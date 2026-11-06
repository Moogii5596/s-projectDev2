/**
 * v0.2.0 §0.4 — Кемпийн өөрчлөлтийн түүх (camp_audit_log) integration
 *   - Ажилтан/хэлтэс/ростер/байр/өрөөний үүсгэх, засах, идэвхгүй → түүхийн мөр (diff, actor, summary_key)
 *   - Өөрчлөлтгүй засвар → мөр нэмэгдэхгүй; алдаатай засвар (409) → мөр үлдэхгүй (нэг transaction)
 *   - GET /camp/camps/:campId/audit (шүүлт, cursor, эрх)
 *   - RLS (app_user): өөр tenant-ийн контекстод 0 мөр; app_user засах/устгах эрхгүй (append-only)
 */
import { asTenant, CampIt, createCampIt } from './helpers/camp-it-app';

let it_: CampIt;

beforeAll(async () => {
  it_ = await createCampIt('audit-it');
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

const rows = (entityType: string, entityId: string) =>
  it_.prismaAdmin.campAuditLog.findMany({ where: { tenantId: it_.tenantId, entityType, entityId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('📜 camp_audit_log', () => {
  it('бэлтгэлийн хэлтэс/ростер/байр үүсгэлт → CREATE мөр (actor = admin, summary_key, params)', async () => {
    const [d] = await rows('department', it_.ids.dept);
    expect(d).toMatchObject({ action: 'CREATE', actorUserId: it_.coreIds.admin, campId: it_.ids.c1, summaryKey: 'audit.department.create' });
    expect(d.summaryParams).toEqual({ code: 'ADM', name: 'Захиргаа' });
    expect((d.diff as Record<string, unknown>).code).toEqual({ from: null, to: 'ADM' });
    expect((await rows('crew', it_.ids.crew))[0].diff).toMatchObject({ rosterAnchorDate: { from: null, to: '2026-10-07' } });
    expect((await rows('building', it_.ids.b1))[0].action).toBe('CREATE');
  });

  it('ажилтан: үүсгэх → засах (зөвхөн өөрчлөгдсөн талбар) → өөрчлөлтгүй засвар мөр нэмэхгүй → INACTIVE = DEACTIVATE', async () => {
    const e = await it_.api().post(it_.hr('/employees')).set(it_.as('admin'))
      .send({ organizationId: it_.ids.org, departmentId: it_.ids.dept, employeeCode: 'E100', fullName: 'Бат', phone: '99112233' });
    expect(e.status).toBe(201);
    const id = e.body.id as string;
    expect((await it_.api().patch(it_.hr(`/employees/${id}`)).set(it_.as('admin')).send({ fullName: 'Бат-Эрдэнэ', phone: '99112233' })).status).toBe(200);
    expect((await it_.api().patch(it_.hr(`/employees/${id}`)).set(it_.as('admin')).send({ fullName: 'Бат-Эрдэнэ' })).status).toBe(200);
    expect((await it_.api().patch(it_.hr(`/employees/${id}`)).set(it_.as('admin')).send({ status: 'INACTIVE' })).status).toBe(200);
    const list = await rows('employee', id);
    expect(list.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'DEACTIVATE']);
    // v0.2.3 Блок D (S1): нэрийн хэсгүүд ч түүхэд (fullName = «овог нэр»)
    expect(list[1].diff).toEqual({ fullName: { from: 'Бат', to: 'Бат-Эрдэнэ' }, firstName: { from: 'Бат', to: 'Бат-Эрдэнэ' } });
    expect(list[1].summaryParams).toEqual({ code: 'E100', name: 'Бат-Эрдэнэ' });
    expect(list[2].summaryKey).toBe('audit.employee.deactivate');
    it_.ids.emp = id;
  });

  it('алдаатай засвар (давхар код 409) → түүхийн мөр нэмэгдэхгүй', async () => {
    await it_.api().post(it_.hr('/employees')).set(it_.as('admin'))
      .send({ organizationId: it_.ids.org, departmentId: it_.ids.dept, employeeCode: 'E101', fullName: 'Дорж' });
    const before = await it_.prismaAdmin.campAuditLog.count({ where: { tenantId: it_.tenantId } });
    expect((await it_.api().patch(it_.hr(`/employees/${it_.ids.emp}`)).set(it_.as('admin')).send({ employeeCode: 'E101' })).status).toBe(409);
    expect(await it_.prismaAdmin.campAuditLog.count({ where: { tenantId: it_.tenantId } })).toBe(before);
  });

  it('өрөө: үүсгэх → INACTIVE (DEACTIVATE), params = өрөө + байр; хэлтсийн ээлжийн загвар өөрчлөлт → UPDATE (shiftPatterns)', async () => {
    const r = await it_.api().post(it_.camp('/rooms')).set(it_.as('admin')).send({ buildingId: it_.ids.b1, roomNo: '101', capacity: 2 });
    expect(r.status).toBe(201);
    expect((await it_.api().patch(it_.camp(`/rooms/${r.body.id}`)).set(it_.as('admin')).send({ status: 'INACTIVE' })).status).toBe(200);
    const list = await rows('room', r.body.id);
    expect(list.map((x) => x.action)).toEqual(['CREATE', 'DEACTIVATE']);
    expect(list[1].summaryParams).toEqual({ room: '101', building: 'B1' });
    expect(list[1].diff).toEqual({ status: { from: 'ACTIVE', to: 'INACTIVE' } });

    const sp = await it_.api().put(it_.hr(`/departments/${it_.ids.dept}/shift-pattern`)).set(it_.as('admin'))
      .send({ segments: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] });
    expect(sp.status).toBe(200);
    const d = await rows('department', it_.ids.dept);
    expect(d[d.length - 1].action).toBe('UPDATE');
    expect(Object.keys(d[d.length - 1].diff as object)).toEqual(['shiftPatterns']);
  });

  it('GET /audit: entityType/entityId шүүлт, actorName, cursor; рольгүй → 403; буруу entityType → 400', async () => {
    const res = await it_.api().get(it_.camp(`/audit?entityType=employee&entityId=${it_.ids.emp}`)).set(it_.as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { action: string }) => r.action)).toEqual(['DEACTIVATE', 'UPDATE', 'CREATE']);
    expect(res.body.data[0].actorName).toBe('IT admin');
    const p1 = await it_.api().get(it_.camp('/audit?limit=2')).set(it_.as('admin'));
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await it_.api().get(it_.camp(`/audit?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`)).set(it_.as('admin'));
    expect(p2.body.data[0].id).not.toBe(p1.body.data[1].id);
    expect((await it_.api().get(it_.camp('/audit')).set(it_.as('manager'))).status).toBe(200);
    expect((await it_.api().get(it_.camp('/audit')).set(it_.as('nobody'))).status).toBe(403);
    expect((await it_.api().get(it_.camp('/audit?entityType=user')).set(it_.as('admin'))).status).toBe(400);
  });

  it('RLS (app_user): өөрийн tenant → мөрүүд; өөр tenant → 0; UPDATE/DELETE эрхгүй', async () => {
    const mine = await asTenant(it_.prismaRls, it_.tenantId, (tx) => tx.campAuditLog.count());
    expect(mine).toBeGreaterThan(5);
    const other = await asTenant(it_.prismaRls, '00000000-0000-0000-0000-000000000002', (tx) => tx.campAuditLog.count({ where: { tenantId: it_.tenantId } }));
    expect(other).toBe(0);
    await expect(
      asTenant(it_.prismaRls, it_.tenantId, (tx) => tx.$executeRawUnsafe(`UPDATE camp_audit_log SET summary_key = 'x.y.z' WHERE tenant_id = '${it_.tenantId}'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asTenant(it_.prismaRls, it_.tenantId, (tx) => tx.$executeRawUnsafe(`DELETE FROM camp_audit_log WHERE tenant_id = '${it_.tenantId}'`)),
    ).rejects.toThrow(/permission denied/);
  });
});
