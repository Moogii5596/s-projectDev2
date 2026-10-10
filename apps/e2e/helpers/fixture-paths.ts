import { resolve } from 'node:path';

/** apps/e2e/helpers → repo root */
export const REPO_ROOT = resolve(__dirname, '../../..');
export const FIXTURE_PATH = resolve(__dirname, '../.fixture.json');

export const fixtureCommand = (): string =>
  process.env['E2E_FIXTURE_CMD']?.trim() || 'pnpm --silent --filter @s-project/core-kernel e2e:fixture';
