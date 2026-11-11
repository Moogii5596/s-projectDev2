#!/usr/bin/env node
// S Project — git hook-уудыг идэвхжүүлэх (issue #15 / H8). Root `package.json` → `prepare`.
// `core.hooksPath = scripts/git-hooks` — worktree бүрт (relative зам) ажиллана.
// Root `prepare`: файл алга бол (Docker build зөвхөн package.json хуулдаг) алгасна.
// CI, Docker build (`.git` байхгүй) болон git суугаагүй орчинд чимээгүй алгасна — install-ийг хэзээ ч унагахгүй.
const { execFileSync } = require('node:child_process');

const HOOKS_PATH = 'scripts/git-hooks';

if (process.env.CI) process.exit(0);

function git(args) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

try {
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') process.exit(0);
  let current = '';
  try {
    current = git(['config', '--get', 'core.hooksPath']);
  } catch {
    // тохируулаагүй
  }
  if (current === HOOKS_PATH) process.exit(0);
  if (current) {
    console.warn(`[git-hooks] core.hooksPath = "${current}" аль хэдийн тохируулсан — өөрчлөхгүй. main-ийн хамгаалалтад "${HOOKS_PATH}" хэрэгтэй.`);
    process.exit(0);
  }
  git(['config', 'core.hooksPath', HOOKS_PATH]);
  console.log(`[git-hooks] core.hooksPath = ${HOOKS_PATH} (main руу шууд push ✖)`);
} catch {
  // git алга / repo биш — алгасна
}
