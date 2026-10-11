/**
 * Camp unit тестийн туслах: Prisma transaction mock (model.method → vi.fn автоматаар) + бодит CampAccessService.
 * Хэрэглэгч/эрхийг `setActor`-оор тохируулна.
 */
import { vi, type Mock } from 'vitest';
import { UserRole } from '@prisma/client';
import { CampAccessService } from '../camp-access.service';
import { CampAuditService } from '../camp-audit.service';

type ModelMock = Record<string, Mock>;
export type TxMock = Record<string, ModelMock> & { $executeRaw: Mock; $queryRaw: Mock };

const DEFAULTS: Record<string, unknown> = {
  findFirst: null,
  findMany: [],
  count: 0,
  create: { id: 'new-id' },
  update: { id: 'upd-id' },
  upsert: { id: 'ups-id' },
  delete: {},
  deleteMany: { count: 0 },
  createMany: { count: 0 },
  updateMany: { count: 1 },
};

export function createTx(): TxMock {
  const models: Record<string, ModelMock> = {};
  const executeRaw = vi.fn().mockResolvedValue(1);
  const queryRaw = vi.fn().mockResolvedValue([]);
  return new Proxy({} as TxMock, {
    get(_t, prop: string) {
      if (prop === '$executeRaw') return executeRaw;
      if (prop === '$queryRaw') return queryRaw;
      if (prop === 'then') return undefined;
      return (models[prop] ??= new Proxy({} as ModelMock, {
        get(m, method: string) {
          return (m[method] ??= vi.fn().mockResolvedValue(DEFAULTS[method] ?? null));
        },
      }));
    },
  });
}

export function createPrisma(tx: TxMock) {
  return { $transaction: vi.fn(async (fn: (t: unknown) => unknown, _options?: { timeout?: number; maxWait?: number }) => fn(tx)) };
}

export function createCache() {
  return {
    buildKey: (m: string, t: string, r: string, id?: string) => (id ? `cache:${m}:${t}:${r}:${id}` : `cache:${m}:${t}:${r}`),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  };
}

export interface ActorSpec {
  userId?: string;
  role?: UserRole;
  /** camp_id NULL = бүх кемп */
  roles?: { campId: string | null; perms: string[] }[];
}

/** authId-аар хайсан coreUser.findFirst → хэрэглэгч; бусад coreUser.findFirst дуудлага → `others` */
export function setActor(tx: TxMock, spec: ActorSpec, others: (args: { where: Record<string, unknown> }) => unknown = () => null) {
  tx.coreUser.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    'authId' in args.where ? { id: spec.userId ?? 'cu-actor', role: spec.role ?? UserRole.REQUESTER } : others(args),
  );
  // v0.2.2 D-01: guard camp_user_permissions-ийг уншина (мөр бүр = нэг эрх × кемп)
  tx.campUserPermission.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    args.where.userId === (spec.userId ?? 'cu-actor') && !('source' in args.where)
      ? (spec.roles ?? []).flatMap((r) => r.perms.map((permissionCode) => ({ campId: r.campId, permissionCode })))
      : [],
  );
}

export function setup() {
  const tx = createTx();
  const prisma = createPrisma(tx);
  const cache = createCache();
  const access = new CampAccessService(cache as never);
  const audit = new CampAuditService(prisma as never, access);
  return { tx, prisma, cache, access, audit };
}

/** Transaction бүр set_config('app.tenant_id', tenantId)-аар ЭХЭЛСЭН эсэх (RULE-04) */
export function expectTenantTx(tx: TxMock, tenantId: string) {
  const first = tx.$executeRaw.mock.calls[0];
  if (!first) throw new Error('set_config дуудагдаагүй');
  const sql = (first[0] as TemplateStringsArray).join('?');
  if (!sql.includes("set_config('app.tenant_id'") || first[1] !== tenantId) {
    throw new Error(`Эхний query set_config(${tenantId}) биш: ${sql} / ${String(first[1])}`);
  }
}
