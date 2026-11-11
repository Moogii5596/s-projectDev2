#!/usr/bin/env node
/**
 * S Project — өөрчлөгдсөн хэсгийг шалгах (`pnpm verify:changed`).
 * AGENTS.md §2-ийн «tsc + eslint (хөндсөн файл) + unit (хөндсөн)»-ийг нэг командаар.
 * Сургамж: TEST-002 (тестийн дараа tsc), TEST-023 / PROC-020 / CI-008 (өөрчлөлтийн нөлөөг хайх).
 *
 * Өөрчлөлт = `main`-аас салсан commit-ууд + commit хийгээгүй + шинэ (untracked) файлууд.
 *   1. type-check — хөндсөн app (packages/* хөндвөл бүх app)
 *   2. eslint     — хөндсөн .ts/.tsx (зөвхөн error унагана, warning биш)
 *   3. unit       — `vitest related` (хөндсөн файлаас хамаарах тест)
 *   4. сануулга   — migration / Prisma schema өөрчлөгдсөн бол reset + drift (Docker шаардах тул автомат биш)
 *
 * Горим:
 *   node scripts/agent/verify-changed.mjs          → CLI: алдаатай бол exit 1
 *   node scripts/agent/verify-changed.mjs --hook   → Claude Code Stop hook: алдаатай бол exit 2
 *                                                    (Claude зогсолгүй засна; 2 дахь удаадаа хэрэглэгчид сануулна)
 *   --list   → зөвхөн хөндсөн файл/багцыг харуулна
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WIN = process.platform === 'win32';
/** Hook горимд stdout = зөвхөн JSON (Claude Code уншина) → явцыг stderr-д. */
let progress = process.stdout;

/** Шалгах app-ууд. `lintSrc` — eslint-ийн хүрээ (package-ийн `lint` script-тэй ижил). */
export const APPS = [
  { dir: 'apps/core-kernel', name: '@s-project/core-kernel', lintSrc: 'src/', lintArgs: [], unit: true },
  { dir: 'apps/web-shell', name: '@s-project/web-shell', lintSrc: 'src/', lintArgs: ['--rulesdir', 'eslint-rules'], unit: true },
  { dir: 'apps/mfe-requisitions', name: '@s-project/mfe-requisitions', lintSrc: null, lintArgs: [], unit: false },
];

const CODE_RE = /\.(ts|tsx|mts|cts)$/;

/** Хөндсөн файлуудаас хийх шалгалтыг тооцно (цэвэр функц — тестлэгдэнэ). */
export function plan(files) {
  const norm = [...new Set(files.map((f) => f.replace(/\\/g, '/')).filter(Boolean))];
  const sharedTouched = norm.some((f) => f.startsWith('packages/') && !f.endsWith('.md'));
  const tsconfigTouched = norm.some((f) => /^(tsconfig\.json|package\.json|pnpm-lock\.yaml)$/.test(f));
  const steps = [];
  for (const app of APPS) {
    const own = norm.filter((f) => f.startsWith(app.dir + '/'));
    const ownCode = own.filter((f) => CODE_RE.test(f));
    const typeCheck = ownCode.length > 0 || own.some((f) => /\/(tsconfig[^/]*\.json|package\.json)$/.test(f)) || sharedTouched || tsconfigTouched;
    const lintFiles = app.lintSrc
      ? ownCode.map((f) => f.slice(app.dir.length + 1)).filter((f) => f.startsWith(app.lintSrc))
      : [];
    const unitFiles = app.unit ? ownCode.map((f) => f.slice(app.dir.length + 1)).filter((f) => f.startsWith('src/')) : [];
    if (typeCheck || lintFiles.length || unitFiles.length) steps.push({ app, typeCheck, lintFiles, unitFiles });
  }
  const reminders = [];
  if (norm.some((f) => f.startsWith('supabase/migrations/'))) {
    reminders.push('Migration өөрчлөгдсөн: `pnpm supabase:reset` → `pnpm db:generate` → `node scripts/ci/prisma-drift.mjs --update` (AGENTS.md §2).');
  }
  if (norm.some((f) => /prisma\/schema/.test(f))) {
    reminders.push('Prisma schema өөрчлөгдсөн: `pnpm db:generate` + `node scripts/ci/prisma-drift.mjs`.');
  }
  if (norm.some((f) => /\.controller\.ts$|permission-registry\.ts$/.test(f))) {
    reminders.push('API / эрх өөрчлөгдсөн: сөрөг тест (эрхгүй · өөр tenant · өндөр эрхтэй зорилт) + `pnpm docs:gen` (SEC-001/009, PROC-020).');
  }
  return { files: norm, steps, reminders };
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : null;
}

/** main-аас хойш өөрчлөгдсөн + commit хийгээгүй + untracked файлууд (устгагдсаныг хасна). */
export function changedFiles() {
  let base = null;
  for (const ref of ['origin/main', 'main']) {
    const mb = git(['merge-base', 'HEAD', ref]);
    if (mb && mb[0]) { base = mb[0]; break; }
  }
  const sets = [
    base ? git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]) : [],
    git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
    git(['ls-files', '--others', '--exclude-standard']),
  ];
  return [...new Set(sets.flat().filter(Boolean))].filter((f) => existsSync(join(ROOT, f)));
}

function run(label, cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: IS_WIN, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const ok = r.status === 0;
  progress.write(`${ok ? '✓' : '✖'} ${label}\n`);
  return { ok, label, tail: out.split('\n').slice(-40).join('\n') };
}

export function verify(p) {
  const failures = [];
  for (const { app, typeCheck, lintFiles, unitFiles } of p.steps) {
    const cwd = join(ROOT, app.dir);
    if (typeCheck) {
      const r = run(`type-check ${app.name}`, 'pnpm', ['exec', 'tsc', '--noEmit'], cwd);
      if (!r.ok) failures.push(r);
    }
    if (lintFiles.length) {
      const r = run(`eslint ${app.name} (${lintFiles.length} файл)`, 'pnpm', ['exec', 'eslint', '--quiet', ...app.lintArgs, ...lintFiles], cwd);
      if (!r.ok) failures.push(r);
    }
    if (unitFiles.length) {
      const r = run(`unit ${app.name} (vitest related)`, 'pnpm', ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...unitFiles], cwd);
      if (!r.ok) failures.push(r);
    }
  }
  return failures;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  const hook = argv.includes('--hook');
  if (hook) progress = process.stderr;
  let retry = false;
  if (hook) {
    try {
      retry = JSON.parse((await readStdin()) || '{}').stop_hook_active === true;
    } catch {
      /* оролтгүй */
    }
  }
  const p = plan(changedFiles());
  if (argv.includes('--list')) {
    process.stdout.write(JSON.stringify({ files: p.files, steps: p.steps.map((s) => ({ app: s.app.name, typeCheck: s.typeCheck, lint: s.lintFiles, unit: s.unitFiles })), reminders: p.reminders }, null, 2) + '\n');
    return 0;
  }
  if (p.steps.length === 0) {
    if (!hook && p.reminders.length) process.stdout.write(p.reminders.map((r) => `• ${r}`).join('\n') + '\n');
    return 0;
  }
  const failures = verify(p);
  const reminderText = p.reminders.length ? `\nСануулга:\n${p.reminders.map((r) => `• ${r}`).join('\n')}\n` : '';
  if (failures.length === 0) {
    if (!hook) process.stdout.write(`Бүгд ногоон.${reminderText}`);
    return 0;
  }
  const report = failures.map((f) => `── ${f.label} ──\n${f.tail}`).join('\n\n');
  if (!hook) {
    process.stderr.write(`\n${report}\n${reminderText}`);
    return 1;
  }
  if (retry) {
    // Дахин оролдлого ч улаан → хязгааргүй давталтаас сэргийлж зогсоохыг зөвшөөрнө, хэрэглэгчид мэдэгдэнэ.
    process.stdout.write(JSON.stringify({ systemMessage: `⚠ verify:changed улаан хэвээр: ${failures.map((f) => f.label).join(', ')} — «дууссан» гэж тооцохгүй.` }) + '\n');
    return 0;
  }
  process.stderr.write(
    `verify:changed улаан — ажлыг «дууссан» гэхээс өмнө засна (AGENTS.md §2). Засах боломжгүй бол яг аль шалгалт унасныг хэрэглэгчид хэл.\n\n${report}\n${reminderText}`,
  );
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
