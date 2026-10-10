import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  plugins: [
    swc.vite({
      // [DI-009] module: 'commonjs' ХОРИГЛОНО — vitest ESM дотор ажилладаг
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts', 'test/**/*.integration.spec.ts'],
    testTimeout: 30000,
    // [3.6.6] Санаатай давхардлын (409) `prisma:error` чимээг нуух. Барьж аваагүй алдаа → filter-ийн [ERROR] лог хэвээр
    // [5.0] OUTBOX_POLLER_CRON=off: зэрэгцээ тест файлуудын app-ийн cron бие биеийн outbox-ийг боловсруулахгүй (тест poller-ийг шууд дуудна)
    env: { PRISMA_LOG_LEVELS: process.env.PRISMA_LOG_LEVELS ?? 'warn', OUTBOX_POLLER_CRON: 'off' },
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--max-old-space-size=4096'],
      },
    },
    // [RESOLVE-001] fastify зэрэг pnpm strict-mode-д шууд symlink байхгүй
    // transitive dependency-уудыг Node.js native resolve-д шилжүүлнэ
    server: {
      deps: {
        external: ['fastify', '@fastify/.*'],
      },
    },
  },
});
