/**
 * Phase 6.1.1 — Playwright globalTeardown: fixture-ийн tenant, хэрэглэгч, тэдний MR / `prefix`-тэй бараа,
 * нийлүүлэгчийг устгаад `.fixture.json`-г арилгана. Алдаа гарвал файлыг үлдээнэ (дахин `teardown` хийх боломжтой).
 */
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { FIXTURE_PATH, REPO_ROOT, fixtureCommand } from './helpers/fixture-paths';

export default function globalTeardown(): void {
  if (!existsSync(FIXTURE_PATH)) return;
  execSync(`${fixtureCommand()} teardown --in="${FIXTURE_PATH}"`, { cwd: REPO_ROOT, stdio: 'inherit' });
  unlinkSync(FIXTURE_PATH);
}
