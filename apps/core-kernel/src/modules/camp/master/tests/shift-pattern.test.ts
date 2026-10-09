import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CampShiftType } from '@prisma/client';
import { normalizeShiftPattern } from '../shift-pattern';

const { DAY, NIGHT } = CampShiftType;

describe('normalizeShiftPattern (Шат 2.4)', () => {
  it('Уулын хэсэг 7/7 ба Захиргаа 14 өдөр → хүчинтэй, эрэмбэлэгдэнэ', () => {
    expect(normalizeShiftPattern([{ dayFrom: 8, dayTo: 14, shift: NIGHT }, { dayFrom: 1, dayTo: 7, shift: DAY }], 14)).toEqual([
      { dayFrom: 1, dayTo: 7, shift: DAY },
      { dayFrom: 8, dayTo: 14, shift: NIGHT },
    ]);
    expect(normalizeShiftPattern([{ dayFrom: 1, dayTo: 14, shift: DAY }], 14)).toEqual([{ dayFrom: 1, dayTo: 14, shift: DAY }]);
  });

  it('хөрш ижил ээлжийг нэгтгэнэ; оролтыг өөрчлөхгүй', () => {
    const input = [{ dayFrom: 1, dayTo: 3, shift: DAY }, { dayFrom: 4, dayTo: 14, shift: DAY }];
    expect(normalizeShiftPattern(input, 14)).toEqual([{ dayFrom: 1, dayTo: 14, shift: DAY }]);
    expect(input[0].dayTo).toBe(3);
  });

  it('хоосон = загваргүй', () => {
    expect(normalizeShiftPattern([], 14)).toEqual([]);
  });

  it('дутуу өдөр → 400, мужаар нэрлэнэ', () => {
    expect(() => normalizeShiftPattern([{ dayFrom: 1, dayTo: 7, shift: DAY }, { dayFrom: 10, dayTo: 12, shift: NIGHT }], 14)).toThrow(
      /1–14 өдрийг бүрэн бүрхэх ёстой\. Дутуу: 8–9, 13–14-р өдөр/,
    );
    expect(() => normalizeShiftPattern([{ dayFrom: 2, dayTo: 14, shift: DAY }], 14)).toThrow(/Дутуу: 1-р өдөр/);
  });

  it('давхцал → 400, өдрүүдийг нэрлэнэ', () => {
    expect(() => normalizeShiftPattern([{ dayFrom: 1, dayTo: 8, shift: DAY }, { dayFrom: 7, dayTo: 14, shift: NIGHT }], 14)).toThrow(/давхцаж байна: 7–8-р өдөр/);
  });

  it('муж буруу (0, урвуу, ростероос хэтэрсэн) → 400', () => {
    expect(() => normalizeShiftPattern([{ dayFrom: 0, dayTo: 14, shift: DAY }], 14)).toThrow(BadRequestException);
    expect(() => normalizeShiftPattern([{ dayFrom: 9, dayTo: 3, shift: DAY }], 14)).toThrow(/1 ≤ эхлэх ≤ дуусах ≤ 14/);
    expect(() => normalizeShiftPattern([{ dayFrom: 1, dayTo: 15, shift: DAY }], 14)).toThrow(/≤ 14/);
  });

  it('өөр ростерын урт (10)', () => {
    expect(normalizeShiftPattern([{ dayFrom: 1, dayTo: 10, shift: NIGHT }], 10)).toHaveLength(1);
    expect(() => normalizeShiftPattern([{ dayFrom: 1, dayTo: 14, shift: NIGHT }], 10)).toThrow(/≤ 10/);
  });
});
