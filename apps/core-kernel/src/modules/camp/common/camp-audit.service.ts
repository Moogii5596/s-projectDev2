import { Injectable } from '@nestjs/common';
import { CampAuditAction, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { CampAccessService } from './camp-access.service';
import { inTenantTx, Tx } from './camp-tx';
import { badRequest } from '../../../common/i18n/app-error';

/** v0.2.0-д түүх хөтлөх бичлэгүүд (v0.2.x-д нэмэгдэнэ) */
export const CAMP_AUDIT_ENTITIES = ['employee', 'department', 'crew', 'building', 'room'] as const;
export type CampAuditEntity = (typeof CAMP_AUDIT_ENTITIES)[number];

export type AuditScalar = string | number | boolean | null;
export type AuditDiff = Record<string, { from: AuditScalar; to: AuditScalar }>;

/** Date → ISO (огноо зөвхөн бол 'YYYY-MM-DD'), Decimal/BigInt → string, бусад объект → JSON текст */
export function auditValue(v: unknown): AuditScalar {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function') return String(v); // Prisma.Decimal
  return JSON.stringify(v);
}

/**
 * Өмнөх ба дараах мөрийн зөрүү. `fields` — харьцуулах талбарууд (бусдыг үл тооно: id, createdAt г.м.).
 * before = null → үүсгэлт: утгатай (null биш) талбар бүр {from: null, to}.
 */
export function computeAuditDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: readonly string[],
): AuditDiff {
  const diff: AuditDiff = {};
  for (const f of fields) {
    const from = before ? auditValue(before[f]) : null;
    const to = after ? auditValue(after[f]) : null;
    if (from !== to) diff[f] = { from, to };
  }
  return diff;
}

export interface AuditEntry {
  tenantId: string;
  campId: string | null;
  entityType: CampAuditEntity;
  entityId: string;
  action: CampAuditAction;
  actorUserId: string;
  /** Харьцуулах талбарууд */
  fields: readonly string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Орчуулгын параметр (код, нэр) — Feed/түүхийн мөрөнд харагдана */
  summaryParams?: Record<string, AuditScalar>;
  importId?: string | null;
}

/** UPDATE-д isActive true→false (эсвэл status → INACTIVE) бол DEACTIVATE */
export function resolveAuditAction(action: CampAuditAction, diff: AuditDiff): CampAuditAction {
  if (action !== CampAuditAction.UPDATE) return action;
  if (diff.isActive?.from === true && diff.isActive.to === false) return CampAuditAction.DEACTIVATE;
  if (diff.status && diff.status.to === 'INACTIVE') return CampAuditAction.DEACTIVATE;
  return action;
}

/** Нэг бичлэгийн мөр (createMany-д) — UPDATE-д өөрчлөлтгүй бол null */
export function buildAuditRow(e: AuditEntry): Prisma.CampAuditLogCreateManyInput | null {
  const diff = computeAuditDiff(e.before ?? null, e.after ?? null, e.fields);
  if (e.action === CampAuditAction.UPDATE && Object.keys(diff).length === 0) return null;
  const action = resolveAuditAction(e.action, diff);
  return {
    tenantId: e.tenantId,
    campId: e.campId,
    entityType: e.entityType,
    entityId: e.entityId,
    action,
    actorUserId: e.actorUserId,
    summaryKey: `audit.${e.entityType}.${action.toLowerCase()}`,
    summaryParams: (e.summaryParams ?? {}) as Prisma.InputJsonObject,
    diff: diff as unknown as Prisma.InputJsonObject,
    importId: e.importId ?? null,
  };
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Кемпийн өөрчлөлтийн түүх (v0.2.0 §0.4, PIL-03). `record*` нь бизнесийн transaction-ий `tx`-ийг авна (RLS-007):
 * бичлэг амжилтгүй бол түүх ч rollback.
 */
@Injectable()
export class CampAuditService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    const row = buildAuditRow(entry);
    if (row) await tx.campAuditLog.create({ data: row });
  }

  async recordMany(tx: Tx, entries: AuditEntry[]): Promise<number> {
    const rows = entries.map(buildAuditRow).filter((r): r is Prisma.CampAuditLogCreateManyInput => r !== null);
    if (rows.length === 0) return 0;
    const res = await tx.campAuditLog.createMany({ data: rows });
    return res.count;
  }

  /** GET /camp/camps/:campId/audit — кемпэд хандах эрхтэй хэн ч (UI: v0.2.2 FB-09) */
  async list(tenantId: string, authId: string, campId: string, q: AuditQuery) {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    let cursor: { id: string; createdAt: Date } | null = null;
    if (q.cursor) {
      try {
        cursor = decodeCursor(q.cursor);
      } catch {
        throw badRequest('camp.err.assets.11');
      }
    }
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const rows = await tx.campAuditLog.findMany({
        where: {
          tenantId,
          campId,
          ...(q.entityType ? { entityType: q.entityType } : {}),
          ...(q.entityId ? { entityId: q.entityId } : {}),
          ...(cursor
            ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      const userIds = [...new Set(data.map((r) => r.actorUserId))];
      const users = userIds.length
        ? await tx.coreUser.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
        : [];
      const byId = new Map(users.map((u) => [u.id, u.fullName || u.email]));
      const last = data[data.length - 1];
      return {
        data: data.map((r) => ({ ...r, actorName: byId.get(r.actorUserId) ?? null })),
        nextCursor: hasMore && last ? encodeCursor(last.id, last.createdAt) : null,
        hasMore,
      };
    });
  }
}
