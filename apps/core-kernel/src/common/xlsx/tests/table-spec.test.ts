import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { HttpException } from '@nestjs/common';
import { i18nStorage } from '../../i18n/i18n-context';
import { buildExport, buildTemplate, coerceCell, parseTableRows, parseTableXlsx, TableSpec } from '../table-spec';
import { EMPLOYEES_SPEC } from '../../../modules/camp/data/employees.handler';
import { DEPARTMENTS_SPEC } from '../../../modules/camp/data/departments.handler';

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const errCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return ((e as HttpException).getResponse() as { code: string }).code;
  }
  return 'no-error';
};

describe('coerceCell', () => {
  const col = (o: Partial<TableSpec['columns'][number]>) => ({ key: 'k', label: 'col.room.floor' as const, type: 'text' as const, ...o });
  it('заавал хоосон → row.required; заавал биш хоосон → null', () => {
    expect(coerceCell(col({ required: true }), '  ').error?.code).toBe('row.required');
    expect(coerceCell(col({}), '')).toEqual({ value: null });
  });
  it('int: "12" → 12, "1.5" → bad_int, муж', () => {
    expect(coerceCell(col({ type: 'int' }), '12').value).toBe(12);
    expect(coerceCell(col({ type: 'int' }), '1.5').error?.code).toBe('row.bad_int');
    expect(coerceCell(col({ type: 'int', min: 1, max: 9 }), 10).error?.code).toBe('row.out_of_range');
  });
  it('enum: утга, mn/en/zh шошго, том жижиг үсэг', () => {
    const status = EMPLOYEES_SPEC.columns.find((c) => c.key === 'status')!;
    for (const v of ['ACTIVE', 'active', 'Идэвхтэй', 'Active', '在职']) expect(coerceCell(status, v).value).toBe('ACTIVE');
    expect(coerceCell(status, 'fired').error).toMatchObject({ code: 'row.bad_enum', params: { allowed: 'ACTIVE, INACTIVE' } });
  });
  it('phone: зай/зураас арилгана, 8 орон эсвэл +код; email жижиг үсгээр', () => {
    const phone = EMPLOYEES_SPEC.columns.find((c) => c.key === 'phone')!;
    expect(coerceCell(phone, '9911-2233').value).toBe('99112233');
    expect(coerceCell(phone, '+86 138 0013 8000').value).toBe('+8613800138000');
    expect(coerceCell(phone, '991122').error?.code).toBe('row.bad_phone');
    const email = EMPLOYEES_SPEC.columns.find((c) => c.key === 'email')!;
    expect(coerceCell(email, 'A@B.MN').value).toBe('a@b.mn');
    expect(coerceCell(email, 'a@b').error?.code).toBe('row.bad_email');
  });
  it('bool: Тийм/Үгүй/是/否/true/0', () => {
    const active = DEPARTMENTS_SPEC.columns.find((c) => c.key === 'active')!;
    expect(['Тийм', '是', 'true', 'YES'].map((v) => coerceCell(active, v).value)).toEqual([true, true, true, true]);
    expect(['Үгүй', '否', '0'].map((v) => coerceCell(active, v).value)).toEqual([false, false, false]);
  });
});

describe('parseTableXlsx', () => {
  it('толгойг 3 хэл/кодоор таньна, байхгүй багана → values-д түлхүүр алга, хоосон мөр алгасна, файлын давхар код', async () => {
    const buf = await xlsx([
      ['员工编号', 'Full name', 'Байгууллага', 'department'],
      ['E1', 'A', 'R1', 'ADM'],
      [null, null, null, null],
      ['e1', 'B', 'R1', 'ADM'],
    ]);
    const rows = await parseTableXlsx(buf, EMPLOYEES_SPEC);
    expect(rows.map((r) => r.row)).toEqual([2, 4]);
    expect(rows[0].values).toEqual({ employeeCode: 'E1', fullName: 'A', organization: 'R1', department: 'ADM' });
    expect('phone' in rows[0].values).toBe(false);
    expect(rows[1].errors).toEqual([{ column: 'employeeCode', code: 'row.duplicate_in_file', params: { value: 'e1', first: 2 } }]);
  });
  it('файлын алдаа: заавал багана, .xlsx биш, хоосон, хэт олон мөр', async () => {
    expect(await errCode(parseTableXlsx(await xlsx([['Full name'], ['x']]), EMPLOYEES_SPEC))).toBe('import.missing_columns');
    expect(await errCode(parseTableXlsx(Buffer.from('hello world'), EMPLOYEES_SPEC))).toBe('import.not_xlsx');
    expect(await errCode(parseTableXlsx(await xlsx([['code', 'name']]), DEPARTMENTS_SPEC))).toBe('import.empty');
    const many = [['code', 'name'], ...Array.from({ length: 5001 }, (_, i) => [`D${i}`, 'n'])];
    expect(await errCode(parseTableXlsx(await xlsx(many), DEPARTMENTS_SPEC))).toBe('import.too_many_rows');
  });
  it('5000 мөр зөвшөөрнө', async () => {
    const ok = [['code', 'name'], ...Array.from({ length: 5000 }, (_, i) => [`D${i}`, 'n'])];
    expect(await parseTableXlsx(await xlsx(ok), DEPARTMENTS_SPEC)).toHaveLength(5000);
  });
});

describe('parseTableRows (хүснэгтээр)', () => {
  it('мэдэхгүй түлхүүрийг хаяна, мөрийн дугаар = индекс + 2, хоосон мөр алгасна', () => {
    const rows = parseTableRows([{ code: 'A', name: 'x', hack: 1 }, { code: '', name: '' }, { code: 'B!', name: 'y' }], DEPARTMENTS_SPEC);
    expect(rows.map((r) => r.row)).toEqual([2, 4]);
    expect(rows[0].values).toEqual({ code: 'A', name: 'x' });
    expect(rows[1].errors[0]).toMatchObject({ column: 'code', code: 'row.bad_format' });
  });
});

describe('buildTemplate / buildExport', () => {
  it('загвар: толгой хэлээр, жишээ мөр, Заавар хуудас; экспорт → буцааж уншихад ижил утга', async () => {
    const tpl = await buildTemplate(DEPARTMENTS_SPEC, 'zh');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tpl as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['部门', '说明']);
    expect(wb.worksheets[0].getRow(1).getCell(1).value).toBe('部门编码');
    expect(wb.worksheets[0].getRow(2).getCell(1).value).toBe('KITCHEN');
    expect(wb.worksheets[0].getCell('C2').dataValidation?.type).toBe('list');

    const exp = await buildExport(EMPLOYEES_SPEC, [
      { employeeCode: 'E1', fullName: 'Бат', position: null, phone: '99112233', email: null, organization: 'R1', department: 'ADM', crew: null, status: 'INACTIVE' },
    ], 'en');
    const back = await parseTableXlsx(exp, EMPLOYEES_SPEC);
    expect(back[0].values).toMatchObject({ employeeCode: 'E1', phone: '99112233', status: 'INACTIVE', crew: null });
    expect(back[0].errors).toEqual([]);
  });

  it('байгууллагын орчуулгын засвартай толгойг ч таньна (засвар → загвар → импорт эвдрэхгүй)', async () => {
    const overrides = new Map([['mn:col.department.code', 'Код (хэлтэс)']]);
    await i18nStorage.run({ lang: 'mn', overrides }, async () => {
      const tpl = await buildTemplate(DEPARTMENTS_SPEC);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(tpl as unknown as ArrayBuffer);
      expect(wb.worksheets[0].getRow(1).getCell(1).value).toBe('Код (хэлтэс)');
      const rows = await parseTableXlsx(tpl, DEPARTMENTS_SPEC);
      expect(rows[0].values.code).toBe('KITCHEN');
    });
  });
});
