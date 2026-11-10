import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TierType } from '@prisma/client';
import { createCampIt, type CampIt } from './helpers/camp-it-app';

describe('SYS-03 holiday calendars API (integration)', () => {
  let app: CampIt;
  let foreignTenantId: string;

  beforeAll(async () => {
    app = await createCampIt('calendars');
    foreignTenantId = (await app.prismaAdmin.tenant.create({
      data: { name: 'Foreign calendar tenant', slug: `${app.slug}-foreign`, tier: TierType.TIER1 },
    })).id;
  });

  afterAll(async () => {
    if (foreignTenantId) {
      await app.prismaAdmin.tenant.delete({ where: { id: foreignTenantId } }).catch((error) => console.error('[cleanup]', error));
    }
    await app?.close();
  });

  it('tenant admin lists seeded calendars, creates recurring holidays, and archives removals with audit', async () => {
    const seeded = await app.api().get('/api/v1/core/calendars').set(app.as('admin')).expect(200);
    expect(seeded.body.map((calendar: { code: string }) => calendar.code)).toEqual(['CN', 'MN', 'ORG']);

    const created = await app.api().post('/api/v1/core/calendars').set(app.as('admin')).send({
      code: 'TEST', name: 'Test calendar', countryCode: 'MN',
    }).expect(201);
    const calendarId = created.body.id as string;
    const holiday = await app.api().post(`/api/v1/core/calendars/${calendarId}/holidays`).set(app.as('admin')).send({
      name: 'Leap day', recurrence: 'ANNUAL', month: 2, day: 29,
    }).expect(201);
    await app.api().post(`/api/v1/core/calendars/${calendarId}/holidays`).set(app.as('admin')).send({
      name: 'One-time holiday', recurrence: 'ONCE', holidayDate: '2026-11-07',
    }).expect(201);

    await app.api().post(`/api/v1/core/calendars/${calendarId}/holidays`).set(app.as('admin')).send({
      name: 'Invalid day', recurrence: 'ANNUAL', month: 2, day: 30,
    }).expect(400);
    await app.api().post(`/api/v1/core/calendars/${calendarId}/holidays`).set(app.as('admin')).send({
      name: 'Invalid date', recurrence: 'ONCE', holidayDate: '2026-02-30',
    }).expect(400);

    await app.api().delete(`/api/v1/core/calendars/${calendarId}/holidays/${holiday.body.id}`).set(app.as('admin')).expect(200);
    const afterRemoval = await app.api().get('/api/v1/core/calendars').set(app.as('admin')).expect(200);
    expect(afterRemoval.body.find((calendar: { id: string }) => calendar.id === calendarId).holidays).toMatchObject([
      { name: 'One-time holiday', recurrence: 'ONCE', holidayDate: '2026-11-07T00:00:00.000Z' },
    ]);
    expect(await app.prismaAdmin.campAuditLog.count({
      where: { tenantId: app.tenantId, entityType: 'calendar_holiday', entityId: holiday.body.id, action: 'DEACTIVATE' },
    })).toBe(1);
  });

  it('enforces tenant-admin access and does not expose another tenant calendar', async () => {
    await app.api().get('/api/v1/core/calendars').set(app.as('manager')).expect(403);

    const foreign = await app.prismaAdmin.coreHolidayCalendar.findFirstOrThrow({
      where: { tenantId: foreignTenantId, code: 'MN' },
      include: { holidays: true },
    });
    const response = await app.api().get('/api/v1/core/calendars').set(app.as('admin')).expect(200);
    expect(response.body.some((calendar: { id: string }) => calendar.id === foreign.id)).toBe(false);
    const foreignHoliday = foreign.holidays[0];
    if (foreignHoliday) {
      await app.api().delete(`/api/v1/core/calendars/${foreign.id}/holidays/${foreignHoliday.id}`).set(app.as('admin')).expect(404);
    }
  });
});
