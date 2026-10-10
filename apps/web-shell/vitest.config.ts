import { defineConfig } from 'vitest/config';

// Цэвэр функцийн unit тест (DOM-гүй). vite.config.ts-ийн Module Federation plugin тест ачаалахгүй.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
