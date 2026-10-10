/**
 * Unit тестийн env тусгаарлалт — [TEST-005] (2026-10-08)
 *
 * Апп-ын зан төлөвийг өөрчилдөг env хувьсагчдыг тест бүрийн өмнө цэвэрлэнэ.
 * Жишээ: load test-д `$env:RATE_LIMIT_SHORT="1000000"` тохируулсан PowerShell session-д
 * `pnpm test` ажиллуулахад rate limit тестүүд 429 өгөхгүй унасан.
 * Тодорхой утга хэрэгтэй тест өөрөө `vi.stubEnv(...)` хийнэ.
 */
import { beforeEach } from 'vitest';

export const APP_BEHAVIOR_ENV_KEYS = [
  'RATE_LIMIT_SHORT',
  'RATE_LIMIT_MEDIUM',
  'RATE_LIMIT_LONG',
  'DEPLOYMENT_MODE',
  'DEDICATED_TENANT_SLUG',
  'DEV_TENANT_SLUG',
  'NODE_CLUSTER_WORKERS',
  'CLUSTER_RESTART_BASE_MS', // Phase 3.6.4
  'CLUSTER_RESTART_MAX_MS',
  'CLUSTER_RESTART_WINDOW_MS',
  'PRISMA_LOG_LEVELS', // Phase 3.6.6
  'SYSTEM_DATABASE_URL', // Phase 4.8.4
  'OUTBOX_POLLER_CRON', // Phase 5
] as const;

beforeEach(() => {
  for (const key of APP_BEHAVIOR_ENV_KEYS) delete process.env[key];
});
