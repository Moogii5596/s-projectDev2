import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TierType } from '@prisma/client';
import { asTenant, createCampIt, type CampIt } from './helpers/camp-it-app';

describe('Core sites API (integration)', () => {
  let app: CampIt;
  let foreignTenantId: string;
  let foreignSiteId: string;

  beforeAll(async () => {
    app = await createCampIt('sites');
    const foreign = await app.prismaAdmin.tenant.create({
      data: { name: 'Foreign sites tenant', slug: `${app.slug}-foreign`, tier: TierType.TIER1 },
    });
    foreignTenantId = foreign.id;
    const foreignSite = await app.prismaAdmin.coreSite.create({
      data: { tenantId: foreignTenantId, type: 'OFFICE', code: 'HQ', name: 'Foreign office' },
    });
    foreignSiteId = foreignSite.id;
  });

  afterAll(async () => {
    if (foreignTenantId) {
      await app.prismaAdmin.tenant.delete({ where: { id: foreignTenantId } }).catch((error) => console.error('[cleanup]', error));
    }
    await app?.close();
  });

  it('links Camp API records, creates camp and non-camp sites, updates, archives, and audits changes', async () => {
    const legacyCamp = await app.prismaAdmin.camp.findFirstOrThrow({
      where: { tenantId: app.tenantId, code: 'C1' },
    });
    expect(legacyCamp.siteId).toBeTruthy();
    expect(await app.prismaAdmin.coreSite.findFirst({
      where: { tenantId: app.tenantId, id: legacyCamp.siteId!, type: 'CAMP', code: 'C1' },
    })).not.toBeNull();

    const initial = await app.api().get('/api/v1/core/sites').set(app.as('admin')).expect(200);
    expect(initial.body).toContainEqual(expect.objectContaining({ id: legacyCamp.siteId, type: 'CAMP', code: 'C1' }));

    const office = await app.api().post('/api/v1/core/sites').set(app.as('admin')).send({
      type: 'OFFICE', code: 'HQ', name: 'Main office',
    }).expect(201);
    const camp = await app.api().post('/api/v1/core/sites').set(app.as('admin')).send({
      type: 'CAMP', code: 'C2', name: 'Camp 2',
    }).expect(201);
    expect(await app.prismaAdmin.camp.findFirst({ where: { tenantId: app.tenantId, siteId: camp.body.id } })).not.toBeNull();
    expect(await app.prismaAdmin.campSetting.findFirst({ where: { tenantId: app.tenantId, campId: (await app.prismaAdmin.camp.findFirstOrThrow({ where: { tenantId: app.tenantId, siteId: camp.body.id } })).id } })).not.toBeNull();

    await app.api().patch(`/api/v1/core/sites/${office.body.id}`).set(app.as('admin')).send({
      name: 'Regional office',
    }).expect(200);
    await app.api().delete(`/api/v1/core/sites/${office.body.id}`).set(app.as('admin')).expect(200);
    const active = await app.api().get('/api/v1/core/sites?activeOnly=true').set(app.as('admin')).expect(200);
    expect(active.body.some((site: { id: string }) => site.id === office.body.id)).toBe(false);
    expect(await app.prismaAdmin.campAuditLog.count({
      where: { tenantId: app.tenantId, entityType: 'site', entityId: office.body.id },
    })).toBe(3);
  });

  it('enforces tenant-admin access and isolates records from another tenant', async () => {
    await app.api().get('/api/v1/core/sites').set(app.as('manager')).expect(403);
    const response = await app.api().get('/api/v1/core/sites').set(app.as('admin')).expect(200);
    expect(response.body.some((site: { id: string }) => site.id === foreignSiteId)).toBe(false);
    const rlsSites = await asTenant(app.prismaRls, app.tenantId, (tx) => tx.coreSite.findMany({ select: { id: true } }));
    expect(rlsSites.some((site) => site.id === foreignSiteId)).toBe(false);
    await app.api().patch(`/api/v1/core/sites/${foreignSiteId}`).set(app.as('admin')).send({ name: 'Changed' }).expect(404);
    await app.api().delete(`/api/v1/core/sites/${foreignSiteId}`).set(app.as('admin')).expect(404);
  });
});
