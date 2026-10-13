---
title: "Sprint 5 — E2E & CI/CD Hardening (v1.0.5)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.0]
---

# Sprint 5 — E2E & CI/CD Hardening (v1.0.5)

> **Зорилго:** Playwright E2E, GitHub Actions, Docker
> **Working dir:** monorepo root

---

## Алхам 5.1 — Health endpoint нэмэх

- [ ] `src/modules/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('api/v1/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() };
  }
}
```

> ⚠️ `HealthController`-д `@SkipAuth()` decorator нэмэх (APP_GUARD bypass):
> - `TenantAuthGuard`-д `@SkipAuth()` decorator шалгах logic нэмэх
> - Эсвэл `isPublic` metadata-д суурилсан conditional check

---

## Алхам 5.2 — Playwright тохиргоо

- [ ] `apps/e2e/` package үүсгэх:

```typescript
// apps/e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    { command: 'pnpm --filter web-shell dev', url: 'http://localhost:5173' },
    { command: 'pnpm --filter core-kernel dev', url: 'http://localhost:3000/api/v1/health' },
  ],
});
```

---

## Алхам 5.3 — E2E тест файлууд

- [ ] `apps/e2e/tests/auth.spec.ts` — login / logout
- [ ] `apps/e2e/tests/requisition-flow.spec.ts` — Create → Submit → Approve → Reject
- [ ] `apps/e2e/tests/multi-tenant.spec.ts` — Tenant A data Tenant B-д харагдахгүй
- [ ] `apps/e2e/tests/workflow-multistep.spec.ts` — Multi-level approval E2E

---

## Алхам 5.4 — GitHub Actions

- [ ] `.github/workflows/ci.yml`:

```yaml
name: CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --frozen-lockfile
      - run: npx supabase start
      - run: npx supabase db push
      - run: pnpm turbo lint
      - run: pnpm turbo test:unit
      - run: pnpm turbo test:integration
      - run: pnpm turbo build
```

---

## Алхам 5.5 — Docker

- [ ] `docker/Dockerfile.backend` — NestJS multi-stage build
- [ ] `docker/Dockerfile.shell` — Vite build + nginx serve
- [ ] `docker/docker-compose.prod.yml` — backend + shell + redis

---

## Алхам 5.6 — 👤 ХЭРЭГЛЭГЧ ажиллуулах

```bash
pnpm playwright test           # бүгд ногоон
docker compose -f docker/docker-compose.prod.yml up --build
curl http://localhost:3000/api/v1/health  # → 200 OK
```

**✅ Sprint 5 дуусах шалгуур:** Playwright E2E ногоон + Docker build амжилттай

---

## 📊 Нийт Явцын Хуваарь

```
Sprint 0 │ Pre-flight Fix           │ [ ] Дуусаагүй
Sprint 1 │ Dynamic Route Ingress    │ [ ] Дуусаагүй
Sprint 2 │ Workflow Engine          │ [ ] Дуусаагүй
Sprint 3 │ Event Bus + DLQ          │ [ ] Дуусаагүй
Sprint 4 │ MFE + Tenant Onboarding  │ [ ] Дуусаагүй
Sprint 5 │ E2E & CI/CD              │ [x] ✅ 2026-09-21
```

---

## Checklist

- [x] 5.1 HealthController + @SkipAuth() decorator
- [x] 5.2 Playwright config (apps/e2e/)
- [x] 5.3 E2E тест файлууд (4 файл) — 9 passed, 2 skipped
- [x] 5.4 GitHub Actions CI yaml
- [x] 5.5 Docker файлууд (backend, shell, compose) — build ✅
- [x] 5.6 👤 E2E тест + Docker build ✅
