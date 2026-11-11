// node --test scripts/agent/  — агентын хамгаалалтын unit тест
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCommand, checkPath, evaluate } from './guard.mjs';
import { plan } from './verify-changed.mjs';

const blocked = (cmd) => checkCommand(cmd)?.id ?? null;

test('guard: хориотой командууд', () => {
  assert.equal(blocked('pnpm --filter core-kernel exec prisma db push'), 'MIG-001');
  assert.equal(blocked('git push origin main'), 'MAIN-PUSH');
  assert.equal(blocked('git push origin HEAD:main'), 'MAIN-PUSH');
  assert.equal(blocked('git push -f origin +main'), 'MAIN-PUSH');
  assert.equal(blocked('git push origin main; echo done'), 'MAIN-PUSH');
  assert.equal(blocked('git commit -m "x" --no-verify'), 'NO-VERIFY');
  assert.equal(blocked('gh workflow run deploy-production.yml'), 'WORKFLOW-RUN');
  assert.equal(blocked('supabase db reset --linked'), 'REMOTE-DB-RESET');
  assert.equal(blocked('cat .env'), 'ENV-READ');
  assert.equal(blocked('Get-Content apps/core-kernel/.env'), 'ENV-READ');
  assert.equal(blocked('type .env.staging'), 'ENV-READ');
});

test('guard: зөвшөөрөгдөх командууд (false positive байх ёсгүй)', () => {
  for (const cmd of [
    'git push -u origin chore/36-guardrails',
    'git push origin feat/main-menu',
    'git checkout main',
    'git log origin/main..HEAD',
    'pnpm supabase:reset',
    'supabase db reset',
    'cat .env.example',
    'cp .env.example .env.example.bak',
    'node -e "console.log(process.env.CI)"',
    'grep -rn "domain" src',
    'pnpm --filter core-kernel exec prisma generate',
    'git commit -m "docs: explain main push rule"',
  ]) {
    assert.equal(blocked(cmd), null, cmd);
  }
});

test('guard: файлын зам', () => {
  assert.equal(checkPath('E:\\MoogiiDev\\Dev\\s-project\\.env')?.id, 'ENV-READ');
  assert.equal(checkPath('/repo/apps/web-shell/.env.local')?.id, 'ENV-READ');
  assert.equal(checkPath('/repo/.env.example'), null);
  assert.equal(checkPath('/repo/src/env.ts'), null);
  assert.equal(checkPath('/repo/src/.envrc-notes.md'), null);
});

test('guard: hook оролт', () => {
  assert.equal(evaluate({ tool_name: 'Read', tool_input: { file_path: '/r/.env' } })?.id, 'ENV-READ');
  assert.equal(evaluate({ tool_name: 'Bash', tool_input: { command: 'gh workflow run x' } })?.id, 'WORKFLOW-RUN');
  assert.equal(evaluate({ tool_name: 'Grep', tool_input: { pattern: '.env' } }), null);
  assert.equal(evaluate({}), null);
});

test('verify plan: зөвхөн хөндсөн app', () => {
  const p = plan(['apps/core-kernel/src/a/a.service.ts', 'docs/x.md']);
  assert.equal(p.steps.length, 1);
  assert.equal(p.steps[0].app.name, '@s-project/core-kernel');
  assert.deepEqual(p.steps[0].lintFiles, ['src/a/a.service.ts']);
  assert.deepEqual(p.steps[0].unitFiles, ['src/a/a.service.ts']);
});

test('verify plan: packages/* хөндвөл бүх app type-check', () => {
  const p = plan(['packages/shared-types/src/index.ts']);
  assert.deepEqual(p.steps.map((s) => s.app.name).sort(), ['@s-project/core-kernel', '@s-project/mfe-requisitions', '@s-project/web-shell']);
  assert.ok(p.steps.every((s) => s.typeCheck && s.lintFiles.length === 0));
});

test('verify plan: баримт л бол шалгалтгүй; migration/controller → сануулга', () => {
  assert.equal(plan(['docs/a.md', 'AGENTS.md']).steps.length, 0);
  const p = plan(['supabase/migrations/20261112001_x.sql', 'apps/core-kernel/src/hr/hr.controller.ts']);
  assert.equal(p.reminders.length, 2);
  assert.ok(p.reminders[1].includes('SEC-001'));
});

test('verify plan: Windows зам, test/ хавтас lint-ийн гадна', () => {
  const p = plan(['apps\\web-shell\\src\\App.tsx', 'apps/core-kernel/test/x.integration.spec.ts']);
  const web = p.steps.find((s) => s.app.name === '@s-project/web-shell');
  const core = p.steps.find((s) => s.app.name === '@s-project/core-kernel');
  assert.deepEqual(web.lintFiles, ['src/App.tsx']);
  assert.ok(core.typeCheck);
  assert.deepEqual(core.lintFiles, []);
  assert.deepEqual(core.unitFiles, []);
});
