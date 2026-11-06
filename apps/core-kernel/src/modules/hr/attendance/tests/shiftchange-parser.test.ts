import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  classifyId, extendDaysOf, isAttendanceTemplate, loadXlsx, parseShiftChangeWorkbook, sheetDate, sheetKind,
} from '../shiftchange-parser';

/** 20261104_ShiftChange-ийн бүтэцтэй зохиомол файл (хувийн мэдээлэлгүй) */
function sheet(wb: ExcelJS.Workbook, name: string, title: string, header: string[], rows: unknown[][]) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]);
  ws.mergeCells(1, 1, 1, header.length);
  ws.addRow(header);
  ws.addRow([]); // толгой 2–3-р мөр нэгтгэсэн
  ws.mergeCells(2, 2, 3, 2);
  ws.mergeCells(2, 3, 3, 3);
  rows.forEach((r) => ws.addRow(r));
  return ws;
}
const H = ['Д/д', 'Shift', 'ID', 'Ажилтны овог', 'Ажилтны нэр', 'Албан тушаал', 'Хэлтэс'];
const H_ARR = ['Д/д', 'Shift', 'ID', 'Ажилтны овог', 'Ажилтны нэр', 'Албан тушаал', 'Тэмдэглэл\n/Чөлөө, ээлжийн амралт, +бусад/', 'Утасны дугаар', 'Хэлтэс'];

async function roundTrip(wb: ExcelJS.Workbook) {
  return loadXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
}

describe('shiftchange-parser — туслах функц', () => {
  it('огноо: хуудасны нэр → гарчиг; буруу огноо алгасна', () => {
    expect(sheetDate('2026.11.05 Сунах')).toBe('2026-11-05');
    expect(sheetDate('C ээлж', '2026.10.14-нд ирэх')).toBe('2026-10-14');
    expect(sheetDate('2026.02.30 A ирэх', 'гарчиг')).toBeNull();
  });
  it('төрөл: ирэх / буух / сунах; нэр зөрвөл гарчгаар; ЗОХИЦУУЛАЛТ, чөлөө алгасна', () => {
    expect(sheetKind('2026.11.04 A ирэх', '')).toBe('ARRIVAL');
    expect(sheetKind('2026.11.05 D буух', '')).toBe('DEPARTURE');
    expect(sheetKind('2026.11.05 Сунах', '')).toBe('EXTEND');
    expect(sheetKind('2026.10.14 C ээлж', '2026.10.14-нд ирэх "C ээлж"-ийн ажилтнууд')).toBe('ARRIVAL');
    expect(sheetKind('ЗОХИЦУУЛАЛТ 2026.10.21', 'A ЭЭЛЖИЙН СУНАЖ АЖИЛЛАХ /OVERTIME/')).toBe('LEGACY_ADJUSTMENT');
    expect(sheetKind('2026.08.12 А чөлөө ', '')).toBe('LEAVE');
    expect(sheetKind('Sheet1', 'жагсаалт')).toBe('UNKNOWN_KIND');
  });
  it('ID: 4 орон → 5 орон (D-2), NEW, гэрээт, хоосон', () => {
    expect(classifyId('8101')).toEqual({ idType: 'CODE', employeeCode: '08101' });
    expect(classifyId(' 12345 ')).toEqual({ idType: 'CODE', employeeCode: '12345' });
    expect(classifyId('NEW')).toEqual({ idType: 'NEW', employeeCode: null });
    expect(classifyId('NEW12')).toEqual({ idType: 'NEW', employeeCode: null });
    expect(classifyId('ACCL')).toEqual({ idType: 'CONTRACTOR', employeeCode: null });
    expect(classifyId('МАК')).toEqual({ idType: 'CONTRACTOR', employeeCode: null });
    expect(classifyId('123')).toEqual({ idType: 'CONTRACTOR', employeeCode: null });
    expect(classifyId('')).toEqual({ idType: 'EMPTY', employeeCode: null });
  });
  it('сунах хоног: «07 ХОНОГ», «14 хоног …»; үгүй бол null', () => {
    expect(extendDaysOf('07 ХОНОГ')).toBe(7);
    expect(extendDaysOf('14 хоног сунах')).toBe(14);
    expect(extendDaysOf('OVERTIME')).toBeNull();
    expect(extendDaysOf('0 хоног')).toBeNull();
  });
});

describe('shiftchange-parser — файл', () => {
  it('үндсэн загвар (ирэх / буух / сунах) + хуучин ЗОХИЦУУЛАЛТ, чөлөө алгасна', async () => {
    const wb = new ExcelJS.Workbook();
    sheet(wb, '2026.11.05 Сунах', '2026.11.05-с Сунаж байгаа ажилтнуудын нэрс', H, [
      [1, 'D', 10001, 'Овог1', 'Нэр1', 'Оператор', 'Уурхай'],
      [2, 'D', 8101, 'Овог2', 'Нэр2', 'Жолооч', 'Тээвэр'],
    ]);
    sheet(wb, '2026.11.05 D буух', '2026.11.05-нд буух "D ээлж"-ийн ажилтнууд', H, [
      [1, 'D', 10003, 'Овог3', 'Нэр3', 'Механик', 'Засвар'],
      [2, 'TIRE', 'TIRE', 'Овог4', 'Нэр4', 'Дугуйчин', ''],
      [3, null, '', '', '', '', ''], // хоосон
    ]);
    sheet(wb, '2026.11.04 A ирэх', '2026.11.04-нд ирэх "А ээлж"-ийн ажилтнууд', H_ARR, [
      [1, 'A', 10005, 'Овог5', 'Нэр5 (215)', 'Тогооч', 'Автобусаар', 99119911, 'Катеринг'],
      [2, null, 'NEW', 'Овог6', 'Нэр6', 'Туслах', 'Хувиараа', '', 'Катеринг'],
      [3, 'Ээлжгүй', '', 'Овог7', 'Нэр7', 'Харуул', '', '', ''],
    ]);
    sheet(wb, 'ЗОХИЦУУЛАЛТ 2026.10.21', 'A ЭЭЛЖИЙН СУНАЖ АЖИЛЛАХ АЖИЛТНУУДЫН НЭРС /OVERTIME/', [...H.slice(0, 6), 'Ээлж', 'Тайлбар'], [
      [1, 'A', 10009, 'Овог9', 'Нэр9', 'Оператор', 'ШӨНИЙН ЭЭЛЖ', '07 ХОНОГ'],
    ]);
    sheet(wb, '2026.08.12 А чөлөө', 'чөлөө авсан ажилтнууд', H, [[1, 'A', 10010, 'Овог10', 'Нэр10', 'x', 'y']]);

    const res = parseShiftChangeWorkbook(await roundTrip(wb));
    expect(res.skipped).toEqual([
      { sheet: 'ЗОХИЦУУЛАЛТ 2026.10.21', reason: 'LEGACY_ADJUSTMENT' },
      { sheet: '2026.08.12 А чөлөө', reason: 'LEAVE' },
    ]);
    expect(res.rows.map((r) => [r.sheet, r.row, r.kind, r.date, r.idType, r.employeeCode, r.crew, r.extendDays])).toEqual([
      ['2026.11.05 Сунах', 4, 'EXTEND', '2026-11-05', 'CODE', '10001', 'D', null],
      ['2026.11.05 Сунах', 5, 'EXTEND', '2026-11-05', 'CODE', '08101', 'D', null],
      ['2026.11.05 D буух', 4, 'DEPARTURE', '2026-11-05', 'CODE', '10003', 'D', null],
      ['2026.11.05 D буух', 5, 'DEPARTURE', '2026-11-05', 'CONTRACTOR', null, 'TIRE', null],
      ['2026.11.04 A ирэх', 4, 'ARRIVAL', '2026-11-04', 'CODE', '10005', 'A', null],
      ['2026.11.04 A ирэх', 5, 'ARRIVAL', '2026-11-04', 'NEW', null, null, null],
      ['2026.11.04 A ирэх', 6, 'ARRIVAL', '2026-11-04', 'EMPTY', null, 'Ээлжгүй', null],
    ]);
    const arr = res.rows[4];
    expect([arr.lastName, arr.firstName, arr.position, arr.department, arr.note]).toEqual(['Овог5', 'Нэр5 (215)', 'Тогооч', 'Катеринг', 'Автобусаар']);
  });

  it('нэг хуудсанд давтагдсан толгой + гарчиг; сунах тэмдэглэлээс хоног', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = sheet(wb, '2026.11.19 Сунах', 'Сунаж байгаа ажилтнууд', [...H, 'Тэмдэглэл'], [
      [1, 'B', 20001, 'О1', 'Н1', 'x', 'y', '07 ХОНОГ'],
    ]);
    ws.addRow(['Бусад хэлтэс']);
    ws.addRow(['Д/д', 'ID', 'Shift', 'Ажилтны овог', 'Ажилтны нэр', 'Тэмдэглэл']); // багана өөр дараалалтай
    ws.addRow([1, 20002, 'B', 'О2', 'Н2', '14 хоног']);
    const res = parseShiftChangeWorkbook(await roundTrip(wb));
    expect(res.rows.map((r) => [r.row, r.employeeCode, r.crew, r.lastName, r.extendDays])).toEqual([
      [4, '20001', 'B', 'О1', 7],
      [7, '20002', 'B', 'О2', 14],
    ]);
  });

  it('огноогүй / толгойгүй хуудас алгасна; мөргүй бол алдаа', async () => {
    const wb = new ExcelJS.Workbook();
    sheet(wb, 'D буух', 'буух ажилтнууд', H, [[1, 'D', 10001, 'О', 'Н', 'x', 'y']]);
    const ws = wb.addWorksheet('2026.11.05 D буух');
    ws.addRow(['буух']);
    ws.addRow(['Овог', 'Нэр']);
    await expect(async () => parseShiftChangeWorkbook(await roundTrip(wb))).rejects.toMatchObject({ response: { code: 'camp.err.import_parser.6' } });
  });

  it('«Ирц» загвар эсэхийг таних', async () => {
    const a = new ExcelJS.Workbook();
    a.addWorksheet('Ирц').addRow(['employee_code', 'date', 'direction']);
    const b = new ExcelJS.Workbook();
    sheet(b, '2026.11.05 D буух', 'буух', H, [[1, 'D', 10001, 'О', 'Н', 'x', 'y']]);
    expect(isAttendanceTemplate(await roundTrip(a))).toBe(true);
    expect(isAttendanceTemplate(await roundTrip(b))).toBe(false);
  });

  it('xlsx биш файл → алдаа', async () => {
    await expect(loadXlsx(Buffer.from('hello'))).rejects.toMatchObject({ response: { code: 'camp.err.import_parser.1' } });
  });
});
