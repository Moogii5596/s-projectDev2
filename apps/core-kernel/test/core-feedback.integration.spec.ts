/**
 * v0.2.3 Блок F (FB-SYS-01a) — санал хүсэлт: бодит PostgreSQL + app_user (RLS).
 * Сервисийг шууд дуудна (GoTrue шаардахгүй — camp-v022-users загвар).
 *   - бүх хэрэглэгч илгээнэ, бусдынхыг харна, «+1» (давхар дарахад нэг л тоологдоно)
 *   - зохиогч зөвхөн «Шинэ» үед засна; төлөв / хариу — зөвхөн OWNER / ADMIN; DONE → хувилбар заавал
 *   - өөр tenant-ийн санал харагдахгүй (RLS + tenantId)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoreFeedbackKind, CoreFeedbackStatus, PrismaClient, UserRole } from '@prisma/client';
import { CoreFeedbackService } from '../src/modules/core/feedback/core-feedback.service';
import { CoreFeedbackAttachmentsService } from '../src/modules/core/feedback/core-feedback-attachments.service';
import { MediaUrlSigner } from '../src/storage/media-url';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

describe('v0.2.3 Блок F — санал хүсэлт (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  // v0.2.3 Блок 5: хавсралтын service (файлын хадгалалт энд хэрэггүй — mock)
  const attachments = new CoreFeedbackAttachmentsService(rls as never, { remove: async () => undefined } as never, new MediaUrlSigner('x'.repeat(32)));
  const svc = new CoreFeedbackService(rls as never, attachments);

  const sfx = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let tA: string;
  let tB: string;
  const auth = { owner: randomUUID(), u1: randomUUID(), u2: randomUUID(), off: randomUUID(), ownerB: randomUUID() };

  beforeAll(async () => {
    const mk = async (slug: string) => (await admin.tenant.create({ data: { name: `FB ${slug}`, slug: `fb-${slug}-${sfx}` } })).id;
    tA = await mk('a');
    tB = await mk('b');
    tenantIds.push(tA, tB);
    const user = (tenantId: string, authId: string, role: UserRole, fullName: string, isActive = true) =>
      admin.coreUser.create({ data: { tenantId, authId, email: `${authId}@example.com`, fullName, role, isActive } });
    await user(tA, auth.owner, UserRole.OWNER, 'Эзэмшигч');
    await user(tA, auth.u1, UserRole.REQUESTER, 'Хэрэглэгч 1');
    await user(tA, auth.u2, UserRole.VIEWER, 'Хэрэглэгч 2');
    await user(tA, auth.off, UserRole.REQUESTER, 'Идэвхгүй', false);
    await user(tB, auth.ownerB, UserRole.OWNER, 'B эзэмшигч');
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => undefined);
    await admin?.$disconnect();
    await rls?.$disconnect();
  });

  let fbId: string;

  it('хэрэглэгч санал илгээнэ — хувилбар, хуудас, нэр автоматаар', async () => {
    const r = await svc.create(tA, auth.u1, { kind: CoreFeedbackKind.REQUEST, title: 'Хоолны тайлан', body: 'Сараар', pagePath: '/camp/x/meals' });
    fbId = r.id;
    expect(r).toMatchObject({ status: 'NEW', voteCount: 0, votedByMe: false, isMine: true, canEdit: true, authorName: 'Хэрэглэгч 1', pagePath: '/camp/x/meals' });
    expect(r.appVersion).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('идэвхгүй хэрэглэгч, өөр tenant-ийн хэрэглэгч илгээж / харж чадахгүй', async () => {
    await expect(svc.create(tA, auth.off, { kind: CoreFeedbackKind.BUG, title: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.list(tA, auth.ownerB, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('бусад нь харж, «+1» дарна — давхар дарахад нэг; буцаахад 0', async () => {
    const list = await svc.list(tA, auth.u2, {});
    expect(list.total).toBe(1);
    expect(list.canManage).toBe(false);
    expect(list.data[0]).toMatchObject({ id: fbId, isMine: false, canEdit: false });
    await svc.vote(tA, auth.u2, fbId, true);
    const twice = await svc.vote(tA, auth.u2, fbId, true);
    expect(twice).toMatchObject({ voteCount: 1, votedByMe: true });
    const owner = await svc.vote(tA, auth.owner, fbId, true);
    expect(owner.voteCount).toBe(2);
    const back = await svc.vote(tA, auth.u2, fbId, false);
    expect(back).toMatchObject({ voteCount: 1, votedByMe: false });
  });

  it('бусдын саналыг засах, устгах боломжгүй; зохиогч «Шинэ» үед засна', async () => {
    await expect(svc.update(tA, auth.u2, fbId, { title: 'хак' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.remove(tA, auth.u2, fbId)).rejects.toBeInstanceOf(ForbiddenException);
    const r = await svc.update(tA, auth.u1, fbId, { title: 'Хоолны сарын тайлан' });
    expect(r.title).toBe('Хоолны сарын тайлан');
  });

  it('төлөв — зөвхөн админ; DONE → хувилбар заавал', async () => {
    await expect(svc.setStatus(tA, auth.u1, fbId, { status: CoreFeedbackStatus.ACCEPTED })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.setStatus(tA, auth.owner, fbId, { status: CoreFeedbackStatus.DONE })).rejects.toBeInstanceOf(BadRequestException);
    const p = await svc.setStatus(tA, auth.owner, fbId, { status: CoreFeedbackStatus.PLANNED, adminReply: 'v0.2.7-д' });
    expect(p).toMatchObject({ status: 'PLANNED', adminReply: 'v0.2.7-д', doneVersion: null });
    expect(p.repliedAt).not.toBeNull();
    // «Шинэ» биш болсон тул зохиогч засахгүй
    await expect(svc.update(tA, auth.u1, fbId, { title: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    const d = await svc.setStatus(tA, auth.owner, fbId, { status: CoreFeedbackStatus.DONE, doneVersion: '0.2.3' });
    expect(d).toMatchObject({ status: 'DONE', doneVersion: 'v0.2.3', adminReply: 'v0.2.7-д' });
    const done = await svc.list(tA, auth.u2, { status: CoreFeedbackStatus.DONE });
    expect(done.data.map((x) => x.doneVersion)).toEqual(['v0.2.3']);
  });

  it('шүүлтүүр, эрэмбэ, хайлт', async () => {
    const second = await svc.create(tA, auth.u2, { kind: CoreFeedbackKind.BUG, title: 'Өрөөний самбар удаан' });
    expect((await svc.list(tA, auth.u2, { mine: true })).data.map((x) => x.id)).toEqual([second.id]);
    expect((await svc.list(tA, auth.u2, { kind: CoreFeedbackKind.BUG })).total).toBe(1);
    expect((await svc.list(tA, auth.u2, { q: 'самбар' })).data[0].id).toBe(second.id);
    expect((await svc.list(tA, auth.u2, { sort: 'votes' })).data[0].id).toBe(fbId);
    expect((await svc.list(tA, auth.u2, { sort: 'new' })).data[0].id).toBe(second.id);
    await svc.remove(tA, auth.u2, second.id);
    await expect(svc.vote(tA, auth.u2, second.id, true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenant тусгаарлалт: B tenant-ийн OWNER A-ийн саналыг харахгүй, засахгүй', async () => {
    expect((await svc.list(tB, auth.ownerB, {})).total).toBe(0);
    await expect(svc.setStatus(tB, auth.ownerB, fbId, { status: CoreFeedbackStatus.REJECTED })).rejects.toBeInstanceOf(NotFoundException);
    // RLS: tenant контекстгүй app_user юу ч харахгүй
    expect(await rls.coreFeedback.count()).toBe(0);
  });

  it('Excel экспорт — зөвхөн админ', async () => {
    await expect(svc.exportXlsx(tA, auth.u1)).rejects.toBeInstanceOf(ForbiddenException);
    const buf = await svc.exportXlsx(tA, auth.owner);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});
