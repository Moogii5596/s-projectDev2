import { CampDataImportType, CampEmployeeStatus } from '@prisma/client';
import { CellValue, ParsedTableRow, TableSpec } from '../../../common/xlsx/table-spec';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { Tx } from '../common/camp-tx';
import { EMPLOYEE_AUDIT_FIELDS } from '../master/camp-employees.service';
import { normName, resolvePositionByName } from '../catalog/camp-catalog.service';
import { ApplyCtx, DataImportHandler, has, ImportCtx, PlannedRow, upper } from './import-types';

/**
 * FB-08 — Ажилтан: Excel / хүснэгтээр оруулах, шинэчлэх (кодоор), экспорт.
 * Код tenant дотор давхардахгүй (uq_camp_employees_code): өөр кемпийнх бол алдаа, энэ кемпийнх бол ШИНЭЧЛЭХ.
 * Байгууллага = регистр (давуу) эсвэл нэр; хэлтэс, ростер = тухайн кемпийн код. Ростер хоосон = ростергүй.
 * v0.2.1: албан тушаал = каталогийн нэр (байхгүй бол баталгаажуулахад каталогт нэмнэ); ажлын хоолны байршил = кемпийн
 * байршлын нэр, хоол авах = тийм/үгүй — хоосон = ажилтан дээр тохируулахгүй (албан тушаал / кемпийн анхдагч).
 */
export const EMPLOYEES_SPEC: TableSpec = {
  type: 'employees',
  title: 'table.employees',
  keyColumn: 'employeeCode',
  columns: [
    { key: 'employeeCode', label: 'col.employee.code', type: 'text', required: true, maxLength: 50, aliases: ['employee_code', 'code', 'код', 'ажилтны код'], examples: ['E-1041', 'E-1042'], width: 16 },
    { key: 'fullName', label: 'col.employee.full_name', type: 'text', required: true, maxLength: 200, aliases: ['full_name', 'name', 'нэр', 'овог нэр'], examples: ['Бат-Эрдэнэ Ганболд', 'Li Wei'], width: 26 },
    { key: 'position', label: 'col.employee.position', type: 'text', maxLength: 100, aliases: ['position', 'албан тушаал'], examples: ['Тогооч', 'Инженер'] },
    { key: 'mealLocation', label: 'col.employee.meal_location', type: 'text', maxLength: 200, aliases: ['meal_location', 'work_meal_location', 'хоолны байршил', 'ажлын хоолны байршил'], examples: [null, 'Уулын хэсэг'], width: 20 },
    { key: 'mealsIncluded', label: 'col.employee.meals_included', type: 'bool', aliases: ['meals_included', 'meals', 'хоол авах', 'хоолтой'], examples: [null, true] },
    { key: 'phone', label: 'col.employee.phone', type: 'phone', aliases: ['phone', 'утас', 'утасны дугаар'], examples: ['99112233', '+8613800138000'], width: 16 },
    { key: 'email', label: 'col.employee.email', type: 'email', maxLength: 254, aliases: ['email', 'e-mail', 'имэйл', 'и-мэйл'], examples: ['ganbold@mail.mn', null], width: 24 },
    { key: 'organization', label: 'col.employee.organization', type: 'text', required: true, maxLength: 200, aliases: ['organization', 'org', 'байгууллага', 'регистр'], examples: ['2001234', '2001234'], width: 24 },
    { key: 'department', label: 'col.employee.department', type: 'text', required: true, maxLength: 30, aliases: ['department', 'dept', 'хэлтэс'], examples: ['KITCHEN', 'ENG'] },
    { key: 'crew', label: 'col.employee.crew', type: 'text', maxLength: 30, aliases: ['crew', 'roster', 'ростер', 'баг'], examples: ['A', null] },
    {
      key: 'status', label: 'col.employee.status', type: 'enum', aliases: ['status', 'төлөв'],
      enumValues: { ACTIVE: 'enum.employee_status.ACTIVE', INACTIVE: 'enum.employee_status.INACTIVE' },
      examples: ['ACTIVE', 'ACTIVE'],
    },
  ],
};

type Current = {
  id: string; campId: string; employeeCode: string; fullName: string; position: string | null; phone: string | null; email: string | null;
  status: CampEmployeeStatus; organizationId: string; departmentId: string; crewId: string | null;
  positionId: string | null; mealLocationId: string | null; mealsIncluded: boolean | null;
};
type Resolved = { organizationId?: string; departmentId?: string; crewId?: string | null; mealLocationId?: string | null; position?: string | null };

const RESOLVED = Symbol('resolved');
type WithResolved = PlannedRow & { [RESOLVED]?: Resolved };

const EMP_SELECT = {
  id: true, campId: true, employeeCode: true, fullName: true, position: true, phone: true, email: true, status: true,
  organizationId: true, departmentId: true, crewId: true, positionId: true, mealLocationId: true, mealsIncluded: true,
} as const;

async function loadRefs(tx: Tx, ctx: ImportCtx, codes: string[]) {
  const [existing, depts, crews, orgs, camps, positions, locs] = await Promise.all([
    codes.length
      ? tx.campEmployee.findMany({ where: { tenantId: ctx.tenantId, employeeCode: { in: codes, mode: 'insensitive' } }, select: EMP_SELECT })
      : Promise.resolve([] as Current[]),
    tx.campDepartment.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true, isActive: true } }),
    tx.campCrew.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true, isActive: true } }),
    tx.campOrganization.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, regNumber: true, isActive: true } }),
    tx.camp.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
    tx.campPosition.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, isActive: true } }),
    tx.campMealLocation.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, name: true, isActive: true } }),
  ]);
  return {
    existing: new Map(existing.map((e) => [e.employeeCode.toUpperCase(), e as Current])),
    depts: new Map(depts.map((d) => [d.code.toUpperCase(), d])),
    deptById: new Map(depts.map((d) => [d.id, d.code])),
    crews: new Map(crews.map((c) => [c.code.toUpperCase(), c])),
    crewById: new Map(crews.map((c) => [c.id, c.code])),
    orgsByReg: new Map(orgs.filter((o) => o.regNumber).map((o) => [o.regNumber!.toUpperCase(), o])),
    orgsByName: orgs.reduce((m, o) => m.set(o.name.toUpperCase(), [...(m.get(o.name.toUpperCase()) ?? []), o]), new Map<string, typeof orgs>()),
    orgById: new Map(orgs.map((o) => [o.id, o])),
    campCode: new Map(camps.map((c) => [c.id, c.code])),
    positions: new Map(positions.map((p) => [normName(p.name), p])),
    locs: new Map(locs.map((l) => [l.name.trim().toUpperCase(), l])),
    locById: new Map(locs.map((l) => [l.id, l.name])),
  };
}

export const employeesHandler: DataImportHandler = {
  type: CampDataImportType.EMPLOYEES,
  spec: EMPLOYEES_SPEC,
  permission: CAMP_PERMISSIONS.EMPLOYEE_MANAGE,

  async plan(tx, ctx, rows) {
    const codes = rows.map((r) => r.values.employeeCode).filter((c): c is string => typeof c === 'string' && c !== '');
    const refs = await loadRefs(tx, ctx, codes);

    return rows.map((r): WithResolved => {
      const errors = [...r.errors];
      const v = r.values;
      const resolved: Resolved = {};
      const cur = refs.existing.get(upper(v.employeeCode));
      if (cur && cur.campId !== ctx.campId) {
        errors.push({ column: 'employeeCode', code: 'row.code_other_camp', params: { value: String(v.employeeCode), camp: refs.campCode.get(cur.campId) ?? '?' } });
      }
      if (has(r, 'organization') && v.organization) {
        const key = upper(v.organization);
        const byReg = refs.orgsByReg.get(key);
        const byName = refs.orgsByName.get(key) ?? [];
        const org = byReg ?? (byName.length === 1 ? byName[0] : undefined);
        if (!org && byName.length > 1) errors.push({ column: 'organization', code: 'row.ref_ambiguous', params: { value: String(v.organization), n: byName.length } });
        else if (!org) errors.push({ column: 'organization', code: 'row.ref_not_found', params: { value: String(v.organization) } });
        else if (!org.isActive && org.id !== cur?.organizationId) errors.push({ column: 'organization', code: 'row.ref_inactive', params: { value: String(v.organization) } });
        else resolved.organizationId = org.id;
      }
      if (has(r, 'department') && v.department) {
        const d = refs.depts.get(upper(v.department));
        if (!d) errors.push({ column: 'department', code: 'row.ref_not_found', params: { value: String(v.department) } });
        else if (!d.isActive && d.id !== cur?.departmentId) errors.push({ column: 'department', code: 'row.ref_inactive', params: { value: String(v.department) } });
        else resolved.departmentId = d.id;
      }
      if (has(r, 'crew')) {
        if (!v.crew) resolved.crewId = null;
        else {
          const c = refs.crews.get(upper(v.crew));
          if (!c) errors.push({ column: 'crew', code: 'row.ref_not_found', params: { value: String(v.crew) } });
          else if (!c.isActive && c.id !== cur?.crewId) errors.push({ column: 'crew', code: 'row.ref_inactive', params: { value: String(v.crew) } });
          else resolved.crewId = c.id;
        }
      }
      if (has(r, 'position')) {
        if (!v.position) resolved.position = null;
        else {
          const p = refs.positions.get(normName(String(v.position)));
          if (p && !p.isActive && p.id !== cur?.positionId) errors.push({ column: 'position', code: 'row.ref_inactive', params: { value: String(v.position) } });
          else resolved.position = p?.name ?? String(v.position).trim().replace(/\s+/g, ' ');
        }
      }
      if (has(r, 'mealLocation')) {
        if (!v.mealLocation) resolved.mealLocationId = null;
        else {
          const l = refs.locs.get(upper(v.mealLocation));
          if (!l) errors.push({ column: 'mealLocation', code: 'row.ref_not_found', params: { value: String(v.mealLocation) } });
          else if (!l.isActive && l.id !== cur?.mealLocationId) errors.push({ column: 'mealLocation', code: 'row.ref_inactive', params: { value: String(v.mealLocation) } });
          else resolved.mealLocationId = l.id;
        }
      }
      if (errors.length > 0) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create', [RESOLVED]: resolved };

      // Шинэчлэх: файлд байгаа баганаар л харьцуулна (харагдах утга: код/нэр)
      const changes: PlannedRow['changes'] = {};
      const cmp = (key: string, from: CellValue, to: CellValue) => {
        if ((from ?? null) !== (to ?? null)) changes[key] = { from: from ?? null, to: to ?? null };
      };
      if (has(r, 'employeeCode') && cur.employeeCode !== v.employeeCode) cmp('employeeCode', cur.employeeCode, v.employeeCode);
      for (const k of ['fullName', 'phone', 'email', 'status'] as const) if (has(r, k)) cmp(k, cur[k], v[k] ?? (k === 'status' ? cur.status : null));
      if (resolved.position !== undefined && normName(cur.position ?? '') !== normName(resolved.position ?? '')) cmp('position', cur.position, resolved.position);
      if (resolved.mealLocationId !== undefined && resolved.mealLocationId !== cur.mealLocationId) {
        cmp('mealLocation', cur.mealLocationId ? (refs.locById.get(cur.mealLocationId) ?? null) : null, resolved.mealLocationId ? (refs.locById.get(resolved.mealLocationId) ?? null) : null);
      }
      if (has(r, 'mealsIncluded') && (v.mealsIncluded ?? null) !== cur.mealsIncluded) cmp('mealsIncluded', cur.mealsIncluded, (v.mealsIncluded as boolean | null) ?? null);
      const orgLabel = (id: string) => refs.orgById.get(id)?.regNumber || refs.orgById.get(id)?.name || id;
      if (resolved.organizationId && resolved.organizationId !== cur.organizationId) cmp('organization', orgLabel(cur.organizationId), orgLabel(resolved.organizationId));
      if (resolved.departmentId && resolved.departmentId !== cur.departmentId) cmp('department', refs.deptById.get(cur.departmentId) ?? null, String(v.department));
      if (resolved.crewId !== undefined && resolved.crewId !== cur.crewId) cmp('crew', cur.crewId ? refs.crewById.get(cur.crewId) ?? null : null, (v.crew as string | null) ?? null);
      const op = Object.keys(changes).length > 0 ? 'update' : 'unchanged';
      return { ...r, errors, op, targetId: cur.id, changes, [RESOLVED]: resolved };
    });
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    const audits: Parameters<ApplyCtx['audit']['recordMany']>[1] = [];
    for (const row of rows as WithResolved[]) {
      const v = row.values;
      const res = row[RESOLVED] ?? {};
      // Албан тушаал: каталогоос (байхгүй бол үүсгэнэ — resolvePositionByName); хоосон = хасах
      const pos = res.position === undefined ? undefined : res.position ? await resolvePositionByName(tx, ctx.tenantId, res.position) : null;
      if (row.op === 'create') {
        const e = await tx.campEmployee.create({
          data: {
            tenantId: ctx.tenantId, campId: ctx.campId,
            organizationId: res.organizationId!, departmentId: res.departmentId!, crewId: res.crewId ?? null,
            employeeCode: String(v.employeeCode), fullName: String(v.fullName),
            position: pos?.name ?? null, positionId: pos?.id ?? null,
            mealLocationId: res.mealLocationId ?? null, mealsIncluded: (v.mealsIncluded as boolean | null) ?? null,
            phone: (v.phone as string | null) ?? null, email: (v.email as string | null) ?? null,
            status: (v.status as CampEmployeeStatus | null) ?? CampEmployeeStatus.ACTIVE,
          },
          select: EMP_SELECT,
        });
        created++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'employee', entityId: e.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: EMPLOYEE_AUDIT_FIELDS, before: null, after: e, summaryParams: { code: e.employeeCode, name: e.fullName } });
      } else if (row.op === 'update' && row.targetId) {
        const before = await tx.campEmployee.findFirst({ where: { id: row.targetId, tenantId: ctx.tenantId, campId: ctx.campId }, select: EMP_SELECT });
        if (!before) continue;
        const data: Record<string, unknown> = {};
        for (const k of ['employeeCode', 'fullName', 'phone', 'email'] as const) if (has(row, k)) data[k] = v[k] ?? null;
        if (pos !== undefined) { data.position = pos?.name ?? null; data.positionId = pos?.id ?? null; }
        if (res.mealLocationId !== undefined) data.mealLocationId = res.mealLocationId;
        if (has(row, 'mealsIncluded')) data.mealsIncluded = (v.mealsIncluded as boolean | null) ?? null;
        if (has(row, 'status') && v.status) data.status = v.status;
        if (res.organizationId) data.organizationId = res.organizationId;
        if (res.departmentId) data.departmentId = res.departmentId;
        if (res.crewId !== undefined) data.crewId = res.crewId;
        const after = await tx.campEmployee.update({ where: { id: row.targetId }, data, select: EMP_SELECT });
        updated++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'employee', entityId: after.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: EMPLOYEE_AUDIT_FIELDS, before, after, summaryParams: { code: after.employeeCode, name: after.fullName } });
      }
    }
    await ctx.audit.recordMany(tx, audits);
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.campEmployee.findMany({
      where: { tenantId: ctx.tenantId, campId: ctx.campId },
      select: {
        employeeCode: true, fullName: true, position: true, phone: true, email: true, status: true, mealsIncluded: true,
        positionRef: { select: { name: true } }, workMealLocation: { select: { name: true } },
        organization: { select: { name: true, regNumber: true } }, department: { select: { code: true } }, crew: { select: { code: true } },
      },
      orderBy: { employeeCode: 'asc' },
    });
    return rows.map((e) => ({
      employeeCode: e.employeeCode, fullName: e.fullName, position: e.positionRef?.name ?? e.position,
      mealLocation: e.workMealLocation?.name ?? null, mealsIncluded: e.mealsIncluded, phone: e.phone, email: e.email,
      organization: e.organization.regNumber || e.organization.name, department: e.department.code, crew: e.crew?.code ?? null, status: e.status,
    }));
  },
};

/** parsed_rows-оос буцааж уншихад RESOLVED алга болно — confirm дахин plan хийнэ (DB өөрчлөгдсөн байж болно) */
export type { ParsedTableRow };
