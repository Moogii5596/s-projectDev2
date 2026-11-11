/**
 * v0.2.0 §0.2 — Кемпийн тооцооны "агшин зураг" (snapshot): шинэчлэлийн өмнө (A) ба дараа (B) авч харьцуулна.
 *
 * Кемп бүрт:
 *   - meals    — [өнөөдөр − 35 … өнөөдөр + 7] өдөр бүрийн хоолны суурь тоо (хоол × байршил), хүн, хүн-өдөр, тодорхойгүй ээлж
 *   - rooms    — өнөөдрийн өрөөний самбарын нийлбэр (өрөө, багтаамж, хонож буй, сул, дүүрэн, хуваарилалтгүй)
 *   - counts   — мастер / үйл ажиллагааны өгөгдлийн тоо (төлөвөөр)
 * Байгууллага бүрт (v0.2.2 §5.1):
 *   - perms    — эрхийн жагсаалт "<core_users.id>|<эрх>|<кемпийн код | *>" (хувийн мэдээлэлгүй):
 *                legacy = (core|camp)_user_roles ⋈ (core|camp)_role_permissions (v0.2.1 schema дээр ч), effective = (core|camp)_user_permissions (байвал),
 *                campAdmins = Кемп админ рольтой олголт "<user>|<кемп | *>" (Q9-ийн хүлээгдэж буй зөрүүг тооцоход)
 *                v0.2.3 (ADR-007): хуучин snapshot-ийг шинэ хувилбартай харьцуулахад зөвхөн энд migration mapping хэрэглэнэ;
 *                API/permission registry-д хуучин кодын alias байхгүй.
 *
 * Зөвхөн УНШИНА (READ ONLY transaction). Хуучин хувилбарын schema дээр ч ажиллана: v0.1.6-д байсан багана л уншина.
 */
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { addDays } from '../modules/camp/common/camp-date';
import { loadPresence } from '../modules/camp/attendance/camp-presence.service';
import { computeRoomBoard } from '../modules/camp/attendance/camp-rooms.service';
import type { Tx } from '../modules/camp/common/camp-tx';
import { RETIRED_PERMISSIONS } from '../modules/core/permissions/permission-registry';

const SNAPSHOT_FORMAT = 'camp-snapshot/2';

interface CampSnapshotDay {
  present: number;
  personDays: string;
  /** "BREAKFAST@<байршлын нэр>" → тоо */
  meals: Record<string, number>;
  unknownShift: number;
}

interface CampSnapshotCamp {
  code: string;
  name: string;
  meals: Record<string, CampSnapshotDay>;
  rooms: { rooms: number; capacity: number; present: number; vacant: number; full: number; overCapacity: number; unassigned: number };
  counts: Record<string, number>;
}

export interface CampSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  /** Мэдээллийн талбар — харьцуулахад тооцохгүй */
  meta: { generatedAt: string; db: string; appVersion: string | null };
  today: string;
  from: string;
  to: string;
  /** "<tenant slug>/<camp code>" → кемп */
  camps: Record<string, CampSnapshotCamp>;
  /** v0.2.2 — tenant slug → эрх (хуучин хэрэгслээр авсан файлд алга) */
  perms?: Record<string, CampSnapshotPerms>;
  /** tenant slug → module id → status; null = тухайн schema-д хүснэгт байхгүй */
  modules?: Record<string, Record<string, string> | null>;
  /** tenant slug → key|lang → SHA-256(text); override-ийн агуулгыг snapshot-д хадгалахгүй */
  i18nOverrides?: Record<string, Record<string, string> | null>;
}

export interface CampSnapshotPerms {
  /** camp_user_roles ⋈ camp_role_permissions (DISTINCT, эрэмбэтэй) */
  legacy: string[];
  /** camp_user_permissions (DISTINCT, эрэмбэтэй); хүснэгт байхгүй (v0.2.1) бол null */
  effective: string[] | null;
  /** Кемп админ (system_code = CAMP_ADMIN) олголтууд "<user>|<кемп | *>" */
  campAdmins: string[];
}

/** Guard-ийн бодитоор шалгадаг эрх: v0.2.2+ → effective, v0.2.1 → legacy */
const enforcedPerms = (p: CampSnapshotPerms): string[] => p.effective ?? p.legacy;

/**
 * ADR-007 snapshot compatibility: хуучин, хадгалсан snapshot-ийг шинэ хувилбартай харьцуулахад хэрэглэнэ.
 */
export function normalizePermKeys(keys: readonly string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    const [user, code, camp] = k.split('|');
    if (code === undefined || RETIRED_PERMISSIONS.includes(code)) continue;
    out.add(`${user}|${SNAPSHOT_PERMISSION_MIGRATIONS[code] ?? code}|${camp}`);
  }
  return [...out].sort();
}

const SNAPSHOT_PERMISSION_MIGRATIONS: Readonly<Record<string, string>> = {
  'camp.employee.manage': 'hr.employee.manage',
  'camp.employee.terminate': 'hr.employee.terminate',
  'camp.movement.import': 'hr.attendance.import',
  'camp.shift.adjust': 'hr.shift.adjust',
  'core.organization.manage': 'camp.master.manage',
  'core.exchange_rate.manage': 'camp.contract.manage',
};

/**
 * v0.2.2-ын хүлээгдэж буй нэмэлт: Кемп админ олголт бүрт засвар эхлүүлэх (parts) + хаах (close) — Q9 (20261013003),
 * ажлаас гаргах / дахин ажилд авах — B5-Q2 (20261017002). Нэр нь хуучнаараа (`--expect=v022-q9`).
 */
const Q9_PERMS = ['camp.maintenance.parts', 'camp.maintenance.close', 'camp.employee.terminate'] as const;

/** A → B-д хүлээгдэж буй (зөвхөн нэмэгдэх) мөрүүд: B-ийн Кемп админ олголт × Q9, A-д байгаагүй нь */
export function expectedQ9Additions(a: CampSnapshotPerms, b: CampSnapshotPerms): Set<string> {
  const had = new Set(normalizePermKeys(enforcedPerms(a)));
  const out = new Set<string>();
  for (const g of b.campAdmins) {
    const [user, camp] = g.split('|');
    for (const code of Q9_PERMS) {
      const k = `${user}|${SNAPSHOT_PERMISSION_MIGRATIONS[code] ?? code}|${camp}`;
      if (!had.has(k)) out.add(k);
    }
  }
  return out;
}

export type PermsExpectation = 'none' | 'v022-q9';

export interface SnapshotOptions {
  today: string;
  pastDays?: number;
  futureDays?: number;
  /** Зөвхөн энэ байгууллага (slug) */
  tenantSlug?: string;
  db: string;
  appVersion?: string | null;
}

type CountFn = (tx: Tx, tenantId: string, campId: string) => Promise<Record<string, number>>;

/** groupBy(status) → { "<нэр>.<төлөв>": n } (тогтвортой эрэмбэ) */
const byStatus = (name: string, rows: { status: string; _count: { _all: number } }[]) =>
  Object.fromEntries(rows.map((r) => [`${name}.${r.status}`, r._count._all]));

const COUNTS: CountFn = async (tx, tenantId, campId) => {
  const w = { tenantId, campId };
  const [employees, rooms, maintenance, mealOrders, haul, contracts, imports] = await Promise.all([
    tx.hrEmployee.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campRoom.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campMaintenanceRequest.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campMealOrder.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campHaulRecord.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campContract.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.hrMovementImport.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
  ]);
  const [departments, crews, buildings, mealLocations, movements, stays, allocations, assets, assetMovements, costEntries, userRoles] =
    await Promise.all([
      tx.hrDepartment.count({ where: w }),
      tx.hrCrew.count({ where: w }),
      tx.campBuilding.count({ where: w }),
      tx.campMealLocation.count({ where: w }),
      tx.hrMovement.count({ where: w }),
      tx.campStay.count({ where: w }),
      tx.campRoomAllocation.count({ where: w }),
      tx.campAsset.count({ where: w }),
      tx.campAssetMovement.count({ where: w }),
      tx.campCostEntry.count({ where: w }),
      tx.coreUserRole.count({ where: w }),
    ]);
  const out: Record<string, number> = {
    ...byStatus('employees', employees),
    ...byStatus('rooms', rooms),
    ...byStatus('maintenance', maintenance),
    ...byStatus('mealOrders', mealOrders),
    ...byStatus('haul', haul),
    ...byStatus('contracts', contracts),
    ...byStatus('movementImports', imports),
    departments,
    crews,
    buildings,
    mealLocations,
    movements,
    stays,
    allocations,
    assets,
    assetMovements,
    costEntries,
    userRoles,
  };
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

/** Бүх (эсвэл нэг) байгууллагын бүх кемпийн snapshot. `prisma` нь RLS-ийг тойрох (postgres) холболт байна. */
export async function buildSnapshot(prisma: PrismaClient, opts: SnapshotOptions): Promise<CampSnapshot> {
  const past = opts.pastDays ?? 35;
  const future = opts.futureDays ?? 7;
  const from = addDays(opts.today, -past);
  const to = addDays(opts.today, future);
  const days = Array.from({ length: past + future + 1 }, (_, i) => addDays(from, i));

  const tenants = await prisma.tenant.findMany({
    where: opts.tenantSlug ? { slug: opts.tenantSlug } : {},
    select: { id: true, slug: true },
    orderBy: { slug: 'asc' },
  });
  if (opts.tenantSlug && tenants.length === 0) throw new Error(`Байгууллага "${opts.tenantSlug}" олдсонгүй`);

  // v0.2.0-ийн schema (staging snapshot A): ажилтны хоолны байршлын багана алга → хэлтсийнхээр (loadPresence legacy)
  const cols = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'camp_employees' AND column_name = 'meal_location_id'`;
  const legacy = Number(cols[0]?.n ?? 0) === 0;
  // v0.2.3-ийн schema (staging snapshot A, v0.2.4 upgrade-ийн өмнө): каталогийн name_i18n алга (20261107051)
  const i18nCols = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'camp_positions' AND column_name = 'name_i18n'`;
  const catalogI18n = Number(i18nCols[0]?.n ?? 0) > 0;

  const permTables = await prisma.$queryRaw<{ table_name: string }[]>`SELECT table_name::text AS table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (
      'camp_user_permissions', 'core_user_permissions', 'installed_modules', 'i18n_overrides'
    )`;
  const names = new Set(permTables.map((r) => r.table_name));
  // v0.2.3+ → core_* (ADR-007); v0.2.2 → camp_* + effective; v0.2.1 → camp_* (legacy л)
  const permSchema: PermSchema = names.has('core_user_permissions') ? 'core' : names.has('camp_user_permissions') ? 'camp' : 'camp-legacy';

  const camps: Record<string, CampSnapshotCamp> = {};
  const perms: Record<string, CampSnapshotPerms> = {};
  const modules: NonNullable<CampSnapshot['modules']> = {};
  const i18nOverrides: NonNullable<CampSnapshot['i18nOverrides']> = {};
  for (const t of tenants) {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t.id}, true)`;
        const list = await tx.camp.findMany({ where: { tenantId: t.id }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });
        for (const c of list) {
          const locs = await tx.campMealLocation.findMany({ where: { tenantId: t.id, campId: c.id }, select: { id: true, name: true } });
          const locName = new Map(locs.map((l) => [l.id, l.name]));
          const meals: Record<string, CampSnapshotDay> = {};
          for (const d of days) {
            const p = await loadPresence(tx as Tx, t.id, c.id, d, { legacy, catalogI18n });
            const m: Record<string, number> = {};
            for (const l of p.lines) {
              const k = `${l.mealType}@${l.mealLocationId ? (locName.get(l.mealLocationId) ?? l.mealLocationId) : '-'}`;
              m[k] = (m[k] ?? 0) + l.count;
            }
            meals[d] = { present: p.presentCount, personDays: p.personDays, meals: m, unknownShift: p.warnings.unknownShift.length };
          }
          const b = await computeRoomBoard(tx as Tx, t.id, c.id, opts.today);
          camps[`${t.slug}/${c.code}`] = {
            code: c.code,
            name: c.name,
            meals,
            rooms: {
              ...b.totals,
              overCapacity: b.rooms.filter((r) => r.overCapacity).length,
              unassigned: b.unassigned.length,
            },
            counts: await COUNTS(tx as Tx, t.id, c.id),
          };
        }
        perms[t.slug] = await loadPerms(tx as Tx, t.id, permSchema);
        modules[t.slug] = names.has('installed_modules')
          ? Object.fromEntries(
              (
                await tx.$queryRaw<{ moduleId: string; status: string }[]>`
                  SELECT module_id AS "moduleId", status
                  FROM installed_modules
                  WHERE tenant_id = ${t.id}::uuid
                  ORDER BY module_id`
              ).map((row) => [row.moduleId, row.status]),
            )
          : null;
        i18nOverrides[t.slug] = names.has('i18n_overrides')
          ? Object.fromEntries(
              (
                await tx.$queryRaw<{ key: string; lang: string; text: string }[]>`
                  SELECT key, lang, text
                  FROM i18n_overrides
                  WHERE tenant_id = ${t.id}::uuid
                  ORDER BY key, lang`
              ).map((row) => [
                `${row.key}|${row.lang}`,
                createHash('sha256').update(row.text, 'utf8').digest('hex'),
              ]),
            )
          : null;
      },
      { timeout: 120_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  return {
    format: SNAPSHOT_FORMAT,
    meta: { generatedAt: new Date().toISOString(), db: opts.db, appVersion: opts.appVersion ?? null },
    today: opts.today,
    from,
    to,
    camps,
    perms,
    modules,
    i18nOverrides,
  };
}

type PermSchema = 'core' | 'camp' | 'camp-legacy';

/** Байгууллагын эрхийн жагсаалт (READ ONLY tx дотор). Raw SQL — хуучин schema-д Prisma model-гүй хүснэгт байж болно. */
async function loadPerms(tx: Tx, tenantId: string, schema: PermSchema): Promise<CampSnapshotPerms> {
  const sorted = (rows: { k: string }[]) => rows.map((r) => r.k).sort();
  if (schema === 'core') {
    const legacy = await tx.$queryRaw<{ k: string }[]>`
      SELECT DISTINCT ur.user_id::text || '|' || rp.permission_code || '|' || COALESCE(c.code, '*') AS k
      FROM core_user_roles ur
      JOIN core_role_permissions rp ON rp.tenant_id = ur.tenant_id AND rp.role_id = ur.role_id
      LEFT JOIN camps c ON c.tenant_id = ur.tenant_id AND c.id = ur.site_id
      WHERE ur.tenant_id = ${tenantId}::uuid ORDER BY 1`;
    const effective = await tx.$queryRaw<{ k: string }[]>`
      SELECT DISTINCT up.user_id::text || '|' || up.permission_code || '|' || COALESCE(c.code, '*') AS k
      FROM core_user_permissions up
      LEFT JOIN camps c ON c.tenant_id = up.tenant_id AND c.id = up.site_id
      WHERE up.tenant_id = ${tenantId}::uuid ORDER BY 1`;
    const admins = await tx.$queryRaw<{ k: string }[]>`
      SELECT DISTINCT ur.user_id::text || '|' || COALESCE(c.code, '*') AS k
      FROM core_user_roles ur
      JOIN core_roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id AND r.system_code = 'CAMP_ADMIN'
      LEFT JOIN camps c ON c.tenant_id = ur.tenant_id AND c.id = ur.site_id
      WHERE ur.tenant_id = ${tenantId}::uuid ORDER BY 1`;
    return { legacy: sorted(legacy), effective: sorted(effective), campAdmins: sorted(admins) };
  }
  const legacy = await tx.$queryRaw<{ k: string }[]>`
    SELECT DISTINCT ur.user_id::text || '|' || rp.permission_code || '|' || COALESCE(c.code, '*') AS k
    FROM camp_user_roles ur
    JOIN camp_role_permissions rp ON rp.tenant_id = ur.tenant_id AND rp.role_id = ur.role_id
    LEFT JOIN camps c ON c.tenant_id = ur.tenant_id AND c.id = ur.camp_id
    WHERE ur.tenant_id = ${tenantId}::uuid ORDER BY 1`;
  const effective = schema === 'camp'
    ? await tx.$queryRaw<{ k: string }[]>`
        SELECT DISTINCT up.user_id::text || '|' || up.permission_code || '|' || COALESCE(c.code, '*') AS k
        FROM camp_user_permissions up
        LEFT JOIN camps c ON c.tenant_id = up.tenant_id AND c.id = up.camp_id
        WHERE up.tenant_id = ${tenantId}::uuid ORDER BY 1`
    : null;
  const admins = await tx.$queryRaw<{ k: string }[]>`
    SELECT DISTINCT ur.user_id::text || '|' || COALESCE(c.code, '*') AS k
    FROM camp_user_roles ur
    JOIN camp_roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id AND r.system_code::text = 'CAMP_ADMIN'
    LEFT JOIN camps c ON c.tenant_id = ur.tenant_id AND c.id = ur.camp_id
    WHERE ur.tenant_id = ${tenantId}::uuid ORDER BY 1`;
  // ORDER BY (DB collation) ≠ JS эрэмбэ байж болно → JS-ээр дахин эрэмбэлнэ (файл тогтвортой)
  return { legacy: sorted(legacy), effective: effective ? sorted(effective) : null, campAdmins: sorted(admins) };
}

/**
 * Эрхийн харьцуулалт (v0.2.2 §5.1/5.2): A-ийн бодит эрх ↔ B-ийн бодит эрх (+ / − мөр).
 * expect = 'v022-q9' → Q9-ийн хүлээгдэж буй нэмэлтийг зөвшөөрнө; хүлээгдэж буй мөр B-д алга бол мөн зөрүү.
 * Legacy ба effective-ийн зөрүү өмнөөс байсан бол хадгалагдсан эсэхийг шалгана (шууд эрх / өөрчлөгдсөн загвар).
 */
export function comparePerms(a: CampSnapshot, b: CampSnapshot, expect: PermsExpectation = 'none'): string[] {
  const out: string[] = [];
  if (!a.perms || !b.perms) {
    if (a.perms || b.perms) out.push('perms: нэг файлд алга — A ба B-г хоёуланг v0.2.2-ын хэрэгслээр авна уу');
    return out;
  }
  for (const slug of [...new Set([...Object.keys(a.perms), ...Object.keys(b.perms)])].sort()) {
    const pa = a.perms[slug];
    const pb = b.perms[slug];
    if (!pa || !pb) {
      out.push(`perms.${slug}: ${pa ? 'B' : 'A'}-д алга`);
      continue;
    }
    // ADR-007: нэрлэлт (alias) ба устгасан код зөрүү биш — хоёр талыг хөрвүүлж харьцуулна
    const ea = new Set(normalizePermKeys(enforcedPerms(pa)));
    const eb = new Set(normalizePermKeys(enforcedPerms(pb)));
    const allowed = expect === 'v022-q9' ? expectedQ9Additions(pa, pb) : new Set<string>();
    for (const k of [...eb].sort()) if (!ea.has(k) && !allowed.has(k)) out.push(`perms.${slug}: + ${k}`);
    for (const k of [...ea].sort()) if (!eb.has(k)) out.push(`perms.${slug}: − ${k}`);
    for (const k of [...allowed].sort()) if (!eb.has(k)) out.push(`perms.${slug}: хүлээгдэж буй Q9 алга ${k}`);
    if (pb.effective) {
      const la = new Set(normalizePermKeys(pa.legacy));
      const lb = new Set(normalizePermKeys(pb.legacy));
      const only = (left: Set<string>, right: Set<string>) => new Set([...left].filter((k) => !right.has(k)));
      const changed = (before: Set<string>, after: Set<string>) =>
        only(before, after).size + only(after, before).size;
      const diff = changed(only(ea, la), only(eb, lb)) + changed(only(la, ea), only(lb, eb));
      if (diff > 0) out.push(`perms.${slug}: legacy/effective зөрүү өөрчлөгдсөн (${diff} мөр) — шилжүүлэлт эсвэл загварыг шалгана`);
    }
  }
  return out;
}

function compareModules(a: CampSnapshot, b: CampSnapshot): string[] {
  const out: string[] = [];
  if (!a.modules || !b.modules) {
    if (a.modules || b.modules) out.push('modules: нэг файлд алга — шинэ camp:snapshot хэрэгслээр A ба B-г хоёуланг авна уу');
    return out;
  }
  for (const slug of [...new Set([...Object.keys(a.modules), ...Object.keys(b.modules)])].sort()) {
    const before = a.modules[slug];
    const after = b.modules[slug];
    if (before === undefined || after === undefined) {
      out.push(`modules.${slug}: ${before === undefined ? 'A' : 'B'}-д алга`);
      continue;
    }
    if (before === null || after === null) {
      if (before !== after) out.push(`modules.${slug}: нэг хувилбарт хүснэгт алга`);
      continue;
    }
    for (const id of Object.keys(before).sort()) {
      if (!(id in after)) out.push(`modules.${slug}.${id}: B-д алга`);
      else if (before[id] !== after[id]) out.push(`modules.${slug}.${id}: ${before[id]} → ${after[id]}`);
    }
  }
  return out;
}

function compareI18nOverrides(a: CampSnapshot, b: CampSnapshot): string[] {
  const out: string[] = [];
  if (!a.i18nOverrides || !b.i18nOverrides) {
    if (a.i18nOverrides || b.i18nOverrides) out.push('i18nOverrides: нэг файлд алга — шинэ camp:snapshot хэрэгслээр A ба B-г хоёуланг авна уу');
    return out;
  }
  for (const slug of [...new Set([...Object.keys(a.i18nOverrides), ...Object.keys(b.i18nOverrides)])].sort()) {
    const before = a.i18nOverrides[slug];
    const after = b.i18nOverrides[slug];
    if (before === undefined || after === undefined) {
      out.push(`i18nOverrides.${slug}: ${before === undefined ? 'A' : 'B'}-д алга`);
      continue;
    }
    if (before === null || after === null) {
      if (before !== after) out.push(`i18nOverrides.${slug}: нэг хувилбарт хүснэгт алга`);
      continue;
    }
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      if (!(key in before)) out.push(`i18nOverrides.${slug}.${key}: +`);
      else if (!(key in after)) out.push(`i18nOverrides.${slug}.${key}: −`);
      else if (before[key] !== after[key]) out.push(`i18nOverrides.${slug}.${key}: агуулга өөрчлөгдсөн`);
    }
  }
  return out;
}

/** Хоёр утгын зөрүүг "зам: a → b" хэлбэрээр (meta-г алгасна) */
export function compareSnapshots(a: CampSnapshot, b: CampSnapshot, expect: PermsExpectation = 'none'): string[] {
  const out: string[] = [];
  if (a.format !== b.format) out.push(`format: ${a.format} → ${b.format}`);
  const walk = (path: string, x: unknown, y: unknown) => {
    if (x !== null && y !== null && typeof x === 'object' && typeof y === 'object') {
      const keys = [...new Set([...Object.keys(x as object), ...Object.keys(y as object)])].sort();
      for (const k of keys) walk(path ? `${path}.${k}` : k, (x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]);
      return;
    }
    if (x !== y) out.push(`${path}: ${JSON.stringify(x) ?? '(алга)'} → ${JSON.stringify(y) ?? '(алга)'}`);
  };
  const { meta: _ma, format: _fa, perms: _pa, modules: _mda, i18nOverrides: _ia, ...ra } = a;
  const { meta: _mb, format: _fb, perms: _pb, modules: _mdb, i18nOverrides: _ib, ...rb } = b;
  walk('', ra, rb);
  out.push(...comparePerms(a, b, expect));
  out.push(...compareModules(a, b));
  out.push(...compareI18nOverrides(a, b));
  return out;
}

/** Хураангуй (хүнд уншихад): кемп бүрийн нийт хоол, хүн-өдөр, өрөө */
export function summarize(s: CampSnapshot): string[] {
  const camps = Object.entries(s.camps).map(([k, c]) => {
    const days = Object.values(c.meals);
    const meals = days.reduce((n, d) => n + Object.values(d.meals).reduce((x, y) => x + y, 0), 0);
    const pd = meals / 3;
    return `${k}: ${days.length} хоног · хоол ${meals} · хүн-өдөр ${pd.toFixed(4)} · өрөө ${c.rooms.rooms} (хонож буй ${c.rooms.present}) · ажилтан ${
      (c.counts['employees.ACTIVE'] ?? 0) + (c.counts['employees.INACTIVE'] ?? 0)
    }`;
  });
  const perms = Object.entries(s.perms ?? {}).map(([slug, p]) =>
    `${slug}: эрх ${enforcedPerms(p).length} мөр (${p.effective ? 'эцсийн эрх' : 'хуучин зам'}) · хэрэглэгч ${
      new Set(enforcedPerms(p).map((k) => k.split('|')[0])).size
    } · Кемп админ олголт ${p.campAdmins.length}`,
  );
  const modules = Object.entries(s.modules ?? {}).map(([slug, items]) =>
    `${slug}: модуль ${items ? Object.entries(items).map(([id, status]) => `${id}=${status}`).join(', ') : 'schema байхгүй'}`,
  );
  const overrides = Object.entries(s.i18nOverrides ?? {}).map(([slug, items]) =>
    `${slug}: орчуулгын override ${items ? Object.keys(items).length : 'schema байхгүй'} мөр`,
  );
  return [...camps, ...perms, ...modules, ...overrides];
}
