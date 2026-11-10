/**
 * v0.2.0 §0.7 — Олон хэл ба байгууллагын орчуулгын засвар integration
 *   - Excel татах (key · хэсэг · анхдагч · mn · en · zh) → засах → preview (хуучин → шинэ, хувьсагчийн шалгалт) → apply
 *   - Шууд хүчинтэй: backend алдааны мессеж (AppError) ба GET /i18n/web/:lang; анхдагч руу буцаах; түүх
 *   - CSV (UTF-8 BOM, цэг таслал); эрх (OWNER/ADMIN); RLS (өөр байгууллагын засвар харагдахгүй)
 *   - Хэрэглэгчийн хэл (PATCH /i18n/me/locale → GET /auth/me)
 */
import ExcelJS from 'exceljs';
import { asTenant, CampIt, createCampIt } from './helpers/camp-it-app';

let it_: CampIt;
let other: CampIt;
const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => c && chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  it_ = await createCampIt('i18n-it');
  other = await createCampIt('i18n-other');
}, 180_000);

afterAll(async () => {
  await it_?.close();
  await other?.close();
}, 30_000);

describe('🌐 Орчуулгын Excel', () => {
  it('шууд засварлах catalog: owner/admin л бүх түлхүүр, хэсэг, анхдагч ба override-ийг авна', async () => {
    expect((await it_.api().get('/api/v1/i18n/admin/catalog').set(it_.as('manager'))).status).toBe(403);
    const response = await it_.api().get('/api/v1/i18n/admin/catalog').set(it_.as('admin')).expect(200);
    expect(response.body.length).toBeGreaterThan(800);
    expect(response.body).toContainEqual({
      key: 'nav.camp',
      section: 'web',
      defaults: { mn: 'Кемп', en: 'Camp', zh: '营地' },
      texts: { mn: 'Кемп', en: 'Camp', zh: '营地' },
    });
    expect(response.body.find((row: { key: string }) => row.key === 'import.empty')).toMatchObject({
      section: 'server',
      texts: { mn: 'Өгөгдлийн мөр алга', en: 'There are no data rows', zh: '没有数据行' },
    });
    expect(response.body.find((row: { key: string }) => row.key === 'term.camp.gen')).toMatchObject({
      section: 'term',
      defaults: { mn: 'Кемпийн', en: "Camp's", zh: '营地' },
    });
  });

  it('татах: OWNER/ADMIN л; key, хэсэг (web/server), анхдагч, mn/en/zh', async () => {
    expect((await it_.api().get('/api/v1/i18n/admin/export').set(it_.as('manager'))).status).toBe(403);
    const res = await it_.api().get('/api/v1/i18n/admin/export').set(it_.as('admin')).buffer(true).parse(binary as never);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['key', 'Хэсэг', 'Анхдагч (mn)', 'mn', 'en', 'zh']);
    const rows: Record<string, unknown[]> = {};
    ws.eachRow((r, i) => i > 1 && (rows[String(r.getCell(1).value)] = (r.values as unknown[]).slice(1)));
    expect(rows['import.too_many_rows']).toEqual(['import.too_many_rows', 'server', 'Хэт олон мөр (> {max})', 'Хэт олон мөр (> {max})', 'Too many rows (> {max})', '行数过多（> {max}）']);
    expect(rows['nav.camp']?.[1]).toBe('web');
    it_.ids.xlsxRows = String(Object.keys(rows).length);
  });

  it('засаад оруулах: preview (хуучин → шинэ), хувьсагч дутуу → алдаа, үл мэдэгдэх түлхүүр → алдаа; apply → шууд хүчинтэй', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('T');
    ws.addRow(['key', 'mn', 'en', 'zh']);
    ws.addRow(['import.empty', 'Мөр алга байна!', '', '']); // en/zh хоосон = анхдагч (өөрчлөлтгүй)
    ws.addRow(['nav.camp', 'Бааз', 'Base', '基地']);
    ws.addRow(['import.too_many_rows', 'Хэт олон', '', '']); // {max} алга → алдаа
    ws.addRow(['no.such.key', 'x', '', '']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const pre = await it_.api().post('/api/v1/i18n/admin/preview').set(it_.as('admin', { 'Accept-Language': 'en' })).attach('file', buf, 't.xlsx');
    expect(pre.status).toBe(200);
    expect(pre.body.changes).toEqual([
      { key: 'import.empty', lang: 'mn', from: 'Өгөгдлийн мөр алга', to: 'Мөр алга байна!' },
      { key: 'nav.camp', lang: 'mn', from: 'Кемп', to: 'Бааз' },
      { key: 'nav.camp', lang: 'en', from: 'Camp', to: 'Base' },
      { key: 'nav.camp', lang: 'zh', from: '营地', to: '基地' },
    ]);
    expect(pre.body.errors.map((e: { key: string; code: string }) => `${e.key}:${e.code}`)).toEqual(['import.too_many_rows:i18n.vars_mismatch', 'no.such.key:i18n.unknown_key']);
    expect(pre.body.errors[0].message).toBe('Variables do not match: expected {max}, got —');

    const apply = await it_.api().post('/api/v1/i18n/admin/apply').set(it_.as('admin')).send({ changes: pre.body.changes.map(({ key, lang, to }: { key: string; lang: string; to: string }) => ({ key, lang, to })) });
    expect(apply.body).toEqual({ applied: 4 });

    // backend алдааны мессеж шууд шинэ текстээр (байгууллагын засвар)
    const err = await it_.api().post(it_.hr('/data-imports/employees')).set(it_.as('admin')).send({ rows: [] });
    expect(err.status).toBe(400);
    expect(err.body).toMatchObject({ code: 'import.empty', message: 'Мөр алга байна!' });
    const errEn = await it_.api().post(it_.hr('/data-imports/employees')).set(it_.as('admin', { 'Accept-Language': 'en' })).send({ rows: [] });
    expect(errEn.body.message).toBe('There are no data rows');
    // frontend засвар (зөвхөн web түлхүүр), ETag
    const web = await it_.api().get('/api/v1/i18n/web/zh').set(it_.as('manager'));
    expect(web.status).toBe(200);
    expect(web.body.messages).toEqual({ 'nav.camp': '基地' });
    expect(web.headers.etag).toBe(`"${web.body.version}"`);
    const again = await it_.api().get('/api/v1/i18n/web/zh').set(it_.as('manager', { 'If-None-Match': web.headers.etag }));
    expect(again.status).toBe(304);
  });

  it('анхдагч руу буцаах (to = null), хувьсагчийг өөрчилсөн apply → 400; түүх (хуучин → шинэ, хэн)', async () => {
    const reset = await it_.api().post('/api/v1/i18n/admin/apply').set(it_.as('admin')).send({ changes: [{ key: 'nav.camp', lang: 'en', to: null }] });
    expect(reset.body).toEqual({ applied: 1 });
    const bad = await it_.api().post('/api/v1/i18n/admin/apply').set(it_.as('admin')).send({ changes: [{ key: 'import.too_many_rows', lang: 'mn', to: 'Олон {n}' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('i18n.vars_mismatch');
    const hist = await it_.api().get('/api/v1/i18n/admin/history?key=nav.camp').set(it_.as('admin'));
    expect(hist.body.map((h: { lang: string; source: string; oldText: string | null; newText: string | null }) => [h.lang, h.source, h.oldText, h.newText])).toEqual([
      ['en', 'RESET', 'Base', null],
      ['zh', 'IMPORT', null, '基地'],
      ['en', 'IMPORT', null, 'Base'],
      ['mn', 'IMPORT', null, 'Бааз'],
    ]);
    expect(hist.body[0].changedByName).toBe('IT admin');
    const list = await it_.api().get('/api/v1/i18n/admin/overrides').set(it_.as('admin'));
    expect(list.body.map((r: { key: string; lang: string }) => `${r.key}:${r.lang}`)).toEqual(['import.empty:mn', 'nav.camp:mn', 'nav.camp:zh']);
  });

  it('CSV (UTF-8 BOM, цэг таслал, хашилттай мөр шилжилт)', async () => {
    const csv = '\uFEFFkey;mn;en\r\nauth.subtitle;"Нэвтрэх\nхэсэг";\r\n';
    const pre = await it_.api().post('/api/v1/i18n/admin/preview').set(it_.as('admin')).attach('file', Buffer.from(csv, 'utf8'), 't.csv');
    expect(pre.status).toBe(200);
    expect(pre.body.changes).toEqual([{ key: 'auth.subtitle', lang: 'mn', from: 'Системд нэвтрэх', to: 'Нэвтрэх\nхэсэг' }]);
  });

  it('RLS: өөр байгууллагад засвар харагдахгүй (API ба app_user)', async () => {
    const web = await other.api().get('/api/v1/i18n/web/mn').set(other.as('admin'));
    expect(web.body.messages).toEqual({});
    const err = await other.api().post(other.hr('/data-imports/employees')).set(other.as('admin')).send({ rows: [] });
    expect(err.body.message).toBe('Өгөгдлийн мөр алга');
    const n = await asTenant(it_.prismaRls, other.tenantId, (tx) => tx.i18nOverride.count({ where: { tenantId: it_.tenantId } }));
    expect(n).toBe(0);
    await expect(asTenant(it_.prismaRls, it_.tenantId, (tx) => tx.$executeRawUnsafe(`DELETE FROM i18n_override_history WHERE tenant_id = '${it_.tenantId}'`))).rejects.toThrow(/permission denied/);
  });
});

describe('🗣 Хэрэглэгчийн хэл', () => {
  it('PATCH /i18n/me/locale → GET /auth/me locale; буруу хэл → 400', async () => {
    expect((await it_.api().get('/api/v1/auth/me').set(it_.as('manager'))).body.locale).toBe('mn');
    expect((await it_.api().patch('/api/v1/i18n/me/locale').set(it_.as('manager')).send({ locale: 'zh' })).body).toEqual({ locale: 'zh' });
    expect((await it_.api().get('/api/v1/auth/me').set(it_.as('manager'))).body.locale).toBe('zh');
    expect((await it_.api().patch('/api/v1/i18n/me/locale').set(it_.as('manager')).send({ locale: 'fr' })).status).toBe(400);
  });
});

describe('🌐 Кемпийн алдаа 3 хэлээр (code + params + message)', () => {
  it('давхардсан хэлтэс: Accept-Language-ээр mn/en/zh; code тогтвортой; 403 кодтой', async () => {
    const path = `/api/v1/hr/sites/${it_.ids.c1}/departments`;
    const send = (lang: string) => it_.api().post(path).set(it_.as('admin', { 'Accept-Language': lang })).send({ code: 'ADM', name: 'Дахин', mealLocationId: it_.ids.loc });
    const mn = await send('mn');
    expect(mn.status).toBe(409);
    expect(mn.body).toMatchObject({ code: 'camp.err.departments.2', params: { code: 'ADM' }, message: '"ADM" кодтой хэлтэс аль хэдийн байна' });
    expect((await send('en')).body.message).toBe('A department with code "ADM" already exists');
    expect((await send('zh-CN')).body.message).toBe('代码为"ADM"的部门已存在');
    // Кемпийн эрхгүй (nobody) → 403 кодтой
    const denied = await it_.api().get(`/api/v1/camp/camps/${it_.ids.c1}/audit`).set(it_.as('nobody', { 'Accept-Language': 'en' }));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toMatch(/^camp\.err\.access\./);
  });
});
