import { BadRequestException } from '@nestjs/common';
import { CampShiftType } from '@prisma/client';

export interface ShiftSegment {
  dayFrom: number;
  dayTo: number;
  shift: CampShiftType;
}

const ranges = (days: number[]): string => {
  const out: string[] = [];
  let start = days[0];
  for (let i = 1; i <= days.length; i++) {
    if (days[i] !== days[i - 1] + 1) {
      out.push(start === days[i - 1] ? `${start}` : `${start}–${days[i - 1]}`);
      start = days[i];
    }
  }
  return out.join(', ');
};

/**
 * Хэлтсийн ээлжийн загварыг шалгана (Шат 2.4, ERD v4 §2.1):
 * мөрүүд 1..rosterOnDays-ийг ДАВХЦАЛГҮЙ, ЦООРХОЙГҮЙ бүрхэнэ. Хөрш ижил ээлжийн мөрүүдийг нэгтгэнэ.
 * Хоосон массив = загваргүй (зөвшөөрнө). Буцаах: dayFrom-оор эрэмбэлсэн, нэгтгэсэн мөрүүд.
 * @throws BadRequestException — муж буруу / давхцал / дутуу өдөр (өдрүүдийг нэрлэнэ)
 */
export function normalizeShiftPattern(segments: ShiftSegment[], rosterOnDays: number): ShiftSegment[] {
  if (segments.length === 0) return [];
  for (const s of segments) {
    if (s.dayFrom < 1 || s.dayTo < s.dayFrom || s.dayTo > rosterOnDays) {
      throw new BadRequestException(`Ээлжийн мөр буруу (${s.dayFrom}–${s.dayTo}): 1 ≤ эхлэх ≤ дуусах ≤ ${rosterOnDays} байх ёстой`);
    }
  }
  const owner = new Array<number>(rosterOnDays + 1).fill(0);
  const overlap: number[] = [];
  for (const s of segments) {
    for (let d = s.dayFrom; d <= s.dayTo; d++) {
      if (owner[d] > 0) overlap.push(d);
      owner[d]++;
    }
  }
  if (overlap.length > 0) {
    throw new BadRequestException(`Ээлжийн загвар давхцаж байна: ${ranges([...new Set(overlap)].sort((a, b) => a - b))}-р өдөр`);
  }
  const missing: number[] = [];
  for (let d = 1; d <= rosterOnDays; d++) if (owner[d] === 0) missing.push(d);
  if (missing.length > 0) {
    throw new BadRequestException(`Ээлжийн загвар 1–${rosterOnDays} өдрийг бүрэн бүрхэх ёстой. Дутуу: ${ranges(missing)}-р өдөр`);
  }
  const sorted = [...segments].sort((a, b) => a.dayFrom - b.dayFrom);
  const merged: ShiftSegment[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.shift === s.shift && last.dayTo + 1 === s.dayFrom) last.dayTo = s.dayTo;
    else merged.push({ dayFrom: s.dayFrom, dayTo: s.dayTo, shift: s.shift });
  }
  return merged;
}
