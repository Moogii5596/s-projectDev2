/**
 * Блок 6а — хоолны захиалгын төрлүүд. ⚠️ Эх: apps/core-kernel/src/modules/camp/meal-orders/meal-order.types.ts — ТАМ АДИЛ хуулбар (R20), өөрчлөхдөө хоёуланг зэрэг.
 * (backend DTO + frontend props). DTO нэр frontend-тэй ТАМ АДИЛ (R20).
 * Prisma enum-ийг энд давтахгүй (R02) — string literal union нь `@prisma/client`-ийн утгатай таарна.
 */
type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'NIGHT';
export type MealOrderStatus = 'DRAFT' | 'ORDERED' | 'ACCEPTED' | 'REJECTED' | 'CHANGE_REQUESTED';

export interface MealOrderLineView {
  mealType: MealType;
  mealLocationId: string;
  baseCount: number;
}

interface MealOrderExtraView {
  id: string;
  mealType: MealType;
  mealLocationId: string;
  guestCount: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

/** Хэрэглэгч (actor) тухайн захиалга дээр хийж чадах үйлдэл — frontend товчийг үүгээр харуулна */
export type MealOrderAction =
  | 'edit'
  | 'submit'
  | 'delete'
  | 'accept'
  | 'reject'
  | 'requestChange'
  | 'withdrawChange'
  | 'approveChange'
  | 'rejectChange';

export interface MealOrderView {
  /** null = хараахан үүсээгүй (анхдагч мөрөөр урьдчилан харуулсан) */
  id: string | null;
  campId: string;
  orderDate: string;
  status: MealOrderStatus;
  note: string | null;
  isLate: boolean;
  orderedBy: string | null;
  orderedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  changeReason: string | null;
  revisionNo: number;
  revisedAt: string | null;
  lines: MealOrderLineView[];
  extras: MealOrderExtraView[];
  /** TWO_SIDED: санал болгосон мөрүүд (CHANGE_REQUESTED үед) */
  pendingLines: MealOrderLineView[] | null;
  /** Σ base + Σ guest */
  totalMeals: number;
  /** totalMeals ÷ 3, 2 оронтой (хүн-өдөр) */
  personDays: string;
  actions: MealOrderAction[];
}

export interface MealOrderListItem {
  id: string;
  orderDate: string;
  status: MealOrderStatus;
  isLate: boolean;
  totalMeals: number;
}
