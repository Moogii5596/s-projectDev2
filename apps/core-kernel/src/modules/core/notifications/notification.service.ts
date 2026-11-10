import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { inTenantTx } from '../../../db/tenant-tx';
import { forbidden, notFound } from '../../../common/i18n/app-error';
import { CoreTenantModulesService } from '../modules/core-tenant-modules.service';
import { isTenantModuleId } from '../modules/module-registry';
import { NotificationTypeRegistry } from './notification-type.registry';
import type { NotificationTypeDef } from './notification-types';

type Tx = Prisma.TransactionClient;
export type NotificationParams = Record<string, string | number | boolean | null>;

export interface NotifyInput {
  type: string;
  /** core_users.id */
  recipients: readonly string[];
  titleKey: string;
  bodyKey?: string | null;
  params?: NotificationParams;
  /** Апп доторх зам (`/camp/...`) — гадаад URL ✖ */
  link?: string | null;
  /** Үйлдэл хийсэн хэрэглэгч өөртөө мэдэгдэл авахгүй */
  excludeUserId?: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  titleKey: string;
  bodyKey: string | null;
  params: NotificationParams;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPrefView {
  type: string;
  module: string;
  labelKey: string;
  inApp: boolean;
  email: boolean;
}

const LINK_RE = /^\/[^/]/;
const MAX_LIMIT = 50;

/**
 * v0.2.4 Блок 7 (NTF-01) — мэдэгдэл.
 *   - `notify(tx, …)` — модулийн бизнесийн transaction дотор (transactional outbox): мөр нь үйлдэлтэй хамт commit/rollback.
 *   - Суваг хэрэглэгчийн тохиргоогоор (мөр байхгүй бол төрлийн анхдагч); имэйлийг `NotificationMailScheduler` илгээнэ.
 *   - Текст = i18n түлхүүр + params → хэрэглэгчийн хэлээр (frontend: i18next, имэйл: backend `t`) — tenant override тусна.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly registry: NotificationTypeRegistry,
    private readonly modules: CoreTenantModulesService,
  ) {}

  async notify(tx: Tx, tenantId: string, input: NotifyInput): Promise<number> {
    const def = this.registry.get(input.type);
    if (!def) throw new Error(`Бүртгэлгүй мэдэгдлийн төрөл: ${input.type}`);
    if (input.link != null && !LINK_RE.test(input.link)) throw new Error(`Мэдэгдлийн линк буруу: ${input.link}`);
    if (!(await this.moduleActive(tenantId, def))) return 0;

    const recipients = [...new Set(input.recipients)].filter((id) => id && id !== input.excludeUserId);
    if (recipients.length === 0) return 0;

    const prefs = await tx.coreNotificationPref.findMany({
      where: { tenantId, type: def.type, userId: { in: recipients } },
      select: { userId: true, inApp: true, email: true },
    });
    const byUser = new Map(prefs.map((p) => [p.userId, p]));
    const now = new Date();
    const data: Prisma.CoreNotificationCreateManyInput[] = [];
    for (const userId of recipients) {
      const pref = byUser.get(userId);
      const inApp = pref?.inApp ?? def.defaultInApp;
      const email = pref?.email ?? def.defaultEmail;
      if (!inApp && !email) continue;
      data.push({
        tenantId,
        userId,
        type: def.type,
        titleKey: input.titleKey,
        bodyKey: input.bodyKey ?? null,
        params: (input.params ?? {}) as Prisma.InputJsonObject,
        link: input.link ?? null,
        inApp,
        emailStatus: email ? 'PENDING' : 'NONE',
        emailNextAt: email ? now : null,
      });
    }
    if (data.length === 0) return 0;
    const res = await tx.coreNotification.createMany({ data });
    return res.count;
  }

  async list(tenantId: string, authId: string, q: { unreadOnly?: boolean; before?: string; limit?: number }) {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), MAX_LIMIT);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.userId(tx, tenantId, authId);
      const rows = await tx.coreNotification.findMany({
        where: {
          tenantId,
          userId,
          inApp: true,
          ...(q.unreadOnly ? { readAt: null } : {}),
          ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const items = rows.slice(0, limit).map(toView);
      return { items, nextBefore: rows.length > limit ? items[items.length - 1].createdAt : null };
    });
  }

  async unreadCount(tenantId: string, authId: string): Promise<{ count: number }> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.userId(tx, tenantId, authId);
      const count = await tx.coreNotification.count({ where: { tenantId, userId, inApp: true, readAt: null } });
      return { count };
    });
  }

  async markRead(tenantId: string, authId: string, id: string): Promise<{ ok: true }> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.userId(tx, tenantId, authId);
      const res = await tx.coreNotification.updateMany({ where: { id, tenantId, userId, readAt: null }, data: { readAt: new Date() } });
      if (res.count === 0) {
        const exists = await tx.coreNotification.count({ where: { id, tenantId, userId } });
        if (!exists) throw notFound('core.notifications.not_found');
      }
      return { ok: true as const };
    });
  }

  async markAllRead(tenantId: string, authId: string): Promise<{ count: number }> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.userId(tx, tenantId, authId);
      const res = await tx.coreNotification.updateMany({ where: { tenantId, userId, readAt: null }, data: { readAt: new Date() } });
      return { count: res.count };
    });
  }

  async preferences(tenantId: string, authId: string): Promise<{ items: NotificationPrefView[] }> {
    const active = await this.activeTypes(tenantId);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.userId(tx, tenantId, authId);
      const prefs = await tx.coreNotificationPref.findMany({ where: { tenantId, userId }, select: { type: true, inApp: true, email: true } });
      const byType = new Map(prefs.map((p) => [p.type, p]));
      return {
        items: active.map((def) => ({
          type: def.type,
          module: def.module,
          labelKey: def.labelKey,
          inApp: byType.get(def.type)?.inApp ?? def.defaultInApp,
          email: byType.get(def.type)?.email ?? def.defaultEmail,
        })),
      };
    });
  }

  async updatePreferences(tenantId: string, authId: string, items: ReadonlyArray<{ type: string; inApp: boolean; email: boolean }>) {
    const active = new Set((await this.activeTypes(tenantId)).map((d) => d.type));
    for (const item of items) if (!active.has(item.type)) throw notFound('core.notifications.type_unknown', { type: item.type });
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const userId = await this.userId(tx, tenantId, authId);
      for (const item of items) {
        await tx.coreNotificationPref.upsert({
          where: { tenantId_userId_type: { tenantId, userId, type: item.type } },
          create: { tenantId, userId, type: item.type, inApp: item.inApp, email: item.email },
          update: { inApp: item.inApp, email: item.email, updatedAt: new Date() },
        });
      }
    });
    return this.preferences(tenantId, authId);
  }

  private async activeTypes(tenantId: string): Promise<NotificationTypeDef[]> {
    const out: NotificationTypeDef[] = [];
    for (const def of this.registry.list()) if (await this.moduleActive(tenantId, def)) out.push(def);
    return out;
  }

  private async moduleActive(tenantId: string, def: NotificationTypeDef): Promise<boolean> {
    if (def.module === 'core') return true;
    if (!isTenantModuleId(def.module)) return false;
    return this.modules.isActive(tenantId, def.module);
  }

  private async userId(tx: Tx, tenantId: string, authId: string): Promise<string> {
    const user = await tx.coreUser.findFirst({ where: { authId, tenantId, isActive: true }, select: { id: true } });
    if (!user) throw forbidden('camp.err.access.1');
    return user.id;
  }
}

function toView(row: {
  id: string; type: string; titleKey: string; bodyKey: string | null; params: Prisma.JsonValue;
  link: string | null; readAt: Date | null; createdAt: Date;
}): NotificationView {
  return {
    id: row.id,
    type: row.type,
    titleKey: row.titleKey,
    bodyKey: row.bodyKey,
    params: (row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? row.params : {}) as NotificationParams,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
