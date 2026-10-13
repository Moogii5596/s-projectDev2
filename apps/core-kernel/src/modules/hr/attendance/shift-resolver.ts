import { CampShiftType } from '@prisma/client';
import { coversDay } from '../../camp/common/camp-date';
import { rosterDayNo, RosterSettings } from './roster';

export interface PatternSegment {
  dayFrom: number;
  dayTo: number;
  shift: CampShiftType;
}
export interface AdjustmentRange {
  startDate: string;
  endDate: string;
  shift: CampShiftType;
}
export type ShiftSource = 'ADJUSTMENT' | 'PATTERN' | 'UNIFORM_PATTERN' | 'UNKNOWN';
export interface ResolvedShift {
  shift: CampShiftType | null;
  source: ShiftSource;
  /** Багийн ростерын өдөр (багагүй бол null) */
  dayNo: number | null;
}

/** Загвар бүх өдөрт нэг ээлжтэй бол тэр ээлж (жнь Захиргаа 1–14 DAY) */
export function uniformShift(pattern: PatternSegment[]): CampShiftType | null {
  if (pattern.length === 0) return null;
  const first = pattern[0].shift;
  return pattern.every((p) => p.shift === first) ? first : null;
}

/**
 * D өдрийн ээлж (ERD v4 §2.1, Шат 3 шийдвэр 4):
 *   1) ажилтны зохицуулалт D-г хамарвал → тэр
 *   2) баг + ростерын өдөр 1..on → хэлтсийн загвар
 *   3) багагүй ажилтан + загвар бүх өдөрт нэг ээлжтэй → тэр
 *   4) бусад (ээлжээс өмнө ирсэн, загваргүй г.м.) → UNKNOWN (таамаглахгүй, анхааруулга)
 */
export function resolveShift(input: {
  date: string;
  adjustments: AdjustmentRange[];
  pattern: PatternSegment[];
  crewAnchor: string | null;
  settings: RosterSettings;
}): ResolvedShift {
  const { date, adjustments, pattern, crewAnchor, settings } = input;
  const dayNo = crewAnchor === null ? null : rosterDayNo(crewAnchor, date, settings);
  const adj = adjustments.find((a) => coversDay(a.startDate, a.endDate, date));
  if (adj) return { shift: adj.shift, source: 'ADJUSTMENT', dayNo };
  if (dayNo !== null) {
    if (dayNo >= 1 && dayNo <= settings.rosterOnDays) {
      const seg = pattern.find((p) => dayNo >= p.dayFrom && dayNo <= p.dayTo);
      if (seg) return { shift: seg.shift, source: 'PATTERN', dayNo };
    }
    return { shift: null, source: 'UNKNOWN', dayNo };
  }
  const uniform = uniformShift(pattern);
  if (uniform) return { shift: uniform, source: 'UNIFORM_PATTERN', dayNo: null };
  return { shift: null, source: 'UNKNOWN', dayNo: null };
}
