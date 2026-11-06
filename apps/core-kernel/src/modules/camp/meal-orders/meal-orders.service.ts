import { Injectable } from '@nestjs/common';
import { CampMealOrderStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, fromDbTime, inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { assertMealLocation, getCampOr404 } from '../common/camp-lookup';
import { addDays, diffDays, isRealIsoDate } from '../common/camp-date';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import {
  allowedActions,
  decideSubmit,
  defaultLines,
  duplicateLineKeys,
  isEmptyOrder,
  MEAL_ORDER_SETTINGS_DEFAULTS,
  mealTotals,
  nowUb,
} from './meal-order-policy';
import type {
  AfterCutoffMode,
  DefaultFillMode,
  EditAfterAcceptMode,
  MealOrderAction,
  MealOrderExtraView,
  MealOrderLineView,
  MealOrderListItem,
  MealOrderSettings,
  MealOrderStatus,
  MealOrderView,
  MealType,
} from './meal-order.types';
import type { AddMealExtraDto, MealReasonDto, PutMealTemplateDto, QueryMealOrdersDto, RequestMealChangeDto, UpsertMealOrderDto } from './meal-orders.dto';

const P = CAMP_PERMISSIONS;
const MAX_RANGE_DAYS = 92;

type Actor = { userId: string; canOrder: boolean; canAccept: boolean };

const ORDER_SELECT = {
  id: true,
  campId: true,
  orderDate: true,
  status: true,
  note: true,
  isLate: true,
  orderedBy: true,
  orderedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  rejectReason: true,
  changeReason: true,
  revisionNo: true,
  revisedAt: true,
  pendingLines: true,
  lines: { select: { mealType: true, mealLocationId: true, baseCount: true }, orderBy: [{ mealType: 'asc' as const }, { mealLocationId: 'asc' as const }] },
  extras: { select: { id: true, mealType: true, mealLocationId: true, guestCount: true, note: true, createdBy: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.CampMealOrderSelect;
type OrderRow = Prisma.CampMealOrderGetPayload<{ select: typeof ORDER_SELECT }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const toLine = (l: { mealType: string; mealLocationId: string; baseCount: number }): MealOrderLineView => ({
  mealType: l.mealType as MealType,
  mealLocationId: l.mealLocationId,
  baseCount: l.baseCount,
});

function parsePending(v: Prisma.JsonValue | null): MealOrderLineView[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => toLine(x as { mealType: string; mealLocationId: string; baseCount: number }));
}

/**
 * V2-03 (Блок 6а) — хоолны захиалга. Урсгалын БҮХ дүрэм `camp_settings.meal_order_*` (G-8) → `meal-order-policy.ts`.
 * Нэхэмжлэх тоо = захиалга (ирцээс хамаарахгүй, G-2). ACCEPTED/CHANGE_REQUESTED/REJECTED-ийн DB түгжээг
 * зөвхөн энд (бодлого шалгасны дараа) `app.meal_order_edit=1` (tx-local) тавьж тойрно.
 */
@Injectable()
export class MealOrdersService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  // ── Унших ────────────────────────────────────────────────

  async list(tenantId: string, authId: string, campId: string, q: QueryMealOrdersDto): Promise<MealOrderListItem[]> {
    this.assertRange(q.from, q.to);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const rows = await tx.campMealOrder.findMany({
        where: { tenantId, campId, orderDate: { gte: toDbDate(q.from), lte: toDbDate(q.to) } },
        select: {
          id: true, orderDate: true, status: true, isLate: true,
          lines: { select: { baseCount: true } }, extras: { select: { guestCount: true } },
        },
        orderBy: { orderDate: 'asc' },
      });
      return rows.map((r) => ({
        id: r.id,
        orderDate: fromDbDate(r.orderDate),
        status: r.status as MealOrderStatus,
        isLate: r.isLate,
        totalMeals: mealTotals(r.lines, r.extras).totalMeals,
      }));
    });
  }

  async get(tenantId: string, authId: string, campId: string, date: string): Promise<MealOrderView> {
    this.assertDate(date);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const { actor, settings } = await this.begin(tx, tenantId, authId, campId, false);
      const row = await this.find(tx, tenantId, campId, date);
      if (row) return this.view(row, settings, actor);
      return this.preview(tx, tenantId, campId, date, settings, actor);
    });
  }

  // ── Засах ────────────────────────────────────────────────

  async upsert(tenantId: string, authId: string, campId: string, date: string, dto: UpsertMealOrderDto): Promise<MealOrderView> {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        await this.assertLines(tx, tenantId, campId, dto.lines);
        let row = await this.find(tx, tenantId, campId, date);
        if (!row) {
          row = await this.createDraft(tx, tenantId, campId, date, dto.note ?? null);
        } else {
          this.require(row, settings, actor, 'edit');
        }
        await this.unlock(tx);
        const orderId = row.id;
        const revise = row.status === 'ACCEPTED'; // ALLOW горим (policy 'edit'-ийг зөвхөн ALLOW үед өгнө)
        await tx.campMealOrderLine.deleteMany({ where: { tenantId, orderId } });
        if (dto.lines.length > 0) {
          await tx.campMealOrderLine.createMany({
            data: dto.lines.map((l) => ({ tenantId, campId, orderId, mealType: l.mealType, mealLocationId: l.mealLocationId, baseCount: l.baseCount })),
          });
        }
        await tx.campMealOrder.update({
          where: { id: orderId },
          data: {
            ...(dto.note !== undefined ? { note: dto.note } : {}),
            ...(revise ? { revisionNo: { increment: 1 }, revisedAt: new Date() } : {}),
          },
        });
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  async remove(tenantId: string, authId: string, campId: string, date: string): Promise<void> {
    this.assertDate(date);
    await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        const row = await this.mustFind(tx, tenantId, campId, date);
        this.require(row, settings, actor, 'delete');
        await tx.campMealOrder.delete({ where: { id: row.id } });
      }),
    );
  }

  async addExtra(tenantId: string, authId: string, campId: string, date: string, dto: AddMealExtraDto): Promise<MealOrderView> {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        await assertMealLocation(tx, tenantId, campId, dto.mealLocationId);
        let row = await this.find(tx, tenantId, campId, date);
        if (!row) row = await this.createDraft(tx, tenantId, campId, date, null);
        else this.require(row, settings, actor, 'edit');
        await this.unlock(tx);
        await tx.campMealOrderExtra.create({
          data: { tenantId, campId, orderId: row.id, mealType: dto.mealType, mealLocationId: dto.mealLocationId, guestCount: dto.guestCount, note: dto.note, createdBy: actor.userId },
        });
        if (row.status === 'ACCEPTED') {
          await tx.campMealOrder.update({ where: { id: row.id }, data: { revisionNo: { increment: 1 }, revisedAt: new Date() } });
        }
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  async removeExtra(tenantId: string, authId: string, campId: string, date: string, extraId: string): Promise<MealOrderView> {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        const row = await this.mustFind(tx, tenantId, campId, date);
        this.require(row, settings, actor, 'edit');
        if (!row.extras.some((e) => e.id === extraId)) throw notFound('camp.err.mealorder.9');
        await this.unlock(tx);
        await tx.campMealOrderExtra.delete({ where: { id: extraId } });
        if (row.status === 'ACCEPTED') {
          await tx.campMealOrder.update({ where: { id: row.id }, data: { revisionNo: { increment: 1 }, revisedAt: new Date() } });
        }
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  // ── Төлөв шилжилт ────────────────────────────────────────

  async submit(tenantId: string, authId: string, campId: string, date: string): Promise<MealOrderView> {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        const row = await this.mustFind(tx, tenantId, campId, date);
        this.require(row, settings, actor, 'submit');
        if (isEmptyOrder(row.lines, row.extras)) throw badRequest('camp.err.mealorder.6');
        const d = decideSubmit(date, settings, nowUb());
        if (!d.ok) {
          if (d.code === 'PAST_DATE') throw badRequest('camp.err.mealorder.5', { date });
          throw badRequest('camp.err.mealorder.4', { date: addDays(date, -settings.leadDays), time: settings.cutoffTime ?? '24:00' });
        }
        const now = new Date();
        await this.unlock(tx);
        await tx.campMealOrder.update({
          where: { id: row.id },
          data: {
            status: d.nextStatus,
            isLate: d.isLate,
            orderedBy: actor.userId,
            orderedAt: now,
            // хүлээн авах шаардлагагүй → илгээсэн хүн өөрөө хүлээн авсан гэж тэмдэглэнэ (DB CHECK reviewed_*)
            reviewedBy: d.nextStatus === 'ACCEPTED' ? actor.userId : null,
            reviewedAt: d.nextStatus === 'ACCEPTED' ? now : null,
            rejectReason: null,
          },
        });
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  async accept(tenantId: string, authId: string, campId: string, date: string): Promise<MealOrderView> {
    return this.review(tenantId, authId, campId, date, 'accept');
  }

  async reject(tenantId: string, authId: string, campId: string, date: string, dto: MealReasonDto): Promise<MealOrderView> {
    return this.review(tenantId, authId, campId, date, 'reject', dto.reason);
  }

  async requestChange(tenantId: string, authId: string, campId: string, date: string, dto: RequestMealChangeDto): Promise<MealOrderView> {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        await this.assertLines(tx, tenantId, campId, dto.lines);
        const row = await this.mustFind(tx, tenantId, campId, date);
        this.require(row, settings, actor, 'requestChange');
        await this.unlock(tx);
        await tx.campMealOrder.update({
          where: { id: row.id },
          data: {
            status: CampMealOrderStatus.CHANGE_REQUESTED,
            pendingLines: dto.lines.map(({ mealType, mealLocationId, baseCount }) => ({ mealType, mealLocationId, baseCount })),
            changeReason: dto.reason,
          },
        });
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  async withdrawChange(tenantId: string, authId: string, campId: string, date: string): Promise<MealOrderView> {
    return this.changeDecision(tenantId, authId, campId, date, 'withdrawChange');
  }

  async approveChange(tenantId: string, authId: string, campId: string, date: string): Promise<MealOrderView> {
    return this.changeDecision(tenantId, authId, campId, date, 'approveChange');
  }

  async rejectChange(tenantId: string, authId: string, campId: string, date: string, dto: MealReasonDto): Promise<MealOrderView> {
    return this.changeDecision(tenantId, authId, campId, date, 'rejectChange', dto.reason);
  }

  // ── Тогтмол загвар ───────────────────────────────────────

  async getTemplate(tenantId: string, authId: string, campId: string): Promise<{ lines: MealOrderLineView[] }> {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return { lines: await this.templateLines(tx, tenantId, campId) };
    });
  }

  async putTemplate(tenantId: string, authId: string, campId: string, dto: PutMealTemplateDto): Promise<{ lines: MealOrderLineView[] }> {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.SETTINGS_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        await this.assertLines(tx, tenantId, campId, dto.lines);
        await tx.campMealOrderTemplate.deleteMany({ where: { tenantId, campId } });
        if (dto.lines.length > 0) {
          await tx.campMealOrderTemplate.createMany({
            data: dto.lines.map((l) => ({ tenantId, campId, mealType: l.mealType, mealLocationId: l.mealLocationId, baseCount: l.baseCount })),
          });
        }
        return { lines: await this.templateLines(tx, tenantId, campId) };
      }),
    );
  }

  // ── Дотоод ───────────────────────────────────────────────

  private async review(tenantId: string, authId: string, campId: string, date: string, action: 'accept' | 'reject', reason?: string) {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        const row = await this.mustFind(tx, tenantId, campId, date);
        this.require(row, settings, actor, action);
        await this.unlock(tx);
        await tx.campMealOrder.update({
          where: { id: row.id },
          data:
            action === 'accept'
              ? { status: CampMealOrderStatus.ACCEPTED, reviewedBy: actor.userId, reviewedAt: new Date(), rejectReason: null }
              : { status: CampMealOrderStatus.REJECTED, reviewedBy: actor.userId, reviewedAt: new Date(), rejectReason: reason },
        });
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  /** TWO_SIDED: санал болгосон өөрчлөлтийг цуцлах / зөвшөөрөх / татгалзах */
  private async changeDecision(
    tenantId: string,
    authId: string,
    campId: string,
    date: string,
    action: 'withdrawChange' | 'approveChange' | 'rejectChange',
    reason?: string,
  ) {
    this.assertDate(date);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { actor, settings } = await this.begin(tx, tenantId, authId, campId, true);
        const row = await this.mustFind(tx, tenantId, campId, date);
        this.require(row, settings, actor, action);
        const pending = parsePending(row.pendingLines);
        if (!pending) throw conflict('camp.err.mealorder.11');
        await this.unlock(tx);
        const back = { status: CampMealOrderStatus.ACCEPTED, pendingLines: Prisma.DbNull, changeReason: null };
        if (action === 'approveChange') {
          await tx.campMealOrderLine.deleteMany({ where: { tenantId, orderId: row.id } });
          if (pending.length > 0) {
            await tx.campMealOrderLine.createMany({ data: pending.map((l) => ({ tenantId, campId, orderId: row.id, ...l })) });
          }
          await tx.campMealOrder.update({
            where: { id: row.id },
            data: { ...back, revisionNo: { increment: 1 }, revisedAt: new Date(), reviewedBy: actor.userId, reviewedAt: new Date() },
          });
        } else {
          await tx.campMealOrder.update({ where: { id: row.id }, data: { ...back, ...(action === 'rejectChange' ? { rejectReason: reason } : {}) } });
        }
        return this.reload(tx, tenantId, campId, date, settings, actor);
      }),
    );
  }

  /** Эрх + кемп + тохиргоо. write=true → camp.meal.order эсвэл camp.meal.accept аль нэг заавал */
  private async begin(tx: Tx, tenantId: string, authId: string, campId: string, write: boolean) {
    const actorSet = await this.access.requireAccess(tx, tenantId, authId, campId);
    await getCampOr404(tx, tenantId, campId);
    const canOrder = CampAccessService.has(actorSet.perms, campId, P.MEAL_ORDER);
    const canAccept = CampAccessService.has(actorSet.perms, campId, P.MEAL_ACCEPT);
    if (write) await this.access.require(tx, tenantId, authId, campId, [P.MEAL_ORDER, P.MEAL_ACCEPT]);
    const actor: Actor = { userId: actorSet.userId, canOrder, canAccept };
    return { actor, settings: await loadMealOrderSettings(tx, tenantId, campId) };
  }

  private actions(row: { status: string; orderedBy: string | null }, settings: MealOrderSettings, actor: Actor): MealOrderAction[] {
    return allowedActions({
      status: row.status as MealOrderStatus,
      settings,
      canOrder: actor.canOrder,
      canAccept: actor.canAccept,
      isOrderer: row.orderedBy === null || row.orderedBy === actor.userId,
    });
  }

  private require(row: OrderRow, settings: MealOrderSettings, actor: Actor, action: MealOrderAction) {
    if (!this.actions(row, settings, actor).includes(action)) {
      throw conflict('camp.err.mealorder.3', { status: row.status, action });
    }
  }

  private async unlock(tx: Tx) {
    await tx.$executeRaw`SELECT set_config('app.meal_order_edit', '1', true)`;
  }

  private find(tx: Tx, tenantId: string, campId: string, date: string) {
    return tx.campMealOrder.findFirst({ where: { tenantId, campId, orderDate: toDbDate(date) }, select: ORDER_SELECT });
  }

  private async mustFind(tx: Tx, tenantId: string, campId: string, date: string) {
    const row = await this.find(tx, tenantId, campId, date);
    if (!row) throw notFound('camp.err.mealorder.2', { date });
    return row;
  }

  private async createDraft(tx: Tx, tenantId: string, campId: string, date: string, note: string | null) {
    await tx.campMealOrder.create({ data: { tenantId, campId, orderDate: toDbDate(date), note } });
    return this.mustFind(tx, tenantId, campId, date);
  }

  private async reload(tx: Tx, tenantId: string, campId: string, date: string, settings: MealOrderSettings, actor: Actor) {
    return this.view(await this.mustFind(tx, tenantId, campId, date), settings, actor);
  }

  private view(r: OrderRow, settings: MealOrderSettings, actor: Actor): MealOrderView {
    const lines = r.lines.map(toLine);
    const extras: MealOrderExtraView[] = r.extras.map((e) => ({
      id: e.id,
      mealType: e.mealType as MealType,
      mealLocationId: e.mealLocationId,
      guestCount: e.guestCount,
      note: e.note,
      createdBy: e.createdBy,
      createdAt: e.createdAt.toISOString(),
    }));
    return {
      id: r.id,
      campId: r.campId,
      orderDate: fromDbDate(r.orderDate),
      status: r.status as MealOrderStatus,
      note: r.note,
      isLate: r.isLate,
      orderedBy: r.orderedBy,
      orderedAt: iso(r.orderedAt),
      reviewedBy: r.reviewedBy,
      reviewedAt: iso(r.reviewedAt),
      rejectReason: r.rejectReason,
      changeReason: r.changeReason,
      revisionNo: r.revisionNo,
      revisedAt: iso(r.revisedAt),
      lines,
      extras,
      pendingLines: parsePending(r.pendingLines),
      ...mealTotals(lines, extras),
      actions: this.actions(r, settings, actor),
    };
  }

  /** Захиалга хараахан үүсээгүй өдөр: анхдагч тооны урьдчилсан харагдац (хадгалахгүй) */
  private async preview(tx: Tx, tenantId: string, campId: string, date: string, settings: MealOrderSettings, actor: Actor): Promise<MealOrderView> {
    const [previous, template] = await Promise.all([
      settings.defaultFill === 'COPY_PREV' ? this.previousLines(tx, tenantId, campId, date) : Promise.resolve([]),
      settings.defaultFill === 'TEMPLATE' ? this.templateLines(tx, tenantId, campId) : Promise.resolve([]),
    ]);
    const lines = defaultLines(settings.defaultFill, { previous, template });
    return {
      id: null,
      campId,
      orderDate: date,
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
      lines,
      extras: [],
      pendingLines: null,
      ...mealTotals(lines, []),
      actions: this.actions({ status: 'DRAFT', orderedBy: null }, settings, actor).filter((a) => a !== 'delete'),
    };
  }

  /** Өмнөх хамгийн ойрын захиалгын мөрүүд (зочин/нэмэлт хуулагдахгүй) */
  private async previousLines(tx: Tx, tenantId: string, campId: string, date: string): Promise<MealOrderLineView[]> {
    const prev = await tx.campMealOrder.findFirst({
      where: { tenantId, campId, orderDate: { lt: toDbDate(date) }, lines: { some: {} } },
      orderBy: { orderDate: 'desc' },
      select: { lines: { select: { mealType: true, mealLocationId: true, baseCount: true } } },
    });
    return prev ? prev.lines.map(toLine) : [];
  }

  private async templateLines(tx: Tx, tenantId: string, campId: string): Promise<MealOrderLineView[]> {
    const rows = await tx.campMealOrderTemplate.findMany({
      where: { tenantId, campId },
      select: { mealType: true, mealLocationId: true, baseCount: true },
      orderBy: [{ mealType: 'asc' }, { mealLocationId: 'asc' }],
    });
    return rows.map(toLine);
  }

  private async assertLines(tx: Tx, tenantId: string, campId: string, lines: ReadonlyArray<{ mealType: MealType; mealLocationId: string }>) {
    const dup = duplicateLineKeys(lines);
    if (dup.length > 0) throw badRequest('camp.err.mealorder.7', { keys: dup.join(', ') });
    for (const id of new Set(lines.map((l) => l.mealLocationId))) await assertMealLocation(tx, tenantId, campId, id);
  }

  private assertDate(date: string) {
    if (!isRealIsoDate(date)) throw badRequest('camp.err.mealorder.1', { date });
  }

  private assertRange(from: string, to: string) {
    this.assertDate(from);
    this.assertDate(to);
    if (to < from || diffDays(from, to) > MAX_RANGE_DAYS) throw badRequest('camp.err.mealorder.10', { max: MAX_RANGE_DAYS });
  }
}

/** camp_settings.meal_order_* → MealOrderSettings (тохиргоо байхгүй бол анхдагч) */
export async function loadMealOrderSettings(tx: Tx, tenantId: string, campId: string): Promise<MealOrderSettings> {
  const s = await tx.campSetting.findFirst({
    where: { tenantId, campId },
    select: {
      mealOrderCutoffTime: true,
      mealOrderLeadDays: true,
      mealOrderAfterCutoff: true,
      mealOrderRequiresAccept: true,
      mealOrderEditAfterAccept: true,
      mealOrderDefaultFill: true,
      mealOrderAllowSelfAccept: true,
    },
  });
  if (!s) return { ...MEAL_ORDER_SETTINGS_DEFAULTS };
  return {
    leadDays: s.mealOrderLeadDays,
    cutoffTime: s.mealOrderCutoffTime ? fromDbTime(s.mealOrderCutoffTime) : null,
    afterCutoff: s.mealOrderAfterCutoff as AfterCutoffMode,
    requiresAccept: s.mealOrderRequiresAccept,
    editAfterAccept: s.mealOrderEditAfterAccept as EditAfterAcceptMode,
    defaultFill: s.mealOrderDefaultFill as DefaultFillMode,
    allowSelfAccept: s.mealOrderAllowSelfAccept,
  };
}
