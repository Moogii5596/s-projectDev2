/**
 * S Project — Root ESLint тохиргоо (ESLint 8, legacy config)
 * Зөвхөн root devDependencies-д байгаа багцуудыг ашиглана
 * (@typescript-eslint/parser + eslint-plugin) → lockfile өөрчлөгдөхгүй.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, browser: true, es2022: true },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '@mf-types/', '*.d.ts'],
  rules: {
    // Одоогийн кодонд `as any` (Prisma tx, mock) өргөн ашиглагддаг → алдаа биш, анхааруулга
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['apps/web-shell/src/**/*.{ts,tsx}'],
      rules: {
        'no-cross-module-imports': 'error',
      },
    },
    {
      files: ['apps/web-shell/src/core/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': ['error', { patterns: ['**/modules/**'] }],
      },
    },
  ],
};
