import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCampIt, type CampIt } from './helpers/camp-it-app';

describe('SYS-01 tenant settings API (integration)', () => {
  let app: CampIt;

  beforeAll(async () => {
    app = await createCampIt('tenant-settings');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('tenant admin уншиж, профайл/аюулгүй байдлын бодлогыг audit-тай шинэчилнэ', async () => {
    const initial = await app.api().get('/api/v1/core/settings').set(app.as('admin')).expect(200);
    expect(initial.body.profile.name).toBe(`IT tenant-settings`);

    const profile = await app.api().patch('/api/v1/core/settings/profile').set(app.as('admin')).send({
      name: 'Updated tenant',
      defaultLanguage: 'en',
      activeLanguages: ['en', 'mn'],
      timeZone: 'Asia/Ulaanbaatar',
    }).expect(200);
    expect(profile.body.profile).toMatchObject({
      name: 'Updated tenant',
      defaultLanguage: 'en',
      activeLanguages: ['en', 'mn'],
    });
    expect((await app.prismaAdmin.tenant.findUnique({ where: { id: app.tenantId } }))?.name).toBe('Updated tenant');

    const security = await app.api().patch('/api/v1/core/settings/security').set(app.as('admin')).send({
      passwordMinLength: 16,
      loginFailureLimit: 5,
      loginLockoutMinutes: 30,
      sessionDurationMinutes: 480,
    }).expect(200);
    expect(security.body.security).toMatchObject({
      passwordMinLength: 16,
      loginFailureLimit: 5,
      loginLockoutMinutes: 30,
      sessionDurationMinutes: 480,
    });
    expect(await app.prismaAdmin.campAuditLog.count({
      where: { tenantId: app.tenantId, entityType: 'tenant_settings', entityId: app.tenantId },
    })).toBe(2);
  });

  it('camp manager tenant-admin эрхгүй тул settings API-г ашиглахгүй', async () => {
    await app.api().get('/api/v1/core/settings').set(app.as('manager')).expect(403);
    await app.api().patch('/api/v1/core/settings/security').set(app.as('manager')).send({ loginFailureLimit: 4 }).expect(403);
  });

  it('хэлний уялдаа ба DB хязгаарыг API түвшинд шалгана', async () => {
    await app.api().patch('/api/v1/core/settings/profile').set(app.as('admin')).send({
      defaultLanguage: 'zh',
      activeLanguages: ['mn', 'en'],
    }).expect(400);
    await app.api().patch('/api/v1/core/settings/security').set(app.as('admin')).send({
      passwordMinLength: 5,
    }).expect(400);
  });

  it('модулийн default, эрх, идэвхжүүлэлт, dependency ба debug default хаалт шалгана', async () => {
    const mine = await app.api().get('/api/v1/me/modules').set(app.as('admin')).expect(200);
    expect(mine.body.modules).toEqual(expect.arrayContaining(['core', 'camp', 'hr', 'feed']));
    expect(mine.body.modules).not.toContain('inventory');

    const catalog = await app.api().get('/api/v1/core/modules').set(app.as('admin')).expect(200);
    expect(catalog.body.find((module: { id: string }) => module.id === 'inventory').active).toBe(false);
    await app.api().get('/api/v1/inventory/items').set(app.as('admin')).expect(404);
    await app.api().patch('/api/v1/core/modules/inventory').set(app.as('manager')).send({ active: true }).expect(403);

    const activated = await app.api().patch('/api/v1/core/modules/inventory').set(app.as('admin')).send({ active: true }).expect(200);
    expect(activated.body.find((module: { id: string }) => module.id === 'inventory').active).toBe(true);
    await app.api().get('/api/v1/inventory/items').set(app.as('admin')).expect(404);

    await app.api().patch('/api/v1/core/modules/inventory').set(app.as('admin')).send({ active: false }).expect(200);
    await app.api().get('/api/v1/inventory/items').set(app.as('admin')).expect(404);
    await app.api().patch('/api/v1/core/modules/hr').set(app.as('admin')).send({ active: false }).expect(409);
    expect(await app.prismaAdmin.campAuditLog.count({
      where: { tenantId: app.tenantId, entityType: 'installed_module' },
    })).toBe(2);
  });
});
