import { CampDataImportType } from '@prisma/client';
import { CellValue, TableSpec } from '../../../common/xlsx/table-spec';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { ApplyCtx, DataImportHandler, has, PlannedRow, upper } from './import-types';

/**
 * FB-02 — Хэлтэс: Excel / хүснэгтээр оруулах, шинэчлэх (кодоор), экспорт.
 * Хоол идэх байршил = тухайн кемпийн байршлын НЭР (шинэ хэлтэст заавал). Ээлжийн загвар импортод орохгүй (маягтаар).
 */
const CODE = /^[A-Za-z0-9._-]+$/;
const DEPT_AUDIT_FIELDS = ['code', 'name', 'mealLocationId', 'isActive'] as const;

export const DEPARTMENTS_SPEC: TableSpec = {
  type: 'departments',
  title: 'table.departments',
  keyColumn: 'code',
  columns: [
    { key: 'code', label: 'col.department.code', type: 'text', required: true, maxLength: 30, pattern: CODE, aliases: ['code', 'код', 'department_code'], examples: ['KITCHEN', 'ENG'] },
    { key: 'name', label: 'col.department.name', type: 'text', required: true, maxLength: 200, aliases: ['name', 'нэр', 'хэлтэс'], examples: ['Гал тогоо', 'Инженерийн хэлтэс'], width: 26 },
    { key: 'mealLocation', label: 'col.department.meal_location', type: 'text', maxLength: 200, aliases: ['meal_location', 'хоолны байршил', 'байршил'], examples: ['Гал тогоо', 'Гал тогоо'], width: 22 },
    { key: 'active', label: 'col.department.active', type: 'bool', aliases: ['active', 'is_active', 'идэвхтэй', 'төлөв'], examples: [true, true] },
  ],
};

type Res = { mealLocationId?: string };
const RESOLVED = Symbol('resolved');
type WithResolved = PlannedRow & { [RESOLVED]?: Res };

const SELECT = { id: true, code: true, name: true, mealLocationId: true, isActive: true } as const;

export const departmentsHandler: DataImportHandler = {
  type: CampDataImportType.DEPARTMENTS,
  spec: DEPARTMENTS_SPEC,
  permission: CAMP_PERMISSIONS.MASTER_MANAGE,

  async plan(tx, ctx, rows) {
    const [depts, locs, activeCounts] = await Promise.all([
      tx.campDepartment.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: SELECT }),
      tx.campMealLocation.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, name: true, isActive: true } }),
      tx.campEmployee.groupBy({ by: ['departmentId'], where: { tenantId: ctx.tenantId, campId: ctx.campId, status: 'ACTIVE' }, _count: { _all: true } }),
    ]);
    const byCode = new Map(depts.map((d) => [d.code.toUpperCase(), d]));
    const locByName = new Map(locs.map((l) => [l.name.trim().toUpperCase(), l]));
    const locName = new Map(locs.map((l) => [l.id, l.name]));
    const active = new Map(activeCounts.map((c) => [c.departmentId, c._count._all]));

    return rows.map((r): WithResolved => {
      const v = r.values;
      const errors = [...r.errors];
      const cur = byCode.get(upper(v.code));
      const res: Res = {};
      if (has(r, 'mealLocation') && v.mealLocation) {
        const l = locByName.get(upper(v.mealLocation));
        if (!l) errors.push({ column: 'mealLocation', code: 'row.ref_not_found', params: { value: String(v.mealLocation) } });
        else if (!l.isActive && l.id !== cur?.mealLocationId) errors.push({ column: 'mealLocation', code: 'row.ref_inactive', params: { value: String(v.mealLocation) } });
        else res.mealLocationId = l.id;
      } else if (!cur && errors.length === 0) {
        errors.push({ column: 'mealLocation', code: 'row.required' });
      }
      if (cur && v.active === false && cur.isActive && (active.get(cur.id) ?? 0) > 0) {
        errors.push({ column: 'active', code: 'row.dept_has_active', params: { n: active.get(cur.id) ?? 0 } });
      }
      if (errors.length > 0) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create', [RESOLVED]: res };
      const changes: Record<string, { from: CellValue; to: CellValue }> = {};
      if (has(r, 'name') && v.name !== cur.name) changes.name = { from: cur.name, to: v.name };
      if (res.mealLocationId && res.mealLocationId !== cur.mealLocationId) changes.mealLocation = { from: locName.get(cur.mealLocationId) ?? null, to: String(v.mealLocation) };
      if (has(r, 'active') && v.active !== null && v.active !== cur.isActive) changes.active = { from: cur.isActive, to: v.active };
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: cur.id, changes, [RESOLVED]: res };
    });
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    const audits: Parameters<ApplyCtx['audit']['recordMany']>[1] = [];
    for (const row of rows as WithResolved[]) {
      const v = row.values;
      const res = row[RESOLVED] ?? {};
      if (row.op === 'create') {
        const d = await tx.campDepartment.create({
          data: { tenantId: ctx.tenantId, campId: ctx.campId, code: String(v.code), name: String(v.name), mealLocationId: res.mealLocationId!, isActive: v.active !== false },
          select: SELECT,
        });
        created++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'department', entityId: d.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: DEPT_AUDIT_FIELDS, before: null, after: d, summaryParams: { code: d.code, name: d.name } });
      } else if (row.op === 'update' && row.targetId) {
        const before = await tx.campDepartment.findFirst({ where: { id: row.targetId, tenantId: ctx.tenantId, campId: ctx.campId }, select: SELECT });
        if (!before) continue;
        const after = await tx.campDepartment.update({
          where: { id: row.targetId },
          data: {
            ...(has(row, 'name') && v.name ? { name: String(v.name) } : {}),
            ...(res.mealLocationId ? { mealLocationId: res.mealLocationId } : {}),
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
    const rows = await tx.campDepartment.findMany({
      where: { tenantId: ctx.tenantId, campId: ctx.campId },
      select: { code: true, name: true, isActive: true, mealLocation: { select: { name: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((d) => ({ code: d.code, name: d.name, mealLocation: d.mealLocation.name, active: d.isActive }));
  },
};
