import { CampEmployeeStatus, CampMovementDirection } from '@prisma/client';
import { t } from '../../../common/i18n/translate';
import type { Tx } from '../../camp/common/camp-tx';
import type { ParsedRow } from './import-parser';
import type { ShiftChangeRow } from './shiftchange-parser';

/**
 * v0.2.3 Блок R2 — ShiftChange мөрийг ажилтантай тулгах (ЦЭВЭР функц + DB ачаалагч).
 *   CODE → кодоор; олдохгүй бол нэрээр (анхааруулга: код зөрүүтэй)
 *   NEW / CONTRACTOR / EMPTY → овог + нэрээр (нэрний ард өрөөний дугаар, «Sino», «SGS» г.м. үл тооно)
 *   нэрээр давхардвал / олдохгүй бол мөрийн алдаа (бусад мөрийг алгасах боломжтой — PREVIEW)
 * Үр дүн = одоогийн planner-ийн ParsedRow (ARRIVAL / DEPARTURE, EXTEND = action).
 */
export interface ResolverEmployee {
  employeeCode: string;
  lastName: string | null;
  firstName: string | null;
  fullName: string;
  status: CampEmployeeStatus;
}

/** Латин ижил дүрстэй үсгийг кирилл болгоно (HR файлд холилдсон байдаг) */
const LATIN_TO_CYR: Record<string, string> = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
const NOISE = new Set(['sino', 'sgs', 'сино']);

/** Нэрийг тулгахад: жижиг үсэг, хаалтанд/тоо, «Sino», «SGS» хасах, латин → кирилл, зай нэгтгэх */
export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .map((w) => w.replace(/[a-z]/g, (c) => LATIN_TO_CYR[c] ?? c)) // хоёр талд ижил хувиргалт — тэгшитгэлд хангалттай
    .join(' ')
    .trim();
}
const nameKey = (last: string | null | undefined, first: string | null | undefined) => `${normName(last)}|${normName(first)}`;

export function resolveShiftChange(input: ShiftChangeRow[], employees: ResolverEmployee[]): ParsedRow[] {
  const byCode = new Map<string, ResolverEmployee>();
  const byName = new Map<string, ResolverEmployee[]>();
  for (const e of employees) {
    // нэг код ажлаас гарсан + шинэ бүртгэлд байж болно — идэвхтэй нь давуу
    const prev = byCode.get(e.employeeCode);
    if (!prev || prev.status === CampEmployeeStatus.TERMINATED) byCode.set(e.employeeCode, e);
    const k = nameKey(e.lastName, e.firstName);
    if (k !== '|') byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const findByName = (r: ShiftChangeRow): { emp?: ResolverEmployee; error?: string } => {
    const all = byName.get(nameKey(r.lastName, r.firstName)) ?? [];
    const active = all.filter((e) => e.status !== CampEmployeeStatus.TERMINATED);
    if (active.length === 1) return { emp: active[0] };
    if (active.length > 1) return { error: t('camp.row.sc_name_ambiguous', { codes: active.map((e) => e.employeeCode).join(', ') }) };
    if (all.length > 0) return { emp: all[0] }; // ажлаас гарсан — planner «идэвхгүй» алдаа өгнө
    return {};
  };
  const who = (r: ShiftChangeRow) => `${r.lastName} ${r.firstName}`.trim();

  return input.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let code = '';
    if (r.idType === 'CODE' && r.employeeCode) {
      const emp = byCode.get(r.employeeCode);
      if (emp) {
        code = emp.employeeCode;
        if ((r.lastName || r.firstName) && nameKey(r.lastName, r.firstName) !== nameKey(emp.lastName, emp.firstName)) {
          warnings.push(t('camp.row.sc_name_mismatch', { file: who(r), system: emp.fullName }));
        }
      } else {
        const m = findByName(r);
        if (m.emp) {
          code = m.emp.employeeCode;
          warnings.push(t('camp.row.sc_code_mismatch', { file: r.employeeCode, system: m.emp.employeeCode }));
        } else {
          code = r.employeeCode; // planner «Ажилтан олдсонгүй» алдаа
          if (m.error) errors.push(m.error);
        }
      }
    } else {
      const m = findByName(r);
      if (m.emp) code = m.emp.employeeCode;
      else if (m.error) errors.push(m.error);
      else errors.push(t(r.idType === 'NEW' ? 'camp.row.sc_new_not_registered' : 'camp.row.sc_not_registered', { name: who(r), id: r.idRaw }));
    }
    return {
      row: i + 1,
      employeeCode: code,
      date: r.date,
      direction: r.kind === 'EXTEND' ? null : r.kind === 'ARRIVAL' ? CampMovementDirection.ARRIVAL : CampMovementDirection.DEPARTURE,
      meals: null,
      shift: null,
      errors,
      ...(r.kind === 'EXTEND' ? { action: 'EXTEND' as const } : {}),
      source: { sheet: r.sheet, row: r.row, idRaw: r.idRaw, idType: r.idType, lastName: r.lastName, firstName: r.firstName, crew: r.crew, extendDays: r.extendDays },
      ...(warnings.length ? { warnings } : {}),
    };
  });
}

/** Кемпийн бүх ажилтан (≈ 2 мянга) — тулгалтад */
export function loadResolverEmployees(tx: Tx, tenantId: string, campId: string): Promise<ResolverEmployee[]> {
  return tx.hrEmployee.findMany({
    where: { tenantId, campId },
    select: { employeeCode: true, lastName: true, firstName: true, fullName: true, status: true },
  });
}
