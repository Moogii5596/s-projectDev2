/**
 * v0.2.2 Блок 4 — хэрэглэгчийн жагсаалт (B4-Q3), идэвхгүй болгох (B4-Q2).
 * Бодит PostgreSQL + app_user (RLS). GoTrue шаардахгүй: `UserAdminService.setBanned`-ийг stub (TEST-022 загвар).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { CampAuditService } from '../src/modules/camp/common/camp-audit.service';
import { CampRbacService } from '../src/modules/camp/rbac/camp-rbac.service';
import { CampUserAccessService } from '../src/modules/camp/rbac/camp-user-access.service';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

/** ck_core_user_invites_hash: 64 hex (SHA-256) — TEST-025 */
const hex = (s: string) => createHash('sha256').update(s).digest('hex');

const cache = {
  buildKey: (...p: string[]) => p.join(':'),
  get: async () => null,
  set: async () => undefined,
  del: async () => undefined,
  invalidateTenant: async () => undefined,
};

describe('v0.2.2 Блок 4 — хэрэглэгч удирдах (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const access = new CampAccessService(cache as never);
  const audit = new CampAuditService(rls as never, access);
  const rbac = new CampRbacService(rls as never, access, audit);
  const banned: [string, boolean][] = [];
  const userAdmin = { setBanned: async (authId: string, b: boolean) => void banned.push([authId, b]) };
  const svc = new CampUserAccessService(rls as never, access, audit, userAdmin as never, {} as never, {} as never, { invalidateMember: async () => undefined } as never);

  const sfx = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let tA: string;
  let tB: string;
  const auth = { owner: randomUUID(), u1: randomUUID(), ownerB: randomUUID() };
  const user: Record<string, string> = {};

  const mkTenant = async (slug: string) => {
    const t = await admin.tenant.create({ data: { slug: `${slug}-${sfx}`, name: slug } });
    tenantIds.push(t.id);
    return t.id;
  };
  const mkUser = async (tenantId: string, key: string, r: UserRole, authId = randomUUID()) => {
    user[key] = (await admin.coreUser.create({ data: { tenantId, authId, email: `${key}-${sfx}@it.test`, role: r } })).id;
  };

  beforeAll(async () => {
    tA = await mkTenant('v022u-a');
    tB = await mkTenant('v022u-b');
    await mkUser(tA, 'owner', UserRole.OWNER, auth.owner);
    await mkUser(tA, 'u1', UserRole.REQUESTER, auth.u1);
    await mkUser(tB, 'ownerB', UserRole.OWNER, auth.ownerB);
    const day = 86_400_000;
    await admin.coreUserInvite.createMany({
      data: [
        { tenantId: tA, userId: user.u1, tokenHash: hex(`old-${sfx}`), purpose: 'INVITE', channel: 'EMAIL', expiresAt: new Date(Date.now() - day), createdAt: new Date(Date.now() - 2 * day) },
        { tenantId: tA, userId: user.u1, tokenHash: hex(`new-${sfx}`), purpose: 'INVITE', channel: 'LINK', expiresAt: new Date(Date.now() + day) },
      ],
    });
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.$disconnect();
    await rls.$disconnect();
  });

  it('listUsers: зөвхөн өөрийн tenant; сүүлийн урилга PENDING; утас/username талбартай', async () => {
    const rows = await rbac.listUsers(tA, auth.owner);
    expect(rows.map((r) => r.id).sort()).toEqual([user.owner, user.u1].sort());
    const u1 = rows.find((r) => r.id === user.u1)!;
    expect(u1).toMatchObject({ isActive: true, phone: null, username: null, internalEmail: false, employee: null, invite: { status: 'PENDING', channel: 'LINK' } });
  });

  it('setActive: өөрийгөө → 400; өөр tenant-ийн хэрэглэгч → 404', async () => {
    await expect(svc.setActive(tA, auth.owner, user.owner, false)).rejects.toThrow(BadRequestException);
    await expect(svc.setActive(tA, auth.owner, user.ownerB, false)).rejects.toThrow(NotFoundException);
    expect(banned).toEqual([]);
  });

  it('setActive: идэвхгүй → ban, is_active=false, хүлээгдэж буй урилга хүчингүй, аудит; дахин идэвхжүүлэх → unban', async () => {
    expect(await svc.setActive(tA, auth.owner, user.u1, false)).toEqual({ id: user.u1, isActive: false });
    expect(banned).toEqual([[auth.u1, true]]);
    expect((await admin.coreUser.findUnique({ where: { id: user.u1 } }))!.isActive).toBe(false);
    const pending = await admin.coreUserInvite.count({ where: { tenantId: tA, userId: user.u1, usedAt: null, revokedAt: null } });
    expect(pending).toBe(0);
    const log = await admin.campAuditLog.findFirst({ where: { tenantId: tA, entityType: 'user_account', entityId: user.u1 }, orderBy: { createdAt: 'desc' } });
    expect(log?.action).toBe('DEACTIVATE');
    expect((await rbac.listUsers(tA, auth.owner)).find((r) => r.id === user.u1)!.invite!.status).toBe('REVOKED');

    await svc.setActive(tA, auth.owner, user.u1, true);
    expect(banned).toEqual([[auth.u1, true], [auth.u1, false]]);
    expect((await admin.coreUser.findUnique({ where: { id: user.u1 } }))!.isActive).toBe(true);
  });
});
