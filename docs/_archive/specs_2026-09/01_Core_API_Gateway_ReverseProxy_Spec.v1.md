---
title: "02_System_Architecture: Core API Gateway & Reverse Proxy Spec"
type: "Architecture"
status: "Archived"
last_updated: 2026-10-13
tags: [api]
---

> 🗄 **Архив (2026-10-13):** 2026-09-ийн анхны хувилбар — одоогийн бодит байдалтай зөрнө (Kubernetes/gRPC/PgBouncer/`SET LOCAL`/Express г.м.). **Одоогийн баримт: [[01_Core_API_Gateway_ReverseProxy_Spec]].** Хөгжүүлэлтэд ашиглахгүй — зөвхөн түүх, санаа сэргээхэд.


# 02_System_Architecture: Core API Gateway & Reverse Proxy Spec

**Хувилбар:** v2.0.0  
**Огноо:** 2026-09-20  
**Өмнөх хувилбар:** v1.0.0 → NestJS + Supabase Auth стект шилжүүлэв. Express middleware → NestJS Guard/Interceptor болгов.

---

## 1. Manifest-д суурилсан Dynamic Route Ingress Алгоритм

Core Gateway нь модулийн `manifest.json`-ийг уншиж санах ой дахь Ingress Radix Tree-г динамикаар шинэчилнэ.

### 1.1. Ingress Flow

```
[Module Registration]
        │
        ▼
1. Validate JSON Schema (manifest.json)
        │
        ▼
2. Check Core & Module Dependencies
        │
        ▼
3. Atomic Route Swap (Write Lock / Mutex)
        ├── Target Base Path: /api/v1/requisitions/*
        ├── Upstream Target: http://svc-material-requisition:4001
        └── Health Endpoint: http://svc-material-requisition:4001/healthz
        │
        ▼
4. Broadcast ROUTE_UPDATED to Gateway Worker Fleet
```

### 1.2. Dynamic Ingress Router — NestJS Service

```typescript
// core-kernel/src/gateway/dynamic-ingress-router.service.ts
import { Injectable, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ModuleManifest {
  module_id:    string;
  version:      string;
  dependencies: string[];
  api_routes: {
    base_path:   string;
    target_port: number;
    target_host?: string;
  };
  permissions: string[];
}

export type RouteStatus = 'ACTIVE' | 'DRAINING' | 'OFFLINE';

export interface RouteEntry {
  target:     string;
  status:     RouteStatus;
  moduleId:   string;
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
        this.events.emit('gateway.route.draining', { basePath, moduleId: entry.moduleId });
      }
    }
  }
}
```

---

## 2. Tenant Resolution, Authentication ба Downstream Proxy

### 2.1. Суваг — Supabase Auth JWT баталгаажуулалт

Суурь стек: **Supabase Auth** (`@supabase/supabase-js`). Custom RS256 verify хийх шаардлагагүй — Supabase-н JWT Secret-ийг ашиглана.

```
[HTTP хүсэлт]
      │
      ▼
1. Subdomain → tenant_id (Redis cache)
      │  Алга бол → X-Tenant-ID header
      ▼
2. Authorization: Bearer <JWT>
   → Supabase Auth-аар баталгаажуулах
   → JWT claims: { sub, tenant_id, role, permissions }
      │
      ▼
3. jwt.tenant_id === resolved_tenant_id шалгах
   Зөрвөл → 403 TENANT_MISMATCH
      │
      ▼
4. Downstream headers inject:
   X-Forwarded-Tenant-ID
   X-Forwarded-User-ID
   X-Forwarded-Permissions
   X-Correlation-ID
      │
      ▼
5. Reverse Proxy → Upstream Module Service
```

### 2.2. NestJS Guard — Tenant + Auth шалгалт

```typescript
// core-kernel/src/auth/tenant-auth.guard.ts
import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { tenantStorage, TenantContext } from '../db/prisma-tenant-client';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  private readonly supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req  = context.switchToHttp().getRequest();
    const res  = context.switchToHttp().getResponse();
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedException('MISSING_TOKEN');

    // 1. Supabase Auth-аар JWT баталгаажуулах
    const { data: { user }, error } = await this.supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('INVALID_TOKEN');

    // 2. Tenant resolution — subdomain эхлээд, дараа header
    const subdomain     = req.hostname?.split('.')[0];
    const resolvedId    = subdomain
      ? await this.redis.get(`tenant:slug:${subdomain}`)
      : req.headers['x-tenant-id'];

    const jwtTenantId = user.user_metadata?.tenant_id as string;

    // 3. JWT claims ба resolved tenant_id тохируулсан эсэх шалгах
    if (!resolvedId || jwtTenantId !== resolvedId) {
      throw new ForbiddenException('TENANT_MISMATCH');
    }

    // 4. Downstream итгэмжлэгдсэн header-үүд тохируулах
    const correlationId =
      (req.headers['x-correlation-id'] as string) ?? randomUUID();

    req.headers['x-forwarded-tenant-id']  = resolvedId;
    req.headers['x-forwarded-user-id']    = user.id;
    req.headers['x-forwarded-permissions']= JSON.stringify(
      user.user_metadata?.permissions ?? []
    );
    req.headers['x-correlation-id']       = correlationId;

    // Гадны client-ийн spoofing оролдлогыг устгах
    delete req.headers['x-tenant-id'];
    delete req.headers['x-user-id'];

    // 5. AsyncLocalStorage-д tenant context тохируулах (RLS-д хэрэгтэй)
    const ctx: TenantContext = {
      tenantId:      resolvedId,
      userId:        user.id,
      correlationId,
    };
    // NestJS execution context-д context дамжуулах
    req._tenantCtx = ctx;
    return true;
  }
}
```

### 2.3. NestJS Interceptor — Tenant Context AsyncLocalStorage-д оруулах

```typescript
// core-kernel/src/auth/tenant-context.interceptor.ts
import {
  Injectable, NestInterceptor,
  ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from '../db/prisma-tenant-client';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const ctx = req._tenantCtx;

    if (!ctx) return next.handle();

    // RxJS Observable-г AsyncLocalStorage context дотор ажиллуулах
    return new Observable((subscriber) => {
      tenantStorage.run(ctx, () => {
        next.handle().subscribe({
          next:     (v) => subscriber.next(v),
          error:    (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
```

### 2.4. AppModule дээр бүртгэх

```typescript
// core-kernel/src/app.module.ts
import { Module }       from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantAuthGuard }            from './auth/tenant-auth.guard';
import { TenantContextInterceptor }   from './auth/tenant-context.interceptor';

@Module({
  providers: [
    { provide: APP_GUARD,       useExisting: TenantAuthGuard },
    { provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },
  ],
})
export class AppModule {}
```

---

## 3. Модуль 'Draining' төлөв ба Graceful Shutdown — NestJS Interceptor

```typescript
// core-kernel/src/gateway/draining.interceptor.ts
import {
  Injectable, NestInterceptor, ExecutionContext,
  CallHandler, ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { DynamicIngressRouterService } from './dynamic-ingress-router.service';

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

    // In-flight хүсэлтийн тоог хянах
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
      this.router.setStatus(
        [...this.router['routes'].entries()].find(([, v]) => v.target === route.target)?.[0] ?? '',
        'OFFLINE'
      );
    }
  }
}
```

---

## 4. Supabase Realtime — WebSocket Gateway орлуулах

Custom WebSocket Gateway тусдаа хийх шаардлагагүй. **Supabase Realtime** нь RLS-г автоматаар дагаж зөвхөн тухайн тенантын өгөгдлийг дамжуулна.

```typescript
// Frontend: React module доторх Realtime subscription
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// mr_headers хүснэгтийн өөрчлөлтийг бодит цагт хүлээх
// RLS автоматаар ажиллах тул зөвхөн өөрийн tenant-н мэдэгдэл ирнэ
const channel = supabase
  .channel('mr-updates')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'mr_headers' },
    (payload) => {
      console.log('MR updated:', payload);
      // Redux / Zustand store шинэчлэх
    }
  )
  .subscribe();
```

> **Тэмдэглэл:** [[PRD-01_Core_Vision]]-н Section 4 (WebSocket Gateway)-д заасан `Dual-Protocol Proxy` нь Supabase Realtime-аар бүрэн орлогдоно. Тусдаа WebSocket сервер хийх шаардлагагүй.

---

## 5. Environment Variables (Supabase Local)

```bash
# .env.local — Core Kernel

# Supabase Local (supabase start-аар асдаг)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<supabase start гарсан service_role key>
SUPABASE_ANON_KEY=<supabase start гарсан anon key>

# Prisma — Supabase local PostgreSQL шууд холболт
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
DIRECT_URL="postgresql://postgres:postgres@localhost:54322/postgres"

# Redis
REDIS_URL=redis://localhost:6379

# JWT
# Supabase local нь өөрийн JWT_SECRET ашигладаг — supabase/config.toml-оос авна
```
