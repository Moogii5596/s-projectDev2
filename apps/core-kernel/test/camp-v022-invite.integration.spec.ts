/**
 * v0.2.2 Блок 3 — урилга / reset токен, ажилтнаас хэрэглэгч үүсгэх (ADR-003 §2.3, D-03).
 * Бодит PostgreSQL + app_user (RLS). GoTrue → хуурамч (нууц үг тавих / хэрэглэгч үүсгэх дуудлагыг бүртгэнэ).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { CampAuditService } from '../src/modules/camp/common/camp-audit.service';
import { CampRbacService } from '../src/modules/camp/rbac/camp-rbac.service';
import { CampEmployeeLoginService } from '../src/modules/camp/rbac/camp-employee-login.service';
import { CampUserAccessService } from '../src/modules/camp/rbac/camp-user-access.service';
import { InviteService } from '../src/auth/invite.service';
import { SignInService } from '../src/auth/sign-in.service';
import { hashToken } from '../src/auth/invite-token';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

const cache = { buildKey: (...p: string[]) => p.join(':'), get: async () => null, set: async () => undefined, del: async () => undefined, invalidateTenant: async () => undefined };
const tenantCache = { invalidateMember: async () => undefined, getTenantId: async () => null };
const redis = { incr: async () => 1, pexpire: async () => 1, get: async () => null, del: async () => 1 };

describe('v0.2.2 Блок 3 — урилга, хэрэглэгч үүсгэх (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const access = new CampAccessService(cache as never);
  const audit = new CampAuditService(rls as never, access);
  const rbac = new CampRbacService(rls as never, access, audit);
  const login = new CampEmployeeLoginService(rls as never, access, audit, tenantCache as never);
  const passwords: Record<string, string> = {};
  /** GoTrue-гүй: core_users-ийг бодит DB-д (RLS) үүсгэнэ, нууц үгийг санана */
  const userAdmin = {
    async createUser(i: { tenantId: string; email: string | null; fullName: string | null; tenantSlug: string }) {
      const email = i.email ?? `u-${randomUUID().slice(0, 8)}@${i.tenantSlug}.login.invalid`;
      return rls.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${i.tenantId}, true)`;
        return tx.coreUser.create({ data: { tenantId: i.tenantId, authId: randomUUID(), email, fullName: i.fullName }, select: { id: true, authId: true, email: true } });
      });
    },
    async setPassword(authId: string, pw: string) { passwords[authId] = pw; },
    admin: () => ({ auth: { admin: { deleteUser: async () => ({}) } } }),
  };
  const signIn = new SignInService({ get: () => undefined } as never, admin as never, tenantCache as never, redis as never);
  const config = { get: (k: string) => (k === 'PUBLIC_APP_URL' ? 'https://sino.gobiverse.website' : undefined) };
  const mailer = { isEnabled: () => false, send: async () => undefined };
  const invites = new InviteService(config as never, rls as never, admin as never, userAdmin as never, mailer as never, tenantCache as never, signIn as never, redis as never);
  const ua = new CampUserAccessService(rls as never, access, audit, userAdmin as never, invites, login, { invalidateMember: async () => undefined } as never);

  const sfx = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let t: string;
  let tB: string;
  let camp: string;
  const ownerAuth = randomUUID();
  const emp: Record<string, string> = {};

  beforeAll(async () => {
    for (const s of ['v022ia', 'v022ib']) tenantIds.push((await admin.tenant.create({ data: { slug: `${s}-${sfx}`, name: s } })).id);
    [t, tB] = tenantIds;
    camp = (await admin.camp.create({ data: { tenantId: t, code: 'C1', name: 'C1' } })).id;
    await admin.coreUser.create({ data: { tenantId: t, authId: ownerAuth, email: `owner-${sfx}@it.test`, role: UserRole.OWNER } });
    const org = await admin.coreOrganization.create({ data: { tenantId: t, name: `Org ${sfx}`, orgType: 'MAIN' } });
    const dept = await admin.hrDepartment.create({ data: { tenantId: t, campId: camp, code: 'D1', name: 'D1' } });
    const pos = await admin.hrPosition.create({ data: { tenantId: t, name: `Ажилтан ${sfx}` } });
    const empRole = await admin.coreRole.findFirstOrThrow({ where: { tenantId: t, systemCode: 'EMPLOYEE' } });
    await rbac.setPositionTemplates(t, ownerAuth, pos.id, { templates: [{ roleId: empRole.id, scope: 'EMPLOYEE_CAMP' }] });
    const mk = async (k: string, phone: string | null, email: string | null) => {
      emp[k] = (await admin.hrEmployee.create({ data: { tenantId: t, campId: camp, organizationId: org.id, departmentId: dept.id, employeeCode: `${k.toUpperCase()}${sfx}`, fullName: k, phone, email, positionId: pos.id } })).id;
    };
    await mk('bat', '99112233', null);
    await mk('li', '+86 138 0013 8000', `li-${sfx}@sino.cn`);
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.$disconnect();
    await rls.$disconnect();
  });

  let batUser: string;
  let liUser: string;

  it('ажилтнаас хэрэглэгч үүсгэх: имэйлгүй → дотоод хаяг + утас + албан тушаалын эрх; имэйлтэй → картынх + username; давхар → 409', async () => {
    const b = await ua.createUserForEmployee(t, `v022ia-${sfx}`, ownerAuth, camp, emp.bat, undefined);
    expect(b).toMatchObject({ hasEmail: false, phone: '99112233', username: null });
    batUser = b.userId;
    const bu = await admin.coreUser.findUniqueOrThrow({ where: { id: batUser } });
    expect(bu.email).toMatch(/\.login\.invalid$/);
    expect(await admin.coreUserPermission.count({ where: { userId: batUser } })).toBeGreaterThan(0);
    const l = await ua.createUserForEmployee(t, `v022ia-${sfx}`, ownerAuth, camp, emp.li, undefined);
    expect(l).toMatchObject({ hasEmail: true, phone: null, username: `li${sfx}`.toLowerCase() });
    liUser = l.userId;
    await expect(ua.createUserForEmployee(t, `v022ia-${sfx}`, ownerAuth, camp, emp.li, undefined)).rejects.toThrow(ConflictException);
    const trail = await admin.campAuditLog.count({ where: { tenantId: t, summaryKey: 'audit.user_account.create' } });
    expect(trail).toBe(2);
  });

  it('LINK урилга: hash л хадгалагдана; дахин урихад хуучин цуцлагдана; inspect → нэр + нэвтрэх нэр; accept нэг удаа', async () => {
    const first = await ua.invite(t, ownerAuth, batUser, 'LINK');
    const second = await ua.invite(t, ownerAuth, batUser, 'LINK');
    const tok1 = first.path!.split('/').pop()!;
    const tok2 = second.path!.split('/').pop()!;
    expect(second.url).toBe(`https://sino.gobiverse.website/invite/${tok2}`);
    const rows = await admin.coreUserInvite.findMany({ where: { userId: batUser }, orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedAt).not.toBeNull();
    expect(rows.map((r) => r.tokenHash)).toEqual([hashToken(tok1), hashToken(tok2)]);
    expect(await invites.inspect(tok1)).toEqual({ valid: false, reason: 'revoked' });
    expect(await invites.inspect(tok2)).toMatchObject({ valid: true, purpose: 'INVITE', name: 'bat', login: '99112233' });

    await admin.coreUser.update({ where: { id: batUser }, data: { mustChangePassword: true } });
    expect(await invites.accept(tok2, 'new-password-123')).toEqual({ done: true, login: '99112233' });
    const bu = await admin.coreUser.findUniqueOrThrow({ where: { id: batUser } });
    expect(passwords[bu.authId]).toBe('new-password-123');
    expect(bu.mustChangePassword).toBe(false);
    await expect(invites.accept(tok2, 'other-password-1')).rejects.toMatchObject({ code: 'auth.invite_invalid' });
    expect(await invites.inspect(tok2)).toEqual({ valid: false, reason: 'used' });
    expect(await admin.campAuditLog.count({ where: { tenantId: t, summaryKey: 'audit.user_invite.create' } })).toBe(2);
  });

  it('хугацаа дууссан / зэрэг accept → нэг л амжилттай', async () => {
    const r = await ua.invite(t, ownerAuth, liUser, 'LINK');
    const tok = r.path!.split('/').pop()!;
    const results = await Promise.allSettled([invites.accept(tok, 'pass-word-0001'), invites.accept(tok, 'pass-word-0002')]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const r2 = await ua.invite(t, ownerAuth, liUser, 'LINK');
    const tok2 = r2.path!.split('/').pop()!;
    await admin.$executeRaw`UPDATE core_user_invites SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE token_hash = ${hashToken(tok2)}`;
    expect(await invites.inspect(tok2)).toEqual({ valid: false, reason: 'expired' });
    await expect(invites.accept(tok2, 'pass-word-0003')).rejects.toMatchObject({ code: 'auth.invite_invalid' });
  });

  it('EMAIL урилга SMTP-гүй → 400 auth.mail_disabled; options → emailEnabled=false', async () => {
    await expect(ua.invite(t, ownerAuth, liUser, 'EMAIL')).rejects.toMatchObject({ code: 'auth.mail_disabled' });
    expect(await ua.options(t, ownerAuth)).toEqual({ emailEnabled: false, publicUrl: 'https://sino.gobiverse.website' });
  });

  it('RLS: өөр tenant-ийн context-оор урилга харагдахгүй, бичих боломжгүй; өөр tenant-ийн хэрэглэгчийг урих → 400', async () => {
    const seen = await rls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tB}, true)`;
      return tx.coreUserInvite.count({ where: { tenantId: t } });
    });
    expect(seen).toBe(0);
    await expect(rls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tB}, true)`;
      await tx.coreUserInvite.create({ data: { tenantId: t, userId: batUser, tokenHash: 'a'.repeat(64), purpose: 'INVITE', channel: 'LINK', expiresAt: new Date(Date.now() + 1e6) } });
    })).rejects.toThrow();
    await expect(invites.createInvite({ tenantId: tB, userId: batUser, purpose: 'INVITE', channel: 'LINK', createdBy: null })).rejects.toMatchObject({ code: 'camp.err.rbac.5' });
  });
});
