---
title: "Sprint 1 — Dynamic Route Ingress (v1.0.1)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.0]
---

# Sprint 1 — Dynamic Route Ingress (v1.0.1)

> **Зорилго:** Manifest-д суурилсан dynamic routing — module бүртгэл, route ingress, DRAINING
> **Working dir:** `apps/core-kernel/`
> **Хамаарал:** Sprint 0 дууссан байх ёстой

---

## Алхам 1.1 — Migration үүсгэх

- [ ] `supabase/migrations/YYYYMMDD_tenant_routes.sql`:

```sql
-- RULE-11: uuid_generate_v7() | RULE-12: FORCE + RESTRICTIVE
CREATE TABLE tenant_routes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path          TEXT        NOT NULL,
  method        TEXT        NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','*')),
  target_module TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tenant_route UNIQUE(tenant_id, path, method)
);

ALTER TABLE tenant_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_tenant_routes_tenant ON tenant_routes
  AS RESTRICTIVE FOR ALL TO s_project_app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX idx_tenant_routes_tenant_active ON tenant_routes(tenant_id, is_active);
```

---

## Алхам 1.2 — Prisma model нэмэх

- [ ] `prisma/schema.prisma`-д:

```prisma
model TenantRoute {
  id           String   @id @default(uuid()) @db.Uuid  // RULE-05
  tenantId     String   @db.Uuid
  path         String
  method       String
  targetModule String
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, path, method])
  @@map("tenant_routes")
}
```

- [ ] `Tenant` model-д `tenantRoutes TenantRoute[]` нэмэх

---

## Алхам 1.3 — DynamicIngressRouterService

- [ ] `src/gateway/dynamic-ingress-router.service.ts`:

```typescript
import { Injectable, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ModuleManifest {
  module_id:    string;
  version:      string;
  dependencies: string[];
  api_routes: {
    base_path:    string;
    target_port:  number;
    target_host?: string;
  };
  permissions: string[];
}

export type RouteStatus = 'ACTIVE' | 'DRAINING' | 'OFFLINE';

export interface RouteEntry {
  target:       string;
  status:       RouteStatus;
  moduleId:     string;
  registeredAt: Date;
}

@Injectable()
export class DynamicIngressRouterService {
  private readonly routes = new Map<string, RouteEntry>();

  constructor(private readonly events: EventEmitter2) {}

  registerModule(manifest: ModuleManifest): void {
    const target =
      manifest.api_routes.target_host ??
      `http://svc-${manifest.module_id}:${manifest.api_routes.target_port}`;

    const existing = this.routes.get(manifest.api_routes.base_path);
    if (existing && existing.status !== 'OFFLINE') {
      throw new ConflictException(
        `CONFLICT: Route prefix ${manifest.api_routes.base_path} is already claimed by ${existing.moduleId}.`
      );
    }

    this.routes.set(manifest.api_routes.base_path, {
      target,
      status: 'ACTIVE',
      moduleId: manifest.module_id,
      registeredAt: new Date(),
    });

    this.events.emit('gateway.route.updated', { manifest, target });
  }

  resolveRoute(path: string): RouteEntry | undefined {
    for (const [prefix, entry] of this.routes.entries()) {
      if (path.startsWith(prefix)) return entry;
    }
    return undefined;
  }

  setStatus(basePath: string, status: RouteStatus): void {
    const entry = this.routes.get(basePath);
    if (entry) {
      entry.status = status;
      if (status === 'DRAINING') {
        this.events.emit('gateway.route.draining', {
          basePath,
          moduleId: entry.moduleId,
        });
      }
    }
  }

  getRoutes(): Map<string, RouteEntry> {
    return this.routes;
  }
}
```

---

## Алхам 1.4 — DrainingInterceptor

- [ ] `src/gateway/draining.interceptor.ts`:

```typescript
import {
  Injectable, NestInterceptor, ExecutionContext,
  CallHandler, ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import {
  DynamicIngressRouterService,
  RouteStatus,
} from './dynamic-ingress-router.service';

@Injectable()
export class DrainingInterceptor implements NestInterceptor {
  private readonly inflight = new Map<string, number>();

  constructor(private readonly router: DynamicIngressRouterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req   = context.switchToHttp().getRequest();
    const res   = context.switchToHttp().getResponse();
    const route = this.router.resolveRoute(req.path);

    if (!route) return next.handle();

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (route.status === 'DRAINING' && isMutation) {
      res.setHeader('Retry-After', '15');
      throw new ServiceUnavailableException({
        code:    'SERVICE_DRAINING',
        message: 'Module is currently updating. Mutations are paused. Retry in 15s.',
      });
    }

    const count = (this.inflight.get(route.target) ?? 0) + 1;
    this.inflight.set(route.target, count);

    return next.handle().pipe(
      tap({
        complete: () => this.decrementInflight(route),
        error:    () => this.decrementInflight(route),
      })
    );
  }

  private decrementInflight(route: { target: string; status: RouteStatus }): void {
    const count = (this.inflight.get(route.target) ?? 1) - 1;
    this.inflight.set(route.target, count);

    if (route.status === 'DRAINING' && count <= 0) {
      const basePath = [...this.router.getRoutes().entries()]
        .find(([, v]) => v.target === route.target)?.[0] ?? '';
      if (basePath) this.router.setStatus(basePath, 'OFFLINE');
    }
  }
}
```

---

## Алхам 1.5 — RouteIngress module файлууд

- [ ] `src/modules/route-ingress/dto/register-route.dto.ts`:

```typescript
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class RegisterRouteDto {
  @IsString() moduleId:    string;
  @IsString() version:     string;
  @IsString() basePath:    string;
  @IsNumber() targetPort:  number;
  @IsOptional() @IsString() targetHost?: string;
}
```

- [ ] `src/modules/route-ingress/route-ingress.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';
import { DynamicIngressRouterService } from '../../gateway/dynamic-ingress-router.service';
import { RegisterRouteDto } from './dto/register-route.dto';
import { tenantStorage } from '../../db/prisma-tenant-client';

@Injectable()
export class RouteIngressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly router: DynamicIngressRouterService,
  ) {}

  async registerRoute(dto: RegisterRouteDto, tenantId: string): Promise<void> {
    const ctx = tenantStorage.getStore()!;
    // RULE-04: $transaction; RULE-03: set_config
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)
      `;
      await tx.tenantRoute.upsert({
        where: { tenantId_path_method: { tenantId, path: dto.basePath, method: '*' } },
        create: { tenantId, path: dto.basePath, method: '*', targetModule: dto.moduleId, isActive: true },
        update: { isActive: true, targetModule: dto.moduleId },
      });
    });

    this.router.registerModule({
      module_id: dto.moduleId, version: dto.version, dependencies: [],
      api_routes: { base_path: dto.basePath, target_port: dto.targetPort, target_host: dto.targetHost },
      permissions: [],
    });
  }

  async deactivateRoute(routeId: string, tenantId: string): Promise<void> {
    const ctx = tenantStorage.getStore()!;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
      const route = await tx.tenantRoute.update({
        where: { id: routeId },
        data:  { isActive: false },
      });
      this.router.setStatus(route.path, 'DRAINING');
    });
  }
}
```

- [ ] `src/modules/route-ingress/route-ingress.controller.ts`:

```typescript
import { Controller, Post, Delete, Param, Body, Req } from '@nestjs/common';
import { RouteIngressService } from './route-ingress.service';
import { RegisterRouteDto } from './dto/register-route.dto';

@Controller('api/v1/routes')
export class RouteIngressController {
  constructor(private readonly svc: RouteIngressService) {}

  @Post()
  async register(@Body() dto: RegisterRouteDto, @Req() req: any) {
    await this.svc.registerRoute(dto, req.headers['x-forwarded-tenant-id']);
    return { ok: true };
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string, @Req() req: any) {
    await this.svc.deactivateRoute(id, req.headers['x-forwarded-tenant-id']);
    return { ok: true };
  }
}
```

- [ ] `src/modules/route-ingress/route-ingress.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RouteIngressService }    from './route-ingress.service';
import { RouteIngressController } from './route-ingress.controller';

@Module({
  controllers: [RouteIngressController],
  providers:   [RouteIngressService],
  exports:     [RouteIngressService],
})
export class RouteIngressModule {}
```

---

## Алхам 1.6 — AppModule шинэчлэх

- [ ] `src/app/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule }          from '../auth/auth.module';
import { TenantAuthGuard }     from '../auth/tenant-auth.guard';
import { TenantContextInterceptor } from '../auth/tenant-context.interceptor';
import { RouteIngressModule }  from '../modules/route-ingress/route-ingress.module';
import { DynamicIngressRouterService } from '../gateway/dynamic-ingress-router.service';
import { DrainingInterceptor } from '../gateway/draining.interceptor';

@Module({
  imports:   [AuthModule, RouteIngressModule],
  providers: [
    DynamicIngressRouterService,
    DrainingInterceptor,
    { provide: APP_GUARD,       useExisting: TenantAuthGuard },           // RULE-07
    { provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },  // RULE-07
    { provide: APP_INTERCEPTOR, useExisting: DrainingInterceptor },       // RULE-07
  ],
})
export class AppModule {}
```

---

## Алхам 1.7 — Unit тестүүд

- [ ] `route-ingress.service.spec.ts`: registerRoute / resolveRoute / deactivateRoute / RLS tenant isolation
- [ ] `draining.interceptor.spec.ts`: DRAINING+POST→503 / DRAINING+GET→pass / ACTIVE→pass / inflight=0+DRAINING→OFFLINE

---

## Алхам 1.8 — 👤 ХЭРЭГЛЭГЧ ажиллуулах

```bash
supabase db push
pnpm --filter core-kernel exec prisma generate
pnpm --filter core-kernel test
pnpm --filter core-kernel test:e2e
```

**✅ Sprint 1 дуусах шалгуур:** RLS leak тест ногоон + DRAINING 503 тест ногоон

---

## Checklist

- [ ] 1.1 Migration tenant_routes
- [ ] 1.2 Prisma TenantRoute model
- [ ] 1.3 DynamicIngressRouterService
- [ ] 1.4 DrainingInterceptor
- [ ] 1.5 RouteIngress module файлууд (dto, service, controller, module)
- [ ] 1.6 AppModule шинэчлэх
- [ ] 1.7 Unit тестүүд
- [ ] 1.8 👤 supabase db push + test
