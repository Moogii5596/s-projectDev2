import { CampMovementDirection, CampMovementKind } from '@prisma/client';
import { diffDays } from '../../camp/common/camp-date';

/**
 * Ростер (хэрэглэгчийн тодруулга 2026-10-09): `onDays` ажлын өдөр; ирэх/явах замын хоног АМРАЛТАД орно.
 *   өдөр 0        = ирэх (жнь Лхагва) — оройн хоолноос
 *   өдөр 1..on    = ажлын өдөр (Пүрэв … Лхагва) — ээлжийн загвар 1..on
 *   өдөр on + 1   = явах (Пүрэв) — өглөөний хоол
 *   мөчлөг        = on + off (14 + 14 = 28)
 */
export interface RosterSettings {
  rosterOnDays: number;
  rosterOffDays: number;
  changeoverWeekday: number;
}

const cycleLength = (s: RosterSettings): number => s.rosterOnDays + s.rosterOffDays;

/** Багийн мөчлөг дэх өдрийн дугаар (0..cycle-1) */
export function rosterDayNo(anchor: string, date: string, s: RosterSettings): number {
  const c = cycleLength(s);
  return (((diffDays(anchor, date)) % c) + c) % c;
}

/** Ростерын дагуу ирэх (0) / явах (on+1) өдөр бол ROSTER, бусад үед (эсвэл багагүй) OFF_ROSTER */
export function classifyMovement(anchor: string | null, date: string, direction: CampMovementDirection, s: RosterSettings): CampMovementKind {
  if (anchor === null) return CampMovementKind.OFF_ROSTER;
  const n = rosterDayNo(anchor, date, s);
  if (direction === CampMovementDirection.ARRIVAL && n === 0) return CampMovementKind.ROSTER;
  if (direction === CampMovementDirection.DEPARTURE && n === s.rosterOnDays + 1) return CampMovementKind.ROSTER;
  return CampMovementKind.OFF_ROSTER;
}

/**
 * Ростерын дагуу d өдрийн ШӨНӨ кемпэд хонох эсэх (өрөөний багтаамж — "хоног"-оор):
 * баг: өдөр 0..on (ирсэн шөнөөс явахын өмнөх шөнө хүртэл); багагүй: үргэлж (болгоомжтой).
 */
export function expectedNight(anchor: string | null, date: string, s: RosterSettings): boolean {
  if (anchor === null) return true;
  return rosterDayNo(anchor, date, s) <= s.rosterOnDays;
}
