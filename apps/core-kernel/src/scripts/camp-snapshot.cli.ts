/**
 * `pnpm camp:snapshot` — staging дадлага A = B: хоол/өрөө/тоо, эрх, module status, орчуулгын override-ийн hash.
 *
 *   pnpm camp:snapshot --env=<.env файл> --out=a.json [--today=YYYY-MM-DD] [--slug=sinohydro] [--past=35] [--future=7]
 *   pnpm camp:snapshot --env=<.env файл> --out=b.json --like=a.json   → A-тай ижил today / муж / slug
 *   pnpm camp:snapshot --compare a.json b.json          → зөрүүгүй бол exit 0, зөрүүтэй бол жагсаалт + exit 1
 *   pnpm camp:snapshot --compare a.json b.json --expect=v022-q9  → v0.2.1 → v0.2.2: зөвхөн Q9-ийн эрх (Кемп админ × засвар эхлүүлэх/хаах) нэмэгдэхийг зөвшөөрнө
 *
 * --env өгөөгүй бол repo-ийн root .env. DB = SYSTEM_DATABASE_URL (эсвэл DATABASE_URL), зөвхөн localhost.
 * Зөвхөн уншина (READ ONLY transaction) — пилот / staging аль алинд нь аюулгүй.
 * A ба B-г ижил хувилбарын snapshot CLI-аар, ижил today-гаар авна → B-д `--like=a.json`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { diffDays, todayUb, isRealIsoDate } from '../modules/camp/common/camp-date';
import { buildSnapshot, CampSnapshot, compareSnapshots, PermsExpectation, summarize } from './camp-snapshot';
import { assertLocalUrl, parseDotenv } from './test-user';

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
/** pnpm --filter нь cwd-г apps/core-kernel болгодог → хэрэглэгчийн хавтас (INIT_CWD)-аас замыг тооцно */
const userPath = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

function readSnapshot(p: string): CampSnapshot {
  const s = JSON.parse(readFileSync(userPath(p), 'utf8')) as CampSnapshot;
  if (!s || typeof s !== 'object' || !s.camps) throw new Error(`${p}: camp-snapshot файл биш`);
  return s;
}

function compare(aPath: string, bPath: string, expect: PermsExpectation): number {
  const a = readSnapshot(aPath);
  const b = readSnapshot(bPath);
  console.log(`A: ${aPath} (${a.meta.generatedAt}, ${a.meta.db}, v${a.meta.appVersion ?? '?'})`);
  console.log(`B: ${bPath} (${b.meta.generatedAt}, ${b.meta.db}, v${b.meta.appVersion ?? '?'})`);
  if (a.today !== b.today) console.log(`⚠  today ялгаатай (${a.today} ≠ ${b.today}) — B-г --today=${a.today}-аар дахин авна уу`);
  if (expect !== 'none') console.log(`ℹ  эрхийн хүлээгдэж буй зөрүү: ${expect}`);
  const diff = compareSnapshots(a, b, expect);
  if (diff.length === 0) {
    console.log(`✅ A = B (${Object.keys(a.camps).length} кемп, ${a.from} … ${a.to})`);
    for (const l of summarize(a)) console.log(`   ${l}`);
    return 0;
  }
  console.log(`❌ ${diff.length} зөрүү:`);
  for (const l of diff.slice(0, 200)) console.log(`   ${l}`);
  if (diff.length > 200) console.log(`   … +${diff.length - 200}`);
  return 1;
}

async function snapshot(): Promise<number> {
  const envPath = arg('env') ? userPath(arg('env') as string) : resolve(__dirname, '../../../../.env');
  if (!existsSync(envPath)) throw new Error(`.env алга: ${envPath}`);
  const env = parseDotenv(readFileSync(envPath, 'utf8'));
  const rawUrl = env.SYSTEM_DATABASE_URL?.trim() ? env.SYSTEM_DATABASE_URL : env.DATABASE_URL;
  const url = assertLocalUrl('SYSTEM_DATABASE_URL', rawUrl);
  const u = new URL(url);
  const db = `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  const like = arg('like') ? readSnapshot(arg('like') as string) : null;
  const today = arg('today') ?? like?.today ?? todayUb();
  if (!isRealIsoDate(today)) throw new Error(`--today буруу: ${today}`);
  const out = arg('out');
  if (!out) throw new Error('--out=<файл.json> заавал');
  // A-д байсан БҮХ байгууллага (кемптэй + кемпгүй — perms) — кемпгүй байгууллагыг B-ээс хасвал «perms.<slug>: B-д алга» хуурамч зөрүү (OPS-011)
  const likeSlugs = like ? [...new Set([...Object.keys(like.camps).map((k) => k.split('/')[0]), ...Object.keys(like.perms ?? {})])] : [];
  const slug = arg('slug') ?? (likeSlugs.length === 1 ? likeSlugs[0] : undefined);
  const num = (name: string, def: number) => {
    const v = arg(name);
    if (v === undefined) return def;
    if (!/^\d{1,3}$/.test(v)) throw new Error(`--${name} буруу: ${v}`);
    return Number(v);
  };
  let appVersion: string | null = null;
  try {
    appVersion = (JSON.parse(readFileSync(resolve(envPath, '..', 'package.json'), 'utf8')) as { version?: string }).version ?? null;
  } catch {
    /* .env-ийн хажууд package.json алга */
  }

  console.log(`DB: ${db} (${envPath}) · today ${today}`);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const past = num('past', like ? diffDays(like.from, like.today) : 35);
    const future = num('future', like ? diffDays(like.today, like.to) : 7);
    const s = await buildSnapshot(prisma, { today, db, appVersion, tenantSlug: slug, pastDays: past, futureDays: future });
    writeFileSync(userPath(out), JSON.stringify(s, null, 1) + '\n');
    console.log(`✅ ${userPath(out)} — ${Object.keys(s.camps).length} кемп, ${s.from} … ${s.to}`);
    for (const l of summarize(s)) console.log(`   ${l}`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<number> {
  const i = argv.indexOf('--compare');
  if (i >= 0) {
    const [a, b] = argv.slice(i + 1);
    if (!a || !b || a.startsWith('--') || b.startsWith('--')) throw new Error('Хэрэглээ: camp:snapshot --compare a.json b.json [--expect=v022-q9]');
    const expect = (arg('expect') ?? 'none') as PermsExpectation;
    if (expect !== 'none' && expect !== 'v022-q9') throw new Error(`--expect буруу: ${expect} (v022-q9)`);
    return compare(a, b, expect);
  }
  return snapshot();
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`[АЛДАА] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  },
);
