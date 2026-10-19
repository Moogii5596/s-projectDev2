import type { Tx } from '../../camp/common/camp-tx';

/**
 * v0.2.3 Блок D (S1, S2) — ажилтны нэр ба нэмэлт утас.
 * DB: `full_name` = trigger `trg_camp_employees_names` («овог нэр»); энд ижил дүрмээр тооцоолж буцаана (хариу, audit).
 */
export interface EmployeeNameInput {
  familyName?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  /** Хуучин урсгал: зөвхөн бүтэн нэр → эхний зайгаар салгана */
  fullName?: string | null;
}
export interface EmployeeNames {
  familyName: string | null;
  lastName: string | null;
  firstName: string;
  fullName: string;
}

const clean = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
const orNull = (s: string | null | undefined) => clean(s) || null;

/** «Хүрлээ Анхбаяр» → овог «Хүрлээ», нэр «Анхбаяр»; нэг үг → нэр */
export function splitFullName(full: string): { lastName: string | null; firstName: string } {
  const s = clean(full);
  const i = s.indexOf(' ');
  return i < 0 ? { lastName: null, firstName: s } : { lastName: s.slice(0, i), firstName: s.slice(i + 1) };
}

export const joinFullName = (lastName: string | null, firstName: string) => [lastName, firstName].filter(Boolean).join(' ');

/**
 * Шинэ/шинэчлэх нэр. Нэг ч нэрийн талбар өгөөгүй бол `null` (өөрчлөхгүй).
 * Овог/нэр өгвөл тэдгээрийг (өгөөгүйг нь одоогийнхоос), эс бөгөөс `fullName`-ийг салгана.
 */
export function resolveNames(input: EmployeeNameInput, current?: EmployeeNames | null): EmployeeNames | null {
  const first = input.firstName === undefined || input.firstName === null ? undefined : clean(input.firstName) || undefined;
  const full = input.fullName === undefined || input.fullName === null ? undefined : clean(input.fullName) || undefined;
  // Нэр өгөөгүй ч бүтэн нэр өгсөн бол бүтэн нэрийг салгана (хуучин клиент/файл); эс бөгөөс овог/нэрийн хэсгүүд
  const useFull = first === undefined && full !== undefined;
  const hasParts = !useFull && (first !== undefined || input.lastName !== undefined);
  if (!useFull && !hasParts && input.familyName === undefined) return null;
  let lastName = current?.lastName ?? null;
  let firstName = current?.firstName ?? '';
  if (useFull) ({ lastName, firstName } = splitFullName(full));
  else {
    if (input.lastName !== undefined) lastName = orNull(input.lastName);
    if (first !== undefined) firstName = first;
  }
  const familyName = input.familyName !== undefined ? orNull(input.familyName) : (current?.familyName ?? null);
  return { familyName, lastName, firstName, fullName: joinFullName(lastName, firstName) };
}

/** Үндсэн утасны дүрэм (table-spec `phone`-той ижил): 8 орон эсвэл +8…15 орон */
export const PHONE_RE = /^(\+\d{8,15}|\d{8})$/;
export const EXTRA_PHONES_MAX = 10;
export const compactPhone = (s: string) => s.replace(/[\s\-()]/g, '');

/** Нэг нүд/текстэд олон дугаар («88123354, 99435600», мөр шилжилт) → жагсаалт */
export function splitPhones(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/[,;/\n\r]+|\s{2,}|\s(?=\+?\d{8})/)
    .map(compactPhone)
    .filter(Boolean);
}

/** Нэмэлт дугаар: давхардал, үндсэн дугаартай давхцахыг хасна (дараалал хадгална) */
export function normalizeExtraPhones(list: readonly string[], primary: string | null | undefined): string[] {
  const seen = new Set<string>(primary ? [compactPhone(primary)] : []);
  const out: string[] = [];
  for (const raw of list) {
    const p = compactPhone(raw);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Нэмэлт утсыг бүхэлд нь солих (transaction дотор) */
export async function replaceExtraPhones(tx: Tx, tenantId: string, employeeId: string, phones: readonly string[]): Promise<void> {
  await tx.hrEmployeePhone.deleteMany({ where: { tenantId, employeeId } });
  if (phones.length > 0) {
    await tx.hrEmployeePhone.createMany({ data: phones.map((phone, i) => ({ tenantId, employeeId, phone, sortOrder: i })) });
  }
}

/** Хариунд: `extraPhones: [{phone}]` → `string[]` */
export const phonesOut = (rows: readonly { phone: string }[] | undefined) => (rows ?? []).map((r) => r.phone);
