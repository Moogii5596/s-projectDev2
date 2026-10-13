---
title: "Sprint 4 — Module Federation + Tenant Onboarding (v1.0.4)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.0]
---

# Sprint 4 — Module Federation + Tenant Onboarding (v1.0.4)

> **Зорилго:** Web Shell + Remote MFE, Tenant Admin API
> ⚠️ `tenants`-д `tier`, `status`, `connection_uri`, `storage_quota_mb` **аль хэдийн байна** — давтан нэмэх ХОРИГЛОНО

---

## Алхам 4.1 — Migration үүсгэх

- [ ] `supabase/migrations/YYYYMMDD_tenant_onboarding.sql`:

```sql
-- Зөвхөн ШИНЭ баганууд
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS max_users    INTEGER     NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_mfes     INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settings     JSONB       NOT NULL DEFAULT '{}';

-- Platform-level super admin (RLS bypass — backend service layer шалгана)
CREATE TABLE super_admins (
  user_id    UUID        PRIMARY KEY REFERENCES core_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## Алхам 4.2 — TenantOnboardingService

> ⚠️ RULE-13: `createTenant()` — Supabase Admin API + core_users **хоёуланг** үүсгэх

- [ ] `src/modules/tenant-admin/dto/create-tenant.dto.ts`:

```typescript
export class CreateTenantDto {
  name:          string;
  slug:          string;
  tier:          'TIER_1' | 'TIER_2' | 'TIER_3';
  adminEmail:    string;
  adminFullName: string;
  adminPassword: string;  // Supabase Auth-д дамжуулна
}
```

- [ ] `src/modules/tenant-admin/tenant-onboarding.service.ts`:

```typescript
import { Injectable, ConflictException } from '@nestjs/common';
import { createClient }  from '@supabase/supabase-js';
import { PrismaService } from '../../db/prisma.service';
import type { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantOnboardingService {
  private readonly supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  constructor(private readonly prisma: PrismaService) {}

  async createTenant(dto: CreateTenantDto) {
    // 1. Supabase Auth-д admin user үүсгэх → authId авах
    const { data: authData, error } = await this.supabaseAdmin.auth.admin.createUser({
      email:         dto.adminEmail,
      password:      dto.adminPassword,
      email_confirm: true,
    });
    if (error || !authData.user) throw new ConflictException(error?.message ?? 'Auth error');

    const authId = authData.user.id;  // Supabase UUID

    // 2. RULE-04 + RULE-03: $transaction дотор tenant + core_users үүсгэх
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.name, slug: dto.slug, tier: dto.tier as any },
      });

      // RULE-13: core_users-д authId (Supabase UUID) хадгалах
      const user = await tx.coreUser.create({
        data: {
          tenantId: tenant.id,
          authId,               // ← Supabase auth_id
          email:    dto.adminEmail,
          fullName: dto.adminFullName,
          role:     'OWNER',
          status:   'ACTIVE',
        },
      });

      // Default workflow definition seed
      await tx.workflowDefinition.create({
        data: {
          tenantId:    tenant.id,
          name:        'Default Approval',
          stepsConfig: [{ order: 0, role: 'APPROVER', quorum: 1 }],
          isActive:    true,
        },
      });

      return { tenant, user };
    });
  }
}
```

- [ ] Controller (`POST /api/v1/admin/tenants`) + Module үүсгэх
- [ ] `AppModule`-д нэмэх

---

## Алхам 4.3 — Frontend MFE тохиргоо

- [ ] `apps/web-shell/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react     from '@vitejs/plugin-react';
import federation from '@module-federation/vite';   // ← зөв package нэр

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        mfe_requisitions: 'http://localhost:5174/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', '@tanstack/react-query'],
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
```

- [ ] `apps/mfe-requisitions/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react     from '@vitejs/plugin-react';
import federation from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name:     'mfe_requisitions',
      filename: 'remoteEntry.js',
      exposes:  { './RequisitionApp': './src/RequisitionApp.tsx' },
      shared:   ['react', 'react-dom', '@tanstack/react-query'],
    }),
  ],
  server: { port: 5174 },
  // RULE-09: VITE_API_BASE_URL='' (хоосон) — web-shell proxy ашиглана
});
```

- [ ] `apps/web-shell/src/App.tsx`-д Remote component load хийх:

```typescript
const RequisitionApp = React.lazy(
  () => import('mfe_requisitions/RequisitionApp')
);
```

---

## Алхам 4.4 — Тестийн хамрах хүрээ

```
tenant-onboarding.service.spec.ts:
  ✓ createTenant() → tenants + core_users (authId-тэй) хоёуланд бичигдэнэ
  ✓ core_users.authId → Supabase-аас авсан UUID (RULE-13)
  ✓ Default workflow_definition seed хийгдэнэ
  ✓ slug давхардвал ConflictException
  ✓ POST /api/v1/admin/tenants → 201 / super admin бус → 403
```

---

## Алхам 4.5 — 👤 ХЭРЭГЛЭГЧ ажиллуулах

```bash
supabase db push
pnpm --filter core-kernel exec prisma generate
pnpm --filter core-kernel test
pnpm --filter core-kernel test:e2e
pnpm --filter web-shell dev &
pnpm --filter mfe-requisitions dev &
# Browser: http://localhost:5173 → MFE load амжилттай эсэхийг шалгах
```

**✅ Sprint 4 дуусах шалгуур:** Tenant isolation + MFE load тест ногоон + authId тест ногоон

---

## Checklist

- [ ] 4.1 Migration (tenants шинэ баганууд, super_admins)
- [ ] 4.2 TenantOnboardingService + CreateTenantDto + Controller + Module
- [ ] 4.3 web-shell vite.config.ts (federation)
- [ ] 4.3 mfe-requisitions vite.config.ts (exposes)
- [ ] 4.3 App.tsx-д React.lazy Remote component
- [ ] 4.4 Unit тестүүд
- [ ] 4.5 👤 supabase db push + test + browser шалгах
