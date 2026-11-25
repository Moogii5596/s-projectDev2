/**
 * S Project — Root ESLint тохиргоо (ESLint 8, legacy config)
 * Зөвхөн root devDependencies-д байгаа багцуудыг ашиглана
 * (@typescript-eslint/parser + eslint-plugin) → lockfile өөрчлөгдөхгүй.
 */
// Давтагдсан сургамжуудыг (docs/lessons) lint-ээр мөрдүүлнэ — баримт унших шаардлагагүй.
const LESSON_RULES = [
  {
    selector: 'TemplateElement[value.raw=/SET\\s+LOCAL/i]',
    message: 'RLS-007/SQL-001: `SET LOCAL` бичихгүй — tenant өгөгдөл `inTenantTx(prisma, tenantId, tx => …)` дотор (AGENTS.md §5).',
  },
  {
    selector: "CallExpression[callee.property.name='$use']",
    message: 'PRISMA-002: Prisma `$use` middleware хориотой (`$executeRaw`-тай рекурс → OOM). Client extension ашигла.',
  },
];
const TEST_RULES = [
  {
    selector: "AssignmentExpression[left.object.property.name='prototype']",
    message: 'PATCH-001: prototype patch тестэд ажиллахгүй (ESM) — `app.get(Service).method = mock` эсвэл `overrideProvider`.',
  },
];

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
    'no-restricted-syntax': ['error', ...LESSON_RULES],
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.test.ts', '**/*.test.tsx', '**/test/**/*.ts'],
      rules: {
        'no-restricted-syntax': ['error', ...LESSON_RULES, ...TEST_RULES],
      },
    },
    {
      files: ['apps/web-shell/src/**/*.{ts,tsx}'],
      rules: {
        'no-cross-module-imports': 'error',
      },
    },
    {
      // ADR-009 (C1, CORE-01): backend цөм бизнес модулиас хамаарахгүй. Feed = цөмийн боломж (AGENTS.md §1б) тул зөвшөөрнө.
      files: ['apps/core-kernel/src/modules/core/**/*.ts'],
      excludedFiles: ['**/*.spec.ts', '**/*.test.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['**/modules/camp/**', '**/modules/hr/**', '../camp/**', '../../camp/**', '../hr/**', '../../hr/**'],
            message: 'ADR-009: цөм (modules/core) Кемп / HR модулиас import хийхгүй — нийтлэг зүйлийг core/platform-д, модулийн зүйлийг registry / интерфейсээр.',
          }],
        }],
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
