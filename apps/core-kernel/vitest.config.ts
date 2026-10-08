import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // [TEST-005] гаднах env (жнь RATE_LIMIT_*) unit тестэд нөлөөлөхгүй
    setupFiles: ['./test/setup/unit-env.ts'],
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['**/*.integration.spec.ts', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.test.ts'],
      thresholds: {
        global: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
