/**
 * v0.2.0 §0.2 — Кемпийн тооцооны "агшин зураг" (snapshot): шинэчлэлийн өмнө (A) ба дараа (B) авч харьцуулна.
 *
 * Кемп бүрт:
 *   - meals    — [өнөөдөр − 35 … өнөөдөр + 7] өдөр бүрийн хоолны суурь тоо (хоол × байршил), хүн, хүн-өдөр, тодорхойгүй ээлж
 *   - rooms    — өнөөдрийн өрөөний самбарын нийлбэр (өрөө, багтаамж, хонож буй, сул, дүүрэн, хуваарилалтгүй)
 *   - counts   — мастер / үйл ажиллагааны өгөгдлийн тоо (төлөвөөр)
 *
 * Зөвхөн УНШИНА (READ ONLY transaction). Хуучин хувилбарын schema дээр ч ажиллана: v0.1.6-д байсан багана л уншина.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { addDays } from '../modules/camp/attendance/camp-date';
import { loadPresence } from '../modules/camp/attendance/camp-presence.service';
import { computeRoomBoard } from '../modules/camp/attendance/camp-rooms.service';
import type { Tx } from '../modules/camp/common/camp-tx';

export const SNAPSHOT_FORMAT = 'camp-snapshot/1';

export interface CampSnapshotDay {
  present: number;
  personDays: string;
  /** "BREAKFAST@<байршлын нэр>" → тоо */
  meals: Record<string, number>;
  unknownShift: number;
}

export interface CampSnapshotCamp {
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
}

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
    tx.campEmployee.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campRoom.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campMaintenanceRequest.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campMealOrder.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campHaulRecord.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campContract.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
    tx.campMovementImport.groupBy({ by: ['status'], where: w, _count: { _all: true } }),
  ]);
  const [departments, crews, buildings, mealLocations, movements, stays, allocations, assets, assetMovements, costEntries, userRoles] =
    await Promise.all([
      tx.campDepartment.count({ where: w }),
      tx.campCrew.count({ where: w }),
      tx.campBuilding.count({ where: w }),
      tx.campMealLocation.count({ where: w }),
      tx.campMovement.count({ where: w }),
      tx.campStay.count({ where: w }),
      tx.campRoomAllocation.count({ where: w }),
      tx.campAsset.count({ where: w }),
      tx.campAssetMovement.count({ where: w }),
      tx.campCostEntry.count({ where: w }),
      tx.campUserRole.count({ where: w }),
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

  const camps: Record<string, CampSnapshotCamp> = {};
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
            const p = await loadPresence(tx as Tx, t.id, c.id, d);
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
  };
}

/** Хоёр утгын зөрүүг "зам: a → b" хэлбэрээр (meta-г алгасна) */
export function compareSnapshots(a: CampSnapshot, b: CampSnapshot): string[] {
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
  const { meta: _ma, format: _fa, ...ra } = a;
  const { meta: _mb, format: _fb, ...rb } = b;
  walk('', ra, rb);
  return out;
}

/** Хураангуй (хүнд уншихад): кемп бүрийн нийт хоол, хүн-өдөр, өрөө */
export function summarize(s: CampSnapshot): string[] {
  return Object.entries(s.camps).map(([k, c]) => {
    const days = Object.values(c.meals);
    const meals = days.reduce((n, d) => n + Object.values(d.meals).reduce((x, y) => x + y, 0), 0);
    const pd = meals / 3;
    return `${k}: ${days.length} хоног · хоол ${meals} · хүн-өдөр ${pd.toFixed(4)} · өрөө ${c.rooms.rooms} (хонож буй ${c.rooms.present}) · ажилтан ${
      (c.counts['employees.ACTIVE'] ?? 0) + (c.counts['employees.INACTIVE'] ?? 0)
    }`;
  });
}
