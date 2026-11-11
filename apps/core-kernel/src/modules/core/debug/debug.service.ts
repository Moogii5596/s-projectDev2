import { Inject, Injectable } from '@nestjs/common';
import { CampAuditAction, Prisma } from '@prisma/client';
import { statfs } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Redis from 'ioredis';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { SystemPrismaService } from '../../../db/system-prisma.service';
import { REDIS_CLIENT } from '../../../db/redis.module';
import { inTenantTx } from '../../../db/tenant-tx';
import { notFound, forbidden, badRequest } from '../../../common/i18n/app-error';
import { APP_VERSION } from '../../../config/app-version';
import { RecentLogLogger } from '../../../common/logging/recent-log.logger';
import { catalog } from '../../../common/i18n/catalog';
import { I18nOverridesService } from '../../../common/i18n/i18n-overrides.service';
import { MailerService } from '../../../auth/mailer.service';
import { STORAGE_SERVICE, type StorageService } from '../../../storage/storage.service';
import { storageDir } from '../../../storage/storage.module';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { CoreTenantModulesService } from '../modules/core-tenant-modules.service';
import { PERMISSIONS } from '../permissions/permission-registry';
import { ScheduledJobRegistry } from '../scheduler/scheduled-job.registry';
import { evaluateDebugStorageWarning } from './debug-storage-warning';

type Tx = Prisma.TransactionClient;

/** Утгыг харуулж болох (нууц биш) тохиргоо; бусад нь зөвхөн «тохируулсан эсэх» */
const PUBLIC_CONFIG = new Set([
  'NODE_ENV', 'PORT', 'DEPLOYMENT_MODE', 'DEDICATED_TENANT_SLUG', 'DEV_TENANT_SLUG', 'DEBUG_MENU_ENABLED', 'RATE_LIMIT_SHORT',
  'RATE_LIMIT_MEDIUM', 'RATE_LIMIT_LONG', 'NODE_CLUSTER_WORKERS', 'PRISMA_LOG_LEVELS', 'STORAGE_DIR', 'ESCALATION_CRON',
  'OUTBOX_POLLER_CRON', 'NOTIFICATION_MAIL_CRON', 'PUBLIC_APP_URL', 'SMTP_HOST', 'SMTP_PORT', 'SUPABASE_URL', 'PILOT_STORAGE_DB_WARN_GB',
  'LOG_FORMAT', 'TRUST_PROXY', 'CORS_ORIGINS', 'SENTRY_ENVIRONMENT',
]);
const SECRET_CONFIG = [
  'DATABASE_URL', 'SYSTEM_DATABASE_URL', 'DIRECT_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_AUTH_JWT_SECRET',
  'REDIS_URL', 'JWT_SECRET', 'MEDIA_URL_SECRET', 'FILE_ENCRYPTION_KEY', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'SENTRY_DSN',
];

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; value?: T; error?: string }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - t0, value };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: (err as Error).message.slice(0, 200) };
  }
}

/**
 * v0.2.4 Блок 10 (DBG-01, D-1) — Debug цэс: системийн мэдээлэл, эрүүл мэнд, эрхийн шалгагч, лог/audit, орчуулгын дутуу,
 * үйлдэлтэй хэрэгсэл. Хаалт: deploy `DEBUG_MENU_ENABLED` + `core.debug.view` (OWNER автоматаар) — `DebugAccessGuard`.
 * Нууц (токен, нууц үг, холболтын мөр) хэзээ ч буцаахгүй.
 */
@Injectable()
export class DebugService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly system: SystemPrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly mailer: MailerService,
    private readonly jobs: ScheduledJobRegistry,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly modules: CoreTenantModulesService,
    private readonly overrides: I18nOverridesService,
  ) {}

  async systemInfo(tenantId: string) {
    const tenant = await this.system.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true, name: true } });
    const mem = process.memoryUsage();
    const config = [
      ...[...PUBLIC_CONFIG].map((key) => ({ key, secret: false, set: !!process.env[key], value: process.env[key] ?? null })),
      ...SECRET_CONFIG.map((key) => ({ key, secret: true, set: !!process.env[key], value: null })),
    ].sort((a, b) => a.key.localeCompare(b.key));
    return {
      version: APP_VERSION,
      commit: process.env['GIT_COMMIT'] ?? process.env['BUILD_SHA'] ?? process.env['RENDER_GIT_COMMIT'] ?? null,
      buildDate: process.env['BUILD_DATE'] ?? null,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      nest: this.nestVersion(),
      platform: `${process.platform}/${process.arch}`,
      pid: process.pid,
      memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
      environment: process.env['NODE_ENV'] ?? 'development',
      tenant,
      config,
    };
  }

  async health(tenantId: string) {
    const db = await timed(async () => {
      const rows = await this.system.$queryRaw<Array<{ size: bigint; migration: string | null }>>`
        SELECT pg_database_size(current_database()) AS size,
               (SELECT max(version) FROM supabase_migrations.schema_migrations) AS migration`;
      return { sizeBytes: Number(rows[0]?.size ?? 0), lastMigration: rows[0]?.migration ?? null };
    });
    const redis = await timed(() => this.redis.ping());
    const gotrue = await timed(async () => {
      const base = process.env['SUPABASE_URL'];
      if (!base) throw new Error('SUPABASE_URL тохируулаагүй');
      const res = await fetch(`${base.replace(/\/+$/, '')}/auth/v1/health`, {
        signal: AbortSignal.timeout(3000),
        headers: process.env['SUPABASE_ANON_KEY'] ? { apikey: process.env['SUPABASE_ANON_KEY'] } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.status;
    });
    const storage = await timed(async () => {
      const usage = await this.storage.usage();
      const fs = await statfs(storageDir());
      return { ...usage, diskFreeBytes: Number(fs.bavail) * Number(fs.bsize), diskTotalBytes: Number(fs.blocks) * Number(fs.bsize) };
    });
    const queues = await inTenantTx(this.prisma, tenantId, async (tx) => ({
      outbox: await this.groupCount(tx, 'outbox'),
      notificationEmail: await this.groupCount(tx, 'email'),
    })).catch((err: Error) => ({ error: err.message.slice(0, 200) }));
    const cron = (await this.jobs.statuses()).map((job) => ({
      ...job,
      name: job.id,
      lastRun: job.lastStartedAt?.toISOString() ?? null,
    }));
    return {
      db: { ok: db.ok, ms: db.ms, error: db.error ?? null, ...(db.value ?? {}) },
      redis: { ok: redis.ok, ms: redis.ms, error: redis.error ?? null },
      gotrue: { ok: gotrue.ok, ms: gotrue.ms, error: gotrue.error ?? null },
      smtp: { configured: this.mailer.isEnabled() },
      storage: { ok: storage.ok, error: storage.error ?? null, ...(storage.value ?? {}) },
      storageDbWarning: evaluateDebugStorageWarning(
        db.ok ? db.value?.sizeBytes : undefined,
        storage.ok ? storage.value?.bytes : undefined,
        process.env['PILOT_STORAGE_DB_WARN_GB'],
      ),
      queues,
      cron,
    };
  }

  /** Эрхийн шалгагч — сонгосон хэрэглэгчийн эцсийн эрх, эх сурвалж (ADR-007). Уншина. */
  async permissions(tenantId: string, userId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const user = await tx.coreUser.findFirst({
        where: { tenantId, id: userId },
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
      });
      if (!user) throw notFound('core.debug.user_not_found');
      const perms = await tx.coreUserPermission.findMany({
        where: { tenantId, userId },
        select: { permissionCode: true, campId: true, source: true, userRoleId: true },
        orderBy: [{ permissionCode: 'asc' }],
      });
      const roleIds = [...new Set(perms.map((p) => p.userRoleId).filter((v): v is string => !!v))];
      const userRoles = roleIds.length
        ? await tx.coreUserRole.findMany({ where: { tenantId, id: { in: roleIds } }, select: { id: true, role: { select: { name: true, systemCode: true } } } })
        : [];
      const roleName = new Map(userRoles.map((r) => [r.id, r.role.name]));
      const campIds = [...new Set(perms.map((p) => p.campId).filter((v): v is string => !!v))];
      const camps = campIds.length ? await tx.camp.findMany({ where: { tenantId, id: { in: campIds } }, select: { id: true, name: true } }) : [];
      const campName = new Map(camps.map((c) => [c.id, c.name]));
      const isTenantAdmin = user.role === 'OWNER' || user.role === 'ADMIN';
      return {
        user: { ...user, email: user.email },
        isTenantAdmin,
        debugView: user.role === 'OWNER' || perms.some((p) => p.permissionCode === PERMISSIONS.DEBUG_VIEW && p.campId === null),
        items: perms.map((p) => ({
          code: p.permissionCode,
          scope: p.campId ? 'SITE' : 'TENANT',
          siteName: p.campId ? (campName.get(p.campId) ?? p.campId) : null,
          source: p.source,
          roleName: p.userRoleId ? (roleName.get(p.userRoleId) ?? null) : null,
        })),
      };
    });
  }

  async users(tenantId: string) {
    return inTenantTx(this.prisma, tenantId, (tx) =>
      tx.coreUser.findMany({ where: { tenantId }, select: { id: true, fullName: true, email: true, role: true, isActive: true }, orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }] }),
    );
  }

  /** Процессын лог нь бүх tenant-ийнх → зөвхөн нэг tenant-тай deploy эсвэл super admin */
  async logs(tenantId: string, authId: string, level?: 'error' | 'warn') {
    const tenants = await this.system.tenant.count();
    if (tenants > 1) {
      const sa = await this.system.superAdmin.findFirst({ where: { user: { authId } }, select: { userId: true } });
      if (!sa) throw forbidden('core.debug.logs_multi_tenant');
    }
    return { items: RecentLogLogger.entries(level) };
  }

  async auditLog(tenantId: string, q: { entityType?: string; limit?: number }) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const rows = await tx.campAuditLog.findMany({
        where: { tenantId, ...(q.entityType ? { entityType: q.entityType } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(q.limit ?? 100, 1), 500),
      });
      const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => !!v))];
      const actors = actorIds.length ? await tx.coreUser.findMany({ where: { tenantId, id: { in: actorIds } }, select: { id: true, fullName: true, email: true } }) : [];
      const names = new Map(actors.map((a) => [a.id, a.fullName?.trim() || a.email]));
      return {
        items: rows.map((r) => ({
          id: r.id, at: r.createdAt.toISOString(), entityType: r.entityType, entityId: r.entityId, action: r.action,
          summaryKey: r.summaryKey, summaryParams: r.summaryParams, actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
        })),
      };
    });
  }

  /** Орчуулга дутуу: en/zh хоосон, эсвэл монгол (кирилл) хэвээр үлдсэн */
  async i18nMissing(tenantId: string) {
    const ov = await this.overrides.load(tenantId);
    const cyr = /[Ѐ-ӿ]/;
    const items: Array<{ key: string; section: string; missing: string[] }> = [];
    for (const entry of catalog().values()) {
      const missing: string[] = [];
      for (const lang of ['en', 'zh'] as const) {
        const text = ov.get(`${lang}:${entry.key}`) ?? entry.defaults[lang];
        if (!text?.trim() || cyr.test(text)) missing.push(lang);
      }
      if (missing.length) items.push({ key: entry.key, section: entry.section, missing });
    }
    return { total: catalog().size, items: items.sort((a, b) => a.key.localeCompare(b.key)) };
  }

  // ── Үйлдэл (core.debug.manage, audit) ────────────────────

  async clearCaches(tenantId: string, authId: string) {
    const actorId = await this.requireManage(tenantId, authId);
    await this.access.invalidate(tenantId);
    await this.modules.invalidate(tenantId);
    this.overrides.invalidate(tenantId);
    await inTenantTx(this.prisma, tenantId, (tx) =>
      this.audit.record(tx, {
        tenantId, campId: null, entityType: 'debug_action', entityId: tenantId, action: CampAuditAction.UPDATE, actorUserId: actorId,
        fields: ['action'], before: { action: null }, after: { action: 'cache_clear' }, summaryParams: { action: 'cache_clear' },
      }),
    );
    return { ok: true as const };
  }

  async outbox(tenantId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const rows = await tx.outboxEvent.findMany({
        where: { tenantId, status: { in: ['FAILED', 'DLQ'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, eventType: true, aggregateType: true, aggregateId: true, status: true, retryCount: true, lastError: true, errorMessage: true, createdAt: true },
      });
      return { items: rows.map((r) => ({ ...r, lastError: r.lastError ?? r.errorMessage, createdAt: r.createdAt.toISOString() })) };
    });
  }

  async retryOutbox(tenantId: string, authId: string, id: string) {
    const actorId = await this.requireManage(tenantId, authId);
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const res = await tx.outboxEvent.updateMany({
        where: { id, tenantId, status: { in: ['FAILED', 'DLQ'] } },
        data: { status: 'PENDING', retryCount: 0, nextRetryAt: new Date() },
      });
      if (res.count === 0) throw badRequest('core.debug.outbox_not_retryable');
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'debug_action', entityId: id, action: CampAuditAction.UPDATE, actorUserId: actorId,
        fields: ['action'], before: { action: null }, after: { action: 'outbox_retry' }, summaryParams: { action: 'outbox_retry' },
      });
    });
    return { ok: true as const };
  }

  async canManage(tenantId: string, authId: string): Promise<boolean> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const u = await tx.coreUser.findFirst({ where: { tenantId, authId, isActive: true }, select: { id: true, role: true } });
      if (!u) return false;
      if (u.role === 'OWNER') return true;
      return (await tx.coreUserPermission.count({ where: { tenantId, userId: u.id, campId: null, permissionCode: PERMISSIONS.DEBUG_MANAGE } })) > 0;
    });
  }

  private async requireManage(tenantId: string, authId: string): Promise<string> {
    if (!(await this.canManage(tenantId, authId))) throw forbidden('core.debug.manage_required');
    return inTenantTx(this.prisma, tenantId, async (tx) => (await tx.coreUser.findFirstOrThrow({ where: { tenantId, authId }, select: { id: true } })).id);
  }

  private async groupCount(tx: Tx, which: 'outbox' | 'email'): Promise<Record<string, number>> {
    if (which === 'outbox') {
      const g = await tx.outboxEvent.groupBy({ by: ['status'], _count: { _all: true } });
      return Object.fromEntries(g.map((x) => [x.status, x._count._all]));
    }
    const g = await tx.coreNotification.groupBy({ by: ['emailStatus'], where: { emailStatus: { not: 'NONE' } }, _count: { _all: true } });
    return Object.fromEntries(g.map((x) => [x.emailStatus, x._count._all]));
  }

  private nestVersion(): string | null {
    try {
      const file = join(dirname(require.resolve('@nestjs/core')), 'package.json');
      return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
    } catch {
      return null;
    }
  }
}
