---
title: "Sprint 8 — Performance & Scaling (v0.1.5.3)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-08
tags: [roadmap, v0.1.5]
---

# Sprint 8 — Performance & Scaling (v0.1.5.3)

> **Зорилго:** 1000+ хэрэглэгчийн ачаалал тэвчих — Redis caching, cursor pagination, rate limiting, cluster
> **Working dir:** `apps/core-kernel/src/` + `apps/web-shell/src/`
> **Хамаарал:** Sprint 7-тэй зэрэгцүүлж хийж болно (тусдаа module)

---

## Алхам 8.1 — Redis Caching Layer Өргөтгөх

Одоогийн `TenantCacheService` нь зөвхөн tenant slug → tenant_id cache хийдэг.
v0.1.5-д MR жагсаалт, workflow definition-г cache хийнэ.

- [x] `apps/core-kernel/src/cache/cache.module.ts` — centralized cache module:

```typescript
import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: () => ({
        store: redisStore,
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        ttl: 300, // default 5 минут
      }),
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class AppCacheModule {}
```

- [x] `apps/core-kernel/src/cache/cache.service.ts`:

```typescript
@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  // Cache key convention: "<module>:<tenantId>:<resource>:<id>"
  buildKey(module: string, tenantId: string, resource: string, id?: string): string {
    return id
      ? `${module}:${tenantId}:${resource}:${id}`
      : `${module}:${tenantId}:${resource}`;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key) ?? null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  // Tenant-н бүх cache цэвэрлэх (tenant өгөгдөл өөрчлөгдөхөд)
  async invalidateTenant(tenantId: string): Promise<void> {
    // Redis SCAN + DEL pattern: "*:<tenantId>:*"
    // ioredis-тэй ажиллах implementation
  }
}
```

- [x] `MaterialRequisitionService`-д cache нэгтгэх:

```typescript
async findAll(tenantId: string, query: ListMrQueryDto) {
  const cacheKey = this.cache.buildKey('mr', tenantId, 'list', JSON.stringify(query));
  const cached = await this.cache.get(cacheKey);
  if (cached) return cached;

  const result = await this.schemaRouter.withSchema(tenantId, async (tx) => {
    // ... DB query
  });

  await this.cache.set(cacheKey, result, 60); // 1 минут TTL
  return result;
}

async update(tenantId: string, id: string, dto: UpdateMrDto) {
  const result = await /* ... update logic */;
  // Cache invalidate
  await this.cache.del(this.cache.buildKey('mr', tenantId, 'list'));
  await this.cache.del(this.cache.buildKey('mr', tenantId, 'detail', id));
  return result;
}
```

- [x] `WorkflowDefinitionService`-д cache нэгтгэх:
  - `findByTenant()` → TTL 10 минут (definition тогтвортой)
  - Definition update → tenant cache invalidate

---

## Алхам 8.2 — Cursor-Based Pagination

Одоогийн `{page, limit}` offset pagination нь том dataset-д х느리 болдог.

- [x] `apps/core-kernel/src/common/dto/cursor-pagination.dto.ts`:

```typescript
export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string;   // base64(lastId + createdAt)

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;  // optional — count query нэмэлт ачааллагатай
}
```

- [x] Cursor encode/decode utility:

```typescript
export const encodeCursor = (id: string, createdAt: Date): string =>
  Buffer.from(JSON.stringify({ id, createdAt: createdAt.toISOString() }))
    .toString('base64url');

export const decodeCursor = (cursor: string): { id: string; createdAt: Date } => {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
  return { id: decoded.id, createdAt: new Date(decoded.createdAt) };
};
```

- [x] `MaterialRequisitionService.findAll()` cursor pagination болгох:

```typescript
async findAll(tenantId: string, dto: CursorPaginationDto): Promise<CursorPaginationResult<MrDto>> {
  const { cursor, limit = 20, order = 'desc' } = dto;

  const where: Prisma.MrHeaderWhereInput = { tenantId };

  if (cursor) {
    const { id, createdAt } = decodeCursor(cursor);
    where.OR = [
      { createdAt: order === 'desc' ? { lt: createdAt } : { gt: createdAt } },
      { createdAt, id: order === 'desc' ? { lt: id } : { gt: id } },
    ];
  }

  const items = await tx.mrHeader.findMany({
    where,
    orderBy: [{ createdAt: order }, { id: order }],
    take: limit + 1,   // +1 → hasMore шалгах
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];

  return {
    data: data.map(toMrDto),
    nextCursor: hasMore ? encodeCursor(lastItem.id, lastItem.createdAt) : null,
    hasMore,
  };
}
```

- [x] Frontend `MRListPage.tsx`-д cursor pagination нэгтгэх (TanStack Query `useInfiniteQuery`):

```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['requisitions'],
  queryFn: ({ pageParam }) => mrApi.list({ cursor: pageParam }),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
```

---

## Алхам 8.3 — Database Index Tuning

- [x] `supabase/migrations/20260922004_performance_indexes.sql`:

```sql
-- mr_headers-д байнга filter хийгдэх column-уудад composite index
CREATE INDEX IF NOT EXISTS idx_mr_headers_tenant_status_created
  ON mr_headers(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mr_headers_tenant_submitter_created
  ON mr_headers(tenant_id, submitted_by_id, created_at DESC)
  WHERE status != 'DRAFT';   -- Partial index — DRAFT биш-ийг хурдан хайх

-- workflow_instances-д
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_status
  ON workflow_instances(tenant_id, status, created_at DESC)
  WHERE status = 'PENDING';

-- outbox_events-д
CREATE INDEX IF NOT EXISTS idx_outbox_events_status_retry
  ON outbox_events(status, next_retry_at)
  WHERE status IN ('PENDING', 'FAILED');

-- workflow_sla_logs-д
CREATE INDEX IF NOT EXISTS idx_sla_tenant_due_pending
  ON workflow_sla_logs(tenant_id, due_at, status)
  WHERE status = 'PENDING';

-- EXPLAIN ANALYZE-н үр дүнг lessons_learned.md-д бичих
```

---

## Алхам 8.4 — Rate Limiting per Tenant

- [x] `pnpm --filter core-kernel add @nestjs/throttler`:

```typescript
// app.module.ts
ThrottlerModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    throttlers: [
      { name: 'short',  ttl: 1000,  limit: 10  },  // 1 сек дотор 10 req
      { name: 'medium', ttl: 10000, limit: 50  },  // 10 сек дотор 50 req
      { name: 'long',   ttl: 60000, limit: 200 },  // 1 мин дотор 200 req
    ],
    storage: new ThrottlerStorageRedisService(redis),  // Redis-тэй
  }),
  inject: [ConfigService],
}),
```

- [x] Custom throttler guard — tenant-аар хязгаарлах:

```typescript
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    // IP биш tenant ID-аар хязгаарлана
    const tenantId = req.user?.tenantId;
    return Promise.resolve(tenantId ?? req.ip);
  }
}
```

- [x] Rate limit exceed → `429 Too Many Requests` + `Retry-After` header

---

## Алхам 8.5 — NestJS Cluster Mode

- [x] `apps/core-kernel/src/main.ts` cluster mode нэмэх:

```typescript
import cluster from 'node:cluster';
import os from 'node:os';

const WORKERS = parseInt(process.env.NODE_CLUSTER_WORKERS ?? '1');

if (cluster.isPrimary && WORKERS > 1) {
  console.log(`Master PID ${process.pid} — spawning ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    console.warn(`Worker ${worker.process.pid} died — restarting`);
    cluster.fork();
  });
} else {
  bootstrap();
}
```

- [x] `docker-compose.yml`-д `NODE_CLUSTER_WORKERS=4` нэмэх

---

## Алхам 8.6 — Load Test Script

- [x] `apps/e2e/tests/load-test.ts` (autocannon):

```typescript
// autocannon ашиглах (npm package — install шаардлагагүй)
// pnpm --filter e2e add -D autocannon

import autocannon from 'autocannon';

const result = await autocannon({
  url: 'http://localhost:3000/api/v1/requisitions',
  connections: 100,     // concurrent connections
  duration: 30,         // секунд
  headers: {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'x-tenant-slug': 'test-tenant',
  },
});

// Шалгуур:
// - p99 latency < 500ms
// - Error rate < 1%
// - Throughput > 500 req/sec
console.assert(result.latency.p99 < 500, `p99 latency too high: ${result.latency.p99}ms`);
console.assert(result.errors === 0, `Errors: ${result.errors}`);
```

- [x] `package.json`-д script нэмэх:
```json
{
  "scripts": {
    "test:load": "pnpm --filter e2e tsx src/load-test.ts"
  }
}
```

---

## Алхам 8.7 — Frontend Virtualization

- [x] `pnpm --filter web-shell add @tanstack/react-virtual`:

```typescript
// MRListPage.tsx — виртуал жагсаалт (10000+ MR хурдан render)
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: allRows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 64,  // row өндөр (px)
  overscan: 5,
});
```

---

## Тест

- [x] `apps/core-kernel/src/cache/tests/cache.service.test.ts`:
  - Cache hit → DB query дуудагдахгүй
  - Cache miss → DB query дуудагдана
  - Update → cache invalidate
  - TTL дуусвал → fresh data авна

- [x] `apps/core-kernel/src/common/tests/cursor-pagination.test.ts`:
  - Cursor encode/decode → roundtrip зөв
  - limit+1 query → hasMore зөв
  - Empty result → nextCursor null

- [x] Rate limit тест:
  - 11 дэх хүсэлт 1 сек дотор → 429
  - Retry-After header байна

---

## Шалгуур (Definition of Done)

- [x] `pnpm test` бүх performance тест давна
- [x] Load test: 100 concurrent, p99 < 500ms, error 0% — `apps/e2e/tests/load-test.ts` → ✅ **p99=57ms**, avg 29ms, 3360 req/s, 100,771 × 2xx, non-2xx 0 (2026-10-08, Windows local, 100 conn × 30s; Phase 3.7 auth cache-ийн дараа)
- [x] Cache hit rate > 80% (жагсаалт endpoint) — load-test.ts → ✅ **100%** (705,883 hits / 0 miss)
- [x] Cursor pagination: 10,000 MR жагсаалтад response < 100ms — ✅ **HTTP max 31ms**, avg 18ms (20 хуудас); DB 5.8ms @10k
- [x] Rate limit: tenant-аар хязгаарлагдана, 429 зөв буцаана
- [x] `NODE_CLUSTER_WORKERS=4` — 4 worker асна, crash нэг нь restart хийнэ — `apps/e2e/tests/cluster-check.ts` → ✅ 4 worker online, kill → шинэ worker, /health 2/2 (2026-10-08, Windows)

---

## Алдааны Урьдчилсан Сэрэмжлүүлэг

> ⚠️ **АНХААР:** Redis cache нь tenant-ийн өгөгдлийг хадгалдаг — cache key-д `tenantId` заавал орох ёстой. `tenantId` ороогүй бол tenant A-н cache tenant B-д харагдах эрсдэл!

> ⚠️ **АНХААР:** Cursor pagination-д `createdAt` + `id` хоёуланг ашиглах — `createdAt` дангаараа уникал биш (millisecond precision-д давхцаж болно).

> ⚠️ **АНХААР:** NestJS cluster mode + AsyncLocalStorage — worker бүрийн `AsyncLocalStorage` instance тусдаа байна. Redis-тэй session share хийхгүй тохиолдолд зөв ажиллана.
