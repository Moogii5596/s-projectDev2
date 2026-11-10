import { CampEmployeeStatus, CampMovementDirection } from '@prisma/client';
import { getRosterSettings } from '../../camp/common/camp-lookup';
import { fromDbDate, toDbDate } from '../../camp/common/camp-tx';
import type { Tx } from '../../camp/common/camp-tx';
import type { ParsedRow } from './import-parser';
import { rosterDayNo, RosterSettings } from './roster';
import type { AttendanceStayStore } from './stay-store';

/**
 * v0.2.3 Блок R4.2 — файлын түвшний анхааруулга (ЦЭВЭР функц + DB ачаалагч): ShiftChange файлд байгаа өдөр
 * ростероор ирэх / явах ёстой боловч жагсаалтад (ирэх / буух / Сунах) алга ажилтнууд. Импортыг зогсоохгүй.
 *   ирэх (өдөр 0): кемпэд байгаагүй (тухайн өдрийг хамарсан stay алга) ажилтан
 *   явах (өдөр on + 1): кемпэд байгаа (өмнө ирсэн, нээлттэй stay), тухайн өдрийг хамарсан зохицуулалт (сунгалт г.м.) алга
 * «Жагсаалтад байгаа» = файлын аль ч өдрийн ижил чиглэлийн мөрөнд (Сунах = явах) — өөр өдөр ирсэн / явсныг гэмтэл гэж тооцохгүй.
 */
export interface GapEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  crew: string | null;
  /** багийн ростерын эхлэл (өдөр 0) */
  anchor: string;
}
export interface RosterGap {
  date: string;
  direction: CampMovementDirection;
  /** нийт тоо (`employees` нь `limit`-ээр хязгаарлагдана) */
  total: number;
  employees: { id: string; employeeCode: string; fullName: string; crew: string | null }[];
}
type Range = { startDate: string; endDate: string | null };

const ROSTER_GAP_LIMIT = 200;

export function findRosterGaps(
  rows: ParsedRow[],
  employees: GapEmployee[],
  stays: Map<string, Range[]>,
  adjustments: Map<string, { startDate: string; endDate: string }[]>,
  s: RosterSettings,
  limit = ROSTER_GAP_LIMIT,
): RosterGap[] {
  const active = rows.filter((r) => !r.deleted && r.source && r.date);
  const arrDates = new Set<string>();
  const depDates = new Set<string>();
  const arrListed = new Set<string>();
  const depListed = new Set<string>();
  for (const r of active) {
    const isArr = r.direction === CampMovementDirection.ARRIVAL;
    (isArr ? arrDates : depDates).add(r.date as string); // DEPARTURE эсвэл EXTEND (Сунах)
    if (r.employeeCode) (isArr ? arrListed : depListed).add(r.employeeCode);
  }
  const covers = (x: Range, d: string) => x.startDate <= d && (x.endDate === null || x.endDate >= d);
  const out: RosterGap[] = [];
  const check = (dates: Set<string>, direction: CampMovementDirection, listed: Set<string>, dayNo: number, expected: (e: GapEmployee, d: string) => boolean) => {
    for (const date of [...dates].sort()) {
      const miss = employees
        .filter((e) => !listed.has(e.employeeCode) && rosterDayNo(e.anchor, date, s) === dayNo && expected(e, date))
        .sort((a, b) => (a.crew ?? '').localeCompare(b.crew ?? '') || a.employeeCode.localeCompare(b.employeeCode));
      if (miss.length) out.push({ date, direction, total: miss.length, employees: miss.slice(0, limit).map((e) => ({ id: e.id, employeeCode: e.employeeCode, fullName: e.fullName, crew: e.crew })) });
    }
  };
  check(arrDates, CampMovementDirection.ARRIVAL, arrListed, 0, (e, d) => !(stays.get(e.id) ?? []).some((x) => covers(x, d)));
  check(depDates, CampMovementDirection.DEPARTURE, depListed, s.rosterOnDays + 1, (e, d) =>
    (stays.get(e.id) ?? []).some((x) => x.startDate < d && x.endDate === null) && !(adjustments.get(e.id) ?? []).some((a) => a.startDate <= d && a.endDate >= d),
  );
  return out;
}

/** Кемпийн багтай идэвхтэй ажилтан + stay + зохицуулалт (файлын хамгийн бага огнооноос) → findRosterGaps */
export async function loadRosterGaps(tx: Tx, tenantId: string, campId: string, rows: ParsedRow[], stayStore: AttendanceStayStore): Promise<RosterGap[]> {
  const dates = rows.filter((r) => !r.deleted && r.source && r.date).map((r) => r.date as string).sort();
  if (dates.length === 0) return [];
  const settings = await getRosterSettings(tx, tenantId, campId);
  const emps = await tx.hrEmployee.findMany({
    where: { tenantId, campId, status: CampEmployeeStatus.ACTIVE, crewId: { not: null } },
    select: { id: true, employeeCode: true, fullName: true, crew: { select: { code: true, rosterAnchorDate: true } } },
  });
  const employees: GapEmployee[] = emps.flatMap((e) =>
    e.crew ? [{ id: e.id, employeeCode: e.employeeCode, fullName: e.fullName, crew: e.crew.code, anchor: fromDbDate(e.crew.rosterAnchorDate) }] : [],
  );
  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return [];
  const [stayRows, adjRows] = await Promise.all([
    stayStore.findForPlanner(tx, tenantId, ids, toDbDate(dates[0])),
    tx.hrShiftAdjustment.findMany({
      where: { tenantId, employeeId: { in: ids }, endDate: { gte: toDbDate(dates[0]) }, startDate: { lte: toDbDate(dates[dates.length - 1]) } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);
  const group = <T extends { employeeId: string }, R>(list: T[], map: (r: T) => R) => {
    const m = new Map<string, R[]>();
    for (const r of list) m.set(r.employeeId, [...(m.get(r.employeeId) ?? []), map(r)]);
    return m;
  };
  return findRosterGaps(
    rows,
    employees,
    group(stayRows, (x) => ({ startDate: fromDbDate(x.startDate), endDate: x.endDate ? fromDbDate(x.endDate) : null })),
    group(adjRows, (a) => ({ startDate: fromDbDate(a.startDate), endDate: fromDbDate(a.endDate) })),
    settings,
  );
}
