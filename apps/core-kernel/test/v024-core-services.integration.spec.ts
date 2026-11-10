import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCampIt, type CampIt } from './helpers/camp-it-app';
import { PrismaTenantClientService } from '../src/db/prisma-tenant-client.service';
import { inTenantTx } from '../src/db/tenant-tx';
import { ApprovalEngineService } from '../src/modules/core/approvals/approval-engine.service';
import { ApprovalEntityRegistry, type ApprovalDecisionContext } from '../src/modules/core/approvals/approval-entity.registry';

/**
 * v0.2.4 — цөмийн нийтлэг үйлчилгээ (integration): батлах хөдөлгүүр (WF-06), хавсралт (FILE-01), Debug хаалт (D-1),
 * Feed холбоос (FEED-04/05) + мэдэгдэл (NTF-01).
 */
describe('v0.2.4 core services (integration)', () => {
  let app: CampIt;
  const finals: ApprovalDecisionContext[] = [];
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

  beforeAll(async () => {
    app = await createCampIt('v024');
    app.app.get(ApprovalEntityRegistry).register({
      entityType: 'IT_TEST', module: 'core', labelKey: 'approval.entity.mr', approvePermissions: ['camp.settings.manage'],
      onFinal: async (_tx, ctx) => { finals.push(ctx); },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('WF-06: тохиргоо хувилбартай; хүсэгч/эрхгүй 403; admin батлахад onFinal + хүсэгчид мэдэгдэл', async () => {
    const def = { entityType: 'IT_TEST', name: 'IT flow', steps: [{ permission: 'camp.settings.manage', quorum: 1 }], slaHours: 24, escalationEnabled: false, delegationEnabled: true };
    await app.api().post('/api/v1/core/approvals/definitions').set(app.as('admin')).send(def).expect(201);
    const v2 = await app.api().post('/api/v1/core/approvals/definitions').set(app.as('admin')).send({ ...def, name: 'IT flow v2' }).expect(201);
    expect(v2.body.items.map((d: { version: number; isActive: boolean }) => [d.version, d.isActive])).toEqual([[2, true], [1, false]]);
    await app.api().post('/api/v1/core/approvals/definitions').set(app.as('manager')).send(def).expect(403);

    const instance = await inTenantTx(app.app.get(PrismaTenantClientService), app.tenantId, (tx) =>
      app.app.get(ApprovalEngineService).start(tx, app.tenantId, {
        entityType: 'IT_TEST', entityId: app.tenantId, requesterId: app.coreIds.manager, title: 'IT-1', link: '/feed',
      }),
    );
    const inbox = await app.api().get('/api/v1/core/approvals/inbox').set(app.as('admin')).expect(200);
    expect(inbox.body.items.map((i: { id: string }) => i.id)).toContain(instance.id);
    expect((await app.api().get('/api/v1/core/approvals/inbox').set(app.as('nobody')).expect(200)).body.items).toHaveLength(0);

    await app.api().post(`/api/v1/core/approvals/instances/${instance.id}/decide`).set(app.as('manager')).send({ action: 'APPROVE' }).expect(403);
    await app.api().post(`/api/v1/core/approvals/instances/${instance.id}/decide`).set(app.as('nobody')).send({ action: 'APPROVE' }).expect(404);
    await app.api().post(`/api/v1/core/approvals/instances/${instance.id}/decide`).set(app.as('admin')).send({ action: 'REJECT' }).expect(400);
    const done = await app.api().post(`/api/v1/core/approvals/instances/${instance.id}/decide`).set(app.as('admin')).send({ action: 'APPROVE', comment: 'ok' }).expect(201);
    expect(done.body).toMatchObject({ status: 'APPROVED', canDecide: false });
    expect(finals).toEqual([expect.objectContaining({ status: 'APPROVED', actorId: app.coreIds.admin })]);
    const mine = await app.api().get('/api/v1/core/notifications').set(app.as('manager')).expect(200);
    expect(mine.body.items.some((n: { type: string }) => n.type === 'core.approval.decided')).toBe(true);
  });

  it('WF-06 delegation: давхцах хугацаа 409, өөрийгөө 400', async () => {
    const until = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await app.api().post('/api/v1/core/approvals/delegations').set(app.as('admin')).send({ delegateId: app.coreIds.admin, validUntil: until }).expect(400);
    await app.api().post('/api/v1/core/approvals/delegations').set(app.as('admin')).send({ delegateId: app.coreIds.nobody, validUntil: until }).expect(201);
    await app.api().post('/api/v1/core/approvals/delegations').set(app.as('admin')).send({ delegateId: app.coreIds.manager, validUntil: until }).expect(409);
    const forMe = await app.api().get('/api/v1/core/approvals/delegations').set(app.as('nobody')).expect(200);
    expect(forMe.body.items).toEqual([expect.objectContaining({ mine: false })]);
  });

  it('FILE-01: лого — admin оруулна (шифрлэгдсэн), бусад харна, оруулж чадахгүй; буруу төрөл 400', async () => {
    await app.api().get('/api/v1/core/settings').set(app.as('admin')).expect(200);
    const up = await app.api().post('/api/v1/core/attachments').query({ entityType: 'TENANT_LOGO', entityId: app.tenantId })
      .set(app.as('admin')).attach('files', PNG, 'logo.png').expect(201);
    const id = up.body.items[0].id as string;
    const row = await app.prismaAdmin.coreAttachment.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ encryption: 'AES-256-GCM', mimeType: 'image/png', sizeBytes: PNG.length });
    const dl = await app.api().get(`/api/v1/core/attachments/${id}/download`).set(app.as('nobody')).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(Buffer.compare(dl.body as Buffer, PNG)).toBe(0);
    await app.api().post('/api/v1/core/attachments').query({ entityType: 'TENANT_LOGO', entityId: app.tenantId })
      .set(app.as('nobody')).attach('files', PNG, 'x.png').expect(403);
    await app.api().post('/api/v1/core/attachments').query({ entityType: 'TENANT_LOGO', entityId: app.tenantId })
      .set(app.as('admin')).attach('files', Buffer.from('<script>alert(1)</script>'), 'x.png').expect(400);
    const settings = await app.api().get('/api/v1/core/settings').set(app.as('admin')).expect(200);
    expect(settings.body.profile.logoPath).toBe(`attachment:${id}`);
  });

  it('D-1: DEBUG_MENU_ENABLED=false үед Debug API 404 (OWNER/ADMIN ч)', async () => {
    await app.api().get('/api/v1/core/debug/system').set(app.as('admin')).expect(404);
    await app.api().get('/api/v1/core/debug/me').set(app.as('nobody')).expect(404);
  });

  it('FEED-04/05: пост → санал хүсэлт; давхар 409; төлөв постод, «Хийгдсэн» болоход зохиогчид мэдэгдэл', async () => {
    const post = await app.api().post('/api/v1/core/feed').set(app.as('nobody')).send({ body: 'Цайны газарт халуун ус алга' }).expect(201);
    const pid = post.body.id as string;
    const fb = await app.api().post(`/api/v1/core/feedback/from-post/${pid}`).set(app.as('manager')).send({ kind: 'REQUEST', title: 'Халуун ус' }).expect(201);
    await app.api().post(`/api/v1/core/feedback/from-post/${pid}`).set(app.as('manager')).send({ kind: 'REQUEST', title: 'Дахин' }).expect(409);
    const seen = await app.api().get(`/api/v1/core/feed/${pid}`).set(app.as('nobody')).expect(200);
    expect(seen.body.links).toEqual([expect.objectContaining({ objectType: 'CORE_FEEDBACK', statusKey: 'feed.link.status.feedback.new', closed: false })]);
    await app.api().patch(`/api/v1/core/feedback/${fb.body.id}/status`).set(app.as('admin')).send({ status: 'DONE', doneVersion: 'v0.2.4' });
    const after = await app.api().get(`/api/v1/core/feed/${pid}`).set(app.as('nobody')).expect(200);
    expect(after.body.links[0]).toMatchObject({ statusKey: 'feed.link.status.feedback.done', closed: true });
    const notes = await app.api().get('/api/v1/core/notifications').set(app.as('nobody')).expect(200);
    expect(notes.body.items.some((n: { type: string; link: string }) => n.type === 'feed.link.status' && n.link === `/feed/${pid}`)).toBe(true);
  });
});
