import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCampIt, asTenant, type CampIt } from './helpers/camp-it-app';
import { NotificationService } from '../src/modules/core/notifications/notification.service';
import { NotificationMailScheduler } from '../src/modules/core/notifications/notification-mail.scheduler';
import { PrismaTenantClientService } from '../src/db/prisma-tenant-client.service';
import { inTenantTx } from '../src/db/tenant-tx';

/** v0.2.4 Блок 7 (NTF-01): мэдэгдэл — өөрийн мөр, tenant тусгаарлалт, тохиргоо, имэйлийн дараалал */
describe('NTF-01 core notifications (integration)', () => {
  let app: CampIt;

  beforeAll(async () => {
    app = await createCampIt('notify');
  });

  afterAll(async () => {
    await app?.close();
  });

  const notify = (recipients: string[], type = 'core.approval.decided') =>
    inTenantTx(app.app.get(PrismaTenantClientService), app.tenantId, (tx) =>
      app.app.get(NotificationService).notify(tx, app.tenantId, {
        type, recipients, titleKey: 'notify.approval.approved.title', params: { entity: 'IT' }, link: '/feed',
      }),
    );

  it('хэрэглэгч зөвхөн өөрийн мэдэгдлийг харж, уншсан болгоно', async () => {
    expect(await notify([app.coreIds.manager, app.coreIds.admin])).toBe(2);
    const mine = await app.api().get('/api/v1/core/notifications').set(app.as('manager')).expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ titleKey: 'notify.approval.approved.title', params: { entity: 'IT' }, link: '/feed', readAt: null });
    expect((await app.api().get('/api/v1/core/notifications/unread-count').set(app.as('manager')).expect(200)).body).toEqual({ count: 1 });

    const adminItem = (await app.api().get('/api/v1/core/notifications').set(app.as('admin')).expect(200)).body.items[0];
    await app.api().post(`/api/v1/core/notifications/${adminItem.id}/read`).set(app.as('manager')).expect(404);

    await app.api().post(`/api/v1/core/notifications/${mine.body.items[0].id}/read`).set(app.as('manager')).expect(201);
    expect((await app.api().get('/api/v1/core/notifications/unread-count').set(app.as('manager')).expect(200)).body).toEqual({ count: 0 });
  });

  it('тохиргоо: апп доторх унтраавал жагсаалтад гарахгүй, имэйл дараалалд орно', async () => {
    const prefs = await app.api().get('/api/v1/core/notifications/preferences').set(app.as('nobody')).expect(200);
    expect(prefs.body.items.map((i: { type: string }) => i.type)).toEqual(expect.arrayContaining(['core.approval.decided', 'camp.meal_order.submitted']));
    await app.api().put('/api/v1/core/notifications/preferences').set(app.as('nobody'))
      .send({ items: [{ type: 'core.approval.decided', inApp: false, email: true }] }).expect(200);
    await notify([app.coreIds.nobody]);
    expect((await app.api().get('/api/v1/core/notifications').set(app.as('nobody')).expect(200)).body.items).toHaveLength(0);
    const rows = await app.prismaAdmin.coreNotification.findMany({ where: { tenantId: app.tenantId, userId: app.coreIds.nobody } });
    expect(rows).toEqual([expect.objectContaining({ inApp: false, emailStatus: 'PENDING' })]);

    // SMTP-гүй орчинд → SKIPPED (дараалал гацахгүй)
    await app.app.get(NotificationMailScheduler).sendPending();
    const after = await app.prismaAdmin.coreNotification.findUniqueOrThrow({ where: { id: rows[0].id } });
    expect(['SKIPPED', 'SENT']).toContain(after.emailStatus);
  });

  it('RLS: өөр tenant-ийн context-оос мэдэгдэл харагдахгүй', async () => {
    const foreign = await app.prismaAdmin.tenant.create({ data: { name: 'notify foreign', slug: `${app.slug}-nf` } });
    try {
      const seen = await asTenant(app.prismaRls, foreign.id, (tx) => tx.coreNotification.count());
      expect(seen).toBe(0);
      const own = await asTenant(app.prismaRls, app.tenantId, (tx) => tx.coreNotification.count());
      expect(own).toBeGreaterThan(0);
    } finally {
      await app.prismaAdmin.tenant.delete({ where: { id: foreign.id } });
    }
  });
});
