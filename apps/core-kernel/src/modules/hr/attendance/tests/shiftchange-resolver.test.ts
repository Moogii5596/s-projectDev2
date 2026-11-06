import { describe, it, expect } from 'vitest';
import { CampEmployeeStatus } from '@prisma/client';
import { normName, resolveShiftChange, ResolverEmployee } from '../shiftchange-resolver';
import type { ShiftChangeRow } from '../shiftchange-parser';

const emp = (employeeCode: string, lastName: string, firstName: string, status: CampEmployeeStatus = CampEmployeeStatus.ACTIVE): ResolverEmployee => ({
  employeeCode, lastName, firstName, fullName: `${lastName} ${firstName}`, status,
});
const EMPS = [
  emp('10001', 'Бат', 'Болд'),
  emp('08101', 'Дорж', 'Сүрэн'),
  emp('10002', 'Ганаа', 'Туяа'),
  emp('10003', 'Ганаа', 'Туяа'), // ижил нэр
  emp('09001', 'Цэрэн', 'Дулам', CampEmployeeStatus.TERMINATED),
  emp('Z0001', 'Харуул', 'Эрдэнэ'),
];
let n = 0;
const row = (p: Partial<ShiftChangeRow>): ShiftChangeRow => ({
  sheet: '2026.11.04 A ирэх', row: ++n + 3, kind: 'ARRIVAL', date: '2026-11-04', idRaw: '', idType: 'EMPTY', employeeCode: null,
  lastName: '', firstName: '', position: '', department: '', crew: 'A', note: '', extendDays: null, ...p,
});

describe('shiftchange-resolver', () => {
  it('normName: хаалт, тоо, Sino/SGS, латин үсэг, том жижиг', () => {
    expect(normName('Болд (215)')).toBe('болд');
    expect(normName('Болд 215 Sino')).toBe('болд');
    expect(normName('БOЛД')).toBe('болд'); // латин O
    expect(normName('  Сүрэн   SGS ')).toBe('сүрэн');
  });

  it('кодоор; 4 оронтой → 5 орон; нэр зөрвөл анхааруулга', () => {
    const [a, b, c] = resolveShiftChange([
      row({ idRaw: '10001', idType: 'CODE', employeeCode: '10001', lastName: 'Бат', firstName: 'Болд (215)' }),
      row({ idRaw: '8101', idType: 'CODE', employeeCode: '08101', lastName: 'Дорж', firstName: 'Сүрэн', kind: 'DEPARTURE', sheet: '2026.11.05 D буух', date: '2026-11-05' }),
      row({ idRaw: '10001', idType: 'CODE', employeeCode: '10001', lastName: 'Бат', firstName: 'Батаа' }),
    ], EMPS);
    expect([a.employeeCode, a.direction, a.errors, a.warnings]).toEqual(['10001', 'ARRIVAL', [], undefined]);
    expect([b.employeeCode, b.direction, b.date]).toEqual(['08101', 'DEPARTURE', '2026-11-05']);
    expect(c.warnings).toEqual(['Нэр зөрүүтэй: файлд «Бат Батаа», системд «Бат Болд»']);
    expect(a.source).toMatchObject({ sheet: '2026.11.04 A ирэх', idRaw: '10001', idType: 'CODE', crew: 'A' });
    expect(a.row).toBe(1);
  });

  it('код системд алга → нэрээр тулгаж анхааруулга; нэрээр ч олдохгүй → planner-ийн алдаа (код хэвээр)', () => {
    const [a, b] = resolveShiftChange([
      row({ idRaw: '19999', idType: 'CODE', employeeCode: '19999', lastName: 'Бат', firstName: 'Болд' }),
      row({ idRaw: '19998', idType: 'CODE', employeeCode: '19998', lastName: 'Үгүй', firstName: 'Хүн' }),
    ], EMPS);
    expect([a.employeeCode, a.warnings]).toEqual(['10001', ['Файлын ID 19999 системд алга — нэрээр 10001 кодтой ажилтантай тулгав']]);
    expect([b.employeeCode, b.errors]).toEqual(['19998', []]);
  });

  it('NEW / гэрээт / хоосон → нэрээр; давхардвал, олдохгүй бол алдаа; гарсан ажилтан → код (planner идэвхгүй гэнэ)', () => {
    const rows = resolveShiftChange([
      row({ idRaw: 'TIRE', idType: 'CONTRACTOR', lastName: 'Харуул', firstName: 'Эрдэнэ' }),
      row({ idRaw: 'NEW', idType: 'NEW', lastName: 'Шинэ', firstName: 'Ажилтан' }),
      row({ idRaw: '', idType: 'EMPTY', lastName: 'Ганаа', firstName: 'Туяа' }),
      row({ idRaw: 'ACCL', idType: 'CONTRACTOR', lastName: 'Үл', firstName: 'Мэдэгдэх' }),
      row({ idRaw: '', idType: 'EMPTY', lastName: 'Цэрэн', firstName: 'Дулам' }),
    ], EMPS);
    expect(rows.map((r) => [r.employeeCode, r.errors])).toEqual([
      ['Z0001', []],
      ['', ['Шинэ ажилтан (Шинэ Ажилтан, ID «NEW») бүртгэлд алга']],
      ['', ['Ижил нэртэй хэд хэдэн ажилтан (10002, 10003) — ID-г файлд бөглөнө үү']],
      ['', ['Ажилтан (Үл Мэдэгдэх, ID «ACCL») бүртгэлд алга']],
      ['09001', []],
    ]);
  });

  it('Сунах → action EXTEND, direction null, хоног source-д', () => {
    const [r] = resolveShiftChange([
      row({ kind: 'EXTEND', sheet: '2026.11.05 Сунах', date: '2026-11-05', idRaw: '10001', idType: 'CODE', employeeCode: '10001', lastName: 'Бат', firstName: 'Болд', extendDays: 7 }),
    ], EMPS);
    expect([r.action, r.direction, r.source?.extendDays]).toEqual(['EXTEND', null, 7]);
  });

  it('идэвхтэй + гарсан ижил код → идэвхтэй нь давуу', () => {
    const [r] = resolveShiftChange([row({ idRaw: '10001', idType: 'CODE', employeeCode: '10001', lastName: 'Бат', firstName: 'Болд' })], [
      emp('10001', 'Бат', 'Болд', CampEmployeeStatus.TERMINATED), emp('10001', 'Бат', 'Болд'),
    ]);
    expect([r.employeeCode, r.warnings]).toEqual(['10001', undefined]);
  });
});
