import { diffDays, isRealIsoDate } from '../../camp/common/camp-date';
import { badRequest } from '../../../common/i18n/app-error';

/** [from, to] огнооны муж хүчинтэй, maxDays-ээс ихгүй эсэх (400) */
export function assertRange(from: string, to: string, maxDays: number): void {
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) throw badRequest('camp.err.range.1');
  if (to < from) throw badRequest('camp.err.range.2');
  if (diffDays(from, to) + 1 > maxDays) throw badRequest('camp.err.range.3', { maxDays });
}

export function assertDate(date: string, field = 'date'): void {
  if (!isRealIsoDate(date)) throw badRequest('camp.err.range.4', { field });
}
