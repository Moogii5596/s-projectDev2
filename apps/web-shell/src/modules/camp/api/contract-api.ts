import apiClient from '../../../api/client';
import type {
  ContractCatalogView,
  ContractItemView,
  ContractListItem,
  ContractMealType,
  ContractPriceView,
  ContractView,
  ExchangeRateView,
  ManualAmendmentType,
  PaymentTerm,
  PriceQuote,
  QuantityRule,
  QuantitySource,
  RatePolicy,
  ServiceTypeView,
  UnitView,
  ContractAmendmentView,
  ContractStatus,
} from './contract-types';

/**
 * v0.2.3 Блок 6б — гэрээ, каталог, ханш (backend: `camp/contracts/*`, `core/exchange-rates/*`).
 * Body-ийн талбарын нэр = backend DTO (`contracts.dto.ts`, `exchange-rates.dto.ts`) — R20.
 */
const V1 = '/api/v1/camp';
const CATALOG = `${V1}/contract-catalog`;
const FX = '/api/v1/core/exchange-rates';
const contractsUrl = (campId: string, path = '') => `${V1}/camps/${campId}/contracts${path}`;

const get = async <T>(url: string, params?: object): Promise<T> => (await apiClient.get<T>(url, { params })).data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body ?? {})).data;
const patch = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.patch<T>(url, body)).data;
const put = async <T>(url: string, body: unknown): Promise<T> => (await apiClient.put<T>(url, body)).data;
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data;

export interface CatalogNamesInput {
  nameMn: string;
  nameEn?: string | null;
  nameZh?: string | null;
  sortOrder?: number;
}
export interface UnitInput extends CatalogNamesInput {
  code: string;
  decimals?: number;
}
export type UnitPatch = Partial<Omit<UnitInput, 'code'>> & { isActive?: boolean };
export interface ServiceTypeInput extends CatalogNamesInput {
  code: string;
  quantitySource: QuantitySource;
  defaultUnitId?: string | null;
}
export type ServiceTypePatch = Partial<Omit<ServiceTypeInput, 'code'>> & { isActive?: boolean };

export interface ContractInput {
  contractNo: string;
  title: string;
  organizationId: string;
  customerOrganizationId?: string | null;
  startDate: string;
  endDate?: string | null;
  currency: string;
  paymentCurrency: string;
  /** '10', '0', '12.5' */
  vatRate: string;
  ratePolicy: RatePolicy;
  fixedRate?: string | null;
  paymentTerms?: PaymentTerm[];
  note?: string | null;
}
/** ACTIVE: contractNo / organizationId / currency / startDate / endDate өгвөл 400 (camp.err.contract.10) */
export type ContractPatch = Partial<ContractInput> & { documentNo?: string | null };

export interface ContractItemInput {
  serviceTypeId: string;
  /** Өгөхгүй бол үйлчилгээний төрлийн анхдагч нэгж */
  unitId?: string;
  quantityRule?: QuantityRule | null;
  quantityDivisor?: string | null;
  mealType?: ContractMealType | null;
  description?: string | null;
}
export type ContractItemPatch = Partial<Omit<ContractItemInput, 'serviceTypeId'>>;

export interface PriceInput {
  effectiveFrom: string;
  unitPrice: string;
  vatIncluded: boolean;
  note?: string | null;
  /** ACTIVE гэрээнд — PRICE_CHANGE нэмэлт өөрчлөлтийн баримт */
  documentNo?: string | null;
}

export interface AmendmentInput {
  amendmentType: ManualAmendmentType;
  effectiveDate: string;
  /** EXTENSION — заавал */
  newEndDate?: string | null;
  documentNo?: string | null;
  note?: string | null;
}

export interface TerminateInput {
  terminatedAt: string;
  note: string;
  documentNo?: string | null;
}

export interface ExchangeRateInput {
  rateDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  sourceNote?: string | null;
}

export const contractApi = {
  // ── Каталог (tenant) ──
  catalog: () => get<ContractCatalogView>(CATALOG),
  createUnit: (body: UnitInput) => post<UnitView>(`${CATALOG}/units`, body),
  updateUnit: (id: string, body: UnitPatch) => patch<UnitView>(`${CATALOG}/units/${id}`, body),
  createServiceType: (body: ServiceTypeInput) => post<ServiceTypeView>(`${CATALOG}/service-types`, body),
  updateServiceType: (id: string, body: ServiceTypePatch) => patch<ServiceTypeView>(`${CATALOG}/service-types/${id}`, body),

  // ── Гэрээ (кемп) ──
  list: (campId: string, q: { status?: ContractStatus; activeOn?: string } = {}) => get<ContractListItem[]>(contractsUrl(campId), q),
  get: (campId: string, id: string) => get<ContractView>(contractsUrl(campId, `/${id}`)),
  create: (campId: string, body: ContractInput) => post<ContractView>(contractsUrl(campId), body),
  update: (campId: string, id: string, body: ContractPatch) => patch<ContractView>(contractsUrl(campId, `/${id}`), body),
  /** Зөвхөн DRAFT */
  remove: (campId: string, id: string) => del<void>(contractsUrl(campId, `/${id}`)),
  activate: (campId: string, id: string) => post<ContractView>(contractsUrl(campId, `/${id}/activate`)),
  terminate: (campId: string, id: string, body: TerminateInput) => post<ContractView>(contractsUrl(campId, `/${id}/terminate`), body),

  addItem: (campId: string, id: string, body: ContractItemInput) => post<ContractItemView>(contractsUrl(campId, `/${id}/items`), body),
  updateItem: (campId: string, id: string, itemId: string, body: ContractItemPatch) =>
    patch<ContractItemView>(contractsUrl(campId, `/${id}/items/${itemId}`), body),
  removeItem: (campId: string, id: string, itemId: string) => del<void>(contractsUrl(campId, `/${id}/items/${itemId}`)),

  addPrice: (campId: string, id: string, itemId: string, body: PriceInput) =>
    post<ContractPriceView>(contractsUrl(campId, `/${id}/items/${itemId}/prices`), body),
  removePrice: (campId: string, id: string, itemId: string, priceId: string) =>
    del<void>(contractsUrl(campId, `/${id}/items/${itemId}/prices/${priceId}`)),

  addAmendment: (campId: string, id: string, body: AmendmentInput) =>
    post<ContractAmendmentView>(contractsUrl(campId, `/${id}/amendments`), body),
  quote: (campId: string, id: string, q: { itemId: string; date: string; quantity: string }) =>
    get<PriceQuote>(contractsUrl(campId, `/${id}/quote`), q),

  // ── Ханш (tenant) ──
  exchangeRates: (q: { from?: string; to?: string; currency?: string } = {}) => get<ExchangeRateView[]>(FX, q),
  /** Ижил (rateDate, base, quote) байвал солино */
  upsertExchangeRate: (body: ExchangeRateInput) => put<ExchangeRateView>(FX, body),
  removeExchangeRate: (id: string) => del<void>(`${FX}/${id}`),
};
