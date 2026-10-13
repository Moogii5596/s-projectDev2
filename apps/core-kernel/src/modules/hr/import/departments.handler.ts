import { CampDataImportType } from '@prisma/client';
import { CellValue, TableSpec } from '../../../common/xlsx/table-spec';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { ApplyCtx, DataImportHandler, has, PlannedRow, upper } from './import-types';

/**
 * FB-02 — Хэлтэс: Excel / хүснэгтээр оруулах, шинэчлэх (кодоор), экспорт.
 * v0.2.1 (Q1): хоолны байршил хэлтсээс хасагдсан (ажилтан / албан тушаал) — хуучин файлын "хоолны байршил" багана үл тоогдоно.
 * Ээлжийн загвар импортод орохгүй (маягтаар).
 */
const CODE = /^[A-Za-z0-9._-]+$/;
const DEPT_AUDIT_FIELDS = ['code', 'name', 'isActive'] as const;

export const DEPARTMENTS_SPEC: TableSpec = {
  type: 'departments',
  title: 'table.departments',
  keyColumn: 'code',
  columns: [
    { key: 'code', label: 'col.department.code', type: 'text', required: true, maxLength: 30, pattern: CODE, aliases: ['code', 'код', 'department_code'], examples: ['KITCHEN', 'ENG'] },
    { key: 'name', label: 'col.department.name', type: 'text', required: true, maxLength: 200, aliases: ['name', 'нэр', 'хэлтэс'], examples: ['Гал тогоо', 'Инженерийн хэлтэс'], width: 26 },
    { key: 'active', label: 'col.department.active', type: 'bool', aliases: ['active', 'is_active', 'идэвхтэй', 'төлөв'], examples: [true, true] },
  ],
};

const SELECT = { id: true, code: true, name: true, isActive: true } as const;

export const departmentsHandler: DataImportHandler = {
  type: CampDataImportType.DEPARTMENTS,
  spec: DEPARTMENTS_SPEC,
  permission: CAMP_PERMISSIONS.MASTER_MANAGE,

  async plan(tx, ctx, rows) {
    const [depts, activeCounts] = await Promise.all([
      tx.hrDepartment.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: SELECT }),
      tx.hrEmployee.groupBy({ by: ['departmentId'], where: { tenantId: ctx.tenantId, campId: ctx.campId, status: 'ACTIVE' }, _count: { _all: true } }),
    ]);
    const byCode = new Map(depts.map((d) => [d.code.toUpperCase(), d]));
    const active = new Map(activeCounts.map((c) => [c.departmentId, c._count._all]));

    return rows.map((r): PlannedRow => {
      const v = r.values;
      const errors = [...r.errors];
      const cur = byCode.get(upper(v.code));
      if (cur && v.active === false && cur.isActive && (active.get(cur.id) ?? 0) > 0) {
        errors.push({ column: 'active', code: 'row.dept_has_active', params: { n: active.get(cur.id) ?? 0 } });
      }
      if (errors.length > 0) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create' };
      const changes: Record<string, { from: CellValue; to: CellValue }> = {};
      if (has(r, 'name') && v.name !== cur.name) changes.name = { from: cur.name, to: v.name };
      if (has(r, 'active') && v.active !== null && v.active !== cur.isActive) changes.active = { from: cur.isActive, to: v.active };
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: cur.id, changes };
    });
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    const audits: Parameters<ApplyCtx['audit']['recordMany']>[1] = [];
    for (const row of rows) {
      const v = row.values;
      if (row.op === 'create') {
        const d = await tx.hrDepartment.create({
          data: { tenantId: ctx.tenantId, campId: ctx.campId, code: String(v.code), name: String(v.name), isActive: v.active !== false },
          select: SELECT,
        });
        created++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'department', entityId: d.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: DEPT_AUDIT_FIELDS, before: null, after: d, summaryParams: { code: d.code, name: d.name } });
      } else if (row.op === 'update' && row.targetId) {
        const before = await tx.hrDepartment.findFirst({ where: { id: row.targetId, tenantId: ctx.tenantId, campId: ctx.campId }, select: SELECT });
        if (!before) continue;
        const after = await tx.hrDepartment.update({
          where: { id: row.targetId },
          data: {
            ...(has(row, 'name') && v.name ? { name: String(v.name) } : {}),
            ...(has(row, 'active') && v.active !== null ? { isActive: Boolean(v.active) } : {}),
          },
          select: SELECT,
        });
        updated++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'department', entityId: after.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: DEPT_AUDIT_FIELDS, before, after, summaryParams: { code: after.code, name: after.name } });
      }
    }
    await ctx.audit.recordMany(tx, audits);
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.hrDepartment.findMany({
      where: { tenantId: ctx.tenantId, campId: ctx.campId },
      select: { code: true, name: true, isActive: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((d) => ({ code: d.code, name: d.name, active: d.isActive }));
  },
};
