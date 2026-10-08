# Төслийн Шинжилгээ ба Хөгжүүлэлтийн Төлөвлөгөө — 2026-10-08

> Хувилбар: v0.1.0 ✅ → v0.1.5 (Tier 2 Enterprise VPC) 🔄
> Төлөв: **БАТЛУУЛАХ ХҮЛЭЭГДЭЖ БАЙНА**

## 1. Одоогийн бодит төлөв (кодоос шалгасан)

| Sprint | Баримт бичигт | Код дээр бодитоор |
|---|---|---|
| 6 Schema Isolation | 🔄 "тест хүлээгдэж байна" | ⚠️ Service + migration + mock тест бий, гэхдээ **request урсгалд холбогдоогүй** |
| 7 Advanced Workflow | ⏳ (index) / [x] (sprint файл) | ✅ amount-router, delegation, escalation, SLA, UI хуудас бий |
| 8 Performance | ✅ | ✅ Load-test-ийн DoD 4 зүйл баталгаажаагүй |
| 9 Модулиуд | ⏳ | ❌ Эхлээгүй |
| 10 Event Bus тест | ⏳ | ❌ Эхлээгүй |
| 11 Release | ⏳ | ❌ Эхлээгүй |

## 2. Илэрсэн асуудлууд

### 🔴 Critical
1. **Schema isolation ажиллахгүй байна.** `SchemaRouterService.withSchema()`-г `TenantContextInterceptor` болон аль ч бизнес service (MR, Workflow) дууддаггүй (Алхам 6.4 хийгдээгүй). Enterprise tenant-ийн өгөгдөл одоо ч `public`-д бичигдэнэ.
2. **`search_path` арга Prisma-тай таарахгүй байх магадлал өндөр.** Prisma хүснэгтийн нэрийг `"public"."mr_headers"` гэж schema-тай нь бичдэг тул `SET search_path` нөлөөлөхгүй. Unit тест mock ашигладаг тул үүнийг барьж чадахгүй → query log-оор баталгаажуулна.

### 🟠 High
3. **CI-ийн unit тест алхам юу ч ажиллуулахгүй.** `ci.yml` → `pnpm turbo test:unit`, гэтэл `core-kernel`-д `test:unit` script байхгүй.
4. **CI-д `supabase db push`** — remote project link шаарддаг; local CI-д `supabase db reset` байх ёстой.
5. **Локал хавтсанд `.git` олдсонгүй** — version control-гүй бол CI trigger болохгүй, буцаах боломжгүй.

### 🟡 Medium
6. Баримт бичгийн зөрүү: `00_index.md` (Sprint 7 "хүлээгдэж байна"), Sprint 6 файл замууд (`src/tenant/` ↔ бодит `src/modules/tenant-admin/`).
7. `lessons_learned.md` хоёр газар (root + `docs/`) — нэг эх сурвалж болгох.
8. Frontend component тест огт байхгүй; `mfe-requisitions` нь 15 мөр stub.
9. Root-д 17 хоосон `_tmp_*` файл, `docs/test_write.tmp`, `supabase/snippets/Untitled query 611.sql`.

## 3. Хийх ажлын төлөвлөгөө

### Phase 0 — Цэвэрлэгээ ба суурь (0.5 session)
- [ ] 0.1 `.git` байгаа эсэхийг шалгах; байхгүй бол `git init` + анхны commit (v0.1.0 tag)
- [ ] 0.2 `_tmp_*`, `test_write.tmp`, untitled snippet файлуудыг цэвэрлэх
- [ ] 0.3 `lessons_learned.md`-г нэгтгэх (root = үндсэн)
- [ ] 0.4 `00_index.md`, `project-status.md`-г бодит төлөвтэй тааруулах

### Phase 1 — CI засвар (0.5 session)
- [ ] 1.1 `core-kernel`-д `test:unit` script нэмэх
- [ ] 1.2 CI: `supabase db push` → `supabase db reset`
- [ ] 1.3 lessons_learned-д [CI-E1] бүртгэх

### Phase 2 — Sprint 6 дуусгах: Schema Isolation (2–3 session)
- [ ] 2.1 **Spike:** Prisma query log асааж `withSchema()` доторх бодит SQL-ийг шалгах
- [ ] 2.2 **Шийдвэр (та батлах):** доорх A/B/C-ээс сонгох
- [ ] 2.3 Сонгосон аргаар `TenantContextInterceptor` / DB layer-т холбох
- [ ] 2.4 MR, Workflow service-үүдийг schema-aware DB access руу шилжүүлэх
- [ ] 2.5 **Бодит DB-тэй** integration тест: `schema-rls-leakage.integration.spec.ts` (RULE-16)
- [ ] 2.6 Sprint 6 DoD шалгуурыг бүгдийг [x] болгох

### Phase 3 — Sprint 8 DoD үлдэгдэл (0.5 session)
- [ ] 3.1 Load test (100 concurrent, p99 < 500ms)
- [ ] 3.2 Cache hit rate, cursor pagination 10k хэмжилт
- [ ] 3.3 Cluster mode worker restart шалгах

### Phase 4 — Sprint 9: Нэмэлт модулиуд (5–6 session)
- [ ] 4.1 Budget (MR submit-д budget check)
- [ ] 4.2 Inventory (`workflow.instance.approved` → reserve)
- [ ] 4.3 Vendor (quote → accept)
- [ ] 4.4 Report + Excel export + Dashboard
- [ ] 4.5 Модуль бүрт RLS leakage тест

### Phase 5 — Sprint 10: Event Bus integration тест (2 session)
- [ ] 5.1 MR → Workflow → Inventory → Budget chain тест
- [ ] 5.2 Event idempotency + DLQ integration тест

### Phase 6 — Sprint 11: v0.1.5 Release (1 session)
- [ ] 6.1 E2E: schema-isolation, advanced-workflow, modules
- [ ] 6.2 CHANGELOG, project-status, `.env.example`, docker-compose
- [ ] 6.3 `v0.1.5` git tag

## 4. Phase 2.2-ийн сонголтууд

| Хувилбар | Арга | Давуу | Сул |
|---|---|---|---|
| A | Enterprise tenant бүрт тусдаа PrismaClient (`?schema=tenant_x`), LRU pool | Prisma-тай зөв ажиллана, жинхэнэ тусгаарлалт | Connection тоо өснө, pool удирдлага хэрэгтэй |
| B | Schema-per-tenant-аас татгалзаж RLS үлдээх; Enterprise VPC = тусдаа DB/deploy | Хамгийн энгийн, одоогийн код хэвээр | Нэг instance доторх schema тусгаарлалт алга болно |
| C | Raw SQL / view-ээр search_path ашиглах | Нэг client | Prisma type safety алдагдана, их засвар |
