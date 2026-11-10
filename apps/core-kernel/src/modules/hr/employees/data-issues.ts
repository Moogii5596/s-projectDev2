import type { Prisma } from '@prisma/client';
import type { RowError } from '../../../common/xlsx/table-spec';

/**
 * v0.2.3 Блок D (S9, S11) — ажилтны «Мэдээлэл дутуу» тэмдэглэгээ (`camp_employees.data_issues`).
 * Импортын буруу утга жинхэнэ талбарт ОРОХГҮЙ — энд эх утгатай хадгалагдаж, HR засна. Статустай холбоогүй.
 */
/** v0.2.3 R9: `employeeCode` = HR ID хүлээгдэж байна (ShiftChange `NEW` мөрөөс түр кодтой бүртгэсэн; код солиход арилна) */
const DATA_ISSUE_FIELDS = ['email', 'phone', 'extraPhones', 'terminatedAt', 'employeeCode'] as const;
export type DataIssueField = (typeof DATA_ISSUE_FIELDS)[number];
export interface DataIssue {
  field: DataIssueField;
  /** Алдааны код (row.bad_email, row.bad_phone, row.date_missing …) */
  code: string;
  /** Эх утга (буруу) — хоосон байж болно (жнь огноо алга) */
  value: string;
}
/** field → шинэ асуудал (null = тэр талбарын асуудлыг арилгах), undefined = хөндөхгүй */
export type IssueUpdate = Partial<Record<DataIssueField, DataIssue | null>>;

export function readIssues(v: Prisma.JsonValue | null | undefined): DataIssue[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is DataIssue & Prisma.JsonObject => !!x && typeof x === 'object' && !Array.isArray(x) && typeof (x as Record<string, unknown>).field === 'string') as unknown as DataIssue[];
}

/** Одоогийн жагсаалтад шинэчлэлийг хэрэглэнэ (талбар бүрт нэг асуудал, дараалал тогтвортой) */
export function applyIssues(current: readonly DataIssue[], update: IssueUpdate): DataIssue[] {
  const touched = new Set(Object.keys(update));
  const out = current.filter((i) => !touched.has(i.field));
  for (const f of DATA_ISSUE_FIELDS) {
    const u = update[f];
    if (u) out.push(u);
  }
  return out;
}

export const sameIssues = (a: readonly DataIssue[], b: readonly DataIssue[]) =>
  JSON.stringify([...a].sort((x, y) => x.field.localeCompare(y.field))) === JSON.stringify([...b].sort((x, y) => x.field.localeCompare(y.field)));

/** Импортын `soft` баганын анхааруулга → асуудал */
export function issueFromRow(field: DataIssueField, e: RowError | undefined): DataIssue | null {
  if (!e) return null;
  const raw = e.params && typeof e.params.value !== 'undefined' ? String(e.params.value) : '';
  return { field, code: e.code, value: raw };
}

/** API-аар талбарыг зассан (DTO баталгаажуулсан = зөв утга) → тэр талбарын асуудлыг арилгана */
export function clearedBy(dto: Partial<Record<DataIssueField, unknown>>): IssueUpdate {
  const u: IssueUpdate = {};
  for (const f of DATA_ISSUE_FIELDS) if (dto[f] !== undefined) u[f] = null;
  return u;
}

/** R9: HR ID хүлээгдэж байна */
export const HR_ID_PENDING: DataIssue = { field: 'employeeCode', code: 'row.hr_id_pending', value: '' };

export const toJson = (issues: readonly DataIssue[]) => issues as unknown as Prisma.InputJsonValue;
