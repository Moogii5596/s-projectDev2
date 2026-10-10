/**
 * Phase 6.1.1 — Playwright globalSetup: тестийн tenant/хэрэглэгчдийг үүсгэнэ (гараар token/SQL бэлдэхгүй).
 * core-kernel-ийн `e2e:fixture` (Prisma + Supabase admin, зөвхөн local) → apps/e2e/.fixture.json
 * `E2E_FIXTURE_CMD` — өөр команд (жнь CI-д тусгай env-тэй wrapper). Анхдагч: pnpm --filter core-kernel.
 */
import { execSync } from 'node:child_process';
import { FIXTURE_PATH, REPO_ROOT, fixtureCommand } from './helpers/fixture-paths';

export default function globalSetup(): void {
  execSync(`${fixtureCommand()} setup --out="${FIXTURE_PATH}"`, { cwd: REPO_ROOT, stdio: 'inherit' });
}
