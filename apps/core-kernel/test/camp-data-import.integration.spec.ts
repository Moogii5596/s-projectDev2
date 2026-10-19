/**
 * v0.2.0 §0.5 — Мастер өгөгдлийн импорт/экспорт integration (FB-08 ажилтан, FB-02 хэлтэс, §2.4 өрөө)
 *   - Загвар: хэрэглэгчийн хэлээр (Accept-Language) толгой + "Заавар"
 *   - Хүснэгтээр (JSON) ба xlsx (монгол толгой) → PREVIEW (шинэ/шинэчлэх/өөрчлөлтгүй/алдаатай)
 *   - Confirm: алдаатай бол юу ч бичихгүй (409 + мөрийн алдаа хэлээр); skipErrors → зөвийг л; түүх IMPORT
 *   - Экспорт → буцааж импорт = бүгд "өөрчлөлтгүй" (формат ижил)
 *   - Зэрэгцээ confirm → нэг нь л; эрх; RLS
 */
import ExcelJS from 'exceljs';
import { asTenant, CampIt, createCampIt } from './helpers/camp-it-app';

let it_: CampIt;
const DI = (path = '') => it_.camp(`/data-imports${path}`);

async function xlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function readSheet(buf: Buffer, idx = 0) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[idx];
  const out: string[][] = [];
  ws.eachRow((row) => out.push((row.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? '' : String(v)))));
  return { name: ws.name, rows: out, sheets: wb.worksheets.map((w) => w.name) };
}
const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void; setEncoding?: (e: string) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => c && chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  it_ = await createCampIt('dimp-it');
  // Нэмэлт: идэвхгүй ростер, 2 дахь кемп (код давхцал)
  await it_.api().post(it_.camp('/crews')).set(it_.as('admin')).send({ code: 'B', rosterAnchorDate: '2026-10-21' });
  const c2 = await it_.api().post('/api/v1/camp/camps').set(it_.as('admin')).send({ code: 'C2', name: 'Кемп 2' });
  it_.ids.c2 = c2.body.id;
  const loc2 = await it_.api().post(`/api/v1/camp/camps/${it_.ids.c2}/meal-locations`).set(it_.as('admin')).send({ name: 'C2 гал тогоо' });
  const d2 = await it_.api().post(`/api/v1/camp/camps/${it_.ids.c2}/departments`).set(it_.as('admin')).send({ code: 'D2', name: 'd2', mealLocationId: loc2.body.id });
  const e2 = await it_.api().post(`/api/v1/camp/camps/${it_.ids.c2}/employees`).set(it_.as('admin'))
    .send({ organizationId: it_.ids.org, departmentId: d2.body.id, employeeCode: 'X-900', fullName: 'Өөр кемп' });
  expect(e2.status).toBe(201);
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('📥 Загвар', () => {
  it('ажилтны загвар: en → "Employee code", zh → "员工编号", mn → "Ажилтны код"; "Заавар" хуудас', async () => {
    for (const [lang, header, help] of [['en', 'Employee code', 'Instructions'], ['zh-CN,zh;q=0.9', '员工编号', '说明'], ['mn', 'Ажилтны код', 'Заавар']] as const) {
      const res = await it_.api().get(DI('/employees/template')).set(it_.as('admin', { 'Accept-Language': lang })).buffer(true).parse(binary as never);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      const sheet = await readSheet(res.body as Buffer);
      expect(sheet.rows[0][0]).toBe(header);
      expect(sheet.sheets[1]).toBe(help);
    }
  });

  it('буруу төрөл → 400 код + орчуулсан мессеж (en)', async () => {
    const res = await it_.api().get(DI('/nope/template')).set(it_.as('admin', { 'Accept-Language': 'en' }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'import.unknown_type', params: { type: 'nope' }, message: 'Unknown import type: nope' });
  });
});

describe('👥 Ажилтан — хүснэгтээр', () => {
  const base = () => ({ organization: it_.ids.orgReg, department: 'ADM', crew: 'A' });

  it('preview: шинэ 2 (нэг нь утас буруу → «Мэдээлэл дутуу», v0.2.3 S9), алдаатай 2 (хэлтэс алга, өөр кемпийн код); DB-д юу ч бичигдээгүй', async () => {
    const res = await it_.api().post(DI('/employees')).set(it_.as('admin', { 'Accept-Language': 'en' })).send({
      rows: [
        { employeeCode: 'E-1', fullName: 'Бат', phone: '9911 2233', email: 'Bat@Mail.mn', ...base() },
        { employeeCode: 'E-2', fullName: 'Дорж', ...base(), department: 'NOPE' },
        { employeeCode: 'E-3', fullName: 'Сарнай', phone: '99-11', ...base() },
        { employeeCode: 'x-900', fullName: 'Давхар', ...base() },
        { employeeCode: '', fullName: '', organization: '', department: '' }, // хоосон мөр — алгасна
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.import).toMatchObject({ status: 'PREVIEW', source: 'GRID', totalRows: 4, createRows: 2, errorRows: 2 });
    const rows = res.body.rows as { row: number; op: string; errors: { column: string; code: string; message: string; columnLabel: string }[]; values: Record<string, unknown> }[];
    expect(rows[0]).toMatchObject({ op: 'create', values: { phone: '99112233', email: 'bat@mail.mn' } });
    expect(rows[1].errors[0]).toMatchObject({ column: 'department', code: 'row.ref_not_found', message: '"NOPE" was not found', columnLabel: 'Department code' });
    expect(rows[2]).toMatchObject({ op: 'create', errors: [], warnings: [expect.objectContaining({ column: 'phone', code: 'row.bad_phone' })] });
    expect(rows[3].errors[0]).toMatchObject({ code: 'row.code_other_camp' });
    expect(await it_.prismaAdmin.hrEmployee.count({ where: { tenantId: it_.tenantId, campId: it_.ids.c1 } })).toBe(0);
    it_.ids.imp1 = res.body.import.id;
  });

  it('confirm (skipErrors=false) → 409 import.has_errors + алдаатай мөрүүд; юу ч бичигдэхгүй; дараа нь skipErrors → 1 үүснэ, түүх IMPORT', async () => {
    const bad = await it_.api().post(DI(`/employees/${it_.ids.imp1}/confirm`)).set(it_.as('admin')).send({});
    expect(bad.status).toBe(409);
    expect(bad.body).toMatchObject({ code: 'import.has_errors', params: { n: 2 }, message: '2 мөр алдаатай — засаад дахин оруулна уу' });
    expect(bad.body.rows).toHaveLength(2);
    expect(await it_.prismaAdmin.hrEmployee.count({ where: { tenantId: it_.tenantId, campId: it_.ids.c1 } })).toBe(0);

    const ok = await it_.api().post(DI(`/employees/${it_.ids.imp1}/confirm`)).set(it_.as('admin')).send({ skipErrors: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'CONFIRMED', created: 2, updated: 0, skipped: 2 });
    const e3 = await it_.prismaAdmin.hrEmployee.findFirstOrThrow({ where: { tenantId: it_.tenantId, employeeCode: 'E-3' } });
    expect(e3).toMatchObject({ phone: null, dataIssues: [{ field: 'phone', code: 'row.bad_phone', value: '99-11' }] });
    const e = await it_.prismaAdmin.hrEmployee.findFirstOrThrow({ where: { tenantId: it_.tenantId, employeeCode: 'E-1' } });
    expect(e).toMatchObject({ phone: '99112233', email: 'bat@mail.mn', crewId: it_.ids.crew, status: 'ACTIVE' });
    const audit = await it_.prismaAdmin.campAuditLog.findMany({ where: { tenantId: it_.tenantId, entityId: e.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'IMPORT', importId: it_.ids.imp1, summaryKey: 'audit.employee.import' });

    const again = await it_.api().post(DI(`/employees/${it_.ids.imp1}/confirm`)).set(it_.as('admin')).send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('import.not_preview');
  });

  it('xlsx (монгол толгой, хятад утга): байгааг шинэчлэх (утас, ростергүй), өөрчлөлтгүй, шинэ; өөрчлөлт "хуучин → шинэ"', async () => {
    const buf = await xlsx([
      ['Ажилтны код', 'Овог нэр', 'Утас', 'Байгууллага (регистр эсвэл нэр)', 'Хэлтсийн код', 'Ростерын код', 'Төлөв'],
      ['E-1', 'Бат', '88001122', it_.ids.orgReg, 'ADM', '', '在职'],
      ['E-4', 'Шинэ хүн', null, 'Уурхай ХХК', 'adm', 'a', 'ИДЭВХТЭЙ'],
    ]);
    const res = await it_.api().post(DI('/employees')).set(it_.as('admin')).attach('file', buf, 'emp.xlsx');
    expect(res.status).toBe(201);
    expect(res.body.import).toMatchObject({ source: 'XLSX', fileName: 'emp.xlsx', updateRows: 1, createRows: 1, errorRows: 0 });
    expect(res.body.rows[0].changes).toEqual({ phone: { from: '99112233', to: '88001122' }, crew: { from: 'A', to: null } });
    const ok = await it_.api().post(DI(`/employees/${res.body.import.id}/confirm`)).set(it_.as('admin')).send({});
    expect(ok.body).toMatchObject({ created: 1, updated: 1 });
    const e1 = await it_.prismaAdmin.hrEmployee.findFirstOrThrow({ where: { tenantId: it_.tenantId, employeeCode: 'E-1' } });
    expect(e1).toMatchObject({ phone: '88001122', crewId: null, email: 'bat@mail.mn' }); // имэйл багана файлд алга → хэвээр
  });

  it('PREVIEW-ээс хойш DB өөрчлөгдвөл confirm ДАХИН шалгана (хэлтэс идэвхгүй болсон → 409)', async () => {
    const dept = await it_.api().post(it_.camp('/departments')).set(it_.as('admin')).send({ code: 'TMP', name: 'Түр', mealLocationId: it_.ids.loc });
    const pre = await it_.api().post(DI('/employees')).set(it_.as('admin')).send({ rows: [{ employeeCode: 'E-5', fullName: 'Ням', organization: it_.ids.orgReg, department: 'TMP' }] });
    expect(pre.body.import.createRows).toBe(1);
    expect((await it_.api().patch(it_.camp(`/departments/${dept.body.id}`)).set(it_.as('admin')).send({ isActive: false })).status).toBe(200);
    const res = await it_.api().post(DI(`/employees/${pre.body.import.id}/confirm`)).set(it_.as('admin')).send({});
    expect(res.status).toBe(409);
    expect(res.body.rows[0].errors[0].code).toBe('row.ref_inactive');
    const cancel = await it_.api().post(DI(`/employees/${pre.body.import.id}/cancel`)).set(it_.as('admin'));
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('v0.2.1: албан тушаал (каталог, нэрийн нормчлол, шинийг үүсгэнэ), ажлын хоолны байршил (нэрээр), хоол авах — preview өөрчлөлт, confirm', async () => {
    const pre = await it_.api().post(DI('/employees')).set(it_.as('admin')).send({
      rows: [
        { employeeCode: 'E-71', fullName: 'Хоолгүй', organization: it_.ids.orgReg, department: 'ADM', position: 'Харуул', mealLocation: 'гал тогоо', mealsIncluded: 'Үгүй' },
        { employeeCode: 'E-72', fullName: 'Хоёр дахь', organization: it_.ids.orgReg, department: 'ADM', position: '  харуул ', mealsIncluded: '否' },
        { employeeCode: 'E-73', fullName: 'Буруу байршил', organization: it_.ids.orgReg, department: 'ADM', mealLocation: 'Байхгүй газар' },
      ],
    });
    expect(pre.status).toBe(201);
    expect(pre.body.rows.map((r: { op: string }) => r.op)).toEqual(['create', 'create', 'error']);
    expect(pre.body.rows[2].errors[0]).toMatchObject({ column: 'mealLocation', code: 'row.ref_not_found' });
    expect(await it_.prismaAdmin.hrPosition.count({ where: { tenantId: it_.tenantId, name: { equals: 'Харуул', mode: 'insensitive' } } })).toBe(0); // preview бичихгүй
    const ok = await it_.api().post(DI(`/employees/${pre.body.import.id}/confirm`)).set(it_.as('admin')).send({ skipErrors: true });
    expect(ok.body).toMatchObject({ created: 2, skipped: 1 });
    const pos = await it_.prismaAdmin.hrPosition.findMany({ where: { tenantId: it_.tenantId, name: { equals: 'Харуул', mode: 'insensitive' } } });
    expect(pos).toHaveLength(1); // " харуул " → ижил албан тушаал
    const rows = await it_.prismaAdmin.hrEmployee.findMany({ where: { tenantId: it_.tenantId, employeeCode: { in: ['E-71', 'E-72'] } }, orderBy: { employeeCode: 'asc' } });
    expect(rows.map((e) => [e.employeeCode, e.positionId, e.mealLocationId, e.mealsIncluded])).toEqual([
      ['E-71', pos[0].id, it_.ids.loc, false],
      ['E-72', pos[0].id, null, false],
    ]);
    // Дахин импорт: хоол авах → тийм, байршил хоосон (= анхдагч руу) — өөрчлөлт "хуучин → шинэ"
    const again = await it_.api().post(DI('/employees')).set(it_.as('admin')).send({
      rows: [{ employeeCode: 'E-71', fullName: 'Хоолгүй', organization: it_.ids.orgReg, department: 'ADM', position: 'Харуул', mealLocation: '', mealsIncluded: 'Тийм' }],
    });
    expect(again.body.rows[0].op).toBe('update');
    expect(again.body.rows[0].changes).toEqual({ mealLocation: { from: 'Гал тогоо', to: null }, mealsIncluded: { from: false, to: true } });
    await it_.api().post(DI(`/employees/${again.body.import.id}/cancel`)).set(it_.as('admin'));
  });

  it('экспорт (en) → буцааж импорт = бүгд өөрчлөлтгүй (формат ижил)', async () => {
    const exp = await it_.api().get(it_.camp('/export/employees')).set(it_.as('admin', { 'Accept-Language': 'en' })).buffer(true).parse(binary as never);
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toMatch(/C1-employees-\d{4}-\d{2}-\d{2}\.xlsx/);
    const sheet = await readSheet(exp.body as Buffer);
    expect(sheet.rows[0]).toContain('Employee code');
    expect(sheet.rows.find((r) => r[0] === 'E-1')).toContain('Active');
    const back = await it_.api().post(DI('/employees')).set(it_.as('admin')).attach('file', exp.body as Buffer, 'export.xlsx');
    expect(back.status).toBe(201);
    // v0.2.1: E-71/E-72 (албан тушаал, хоолны байршил, хоол авах = үгүй) ч өөрчлөлтгүй; v0.2.3 S9: E-3 (утас хоосон + «Мэдээлэл дутуу») — хоосон утас асуудлыг арилгахгүй
    expect(back.body.import).toMatchObject({ totalRows: 5, unchangedRows: 5, createRows: 0, updateRows: 0, errorRows: 0 });
  });

  it('зэрэгцээ confirm → нэг нь 200, нөгөө нь 409 (давхар үүсэхгүй)', async () => {
    const pre = await it_.api().post(DI('/employees')).set(it_.as('admin')).send({ rows: [{ employeeCode: 'E-6', fullName: 'Зэрэг', organization: it_.ids.orgReg, department: 'ADM' }] });
    const id = pre.body.import.id;
    const [a, b] = await Promise.all([
      it_.api().post(DI(`/employees/${id}/confirm`)).set(it_.as('admin')).send({}),
      it_.api().post(DI(`/employees/${id}/confirm`)).set(it_.as('admin')).send({}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await it_.prismaAdmin.hrEmployee.count({ where: { tenantId: it_.tenantId, employeeCode: 'E-6' } })).toBe(1);
  });

  it('эрх: manager (employee.manage-гүй) импорт → 403, экспорт → 200; nobody экспорт → 403', async () => {
    expect((await it_.api().post(DI('/employees')).set(it_.as('manager')).send({ rows: [{ employeeCode: 'Z', fullName: 'z', organization: 'x', department: 'y' }] })).status).toBe(403);
    expect((await it_.api().get(it_.camp('/export/employees')).set(it_.as('manager'))).status).toBe(200);
    expect((await it_.api().get(it_.camp('/export/employees')).set(it_.as('nobody'))).status).toBe(403);
  });

  it('файлын алдаа: заавал багана алга → 400 import.missing_columns (zh); .xlsx биш → 400', async () => {
    const buf = await xlsx([['Овог нэр'], ['Бат']]);
    const res = await it_.api().post(DI('/employees')).set(it_.as('admin', { 'Accept-Language': 'zh' })).attach('file', buf, 'x.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('import.missing_columns');
    expect(res.body.message).toMatch(/^缺少必填列：员工编号/);
    const txt = await it_.api().post(DI('/employees')).set(it_.as('admin')).attach('file', Buffer.from('a,b\n1,2'), 'x.csv');
    expect(txt.body.code).toBe('import.not_xlsx');
  });
});

describe('🏢 Хэлтэс ба өрөөний экспорт', () => {
  it('хэлтэс (v0.2.1, Д-4): хоолны байршлын багана үл тоогдоно (хуучин файл эвдрэхгүй); идэвхтэй ажилтантай хэлтсийг идэвхгүй → алдаа', async () => {
    const res = await it_.api().post(DI('/departments')).set(it_.as('admin')).send({
      rows: [
        { code: 'KITCHEN', name: 'Гал тогоо', mealLocation: 'гал тогоо', active: 'Тийм' },
        { code: 'ENG', name: 'Инженер', mealLocation: '' },
        { code: 'ADM', name: 'Захиргаа', mealLocation: 'Гал тогоо', active: 'Үгүй' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.rows.map((r: { op: string }) => r.op)).toEqual(['create', 'create', 'error']);
    expect(res.body.rows[2].errors[0]).toMatchObject({ code: 'row.dept_has_active' });
    const ok = await it_.api().post(DI(`/departments/${res.body.import.id}/confirm`)).set(it_.as('admin')).send({ skipErrors: true });
    expect(ok.body).toMatchObject({ created: 2, skipped: 1 });
    const d = await it_.prismaAdmin.hrDepartment.findFirstOrThrow({ where: { tenantId: it_.tenantId, campId: it_.ids.c1, code: 'KITCHEN' } });
    expect(d.mealLocationId).toBeNull();
    expect(await it_.prismaAdmin.campAuditLog.count({ where: { tenantId: it_.tenantId, entityId: d.id, action: 'IMPORT' } })).toBe(1);
  });

  it('өрөөний экспорт: байр, дугаар, багтаамж, төлөв (шошго)', async () => {
    await it_.api().post(it_.camp('/rooms')).set(it_.as('admin')).send({ buildingId: it_.ids.b1, roomNo: '101', capacity: 4, floor: 1 });
    const exp = await it_.api().get(it_.camp('/export/rooms')).set(it_.as('admin')).buffer(true).parse(binary as never);
    expect(exp.status).toBe(200);
    const sheet = await readSheet(exp.body as Buffer);
    expect(sheet.rows[0]).toEqual(['Байрны код', 'Өрөөний дугаар', 'Давхар', 'Багтаамж', 'Төлөв', 'Тэмдэглэл']);
    expect(sheet.rows[1].slice(0, 5)).toEqual(['B1', '101', '1', '4', 'Идэвхтэй']);
  });
});

describe('🔒 RLS', () => {
  it('camp_data_imports: өөр tenant-ийн контекстод 0; жагсаалт өөрийн кемпийнх', async () => {
    const mine = await asTenant(it_.prismaRls, it_.tenantId, (tx) => tx.campDataImport.count());
    expect(mine).toBeGreaterThanOrEqual(5);
    const other = await asTenant(it_.prismaRls, '00000000-0000-0000-0000-000000000002', (tx) => tx.campDataImport.count({ where: { tenantId: it_.tenantId } }));
    expect(other).toBe(0);
    const list = await it_.api().get(DI('?type=departments')).set(it_.as('admin'));
    expect(list.body.every((i: { type: string }) => i.type === 'DEPARTMENTS')).toBe(true);
  });
});
