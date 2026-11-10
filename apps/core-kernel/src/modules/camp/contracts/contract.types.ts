/**
 * v0.2.3 Блок 6б — гэрээ, үнэ, ханш, каталог (V2-01, V2-07). API-ийн гэрээ.
 * ⚠️ Frontend-ийн хуулбар: `apps/web-shell/src/modules/camp/api/contract-types.ts` — ТАМ АДИЛ (R20).
 * Мөнгөн дүн, ханш, хуваагч — string (Decimal, нарийвчлал алдахгүй).
 */

export const QUANTITY_SOURCES = ['MEAL_ORDER', 'HAUL', 'MANUAL'] as const;
export type QuantitySource = (typeof QUANTITY_SOURCES)[number];

export const RATE_POLICIES = ['NONE', 'FIXED', 'MONTHLY_MANUAL'] as const;
export type RatePolicy = (typeof RATE_POLICIES)[number];

/** G-3: хоолноос нэхэмжлэх тоо — нийт ÷ N эсвэл нэг хоолны төрөл (хоол тус бүрийн үнэ = хэд хэдэн MEAL_TYPE мөр) */
export const QUANTITY_RULES = ['TOTAL_DIV_N', 'MEAL_TYPE'] as const;
export type QuantityRule = (typeof QUANTITY_RULES)[number];

export const CONTRACT_MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT'] as const;
export type ContractMealType = (typeof CONTRACT_MEAL_TYPES)[number];

const AMENDMENT_TYPES = ['EXTENSION', 'PRICE_CHANGE', 'TERMS', 'TERMINATION', 'OTHER'] as const;
export type AmendmentType = (typeof AMENDMENT_TYPES)[number];
/** POST /amendments-аар шууд бүртгэх төрөл (PRICE_CHANGE — үнэ нэмэхэд, TERMINATION — цуцлахад автоматаар) */
export const MANUAL_AMENDMENT_TYPES = ['EXTENSION', 'TERMS', 'OTHER'] as const;
export type ManualAmendmentType = (typeof MANUAL_AMENDMENT_TYPES)[number];

/** Төлбөрийн хуваарийн мөр: баримтаас хойш N ажлын өдөр / N хоног / N сар (амралтын өдрийн календарь — V2-08) */
export const PAYMENT_TERM_RULES = ['AFTER_INVOICE_WORKDAYS', 'AFTER_INVOICE_DAYS', 'AFTER_MONTHS'] as const;
export type PaymentTermRule = (typeof PAYMENT_TERM_RULES)[number];

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'TERMINATED';

export interface PaymentTerm {
  percent: number;
  rule: PaymentTermRule;
  n: number;
  note: string | null;
}

export interface UnitView {
  id: string;
  code: string;
  nameMn: string;
  nameEn: string | null;
  nameZh: string | null;
  decimals: number;
  sortOrder: number;
  isActive: boolean;
}

export interface ServiceTypeView {
  id: string;
  code: string;
  nameMn: string;
  nameEn: string | null;
  nameZh: string | null;
  quantitySource: QuantitySource;
  defaultUnitId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ContractCatalogView {
  units: UnitView[];
  serviceTypes: ServiceTypeView[];
}

export interface ContractListItem {
  id: string;
  campId: string;
  contractNo: string;
  title: string;
  organizationId: string;
  organizationName: string;
  customerOrganizationId: string | null;
  customerOrganizationName: string | null;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  terminatedAt: string | null;
  currency: string;
  paymentCurrency: string;
  itemCount: number;
}

export interface ContractPriceView {
  id: string;
  effectiveFrom: string;
  unitPrice: string;
  vatIncluded: boolean;
  currency: string;
  note: string | null;
  amendmentId: string | null;
  createdAt: string;
}

export interface ContractItemView {
  id: string;
  serviceTypeId: string;
  serviceTypeCode: string;
  quantitySource: QuantitySource;
  unitId: string;
  unitCode: string;
  quantityRule: QuantityRule | null;
  quantityDivisor: string | null;
  mealType: ContractMealType | null;
  description: string | null;
  /** effectiveFrom өсөхөөр */
  prices: ContractPriceView[];
  /** Өнөөдрийн (Улаанбаатар) хүчинтэй үнэ */
  currentPrice: ContractPriceView | null;
}

export interface ContractAmendmentView {
  id: string;
  amendmentType: AmendmentType;
  effectiveDate: string;
  previousEndDate: string | null;
  newEndDate: string | null;
  documentNo: string | null;
  note: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface ContractView extends ContractListItem {
  note: string | null;
  vatRate: string;
  ratePolicy: RatePolicy;
  fixedRate: string | null;
  paymentTerms: PaymentTerm[];
  items: ContractItemView[];
  /** effectiveDate, createdAt өсөхөөр */
  amendments: ContractAmendmentView[];
}

/** GET …/contracts/:id/quote — (огноо, ажил, тоо) → дүн (гэрээний валют) + төлбөрийн валютаар */
export interface PriceQuote {
  date: string;
  contractItemId: string;
  quantity: string;
  unitPrice: string;
  currency: string;
  vatIncluded: boolean;
  vatRate: string;
  net: string;
  vat: string;
  gross: string;
  paymentCurrency: string;
  /** 1 currency = rate paymentCurrency; ижил валютад '1' */
  rate: string;
  /** MONTHLY_MANUAL — ашигласан ханшийн огноо; бусад NULL */
  rateDate: string | null;
  paymentNet: string;
  paymentVat: string;
  paymentGross: string;
}
