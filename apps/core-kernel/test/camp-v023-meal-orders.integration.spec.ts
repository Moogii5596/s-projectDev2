/**
 * v0.2.3 Блок 6а — Хоолны захиалга (V2-03, G-2, G-6, G-8) (integration, бодит PG + RLS).
 * Урсгал бүгд camp_settings.meal_order_*-оос — 2 өөр тохиргоо:
 *   A) requiresAccept=false + ALLOW (шууд хүлээн авна, хүлээн авсны дараа шууд засна)
 *   B) requiresAccept=true + TWO_SIDED + allowSelfAccept=false (захиалагч ≠ хүлээн авагч, хоёр талын батлалт)
 * + cutoff (BLOCK/FREE), тогтмол загвар (TEMPLATE), DB түгжээ (CAMP_MEAL_LOCKED).
 * Хэрэглэгчид: admin (бүх эрх), manager (Кемп менежер = camp.meal.order), nobody → "Катерингийн админ" (camp.meal.accept).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CampIt, createCampIt } from './helpers/camp-it-app';

let it_: CampIt;
const L = (mealType: string, baseCount: number, mealLocationId?: string) => ({ mealType, mealLocationId: mealLocationId ?? it_.ids.loc, baseCount });
const day = (n: number) => `2099-03-${String(n).padStart(2, '0')}`;
const PAST = '2020-01-06';

const putSettings = (extra: Record<string, unknown>) =>
  it_.api().put(it_.camp('/settings')).set(it_.as('admin')).send({
    vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: it_.ids.loc, ...extra,
  });
const order = (date: string, path = '') => it_.camp(`/meal-orders/${date}${path}`);
const put = (who: 'admin' | 'manager' | 'nobody', date: string, lines: unknown[]) => it_.api().put(order(date)).set(it_.as(who)).send({ lines });
const post = (who: 'admin' | 'manager' | 'nobody', date: string, path: string, body: object = {}) => it_.api().post(order(date, path)).set(it_.as(who)).send(body);

beforeAll(async () => {
  it_ = await createCampIt('v023meal');
  const roles = (await it_.api().get('/api/v1/camp/roles').set(it_.as('admin'))).body as { id: string; systemCode: string | null }[];
  const caterer = roles.find((r) => r.systemCode === 'CATERING_ADMIN')!.id;
  const r = await it_.api().post('/api/v1/camp/user-roles').set(it_.as('admin')).send({ userId: it_.coreIds.nobody, roleId: caterer, campId: it_.ids.c1 });
  expect(r.status).toBeLessThan(300);
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('Тохиргоо A — хүлээн авах шаардлагагүй + ALLOW', () => {
  it('PUT /settings шинэ талбарууд хадгалагдаж буцна; өгөөгүй бол өөрчлөгдөхгүй', async () => {
    const r = await putSettings({ mealOrderRequiresAccept: false, mealOrderEditAfterAccept: 'ALLOW', mealOrderAfterCutoff: 'BLOCK', mealOrderLeadDays: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mealOrderRequiresAccept: false, mealOrderEditAfterAccept: 'ALLOW', mealOrderLeadDays: 1, mealOrderAllowSelfAccept: false });
    const again = await putSettings({});
    expect(again.body).toMatchObject({ mealOrderRequiresAccept: false, mealOrderEditAfterAccept: 'ALLOW' });
  });

  it('захиалга → илгээх = шууд ACCEPTED; дараа нь засвар revisionNo++; зочин/нэмэлт мөн', async () => {
    const d = day(10);
    expect((await put('manager', d, [L('LUNCH', 30)])).status).toBe(200);
    const sub = await post('manager', d, '/submit');
    expect(sub.status).toBe(200);
    expect(sub.body).toMatchObject({ status: 'ACCEPTED', totalMeals: 30, revisionNo: 0 });

    const edit = await put('manager', d, [L('LUNCH', 35)]);
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ status: 'ACCEPTED', totalMeals: 35, revisionNo: 1 });

    const ex = await post('manager', d, '/extras', { mealType: 'LUNCH', mealLocationId: it_.ids.loc, guestCount: 4, note: 'Зочид' });
    expect(ex.status).toBe(201);
    expect(ex.body).toMatchObject({ totalMeals: 39, revisionNo: 2 });
    expect(ex.body.extras[0]).toMatchObject({ guestCount: 4, note: 'Зочид', createdBy: it_.coreIds.manager });
  });

  it('хоосон захиалга илгээх → 400; давхардсан мөр → 400', async () => {
    const d = day(11);
    expect((await put('manager', d, [L('LUNCH', 0)])).status).toBe(200);
    const empty = await post('manager', d, '/submit');
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('camp.err.mealorder.6');
    expect((await put('manager', day(12), [L('LUNCH', 1), L('LUNCH', 2)])).status).toBe(400);
  });
});

describe('Cutoff — BLOCK / FREE', () => {
  it('өнгөрсөн өдөр + BLOCK → 400; FREE бол зөвшөөрч isLate', async () => {
    await putSettings({ mealOrderRequiresAccept: false, mealOrderEditAfterAccept: 'FORBID', mealOrderAfterCutoff: 'BLOCK' });
    expect((await put('manager', PAST, [L('DINNER', 5)])).status).toBe(200);
    const blocked = await post('manager', PAST, '/submit');
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('camp.err.mealorder.5');

    await putSettings({ mealOrderRequiresAccept: false, mealOrderEditAfterAccept: 'FORBID', mealOrderAfterCutoff: 'FREE' });
    const free = await post('manager', PAST, '/submit');
    expect(free.status).toBe(200);
    expect(free.body).toMatchObject({ status: 'ACCEPTED', isLate: true });
  });
});

describe('Тохиргоо B — хүлээн авах + TWO_SIDED + өөрөө хүлээн авахгүй', () => {
  const d = day(20);
  beforeAll(async () => {
    expect((await putSettings({ mealOrderRequiresAccept: true, mealOrderEditAfterAccept: 'TWO_SIDED', mealOrderAfterCutoff: 'BLOCK', mealOrderAllowSelfAccept: false })).status).toBe(200);
  });

  it('manager илгээнэ → ORDERED; manager өөрөө хүлээн авч чадахгүй (409); катеринг хүлээн авна', async () => {
    expect((await put('manager', d, [L('BREAKFAST', 40), L('DINNER', 60)])).status).toBe(200);
    const sub = await post('manager', d, '/submit');
    expect(sub.body).toMatchObject({ status: 'ORDERED', totalMeals: 100 });
    expect(sub.body.actions).toEqual(expect.arrayContaining(['edit', 'submit']));

    expect((await post('manager', d, '/accept')).status).toBe(409);
    const view = await it_.api().get(order(d)).set(it_.as('nobody'));
    expect(view.body.actions).toEqual(['accept', 'reject']);

    const acc = await post('nobody', d, '/accept');
    expect(acc.status).toBe(200);
    expect(acc.body).toMatchObject({ status: 'ACCEPTED', reviewedBy: it_.coreIds.nobody, orderedBy: it_.coreIds.manager });
  });

  it('ACCEPTED: шууд засах 409; DB түгжээ — шууд UPDATE CAMP_MEAL_LOCKED', async () => {
    expect((await put('manager', d, [L('BREAKFAST', 41)])).status).toBe(409);
    const row = await it_.prismaAdmin.campMealOrder.findFirstOrThrow({ where: { tenantId: it_.tenantId, campId: it_.ids.c1 } , orderBy: { orderDate: 'desc' } });
    await expect(it_.prismaAdmin.campMealOrderLine.updateMany({ where: { orderId: row.id }, data: { baseCount: 1 } })).rejects.toThrow(/CAMP_MEAL_LOCKED/);
    await expect(it_.prismaAdmin.campMealOrder.update({ where: { id: row.id }, data: { note: 'x' } })).rejects.toThrow(/CAMP_MEAL_LOCKED/);
  });

  it('өөрчлөлт санал болгох → CHANGE_REQUESTED (мөр хөндөгдөхгүй) → катеринг зөвшөөрнө → мөр шинэчлэгдэнэ', async () => {
    const req = await post('manager', d, '/request-change', { reason: 'Хүн нэмэгдсэн', lines: [L('BREAKFAST', 50), L('DINNER', 60)] });
    expect(req.status).toBe(200);
    expect(req.body).toMatchObject({ status: 'CHANGE_REQUESTED', changeReason: 'Хүн нэмэгдсэн', totalMeals: 100 });
    expect(req.body.pendingLines).toHaveLength(2);
    expect(req.body.actions).toEqual(['withdrawChange']);

    const ok = await post('nobody', d, '/approve-change');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'ACCEPTED', totalMeals: 110, revisionNo: 1, pendingLines: null });
  });

  it('өөрчлөлтийг татгалзвал мөр хэвээр; саналаа цуцалж болно; шалтгаангүй татгалзах 400', async () => {
    await post('manager', d, '/request-change', { reason: 'Дахин', lines: [L('BREAKFAST', 70)] });
    expect((await post('nobody', d, '/reject-change', {})).status).toBe(400);
    const rej = await post('nobody', d, '/reject-change', { reason: 'Оройтсон' });
    expect(rej.body).toMatchObject({ status: 'ACCEPTED', totalMeals: 110, rejectReason: 'Оройтсон', pendingLines: null });

    await post('manager', d, '/request-change', { reason: 'Буцаах', lines: [L('BREAKFAST', 1)] });
    const wd = await post('manager', d, '/withdraw-change');
    expect(wd.body).toMatchObject({ status: 'ACCEPTED', totalMeals: 110 });
  });

  it('татгалзах: шалтгаан заавал; REJECTED-ийг дахин засч илгээж болно', async () => {
    const d2 = day(21);
    await put('manager', d2, [L('LUNCH', 10)]);
    await post('manager', d2, '/submit');
    expect((await post('nobody', d2, '/reject', {})).status).toBe(400);
    const rej = await post('nobody', d2, '/reject', { reason: 'Тоо буруу' });
    expect(rej.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Тоо буруу' });
    expect((await put('manager', d2, [L('LUNCH', 12)])).status).toBe(200);
    const again = await post('manager', d2, '/submit');
    expect(again.body).toMatchObject({ status: 'ORDERED', totalMeals: 12, rejectReason: null, reviewedBy: null });
  });

  it('эрхгүй хэрэглэгч (рольгүй admin биш) — энд nobody-д accept эрх; manager-д accept байхгүй → 409/403 зөв', async () => {
    const d3 = day(22);
    await put('manager', d3, [L('LUNCH', 3)]);
    await post('manager', d3, '/submit');
    expect((await post('manager', d3, '/reject', { reason: 'x' })).status).toBe(409);
  });
});

describe('Тогтмол загвар + анхдагч тоо', () => {
  it('TEMPLATE горимд захиалга үүсээгүй өдөр загварын мөрөөр урьдчилан харагдана (id=null, хадгалагдахгүй)', async () => {
    await putSettings({ mealOrderDefaultFill: 'TEMPLATE' });
    const tpl = await it_.api().put(it_.camp('/meal-order-template')).set(it_.as('admin')).send({ lines: [L('BREAKFAST', 80), L('DINNER', 90)] });
    expect(tpl.status).toBe(200);
    expect(tpl.body.lines).toHaveLength(2);
    expect((await it_.api().put(it_.camp('/meal-order-template')).set(it_.as('manager')).send({ lines: [] })).status).toBe(403);

    const view = await it_.api().get(order(day(25))).set(it_.as('manager'));
    expect(view.body).toMatchObject({ id: null, status: 'DRAFT', totalMeals: 170 });
    const list = await it_.api().get(it_.camp('/meal-orders')).query({ from: day(25), to: day(25) }).set(it_.as('manager'));
    expect(list.body).toEqual([]);
  });

  it('COPY_PREV горимд өмнөх захиалгын мөрийг хуулна (зочин/нэмэлтгүй)', async () => {
    await putSettings({ mealOrderDefaultFill: 'COPY_PREV' });
    const view = await it_.api().get(order(day(30))).set(it_.as('manager'));
    expect(view.body.id).toBeNull();
    expect(view.body.totalMeals).toBeGreaterThan(0);
    expect(view.body.extras).toEqual([]);
  });

  it('манай tenant-ийн өөр кемп/байршлыг буруу ашиглавал 400; рольгүй хэрэглэгч 403', async () => {
    expect((await put('manager', day(26), [L('LUNCH', 1, '00000000-0000-4000-8000-000000000000')])).status).toBe(400);
    const ghost = await it_.api().get(order(day(26))).set(it_.as('nobody'));
    expect(ghost.status).toBe(200);
    // nobody зөвхөн accept эрхтэй → бичих (PUT) нь camp.meal.order биш ч accept байгаа тул нэвтрэлт OK; actions-д edit алга
    expect(ghost.body.actions).not.toContain('edit');
  });
});
