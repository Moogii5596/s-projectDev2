#!/usr/bin/env node
// QA-21 (MIG-001): `prisma/schema` ↔ `supabase/migrations` зөрүүг шалгана.
//
// Schema-ийн үнэн = migration (prisma db push ✖). Prisma-д илэрхийлэгдэхгүй зүйл (FK/index нэр,
// timestamptz, DB default, partial index …) үргэлж зөрнө → ratchet: одоогийн зөрүүг
// `prisma-drift.baseline.txt`-д хадгалж, түүнээс ялгаатай бол унана.
//   + шинэ мөр  → migration эсвэл prisma model шинэчлэгдээгүй (жнь багана нэмээд model-д мартсан)
//   - алга мөр  → зөрүү засагдсан, baseline-аас хас (--update)
//
// Ашиглах (migration-ууд ажилласан DB-тэй — CI-д `supabase start`):
//   node scripts/ci/prisma-drift.mjs [--url <postgres-url>] [--update]
//   URL: --url → PRISMA_DRIFT_DB_URL → DIRECT_URL
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const kernel = join(root, 'apps/core-kernel');
const baselinePath = join(here, 'prisma-drift.baseline.txt');

const args = process.argv.slice(2);
const update = args.includes('--update');
const urlIdx = args.indexOf('--url');
const url = (urlIdx >= 0 ? args[urlIdx + 1] : undefined) ?? process.env.PRISMA_DRIFT_DB_URL ?? process.env.DIRECT_URL;
if (!url) {
  console.error('::error::DB URL алга (--url, PRISMA_DRIFT_DB_URL эсвэл DIRECT_URL)');
  process.exit(2);
}

const res = spawnSync(
  'npx',
  ['prisma', 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema', '--script'],
  { cwd: kernel, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 },
);
if (res.status !== 0) {
  console.error(res.stdout, res.stderr);
  console.error('::error::prisma migrate diff ажилласангүй');
  process.exit(2);
}

/**
 * Prisma-гийн SQL-ийг мөр бүр нэг өөрчлөлт болгон хэвшүүлнэ (эрэмбэ, хоосон мөр, тайлбараас үл хамаарна).
 * `ALTER TABLE "t" A,\nB;` → `ALTER TABLE "t" A` + `ALTER TABLE "t" B` — нэг хүснэгтэд шинэ зөрүү нэмэгдэхэд
 * хуучин мөр нь нуухгүй.
 */
function normalize(sql) {
  const body = sql
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('--'))
    .join('\n');
  const out = new Set();
  for (const raw of body.split(/;\s*(?:\n|$)/)) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const alter = /^ALTER TABLE ("[^"]+") /.exec(stmt);
    if (alter) {
      const clauses = stmt.slice(alter[0].length).split(/,\s*\n/);
      for (const c of clauses) out.add(`ALTER TABLE ${alter[1]} ${c.trim().replace(/\s+/g, ' ')}`);
    } else {
      out.add(stmt.replace(/\s+/g, ' '));
    }
  }
  return [...out].sort();
}

const current = normalize(res.stdout);

if (update) {
  writeFileSync(
    baselinePath,
    '# QA-21: prisma migrate diff (DB ← migrations → prisma/schema) — зөвшөөрсөн зөрүү. Гараар биш: --update\n' +
      current.join('\n') +
      '\n',
  );
  console.log(`baseline шинэчлэгдлээ: ${current.length} мөр → ${baselinePath}`);
  process.exit(0);
}

const baseline = existsSync(baselinePath)
  ? readFileSync(baselinePath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
  : [];
const base = new Set(baseline);
const cur = new Set(current);
const added = current.filter((l) => !base.has(l));
const removed = baseline.filter((l) => !cur.has(l));

if (!added.length && !removed.length) {
  console.log(`✓ prisma schema ↔ migrations: шинэ зөрүүгүй (baseline ${baseline.length} мөр)`);
  process.exit(0);
}

if (added.length) {
  console.error(`::error::Шинэ зөрүү (${added.length}) — migration ба prisma/schema-г тааруул [MIG-001]:`);
  for (const l of added) console.error(`  + ${l}`);
}
if (removed.length) {
  console.error(`::error::Baseline-д байгаа ч алга болсон зөрүү (${removed.length}) — засагдсан бол baseline-аас хас:`);
  for (const l of removed) console.error(`  - ${l}`);
}
console.error(
  '\nСанаатай зөрүү (Prisma-д илэрхийлэгдэхгүй) эсвэл засагдсан бол: node scripts/ci/prisma-drift.mjs --update --url <migration-тай DB>',
);
process.exit(1);
