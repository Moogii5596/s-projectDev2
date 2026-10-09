import { BadRequestException } from '@nestjs/common';
import { diffDays, isRealIsoDate } from './camp-date';

/** [from, to] огнооны муж хүчинтэй, maxDays-ээс ихгүй эсэх (400) */
export function assertRange(from: string, to: string, maxDays: number): void {
  if (!isRealIsoDate(from) || !isRealIsoDate(to)) throw new BadRequestException('Огноо буруу');
  if (to < from) throw new BadRequestException('to нь from-оос өмнө байна');
  if (diffDays(from, to) + 1 > maxDays) throw new BadRequestException(`Хугацааны муж ${maxDays} хоногоос ихгүй`);
}

export function assertDate(date: string, field = 'date'): void {
  if (!isRealIsoDate(date)) throw new BadRequestException(`${field} буруу огноо`);
}
