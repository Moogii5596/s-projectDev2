# CHANGELOG

Бүх мэдэгдэхүйц өөрчлөлтүүд энэ файлд бүртгэгдэнэ.

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Хувилбаржуулалт: [SemVer 2.0.0](https://semver.org/) — v0.x.x = pre-production, v1.0.0 = public release

---

## [Unreleased] — v0.1.5 (Tier 2: Enterprise VPC)

### Нэмэгдэх зүйлс
- Schema-per-tenant / DB-per-tenant isolation
- Advanced approval workflow (мөнгөний хэмжээ, delegation, escalation)
- Inventory, Budget, Vendor, Report модулиуд
- Performance: Redis caching, cursor pagination, rate limiting
- Event Bus integration тест (cross-module chain)

---

## [v0.1.0] — 2026-09-20 — Tier 1 Production Ready (Core System) ✅

> **Тэмдэглэл:** Хуучин нэрлэлтийн MVP + v1.0 sprint бүгд нэгдэж **v0.1.0** болсон.  
> Энэ нэг хувилбар дотор системийн суурь бүтцээс эхлэн Tier 1 production-ready байдал хүртэл бүгд хамрагдана.

### Нэмэгдсэн
- **Monorepo суурь:** Turborepo + pnpm workspaces, Supabase local, Redis Docker
- **Auth & Multi-tenant:** Supabase Auth JWT, TenantAuthGuard, TenantContextInterceptor, AsyncLocalStorage RLS
- **Material Requisition CRUD:** POST/GET/PUT/DELETE endpoints, mr_headers + mr_items хүснэгт
- **Approval workflow:** Submit → Approve/Reject, idempotency log, optimistic locking (version field)
- **Outbox events:** `outbox_events` хүснэгт, DB + event нэг transaction
- **Frontend:** React 18 + Vite 6, TanStack Query v5, Supabase Auth нэвтрэх, Realtime subscription
- **Module Federation:** web-shell (Host) + material-requisition-ui (Remote), shared design system
- **Dynamic Ingress Router:** `DynamicIngressRouterService`, manifest.json validation, DrainingInterceptor
- **Workflow Engine Module:** workflow_definitions/instances/approval_steps, multi-level approval
- **Event Bus:** Outbox processor, Redis pub/sub (CloudEvents v1.0), exponential backoff, DLQ
- **Tenant Onboarding:** Tenant бүртгэх, module идэвхжүүлэх, хэрэглэгч урих API, RBAC
- **CI/CD:** GitHub Actions pipeline, Docker + docker-compose, `.env` validation

### Тест
- Vitest unit тест (80%+ coverage)
- Supertest integration тест (endpoint бүр)
- RLS leakage тест — tenant A → tenant B өгөгдөл = 0
- Approval idempotency тест
- E2E тест (Playwright): Submit → Approve flow
- RLS leakage load тест (100 concurrent)

### Засагдсан алдаанууд (RULE-01~20 боловсруулагдсан)
- APP_GUARD useExisting pattern (RULE-07)
- resolveUserId: authId ≠ core_users.id (RULE-13)
- Dual PrismaClient RLS тест (RULE-16)
- unplugin-swc NestJS+vitest (RULE-08)
- VITE_API_BASE_URL='' proxy (RULE-19)
- uuid_generate_v7() only (RULE-11)
- Pagination {data, total, page, limit} (RULE-17)

---

## Хувилбарын Зураглал

| SemVer | Хуучин нэр | Тайлбар | Төлөв |
|---|---|---|---|
| **v0.1.0** | MVP + v1.0 | Tier 1 Core System | ✅ ДУУССАН |
| **v0.1.5** | v1.5 | Tier 2 Enterprise VPC | 🔜 ДАРААГИЙН |
| **v0.2.0** | v2.0 | Tier 3 Air-Gapped | 📋 ТӨЛӨВЛӨСӨН |
| **v0.3.0+** | — | Нэмэлт хөгжүүлэлт | 📋 ИРЭЭДҮЙ |
| **v1.0.0** | Production | Олон нийтэд гаргах | 🎯 ЗОРИЛГО |

---

[Unreleased]: https://github.com/your-org/s-project/compare/v0.1.0...HEAD
[v0.1.0]: https://github.com/your-org/s-project/releases/tag/v0.1.0
