/**
 * v0.2.3 Блок D — өгөгдлийн импорт integration (бодит PG + RLS):
 *   S1 нэр (овог / нэр / ургийн овог), S2 нэмэлт утас, S4 албан тушаал, S5 өрөөний тохиргоо (байрны төрөл → байр → өрөө),
 *   S6 өрөөнд байрлуулалт (түүх, нэгтгэх, давхцал), S7 ажлаас гарсан ажилтан (түүх, дахин орсон гинж).
 */
import { asTenant, CampIt, createCampIt } from './helpers/camp-it-app';

let it_: CampIt;
const HR = (path = '') => `/api/v1/hr/sites/${it_.ids.c1}${path}`;

type PreviewRow = { op: string; values: Record<string, unknown>; changes: Record<string, { from: unknown; to: unknown }>; errors: { column?: string; code: string }[] };

async function preview(type: string, rows: Record<string, unknown>[]) {
  const res = await it_.api().post(HR(`/data-imports/${type}`)).set(it_.as('admin')).send({ rows });
  if (res.status !== 201) throw new Error(`preview ${type}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { import: { id: string; createRows: number; updateRows: number; unchangedRows: number; errorRows: number }; rows: PreviewRow[] };
}
async function confirm(type: string, id: string, skipErrors = false) {
  return it_.api().post(HR(`/data-imports/${type}/${id}/confirm`)).set(it_.as('admin')).send({ skipErrors });
}
async function importOk(type: string, rows: Record<string, unknown>[]) {
  const p = await preview(type, rows);
  const errs = p.rows.filter((r) => r.op === 'error');
  if (errs.length) throw new Error(`${type} errors: ${JSON.stringify(errs.map((e) => e.errors))}`);
  const c = await confirm(type, p.import.id);
  expect(c.status).toBe(200);
  return p;
}
const employee = (code: string) =>
  asTenant(it_.prismaRls, it_.tenantId, (tx) =>
    tx.hrEmployee.findMany({
      where: { tenantId: it_.tenantId, employeeCode: code },
      select: { id: true, fullName: true, lastName: true, firstName: true, familyName: true, phone: true, status: true, terminatedAt: true, terminationReason: true, rehiredFromId: true, positionRef: { select: { name: true, code: true } }, extraPhones: { select: { phone: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
  );

beforeAll(async () => {
  it_ = await createCampIt('v023-it');
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('S1 + S2 — нэр, нэмэлт утас', () => {
  it('API: овог/нэр/ургийн овог + нэмэлт утас → full_name «овог нэр», нэмэлтээс үндсэнтэй давхардсаныг хасна', async () => {
    const res = await it_.api().post(HR('/employees')).set(it_.as('admin')).send({
      organizationId: it_.ids.org, departmentId: it_.ids.dept, employeeCode: 'N-1',
      lastName: ' Хүрлээ ', firstName: 'Анхбаяр', familyName: 'Дархчууд', phone: '95097590', extraPhones: ['9509 7590', '80788684', '80788684'],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fullName: 'Хүрлээ Анхбаяр', lastName: 'Хүрлээ', firstName: 'Анхбаяр', familyName: 'Дархчууд', extraPhones: ['80788684'] });

    // Хуучин клиент: зөвхөн fullName → салгана
    const legacy = await it_.api().post(HR('/employees')).set(it_.as('admin')).send({ organizationId: it_.ids.org, departmentId: it_.ids.dept, employeeCode: 'N-2', fullName: 'Бат  Дорж' });
    expect(legacy.status).toBe(201);
    expect(legacy.body).toMatchObject({ fullName: 'Бат Дорж', lastName: 'Бат', firstName: 'Дорж', extraPhones: [] });

    // Шинэчлэх: нэрийг л, нэмэлт утсыг солих; үндсэн утас солигдоход давхардал хасагдана
    const upd = await it_.api().patch(HR(`/employees/${res.body.id}`)).set(it_.as('admin')).send({ firstName: 'Анх', extraPhones: ['88123354', '99435600'] });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ fullName: 'Хүрлээ Анх', extraPhones: ['88123354', '99435600'] });
    const upd2 = await it_.api().patch(HR(`/employees/${res.body.id}`)).set(it_.as('admin')).send({ phone: '88123354' });
    expect(upd2.body.extraPhones).toEqual(['99435600']);
    const prof = await it_.api().get(HR(`/employees/${res.body.id}/profile`)).set(it_.as('admin'));
    expect(prof.body).toMatchObject({ lastName: 'Хүрлээ', firstName: 'Анх', extraPhones: ['99435600'] });

    const bad = await it_.api().post(HR('/employees')).set(it_.as('admin')).send({ organizationId: it_.ids.org, departmentId: it_.ids.dept, employeeCode: 'N-3', firstName: 'X', extraPhones: ['123'] });
    expect(bad.status).toBe(400);
  });

  it('импорт: овог/нэр/ургийн овог, «Нэмэлт утас» (таслал, мөр шилжилт); хуучин «Овог нэр» багана; шинэчлэхэд өөрчлөлт', async () => {
    const p = await preview('employees', [
      { employeeCode: 'I-1', lastName: 'Лхам-Осоржин', firstName: 'Бямбадорж', familyName: 'Хөх чоносууд', phone: '99924953', extraPhones: '88252432,\n99717768', organization: it_.ids.orgReg, department: 'ADM', crew: 'A' },
      { employeeCode: 'I-2', fullName: 'Ганзориг Мөнхдорж', organization: it_.ids.orgReg, department: 'ADM' },
      { employeeCode: 'I-3', lastName: 'Овоггүй', organization: it_.ids.orgReg, department: 'ADM' },
      { employeeCode: 'I-4', firstName: 'Утас', extraPhones: '123', organization: it_.ids.orgReg, department: 'ADM' },
    ]);
    expect(p.rows.map((r) => r.op)).toEqual(['create', 'create', 'error', 'error']);
    expect(p.rows[2].errors).toEqual([expect.objectContaining({ column: 'firstName', code: 'row.required' })]);
    expect(p.rows[3].errors).toEqual([expect.objectContaining({ column: 'extraPhones', code: 'row.bad_phone' })]);
    expect((await confirm('employees', p.import.id, true)).status).toBe(200);
    const [e1] = await employee('I-1');
    expect(e1).toMatchObject({ fullName: 'Лхам-Осоржин Бямбадорж', familyName: 'Хөх чоносууд', extraPhones: [{ phone: '88252432' }, { phone: '99717768' }] });
    expect((await employee('I-2'))[0]).toMatchObject({ lastName: 'Ганзориг', firstName: 'Мөнхдорж' });

    const p2 = await preview('employees', [{ employeeCode: 'I-1', firstName: 'Бямба', extraPhones: '99717768', organization: it_.ids.orgReg, department: 'ADM' }]);
    expect(p2.rows[0].op).toBe('update');
    expect(p2.rows[0].changes).toMatchObject({ firstName: { from: 'Бямбадорж', to: 'Бямба' }, extraPhones: { from: '88252432, 99717768', to: '99717768' } });

    // Экспорт → буцааж импорт = өөрчлөлтгүй (шинэ баганууд)
    const exp = await it_.api().get(HR('/export/employees')).set(it_.as('admin'));
    expect(exp.status).toBe(200);
  });
});

describe('S4 — албан тушаал', () => {
  it('нэрээр түлхүүр (нормчлол), код (индекс) шинэчлэх; ажилтны импорт нэрээр холбоно', async () => {
    await importOk('positions', [{ name: 'Автобусны жолооч', code: '8331-11' }, { name: 'Кемп менежер', code: '1412-11' }]);
    const p = await preview('positions', [{ name: '  автобусны   ЖОЛООЧ ', code: '8331-12' }, { name: 'Кемп менежер', code: '1412-11' }, { name: 'Тогооч' }]);
    expect(p.rows.map((r) => r.op)).toEqual(['update', 'unchanged', 'create']);
    expect((await confirm('positions', p.import.id)).status).toBe(200);
    await importOk('employees', [{ employeeCode: 'P-1', firstName: 'Жолооч', position: 'Автобусны жолооч', organization: it_.ids.orgReg, department: 'ADM' }]);
    expect((await employee('P-1'))[0].positionRef).toEqual({ name: 'Автобусны жолооч', code: '8331-12' });
  });
});

describe('S5 — өрөөний тохиргоо', () => {
  it('байрны төрөл → байр → өрөө; файл доторх давхардал; дахин импорт = өөрчлөлтгүй', async () => {
    await importOk('building-types', [{ name: 'Амьдрах байр' }]);
    await importOk('buildings', [{ code: 'B7', name: '7-р байр', type: 'Амьдрах байр' }, { code: 'B1', name: 'Байр 1', type: 'Амьдрах байр' }]);
    const bad = await preview('buildings', [{ code: 'B9', name: '9', type: 'Байхгүй төрөл' }]);
    expect(bad.rows[0].errors[0]).toMatchObject({ column: 'type', code: 'row.ref_not_found' });

    const rooms = [
      { building: 'B7', roomNo: '701', capacity: 2 },
      { building: 'B7', roomNo: '702', capacity: 2, floor: 1 },
      { building: 'B1', roomNo: '101', capacity: 1 },
    ];
    const p = await preview('rooms', [...rooms, { building: 'B7', roomNo: '701', capacity: 3 }, { building: 'B5', roomNo: '1', capacity: 1 }]);
    expect(p.rows.map((r) => r.op)).toEqual(['create', 'create', 'create', 'error', 'error']);
    expect((await confirm('rooms', p.import.id, true)).status).toBe(200);
    const again = await preview('rooms', rooms);
    expect(again.rows.map((r) => r.op)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    const tpl = await it_.api().get(HR('/data-imports/rooms/template')).set(it_.as('admin'));
    expect(tpl.status).toBe(200);
  });
});

describe('S6 — өрөөнд байрлуулалт (түүх)', () => {
  it('өрөө сольсон түүх; одоогийн нь дуусаагүй; профайлд түүх; файл доторх давхцал; өөр өрөөтэй давхцал → алдаа; ижил өрөө → нэгтгэнэ', async () => {
    await importOk('employees', [
      { employeeCode: 'R-1', firstName: 'Нэг', organization: it_.ids.orgReg, department: 'ADM', crew: 'A' },
      { employeeCode: 'R-2', firstName: 'Хоёр', organization: it_.ids.orgReg, department: 'ADM', crew: 'A' },
    ]);
    const p = await preview('room-allocations', [
      { employeeCode: 'R-1', building: 'B7', roomNo: '701', startDate: '2026-07-01', endDate: '2026-08-15' },
      { employeeCode: 'R-1', building: 'B7', roomNo: '702', startDate: '2026-08-16' },
      { employeeCode: 'R-2', building: 'B7', roomNo: '701', startDate: '2026-07-01', endDate: '2026-07-31' },
      { employeeCode: 'R-2', building: 'B7', roomNo: '702', startDate: '2026-07-20', endDate: '2026-08-10' },
      { employeeCode: 'R-9', building: 'B7', roomNo: '701', startDate: '2026-07-01' },
      { employeeCode: 'R-2', building: 'B7', roomNo: '701', startDate: '2026-09-10', endDate: '2026-09-01' },
    ]);
    expect(p.rows.map((r) => r.op)).toEqual(['create', 'create', 'create', 'error', 'error', 'error']);
    expect(p.rows[3].errors[0]).toMatchObject({ code: 'row.alloc_overlap_in_file' });
    expect(p.rows[4].errors[0]).toMatchObject({ column: 'employeeCode', code: 'row.ref_not_found' });
    expect(p.rows[5].errors[0]).toMatchObject({ code: 'row.end_before_start' });
    expect((await confirm('room-allocations', p.import.id, true)).status).toBe(200);

    const [r1] = await employee('R-1');
    const prof = await it_.api().get(HR(`/employees/${r1.id}/profile`)).set(it_.as('admin'));
    expect(prof.body.rooms.map((r: { roomNo: string; startDate: string; endDate: string | null }) => [r.roomNo, r.startDate, r.endDate])).toEqual([
      ['702', '2026-08-16', null],
      ['701', '2026-07-01', '2026-08-15'],
    ]);

    // Дахин импорт: ижил → өөрчлөлтгүй; ижил өрөө эрт эхэлсэн → нэгтгэж шинэчилнэ; өөр өрөөтэй давхцал → алдаа
    const p2 = await preview('room-allocations', [
      { employeeCode: 'R-1', building: 'B7', roomNo: '702', startDate: '2026-08-16' },
      { employeeCode: 'R-2', building: 'B7', roomNo: '701', startDate: '2026-06-25', endDate: '2026-07-10' },
      { employeeCode: 'R-1', building: 'B1', roomNo: '101', startDate: '2026-07-05', endDate: '2026-07-06' },
    ]);
    expect(p2.rows.map((r) => r.op)).toEqual(['unchanged', 'update', 'error']);
    expect(p2.rows[1].changes).toEqual({ startDate: { from: '2026-07-01', to: '2026-06-25' } });
    expect(p2.rows[2].errors[0]).toMatchObject({ code: 'row.alloc_overlap' });
  });

  it('багтаамж: одоогийн байрлуулалт өрөөний багтаамжаас хэтэрвэл алдаа (түүх шалгахгүй)', async () => {
    await importOk('employees', [
      { employeeCode: 'C-1', firstName: 'C1', organization: it_.ids.orgReg, department: 'ADM', crew: 'A' },
      { employeeCode: 'C-2', firstName: 'C2', organization: it_.ids.orgReg, department: 'ADM', crew: 'A' },
    ]);
    const p = await preview('room-allocations', [
      { employeeCode: 'C-1', building: 'B1', roomNo: '101', startDate: '2026-01-01', endDate: '2026-01-31' },
      { employeeCode: 'C-2', building: 'B1', roomNo: '101', startDate: '2026-01-01', endDate: '2026-01-31' },
      { employeeCode: 'C-1', building: 'B1', roomNo: '101', startDate: '2026-02-01' },
      { employeeCode: 'C-2', building: 'B1', roomNo: '101', startDate: '2026-02-01' },
    ]);
    expect(p.rows.map((r) => r.op)).toEqual(['create', 'create', 'create', 'error']);
    expect(p.rows[3].errors[0]).toMatchObject({ code: 'row.over_capacity' });
  });
});

describe('S7 — ажлаас гарсан ажилтан', () => {
  it('түүх үүсгэнэ (TERMINATED, хэрэглэгчгүй), дахин орсон гинж, идэвхтэй ажилтан сүүлд; дахин импорт = өөрчлөлтгүй; OTHER → тайлбар заавал', async () => {
    await importOk('employees', [{ employeeCode: 'T-1', firstName: 'Одоо', organization: it_.ids.orgReg, department: 'ADM' }]);
    const rows = [
      { employeeCode: 'T-1', lastName: 'Анх', firstName: 'Нэг', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2023-05-10', terminationReason: 'RESIGNED', position: 'Дампын операторч' },
      { employeeCode: 'T-1', lastName: 'Анх', firstName: 'Нэг', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2024-07-14', terminationReason: 'Ажлаас чөлөөлсөн', extraPhones: '99435600' },
      { employeeCode: 'T-2', fullName: 'Сүхбаатар Даваа', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2024-01-31', terminationReason: 'OTHER', terminationNote: 'Удаан хугацаанд тасалсан' },
    ];
    const p = await preview('former-employees', [
      ...rows,
      { employeeCode: 'T-3', firstName: 'X', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2024-01-31', terminationReason: 'OTHER' },
      { employeeCode: 'T-1', firstName: 'Давхар', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2023-05-10', terminationReason: 'RESIGNED' },
      { employeeCode: 'T-4', firstName: 'Ирээдүй', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2099-01-01', terminationReason: 'RESIGNED' },
    ]);
    expect(p.rows.map((r) => r.op)).toEqual(['create', 'create', 'create', 'error', 'error', 'error']);
    expect(p.rows[3].errors[0]).toMatchObject({ code: 'row.note_required_other' });
    expect(p.rows[4].errors[0]).toMatchObject({ code: 'row.duplicate_in_file' });
    expect(p.rows[5].errors[0]).toMatchObject({ code: 'row.date_future' });
    expect((await confirm('former-employees', p.import.id, true)).status).toBe(200);

    const t1 = await employee('T-1');
    expect(t1.map((e) => [e.status, e.terminatedAt ? e.terminatedAt.toISOString().slice(0, 10) : null])).toEqual([
      ['ACTIVE', null],
      ['TERMINATED', '2023-05-10'],
      ['TERMINATED', '2024-07-14'],
    ]);
    const [active, first, second] = t1;
    expect(first.rehiredFromId).toBeNull();
    expect(second.rehiredFromId).toBe(first.id);
    expect(active.rehiredFromId).toBe(second.id);
    expect(second).toMatchObject({ terminationReason: 'DISMISSED', extraPhones: [{ phone: '99435600' }] });
    expect(first.positionRef?.name).toBe('Дампын операторч');

    const again = await preview('former-employees', rows);
    expect(again.rows.map((r) => r.op)).toEqual(['unchanged', 'unchanged', 'unchanged']);

    // Ажлаас гарсан ажилтны жагсаалт (статусаар), ердийн жагсаалтад харагдахгүй
    const list = await it_.api().get(HR('/employees')).query({ q: 'T-' }).set(it_.as('admin'));
    expect(list.body.data.map((e: { employeeCode: string }) => e.employeeCode).sort()).toEqual(['T-1']);
  });

  it('эрх: manager (employee.terminate-гүй) → 403', async () => {
    const res = await it_.api().post(HR('/data-imports/former-employees')).set(it_.as('manager')).send({ rows: [{ employeeCode: 'Z', firstName: 'Z', organization: it_.ids.orgReg, department: 'ADM', terminatedAt: '2024-01-01', terminationReason: 'RESIGNED' }] });
    expect(res.status).toBe(403);
  });
});

describe('🔒 RLS — camp_employee_phones', () => {
  it('өөр tenant-ийн контекстод 0 мөр', async () => {
    const other = await asTenant(it_.prismaRls, '00000000-0000-0000-0000-000000000003', (tx) => tx.hrEmployeePhone.count());
    expect(other).toBe(0);
    const mine = await asTenant(it_.prismaRls, it_.tenantId, (tx) => tx.hrEmployeePhone.count());
    expect(mine).toBeGreaterThan(0);
  });
});
