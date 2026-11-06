import { defineConfig } from 'vitest/config';

// Анхдагчаар цэвэр функцийн unit тест (DOM-гүй); компонентын *.test.tsx файл `// @vitest-environment jsdom` зарлана.
// vite.config.ts-ийн Module Federation plugin тест ачаалахгүй.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
