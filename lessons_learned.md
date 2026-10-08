# Lessons Learned — S Project

## Sprint 5: E2E & CI/CD

---

### [S5-E1] Docker build: `Cannot find module typescript/bin/tsc`

**Шалтгаан:** Dockerfile нь зөвхөн `apps/<pkg>/package.json` хуулж байсан бол бусад workspace-ийн `package.json`-г орхидог. pnpm symlink-г зөв тохируулж чадахгүй.

**Зөв шийдэл:** `pnpm dlx turbo prune --scope=<pkg> --docker` ашиглах.
- `/out/json/` → workspace бүтэцтэй зөвхөн package.json файлууд
- `/out/full/` → бүрэн source code

**Зөв Dockerfile pattern:**
```dockerfile
FROM node:20-alpine AS pruner
RUN pnpm dlx turbo prune --scope=@s-project/core-kernel --docker
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@s-project/core-kernel
```

---

### [S5-E2] `pnpm --filter e2e add @playwright/test` → lockfile update хийсэнгүй

**Шалтгаан:** `apps/e2e` нь шинэ package болохоор lockfile-д байгаагүй. `pnpm install` нь "up to date" гэж буцаад шинэ package суулгасангүй.

**Зөв шийдэл:** `pnpm --filter e2e add -D @playwright/test@1.48.0` ашиглах (add, not install).
- Энэ нь lockfile-г шинэчлэн зөв суулгана.

---

### [S5-E3] Windows дээр `pnpm --filter e2e exec playwright install chromium` → `Cannot find module @playwright/test/cli.js`

**Шалтгаан:** Windows дээр pnpm workspace cross-links-г **NTFS junction** болгон үүсгэдэг.  
`apps/e2e/node_modules/@playwright/test` нь 0-byte NTFS junction → Linux VM bridge дээр "Input/output error" болдог.  
`node-linker=hoisted` тохируулсан ч workspace-level symlink/junction үүсдэг.

**Зөв шийдэл:** Root `node_modules/@playwright/test/cli.js` бодит файл байдаг тул:
```bash
# Local Windows PowerShell:
node node_modules/@playwright/test/cli.js install chromium

# Эсвэл convenience script (root package.json-д нэмсэн):
pnpm playwright:install

# CI (Ubuntu) - энэ нь ажиллана:
node node_modules/@playwright/test/cli.js install chromium --with-deps
```

**CI yml засвар:** `pnpm --filter e2e exec playwright install` → `node node_modules/@playwright/test/cli.js install chromium --with-deps`

**Дүрэм:** Windows NTFS junction ≠ Linux symlink. pnpm workspace packages-г Windows дээр native PowerShell-ээс ажиллуулах.

---

### [S5-E4] `docker-compose.prod.yml` WARN: `SUPABASE_URL` not set

**Шалтгаан:** `${SUPABASE_URL}` хувьсагч `.env` файлд байхгүй үед Docker Compose анхааруулга гаргадаг.

**Зөв шийдэл:** Default утга ашиглах: `${SUPABASE_URL:-}`

---

### [S5-E5] `pnpm install --force` → +110, дараа нь `pnpm install` → -110 (cycle)

**Шалтгаан:** `--force` нь cache-г цэвэрлэж дахин суулгахад зарим package-г давхардуулдаг бөгөөд дараагийн `install` нь давхардлыг арилгадаг.

**Дүрэм:** Шинэ package нэмэхдээ `pnpm --filter <pkg> add -D <package>` ашигла, `--force` ашиглахаас зайлсхий.


---

### [S5-E6] `Cannot find module apps/web-shell/node_modules/vite/bin/vite.js` (Windows)

**Шалтгаан:** `.npmrc`-д `node-linker=hoisted` нэмэхийн өмнө үүссэн workspace-level NTFS junction-ууд (`apps/*/node_modules/*`) хуучин `.pnpm` store-г заасан хугарсан байсан. `pnpm install` нь root-д зөв суулгасан ч хуучин junction-г цэвэрлэсэнгүй.

**Шинж тэмдэг:** 
- `apps/web-shell/node_modules/vite` — хугарсан NTFS junction
- `apps/e2e/node_modules/@playwright/test` — хугарсан NTFS junction  
- PowerShell-д ч ажиллахгүй (зөвхөн VM bridge асуудал биш)

**Зөв шийдэл:**
```powershell
# 1. Бүх workspace-level node_modules устгах
Get-ChildItem -Path apps -Recurse -Directory -Filter "node_modules" | Remove-Item -Recurse -Force

# 2. Дахин суулгах (node-linker=hoisted root-д нэгтгэнэ)
pnpm install

# 3. Шалгах
Test-Path node_modules\vite\bin\vite.js           # True
Test-Path node_modules\@playwright\test\cli.js    # True
```

**Дүрэм:** `node-linker=hoisted` тохируулга өөрчлөгдсөний дараа `pnpm install` хийхийн өмнө `apps/*/node_modules` устга. `node-linker=hoisted` горимд workspace packages өөрийн `node_modules` хэрэггүй — Node.js directory tree-г дагаж root-оос хайна.

---

### [S5-E7] `Module '"@prisma/client"' has no exported member 'Prisma'` — 97 алдаа

**Шалтгаан:** `apps/*/node_modules` устгаж `pnpm install` хийсний дараа **Prisma client дахин генерацлагдаагүй**. `@prisma/client` package суулгагдсан ч `.prisma/client` (generated types: `PrismaClient`, `Prisma`, model types) байхгүй болсон.

**Шинж тэмдэг:** `Module '"@prisma/client"' has no exported member 'PrismaClient'`, `'Prisma'`, `'MrStatus'` гэх мэт массаар алдаа.

**Зөв шийдэл:**
```powershell
pnpm db:generate
# эсвэл
pnpm --filter core-kernel exec prisma generate
```

**Дүрэм:** `node_modules` устгаж дахин `pnpm install` хийсний дараа **заавал** `prisma generate` ажиллуулах. Root `package.json`-д `postinstall: "prisma generate"` нэмэх сонголт бий (автоматжуулах).

---

## [S5-E8] Health endpoint 401 — NestJS global prefix давхардсан

**Алдаа:**
```
E2E test: GET /api/v1/health → 401 (expected 200)
```

**Шалтгаан:**
`main.ts`-д `app.setGlobalPrefix('api/v1')` тохируулсан байхад `HealthController`-д `@Controller('api/v1/health')` гэж бичсэн. Үр дүнд бодит URL `/api/v1/api/v1/health` болж, E2E тест `/api/v1/health` руу хандахад `TenantAuthGuard` хариулж 401 буцааж байсан. (`@SkipAuth()` зөв ажиллаж байсан — зүгээр л буруу URL дээр хандаж байсан.)

**Шийдэл:**
```typescript
// БУРУУ:
@Controller('api/v1/health')

// ЗӨВ: Global prefix-г давхардуулахгүй
@Controller('health')
// Үр дүн: /api/v1/health
```

**Дүгнэлт:** `setGlobalPrefix` ашиглах үед controller-уудад prefix давтаж бичихгүй байх. Route нь зөвхөн controller-specific хэсгийг агуулна.

---

## [S5-E9] E2E login selector timeout — Монгол label, htmlFor холболтгүй

**Алдаа:**
```
page.getByLabel(/email/i) → Timeout: locator not found
page.getByLabel(/password/i) → Timeout: locator not found
```

**Шалтгаан:**
`LoginPage.tsx`-ийн label текст нь `И-мэйл` / `Нууц үг` (Монгол) байсан ба `/email/i` regex-тэй таарахгүй. Мөн `<label>` ба `<input>` нь `htmlFor`/`id` холболтгүй байсан тул Playwright `getByLabel()` нь label-ыг input-тай холбож чаддаггүй байсан.

**Шийдэл 1 (тест):** `auth.helper.ts` + `auth.spec.ts`-д `getByLabel` орондоо type-based selector ашиглана:
```typescript
// БУРУУ:
await page.getByLabel(/email/i).fill(email);

// ЗӨВ: HTML type attribute-д тулгуурлана — хэл хамаарахгүй
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill(password);
```

**Шийдэл 2 (UI):** `LoginPage.tsx`-д `id` + `htmlFor` нэмсэн:
```tsx
<label htmlFor="email">И-мэйл</label>
<input id="email" type="email" ... />
```

**Дүгнэлт:** Монгол UI ашиглах үед `getByLabel(/english/i)` ажиллахгүй. Input-уудад `id` + label-д `htmlFor` заавал нэмэх (accessibility + testability). E2E selector-ийн хамгийн найдвартай хувилбар: `input[type]` эсвэл `data-testid`.


---

## [S5-E10] FST_ERR_DUPLICATED_ROUTE — AppController + HealthController ижил route

**Алдаа:**
```
FastifyError: Method 'GET' already declared for route '/api/v1/health'
FST_ERR_DUPLICATED_ROUTE
```

**Шалтгаан:**
`AppController` нь `@Controller()` + `@Get('health')` → глобал prefix-тэй `GET /api/v1/health`.
`HealthController` нь `@Controller('health')` + `@Get()` → мөн `GET /api/v1/health`.
Fastify нэг route-г хоёр удаа бүртгэхийг хориглодог.

**Шийдэл:**
`AppController`-аас `health()` method-г хасаж, liveness-д зориулсан `healthz()`-г (`/api/v1/healthz`) үлдээсэн.
`HealthModule` + `HealthController` нь full health response (`version`, `status`) буцааж хэвээр ажиллана.

**Дүгнэлт:** Шинэ controller/module нэмэхдээ `AppController`-д аль route-ууд байгааг эхлэж шалгана. "Health" гэх мэт нийтлэг нэртэй endpoint-ууд давхардах магадлал өндөр.


---

## [S5-E11] LoginPage /login redirect байхгүй — нэвтэрсэн хэрэглэгч дахин /login-д орвол stuck болно

**Алдаа:**
```
E2E: login → /login давтан очвол → URL хэвээр /login байна (expected: /requisitions)
```

**Шалтгаан:**
`App.tsx`-д `/login` route нь ямар ч auth шалгалтгүй. `ProtectedRoute` нь зөвхөн `/protected` route-уудаас `/login`-д redirect хийдэг, харин `/login`-д ирсэн authenticated хэрэглэгчийг `/requisitions` руу чиглүүлдэггүй байсан.

**Шийдэл:**
`LoginPage.tsx`-д `useAuth()` hook-тэй `useEffect` нэмж, `!loading && user` үед `navigate('/requisitions', { replace: true })` дуудна:
```tsx
useEffect(() => {
  if (!loading && user) {
    navigate('/requisitions', { replace: true })
  }
}, [user, loading, navigate])
```
`loading` үед spinner харуулж, redirect болтол UI хоосон биш байна.

**Дүгнэлт:** Auth-тай ямар ч app-д `/login` page нь "already authenticated" тохиолдлыг зохицуулах ёстой.

---

## [S5-E12] E2E getByRole('link') timeout — MRListPage-д `<button>`, `<a>` биш

**Алдаа:**
```
page.getByRole('link', { name: /шинэ|new|үүсгэх|create/i }) → timeout
```

**Шалтгаан:**
`MRListPage.tsx` дахь "Шинэ MR үүсгэх" element нь `<button onClick={() => navigate(...)}>` — HTML `<a>` биш. Playwright-ийн `getByRole('link')` нь зөвхөн `<a>` эсвэл `role="link"` attribute-тай элементийг хайдаг.

**Шийдэл:**
```typescript
// БУРУУ:
await page.getByRole('link', { name: /шинэ|new|үүсгэх|create/i }).click();

// ЗӨВ:
await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
```

**Дүгнэлт:** E2E тест бичихдээ UI-ийн бодит HTML element-ийг шалгана — `navigate()` ашигласан `<button>` нь navigation хийдэг ч `role="link"` биш байна. `.first()` нэмэх нь хуудасны олон давхцсан button-ийн аюулаас сэргийлнэ.


---

## [S5-E13] MR create form submit-д navigation болохгүй — item fields хоосон (frontend validation)

**Алдаа:**
```
page.waitForURL(/.*requisitions\/[a-f0-9-]{36}.*/) → Timeout 30000ms
```

**Шалтгаан:**
`MRCreatePage.tsx`-д form submit хийхэд `items[0].description` хоосон байвал frontend validation `"1 дүгээр мөрийн нэр хоосон байна"` алдаа харуулж, navigation хийхгүй. E2E тест зөвхөн `title` бөглөж, item fields-г бөглөдөггүй байсан.

**Шийдэл:**
E2E тест дотор MR create form-д `title` бөглөхөөс гадна item fields-г бөглөнө:
```typescript
await page.locator('input[placeholder="Материалын нэр"]').first().fill('E2E тест бараа');
await page.locator('input[type="number"]').first().fill('1');
```

**Дүгнэлт:** Form тест бичихдээ required field-уудыг бүгдийг бөглөх. Frontend validation error нь navigation болохгүй болгодог тул `waitForURL` timeout-аар л илэрдэг — screenshot авбал error message харагдах байсан.


---

## [S5-E14] E2E status text mismatch — StatusBadge Монгол хэл, тест Англи хэл хайсан

**Алдаа:**
```
getByText(/draft/i)         → not found  (UI: "Ноорог")
getByText(/pending/i)       → not found  (UI: "Батлуулж байна")
getByText(/approved/i)      → not found  (UI: "Батлагдсан")
getByRole('button', /approve|зөвшөөрөх/i) → not found (UI: "✅ Батлах")
```

**Шалтгаан:**
`StatusBadge.tsx`-д status label-ууд нь бүгд Монгол хэлтэй:
```typescript
DRAFT          → 'Ноорог'
PENDING_APPROVAL → 'Батлуулж байна'
APPROVED       → 'Батлагдсан'
REJECTED       → 'Татгалзсан'
```
E2E тест нь English/mixed regex ашигласан ба UI-ийн бодит текстэд таарахгүй байсан.

**Шийдэл:**
```typescript
// БУРУУ → ЗӨВ
getByText(/draft/i)              → getByText(/ноорог/i)
getByText(/pending|хүлээгдэж/i) → getByText(/батлуулж байна/i)
getByText(/approved|зөвшөөрсөн/i) → getByText(/батлагдсан/i)
getByRole('button', { name: /approve|зөвшөөрөх/i }) → getByRole('button', { name: /батлах/i })
getByText(/rejected|татгалзсан/i) → getByText(/татгалзсан/i) ✓ (unchanged)
```

**Дүгнэлт:** Монгол UI дахь E2E тест бичихдээ UI дахь бодит текстийг харж regex бичих. Тест эхний удаа алдаагааргүй болохоор StatusBadge болон button-уудын label-ийг тогтоон бичих. `data-testid` attribute нэмэх нь хэлнээс үл хамаарах, хамгийн найдвартай арга.


---

## [S5-E15] Playwright strict mode violation — regex нь олон элементэд таарсан
**Огноо:** 2026-09-21
**Алдаа:** `strict mode violation: getByText(/батлагдсан/i) resolved to 2 elements`
**Шалтгаан:** `/батлагдсан/i` regex нь `<span>Батлагдсан</span>` (StatusBadge) болон `<div>✅ Энэ MR батлагдсан байна</div>` хоёуланд таарч байсан. Playwright strict mode-д нэгээс олон элемент олдвол алдаа гаргадаг.
**Зөв шийдэл:** `page.getByText('Батлагдсан', { exact: true })` — зөвхөн StatusBadge-ийн `<span>`-тэй таарна. Мөн `'Татгалзсан'`-д ижил зарчим хэрэглэнэ.
**Хичээл:** Статус шалгах үед `{ exact: true }` ашиглах, эсвэл `.first()` тодорхой заана.

---

## [S5-E16] RejectModal getByLabel ажиллахгүй — htmlFor/id холболт байхгүй
**Огноо:** 2026-09-21
**Алдаа:** `getByLabel(/reason|шалтгаан/i)` → `isVisible()` = false → if block алгасагдаж reject action дуусгагдахгүй
**Шалтгаан:** `RejectModal.tsx`-д `<label>` болон `<textarea>` хоёрт `htmlFor`/`id` холболт байхгүй. Playwright `getByLabel` нь label-input association шаарддаг.
**Зөв шийдэл:** Modal container (`'.fixed.inset-0'`) дотроос `page.locator('textarea').first()` болон `page.locator('.fixed.inset-0').getByRole('button', { name: /татгалзах/i })` ашиглах. `if (isVisible)` conditonal-ийн оронд modal заавал гарна гэж үздэг.
**Хичээл:** `getByLabel` ашиглахаас өмнө `htmlFor`/`id` холболт байгаа эсэхийг шалгах. Modal-ын дотоод элементүүдийг container-аар нь isolate хийх.

---

## [META] E2E тест бичихийн өмнө шалгах чеклист — Sprint 5-аас сурсан зүйл

Sprint 5 E2E debugging явцад 9 алдаа давтагдсаны ихэнх нь **тест бичихийн өмнө UI-ийг шалгаагүйгаас** үүссэн. Дараах чеклистийг E2E тест бичихийн ӨМНӨ дандаа гүйцэтгэнэ:

### 1. URL & Routing шалгалт
- [ ] `setGlobalPrefix('api/v1')` байгаа бол controller path-д `api/v1` давтаж бичихгүй
- [ ] Frontend route-ийн redirect logic (ProtectedRoute, useEffect redirect) тест сценарид тооцсон эсэх

### 2. HTML element шалгалт (тест бичихийн ӨМНӨ DevTools-д харах)
- [ ] Navigation хийдэг `<button>` vs `<a>` — `getByRole('link')` зөвхөн `<a>`-д ажиллана
- [ ] `getByLabel()` ашиглах бол `htmlFor`/`id` холболт байгаа эсэх
- [ ] Form required field-ууд бүгд бөглөгдсөн эсэх (validation error = navigation болохгүй)

### 3. UI текст шалгалт
- [ ] Button/badge-ийн бодит текстийг (`textContent`) DevTools-д харна
- [ ] Монгол UI → regex-д Монгол үг ашиглана (`/батлах/i` биш `/approve/i`)
- [ ] Нэг хуудсанд ижил текст 2+ элементэд байвал `{ exact: true }` эсвэл container locator ашиглана

### 4. Modal шалгалт
- [ ] Modal trigger → modal container → modal дотоод элемент гэж isolate хийнэ
- [ ] `if (isVisible())` conditional-оос зайлсхийх — conditional алгасагдаж action дуусгагдахгүй болдог

### Гол зарчим: **"Тест бичихийн өмнө browser-д нээгээд бодит UI-г нүдээр харна"**

