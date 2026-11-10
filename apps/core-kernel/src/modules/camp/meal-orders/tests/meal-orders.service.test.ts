import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MealOrdersService } from '../meal-orders.service';
import { ApprovalEntityRegistry, type ApprovalDecisionContext } from '../../../core/approvals/approval-entity.registry';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { setActor, setup } from '../../common/tests/camp-test-utils';

const P = CAMP_PERMISSIONS;
const FUTURE = '2099-01-10';
const PAST = '2020-01-10';
const L = (mealType: string, mealLocationId: string, baseCount: number) => ({ mealType, mealLocationId, baseCount });

const settingsRow = (o: Record<string, unknown> = {}) => ({
  mealOrderCutoffTime: null,
  mealOrderLeadDays: 1,
  mealOrderAfterCutoff: 'BLOCK',
  mealOrderRequiresAccept: true,
  mealOrderEditAfterAccept: 'TWO_SIDED',
  mealOrderDefaultFill: 'EMPTY',
  mealOrderAllowSelfAccept: false,
  ...o,
});

const orderRow = (o: Record<string, unknown> = {}) => ({
  id: 'o1',
  campId: 'c1',
  orderDate: new Date(`${FUTURE}T00:00:00.000Z`),
  status: 'DRAFT',
  note: null,
  isLate: false,
  orderedBy: null,
  orderedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  rejectReason: null,
  changeReason: null,
  revisionNo: 0,
  revisedAt: null,
  pendingLines: null,
  lines: [L('LUNCH', 'loc1', 10)],
  extras: [],
  ...o,
});

describe('MealOrdersService (Блок 6а)', () => {
  let s: ReturnType<typeof setup>;
  let svc: MealOrdersService;
  const actAs = (perms: string[], userId = 'cu-actor') => setActor(s.tx, { userId, roles: [{ campId: 'c1', perms }] });
  const settings = (o: Record<string, unknown> = {}) => s.tx.campSetting.findFirst.mockResolvedValue(settingsRow(o));
  const unlocked = () => s.tx.$executeRaw.mock.calls.length > 1; // эхний дуудлага = app.tenant_id

  beforeEach(() => {
    s = setup();
    const registry = new ApprovalEntityRegistry();
    const approvals = {
      start: vi.fn(async (_tx, _tenantId, input: { entityType: string }) => ({ id: input.entityType })),
      decide: vi.fn(async (_tx, tenantId: string, input: { instanceId: string; actorId: string; action: 'APPROVED' | 'REJECTED'; comment?: string | null }) => {
        const handler = registry.get(input.instanceId);
        const ctx: ApprovalDecisionContext = {
          tenantId,
          entityId: 'o1',
          instanceId: input.instanceId,
          actorId: input.actorId,
          onBehalfOf: null,
          action: input.action,
          comment: input.comment ?? null,
          final: true,
          status: input.action,
        };
        await handler?.onFinal?.(s.tx as never, ctx);
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    svc = new MealOrdersService(s.prisma as never, s.access, approvals as never, registry);
    s.tx.camp.findFirst.mockResolvedValue({ id: 'c1', code: 'C1', name: 'C1', isActive: true });
    s.tx.campMealLocation.findFirst.mockResolvedValue({ id: 'loc1', isActive: true });
    settings();
    actAs([P.MEAL_ORDER]);
  });

  it('get: захиалга үүсээгүй + TEMPLATE → анхдагч мөр, id=null, хадгалахгүй', async () => {
    settings({ mealOrderDefaultFill: 'TEMPLATE' });
    s.tx.campMealOrder.findFirst.mockResolvedValue(null);
    s.tx.campMealOrderTemplate.findMany.mockResolvedValue([L('BREAKFAST', 'loc1', 40)]);
    const v = await svc.get('t1', 'a1', 'c1', FUTURE);
    expect(v).toMatchObject({ id: null, status: 'DRAFT', totalMeals: 40, lines: [L('BREAKFAST', 'loc1', 40)] });
    expect(v.actions).toEqual(['edit', 'submit']);
    expect(s.tx.campMealOrder.create).not.toHaveBeenCalled();
  });

  it('get: буруу огноо → 400', async () => {
    await expect(svc.get('t1', 'a1', 'c1', '2026-13-40')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upsert: шинэ DRAFT үүсгэж мөрүүдийг солино', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValueOnce(null).mockResolvedValue(orderRow());
    await svc.upsert('t1', 'a1', 'c1', FUTURE, { lines: [L('LUNCH', 'loc1', 10) as never] });
    expect(s.tx.campMealOrder.create).toHaveBeenCalled();
    expect(s.tx.campMealOrderLine.deleteMany).toHaveBeenCalled();
    expect(s.tx.campMealOrderLine.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: 't1', campId: 'c1', orderId: 'o1', mealType: 'LUNCH', mealLocationId: 'loc1', baseCount: 10 },
    ]);
  });

  it('upsert: давхардсан хоол × байршил → 400', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValue(null);
    await expect(
      svc.upsert('t1', 'a1', 'c1', FUTURE, { lines: [L('LUNCH', 'loc1', 1) as never, L('LUNCH', 'loc1', 2) as never] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('эрхгүй хэрэглэгч бичихэд 403', async () => {
    actAs([P.SETTINGS_MANAGE]);
    await expect(svc.upsert('t1', 'a1', 'c1', FUTURE, { lines: [] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submit: хүлээн авах шаардлагатай → ORDERED, reviewed хоосон', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow());
    await svc.submit('t1', 'a1', 'c1', FUTURE);
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ status: 'ORDERED', orderedBy: 'cu-actor', reviewedBy: null });
    expect(unlocked()).toBe(true);
  });

  it('submit: хүлээн авах шаардлагагүй → шууд ACCEPTED (өөрөө хүлээн авсан)', async () => {
    settings({ mealOrderRequiresAccept: false });
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow());
    await svc.submit('t1', 'a1', 'c1', FUTURE);
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', reviewedBy: 'cu-actor' });
  });

  it('submit: хоосон захиалга → 400', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow({ lines: [L('LUNCH', 'loc1', 0)] }));
    await expect(svc.submit('t1', 'a1', 'c1', FUTURE)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit: өнгөрсөн өдөр + BLOCK → 400, FREE бол зөвшөөрнө (isLate)', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow({ orderDate: new Date(`${PAST}T00:00:00.000Z`) }));
    await expect(svc.submit('t1', 'a1', 'c1', PAST)).rejects.toBeInstanceOf(BadRequestException);
    settings({ mealOrderAfterCutoff: 'FREE' });
    await svc.submit('t1', 'a1', 'c1', PAST);
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ isLate: true });
  });

  it('accept: захиалагч өөрөө хүлээн авах нь тохиргоогоор хориотой → 409; зөвшөөрвөл ACCEPTED', async () => {
    actAs([P.MEAL_ORDER, P.MEAL_ACCEPT]);
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow({ status: 'ORDERED', orderedBy: 'cu-actor', orderedAt: new Date() }));
    await expect(svc.accept('t1', 'a1', 'c1', FUTURE)).rejects.toBeInstanceOf(ConflictException);
    settings({ mealOrderAllowSelfAccept: true });
    await svc.accept('t1', 'a1', 'c1', FUTURE);
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', reviewedBy: 'cu-actor' });
  });

  it('accept: өөр хүн (camp.meal.accept) хүлээн авна', async () => {
    actAs([P.MEAL_ACCEPT], 'cu-caterer');
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow({ status: 'ORDERED', orderedBy: 'cu-manager', orderedAt: new Date() }));
    await svc.accept('t1', 'a1', 'c1', FUTURE);
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', reviewedBy: 'cu-caterer' });
  });

  const accepted = (o: Record<string, unknown> = {}) =>
    orderRow({ status: 'ACCEPTED', orderedBy: 'cu-actor', orderedAt: new Date(), reviewedBy: 'cu-caterer', reviewedAt: new Date(), ...o });

  it('тохиргооны мөргүй кемпэд ACCEPTED өөрчлөлт анхдагчаар хоёр талын хүсэлт болно', async () => {
    s.tx.campSetting.findFirst.mockResolvedValue(null);
    s.tx.campMealOrder.findFirst.mockResolvedValue(accepted());
    const view = await svc.get('t1', 'a1', 'c1', FUTURE);
    expect(view.actions).toContain('requestChange');
  });

  it('ACCEPTED + FORBID: засах → 409', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValue(accepted());
    await expect(svc.upsert('t1', 'a1', 'c1', FUTURE, { lines: [] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('ACCEPTED + ALLOW: шууд засч revisionNo нэмэгдэнэ', async () => {
    settings({ mealOrderEditAfterAccept: 'ALLOW' });
    s.tx.campMealOrder.findFirst.mockResolvedValue(accepted());
    await svc.upsert('t1', 'a1', 'c1', FUTURE, { lines: [L('LUNCH', 'loc1', 12) as never] });
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ revisionNo: { increment: 1 } });
    expect(unlocked()).toBe(true);
  });

  it('ACCEPTED + TWO_SIDED: requestChange → CHANGE_REQUESTED, pendingLines; шууд засах 409', async () => {
    settings({ mealOrderEditAfterAccept: 'TWO_SIDED' });
    s.tx.campMealOrder.findFirst.mockResolvedValue(accepted());
    await expect(svc.upsert('t1', 'a1', 'c1', FUTURE, { lines: [] })).rejects.toBeInstanceOf(ConflictException);
    await svc.requestChange('t1', 'a1', 'c1', FUTURE, { reason: 'Хүн нэмэгдсэн', lines: [L('LUNCH', 'loc1', 20) as never] });
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({
      status: 'CHANGE_REQUESTED',
      changeReason: 'Хүн нэмэгдсэн',
      pendingLines: [L('LUNCH', 'loc1', 20)],
    });
  });

  it('CHANGE_REQUESTED: approveChange мөрүүдийг солиж ACCEPTED болгоно', async () => {
    settings({ mealOrderEditAfterAccept: 'TWO_SIDED' });
    actAs([P.MEAL_ACCEPT], 'cu-caterer');
    s.tx.campMealOrder.findFirst.mockResolvedValue(
      accepted({ status: 'CHANGE_REQUESTED', pendingLines: [L('LUNCH', 'loc1', 20)], changeReason: 'x', orderedBy: 'cu-manager' }),
    );
    await svc.approveChange('t1', 'a1', 'c1', FUTURE);
    expect(s.tx.campMealOrderLine.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: 't1', campId: 'c1', orderId: 'o1', ...L('LUNCH', 'loc1', 20) },
    ]);
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', revisionNo: { increment: 1 }, reviewedBy: 'cu-caterer' });
  });

  it('CHANGE_REQUESTED: rejectChange мөрүүдийг хөндөхгүй', async () => {
    actAs([P.MEAL_ACCEPT], 'cu-caterer');
    s.tx.campMealOrder.findFirst.mockResolvedValue(
      accepted({ status: 'CHANGE_REQUESTED', pendingLines: [L('LUNCH', 'loc1', 20)], orderedBy: 'cu-manager' }),
    );
    await svc.rejectChange('t1', 'a1', 'c1', FUTURE, { reason: 'Хэт оройтсон' });
    expect(s.tx.campMealOrderLine.createMany).not.toHaveBeenCalled();
    expect(s.tx.campMealOrder.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED', rejectReason: 'Хэт оройтсон' });
  });

  it('remove: зөвхөн DRAFT', async () => {
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow({ status: 'ORDERED', orderedBy: 'cu-actor', orderedAt: new Date() }));
    await expect(svc.remove('t1', 'a1', 'c1', FUTURE)).rejects.toBeInstanceOf(ConflictException);
    s.tx.campMealOrder.findFirst.mockResolvedValue(orderRow());
    await svc.remove('t1', 'a1', 'c1', FUTURE);
    expect(s.tx.campMealOrder.delete).toHaveBeenCalled();
  });
});
