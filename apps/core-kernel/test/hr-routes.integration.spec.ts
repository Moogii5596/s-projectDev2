/**
 * v0.2.2 H1 (ADR-006 §5.1) — HR / Core замууд (integration, бодит PG + RLS)
 *   - шинэ `/api/v1/hr/...`, `/api/v1/core/organizations` нь хуучин `/api/v1/camp/...`-тай ИЖИЛ хариу
 *   - хуучин замууд `Deprecation: true` (H-Q4), шинэд байхгүй
 *   - HR-ийн ирц → Кемпийн байрлалт (`camp_stays`) нэг transaction-д (H-Q2, `CampHrBridge`)
 *   - HR экспортод Кемпийн `rooms` бүртгэгдсэн
 *   - эрх (camp.* код хэвээр) ба RLS (app_user)
 */
import { asTenant, CampIt, createCampIt, WEDNESDAY } from './helpers/camp-it-app';

const HR = '/api/v1/hr';
const CORE = '/api/v1/core';

let it_: CampIt;
const site = (path = '') => `${HR}/sites/${it_.ids.c1}${path}`;

beforeAll(async () => {
  it_ = await createCampIt('hr-it');
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('👥 HR ажилтан, бүтэц — шинэ ба хуучин зам ижил', () => {
  it('POST /hr/sites/:id/employees → 201; GET шинэ = хуучин; хуучинд Deprecation, шинэд үгүй', async () => {
    const { api, as, ids } = it_;
    const r = await api().post(site('/employees')).set(as('admin'))
      .send({ organizationId: ids.org, departmentId: ids.dept, crewId: ids.crew, employeeCode: 'H1', fullName: 'Хүний нөөц 1' });
    expect(r.status).toBe(201);
    expect(r.headers['deprecation']).toBeUndefined();
    ids.h1 = r.body.id;

    const fresh = await api().get(site('/employees')).set(as('admin'));
    const legacy = await api().get(it_.camp('/employees')).set(as('admin'));
    expect(fresh.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(legacy.headers['deprecation']).toBe('true');
    expect(fresh.body).toEqual(legacy.body);
    expect(JSON.stringify(fresh.body)).toContain('H1');

    const one = await api().get(site(`/employees/${ids.h1}`)).set(as('admin'));
    expect(one.status).toBe(200);
    expect(one.body).toEqual((await api().get(it_.camp(`/employees/${ids.h1}`)).set(as('admin'))).body);
  });

  it('хэлтэс, бригад: шинэ = хуучин; шинэ замаар бригад үүсгэнэ', async () => {
    const { api, as } = it_;
    for (const p of ['/departments', '/crews']) {
      const [a, b] = await Promise.all([api().get(site(p)).set(as('admin')), api().get(it_.camp(p)).set(as('admin'))]);
      expect(a.status).toBe(200);
      expect(a.body).toEqual(b.body);
    }
    const crew = await api().post(site('/crews')).set(as('admin')).send({ code: 'B', rosterAnchorDate: WEDNESDAY });
    expect(crew.status).toBe(201);
  });

  it('байгууллага /core/organizations = /camp/organizations; албан тушаал /hr/positions = /camp/positions', async () => {
    const { api, as } = it_;
    const [o1, o2] = await Promise.all([api().get(`${CORE}/organizations`).set(as('admin')), api().get('/api/v1/camp/organizations').set(as('admin'))]);
    expect(o1.status).toBe(200);
    expect(o1.body).toEqual(o2.body);
    expect(o2.headers['deprecation']).toBe('true');

    const pos = await api().post(`${HR}/positions`).set(as('admin')).send({ name: 'Жолооч' });
    expect(pos.status).toBe(201);
    const [p1, p2] = await Promise.all([api().get(`${HR}/positions`).set(as('admin')), api().get('/api/v1/camp/positions').set(as('admin'))]);
    expect(p1.body).toEqual(p2.body);
    expect(p1.body.map((p: { name: string }) => p.name)).toContain('Жолооч');
  });

  it('эрх: рольгүй хэрэглэгч → 403 (шинэ ба хуучин); manager (employee.manage-гүй) ажилтан үүсгэх → 403', async () => {
    const { api, as, ids } = it_;
    expect((await api().get(site('/employees')).set(as('nobody'))).status).toBe(403);
    expect((await api().get(it_.camp('/employees')).set(as('nobody'))).status).toBe(403);
    const r = await api().post(site('/employees')).set(as('manager')).send({ organizationId: ids.org, departmentId: ids.dept, employeeCode: 'X1', fullName: 'X' });
    expect(r.status).toBe(403);
  });
});

describe('🗓 HR ирц → Кемпийн байрлалт (H-Q2)', () => {
  it('POST /hr/sites/:id/movements (ирэлт) → stay нээгдэнэ; хуучин/шинэ жагсаалт ижил; устгахад stay арилна', async () => {
    const { api, as, ids } = it_;
    const date = '2026-10-21';
    const mv = await api().post(site('/movements')).set(as('admin'))
      .send({ employeeId: ids.h1, date, direction: 'ARRIVAL', meals: ['LUNCH'], shift: 'DAY' });
    expect(mv.status).toBe(201);

    const stays = await api().get(it_.camp(`/stays?date=${date}`)).set(as('admin'));
    expect(stays.status).toBe(200);
    expect(stays.headers['deprecation']).toBeUndefined(); // stays = Кемпийнх
    expect(stays.body.map((s: { employee: { id: string } }) => s.employee.id)).toContain(ids.h1);

    const q = `/movements?from=2026-10-01&to=2026-10-31&employeeId=${ids.h1}`;
    const [m1, m2] = await Promise.all([api().get(site(q)).set(as('admin')), api().get(it_.camp(q)).set(as('admin'))]);
    expect(m1.status).toBe(200);
    expect(m1.body).toEqual(m2.body);
    const movementId = (m1.body as { id: string }[])[0].id;

    const cal = `/shift-calendar?from=2026-10-01&to=2026-10-31`;
    const [c1, c2] = await Promise.all([api().get(site(cal)).set(as('admin')), api().get(it_.camp(cal)).set(as('admin'))]);
    expect(c1.status).toBe(200);
    expect(c1.body).toEqual(c2.body);

    expect((await api().delete(site(`/movements/${movementId}`)).set(as('admin'))).status).toBe(200);
    const after = await api().get(it_.camp(`/stays?date=${date}`)).set(as('admin'));
    expect(after.body.map((s: { employee: { id: string } }) => s.employee.id)).not.toContain(ids.h1);
  });
});

describe('📥 HR импорт / экспорт', () => {
  it('загвар, экспорт (employees — HR, rooms — Кемп бүртгэсэн); үл мэдэгдэх төрөл → 400', async () => {
    const { api, as } = it_;
    const tpl = await api().get(site('/data-imports/employees/template')).set(as('admin'));
    expect(tpl.status).toBe(200);
    for (const t of ['employees', 'departments', 'rooms']) {
      const r = await api().get(site(`/export/${t}`)).set(as('admin'));
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('spreadsheetml');
    }
    const legacy = await api().get(it_.camp('/export/rooms')).set(as('admin'));
    expect(legacy.status).toBe(200);
    expect(legacy.headers['deprecation']).toBe('true');
    expect((await api().get(site('/export/nope')).set(as('admin'))).status).toBe(400);
  });
});

describe('🔒 RLS (app_user) — HR model нэр солигдсон ч DB хүснэгт хэвээр', () => {
  it('өөр tenant context → 0; өөрийн → ≥ 1', async () => {
    const { prismaRls, tenantId } = it_;
    const other = '00000000-0000-0000-0000-000000000000';
    expect(await asTenant(prismaRls, other, (tx) => tx.hrEmployee.count())).toBe(0);
    expect(await asTenant(prismaRls, tenantId, (tx) => tx.hrEmployee.count())).toBeGreaterThanOrEqual(1);
    expect(await asTenant(prismaRls, other, (tx) => tx.coreOrganization.count())).toBe(0);
  });
});
