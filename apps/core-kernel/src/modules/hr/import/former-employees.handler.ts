import { CampDataImportType, CampEmployeeStatus, CampTerminationReason } from '@prisma/client';
import { CellValue, TableSpec } from '../../../common/xlsx/table-spec';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { Tx } from '../../camp/common/camp-tx';
import { todayUb } from '../../camp/common/camp-date';
import { EMPLOYEE_AUDIT_FIELDS } from '../employees/hr-employees.service';
import { EXTRA_PHONES_MAX, normalizeExtraPhones, PHONE_RE, replaceExtraPhones, resolveNames, splitPhones, type EmployeeNames } from '../employees/employee-names';
import { normName } from '../positions/hr-positions.service';
import { applyIssues, issueFromRow, readIssues, toJson, type IssueUpdate } from '../employees/data-issues';
import { ApplyCtx, DataImportHandler, has, ImportCtx, PlannedRow, upper } from './import-types';

/**
 * v0.2.3 Блок D (S7) — Ажлаас гарсан ажилтны түүх: Excel / хүснэгтээр оруулах (зөвхөн ШИНЭ бүртгэл), экспорт.
 *  - Нэг код олон удаа байж болно (дахин ажилд орсон) → `keyColumn` алга; түлхүүр = код + гарсан огноо.
 *  - S9/S11: гарсан огноо хоосон → «Мэдээлэл дутуу» (огноогүй бүртгэл); дараа огноотой оруулахад тэр бүртгэлийг ШИНЭЧИЛНЭ.
 *    Буруу имэйл/утас → «Мэдээлэл дутуу» (талбарт орохгүй).
 *  - Ижил код + гарсан огноотой TERMINATED бүртгэл байвал «өөрчлөлтгүй» (дахин оруулахад давхардахгүй).
 *  - Хэлтэс/ростер/байгууллага идэвхгүй ч болно (түүх). Албан тушаал каталогт байхгүй бол үүсгэнэ.
 *  - Хэрэглэгч (нэвтрэх эрх) үүсгэхгүй. Кемпийн хоолны тоо/өрөөнд TERMINATED тоологдохгүй (одоогийн дүрэм).
 *  - Баталгаажуулахад `rehired_from_id` гинж: ижил кодын бүртгэлүүд гарсан огноогоор → идэвхтэй (байвал) сүүлд.
 */
export const FORMER_EMPLOYEES_SPEC: TableSpec = {
  type: 'former-employees',
  title: 'table.former_employees',
  columns: [
    { key: 'employeeCode', label: 'col.employee.code', type: 'text', required: true, maxLength: 50, aliases: ['employee_code', 'code', 'код', 'ажилтны код'], examples: ['18204', '24203'], width: 14 },
    { key: 'lastName', label: 'col.employee.last_name', type: 'text', maxLength: 100, aliases: ['last_name', 'овог'], examples: ['Сауеп', 'Даваасүрэн'], width: 18 },
    { key: 'firstName', label: 'col.employee.first_name', type: 'text', maxLength: 100, aliases: ['first_name', 'нэр'], examples: ['Айболат', 'Пүрэвдаваа'], width: 18 },
    { key: 'familyName', label: 'col.employee.family_name', type: 'text', maxLength: 100, aliases: ['family_name', 'ургийн овог'], examples: [null, null], width: 16 },
    { key: 'fullName', label: 'col.employee.full_name', type: 'text', maxLength: 200, aliases: ['full_name', 'name', 'овог нэр'], examples: [null, null], width: 24 },
    { key: 'position', label: 'col.employee.position', type: 'text', maxLength: 100, aliases: ['position', 'албан тушаал'], examples: ['Экскаваторын операторч', null] },
    { key: 'phone', label: 'col.employee.phone', type: 'phone', soft: true, aliases: ['phone', 'утас', 'утасны дугаар'], examples: ['88875994', null], width: 14 },
    { key: 'extraPhones', label: 'col.employee.extra_phones', type: 'text', maxLength: 300, aliases: ['extra_phones', 'нэмэлт утас'], examples: [null, null], width: 20 },
    { key: 'email', label: 'col.employee.email', type: 'email', soft: true, maxLength: 254, aliases: ['email', 'имэйл', 'и-мэйл'], examples: [null, null], width: 22 },
    { key: 'organization', label: 'col.employee.organization', type: 'text', required: true, maxLength: 200, aliases: ['organization', 'байгууллага', 'регистр'], examples: ['2001234', '2001234'], width: 20 },
    { key: 'department', label: 'col.employee.department', type: 'text', required: true, maxLength: 30, aliases: ['department', 'хэлтэс'], examples: ['10', '50'] },
    { key: 'crew', label: 'col.employee.crew', type: 'text', maxLength: 30, aliases: ['crew', 'roster', 'ростер', 'ээлж'], examples: ['A', null] },
    { key: 'terminatedAt', label: 'col.employee.terminated_at', type: 'date', aliases: ['terminated_at', 'гарсан огноо', 'ажлаас гарсан өдөр'], examples: ['2023-05-10', '2024-01-31'], width: 14 },
    {
      key: 'terminationReason', label: 'col.employee.termination_reason', type: 'enum', required: true, aliases: ['termination_reason', 'reason', 'шалтгаан'],
      enumValues: {
        RESIGNED: 'enum.termination_reason.RESIGNED',
        DISMISSED: 'enum.termination_reason.DISMISSED',
        CONTRACT_END: 'enum.termination_reason.CONTRACT_END',
        OTHER: 'enum.termination_reason.OTHER',
      },
      examples: ['RESIGNED', 'OTHER'],
      width: 18,
    },
    { key: 'terminationNote', label: 'col.employee.termination_note', type: 'text', maxLength: 500, aliases: ['termination_note', 'note', 'тэмдэглэл', 'тайлбар'], examples: [null, 'Удаан хугацаанд ажил тасалсан'], width: 30 },
  ],
};

const RESOLVED = Symbol('resolved');
type Resolved = { organizationId: string; departmentId: string; crewId: string | null; position: string | null; names: EmployeeNames; extraPhones: string[]; issues: IssueUpdate };
type WithResolved = PlannedRow & { [RESOLVED]?: Resolved };

const OUT_SELECT = {
  id: true, employeeCode: true, fullName: true, familyName: true, lastName: true, firstName: true, position: true, phone: true, email: true, status: true,
  organizationId: true, departmentId: true, crewId: true, positionId: true, mealLocationId: true, mealsIncluded: true,
} as const;

async function loadRefs(tx: Tx, ctx: ImportCtx, codes: string[]) {
  const [existing, depts, crews, orgs, positions] = await Promise.all([
    codes.length
      ? tx.hrEmployee.findMany({
          where: { tenantId: ctx.tenantId, employeeCode: { in: codes, mode: 'insensitive' }, status: CampEmployeeStatus.TERMINATED },
          select: { id: true, employeeCode: true, terminatedAt: true, dataIssues: true },
        })
      : Promise.resolve([]),
    tx.hrDepartment.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true } }),
    tx.hrCrew.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true } }),
    tx.coreOrganization.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, regNumber: true } }),
    tx.hrPosition.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } }),
  ]);
  const key = (code: string, date: string) => `${code.toUpperCase()}|${date}`;
  return {
    key,
    terminated: new Map(existing.map((e) => [key(e.employeeCode, e.terminatedAt ? e.terminatedAt.toISOString().slice(0, 10) : ''), e.id])),
    /** S11: огноогүй (тодорхойгүй) бүртгэл — код → id-ууд (огноотой мөр ирвэл шинэчилнэ) */
    undated: existing.reduce((m, e) => (e.terminatedAt ? m : m.set(e.employeeCode.toUpperCase(), [...(m.get(e.employeeCode.toUpperCase()) ?? []), { id: e.id, issues: readIssues(e.dataIssues) }])), new Map<string, { id: string; issues: ReturnType<typeof readIssues> }[]>()),
    depts: new Map(depts.map((d) => [d.code.toUpperCase(), d.id])),
    crews: new Map(crews.map((c) => [c.code.toUpperCase(), c.id])),
    orgsByReg: new Map(orgs.filter((o) => o.regNumber).map((o) => [o.regNumber!.toUpperCase(), o.id])),
    orgsByName: orgs.reduce((m, o) => m.set(o.name.toUpperCase(), [...(m.get(o.name.toUpperCase()) ?? []), o.id]), new Map<string, string[]>()),
    positions: new Map(positions.map((p) => [normName(p.name), p])),
  };
}

/**
 * Ижил кодын бүртгэлүүдийг гинжлэх: гарсан огноогоор өсөхөөр, идэвхтэй/идэвхгүй (TERMINATED биш) бүртгэл хамгийн сүүлд.
 * Аль хэдийн холбогдсон (`rehired_from_id` эсвэл өөр бүртгэлийн өмнөх болсон) бүртгэлийг хөндөхгүй (uq_camp_employees_rehired_from).
 */
export async function linkRehireChains(tx: Tx, tenantId: string, codes: readonly string[]): Promise<number> {
  if (codes.length === 0) return 0;
  const recs = await tx.hrEmployee.findMany({
    where: { tenantId, employeeCode: { in: [...new Set(codes)], mode: 'insensitive' } },
    select: { id: true, employeeCode: true, status: true, terminatedAt: true, createdAt: true, rehiredFromId: true },
  });
  const usedAsPrev = new Set(recs.map((r) => r.rehiredFromId).filter((x): x is string => !!x));
  const byCode = new Map<string, typeof recs>();
  for (const r of recs) byCode.set(r.employeeCode.toUpperCase(), [...(byCode.get(r.employeeCode.toUpperCase()) ?? []), r]);
  let linked = 0;
  for (const list of byCode.values()) {
    // S11: огноо тодорхойгүй гарсан бүртгэл — огноотойн дараа, идэвхтэйн өмнө
    const ord = (r: (typeof recs)[number]) => (r.status !== CampEmployeeStatus.TERMINATED ? Number.MAX_SAFE_INTEGER : r.terminatedAt ? r.terminatedAt.getTime() : Number.MAX_SAFE_INTEGER - 1);
    list.sort((a, b) => ord(a) - ord(b) || a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      const prev = list[i - 1];
      if (cur.rehiredFromId || usedAsPrev.has(prev.id)) continue;
      await tx.hrEmployee.update({ where: { id: cur.id }, data: { rehiredFromId: prev.id }, select: { id: true } });
      usedAsPrev.add(prev.id);
      linked++;
    }
  }
  return linked;
}

export const formerEmployeesHandler: DataImportHandler = {
  type: CampDataImportType.FORMER_EMPLOYEES,
  spec: FORMER_EMPLOYEES_SPEC,
  permission: CAMP_PERMISSIONS.EMPLOYEE_TERMINATE,

  async plan(tx, ctx, rows) {
    const codes = rows.map((r) => r.values.employeeCode).filter((c): c is string => typeof c === 'string' && c !== '');
    const refs = await loadRefs(tx, ctx, codes);
    const today = todayUb();
    const inFile = new Map<string, number>();

    const usedUndated = new Set<string>();
    return rows.map((r0): WithResolved => {
      let r = r0;
      const errors = [...r.errors];
      const v = r.values;
      const code = typeof v.employeeCode === 'string' ? v.employeeCode : '';
      const date = typeof v.terminatedAt === 'string' ? v.terminatedAt : '';
      if (date && date > today) errors.push({ column: 'terminatedAt', code: 'row.date_future', params: { value: date } });
      if (v.terminationReason === CampTerminationReason.OTHER && !v.terminationNote) errors.push({ column: 'terminationNote', code: 'row.note_required_other' });
      if (code) {
        const k = refs.key(code, date);
        const first = inFile.get(k);
        if (first !== undefined) errors.push({ column: 'employeeCode', code: 'row.duplicate_in_file', params: { value: `${code} / ${date || '—'}`, first } });
        else inFile.set(k, r.row);
      }

      let organizationId: string | undefined;
      if (v.organization) {
        const key = upper(v.organization);
        const byName = refs.orgsByName.get(key) ?? [];
        organizationId = refs.orgsByReg.get(key) ?? (byName.length === 1 ? byName[0] : undefined);
        if (!organizationId && byName.length > 1) errors.push({ column: 'organization', code: 'row.ref_ambiguous', params: { value: String(v.organization), n: byName.length } });
        else if (!organizationId) errors.push({ column: 'organization', code: 'row.ref_not_found', params: { value: String(v.organization) } });
      }
      const departmentId = v.department ? refs.depts.get(upper(v.department)) : undefined;
      if (v.department && !departmentId) errors.push({ column: 'department', code: 'row.ref_not_found', params: { value: String(v.department) } });
      let crewId: string | null = null;
      if (has(r, 'crew') && v.crew) {
        crewId = refs.crews.get(upper(v.crew)) ?? null;
        if (!crewId) errors.push({ column: 'crew', code: 'row.ref_not_found', params: { value: String(v.crew) } });
      }
      const names = resolveNames({
        ...(has(r, 'lastName') ? { lastName: (v.lastName as string | null) ?? null } : {}),
        ...(v.firstName ? { firstName: String(v.firstName) } : {}),
        ...(has(r, 'familyName') ? { familyName: (v.familyName as string | null) ?? null } : {}),
        ...(!v.firstName && v.fullName ? { fullName: String(v.fullName) } : {}),
      });
      if (!names || !names.firstName) errors.push({ column: 'firstName', code: 'row.required' });
      const all = splitPhones(v.extraPhones as string | null);
      const bad = all.filter((p) => !PHONE_RE.test(p));
      const extra = all.filter((p) => PHONE_RE.test(p));
      if (extra.length > EXTRA_PHONES_MAX) errors.push({ column: 'extraPhones', code: 'row.out_of_range', params: { value: extra.length, min: 0, max: EXTRA_PHONES_MAX } });
      // S9/S11: «Мэдээлэл дутуу»
      const rowIssues = [...(r.issues ?? [])];
      if (bad.length) rowIssues.push({ column: 'extraPhones', code: 'row.bad_phone', params: { value: bad.join(', ').slice(0, 60) } });
      if (!date) rowIssues.push({ column: 'terminatedAt', code: 'row.date_missing' });
      const issues: IssueUpdate = {
        email: issueFromRow('email', rowIssues.find((i) => i.column === 'email')),
        phone: issueFromRow('phone', rowIssues.find((i) => i.column === 'phone')),
        extraPhones: bad.length ? { field: 'extraPhones', code: 'row.bad_phone', value: bad.join(', ').slice(0, 200) } : null,
        terminatedAt: date ? null : { field: 'terminatedAt', code: 'row.date_missing', value: '' },
      };
      if (rowIssues.length) r = { ...r, issues: rowIssues };

      if (errors.length > 0) return { ...r, errors, op: 'error' };
      const existing = refs.terminated.get(refs.key(code, date));
      if (existing) return { ...r, errors, op: 'unchanged', targetId: existing };
      // S11: огноотой мөр + ижил кодын огноогүй бүртгэл → тэр бүртгэлд огноог нөхнө (шинэ давхар бүртгэл үүсгэхгүй)
      const undated = date ? (refs.undated.get(code.toUpperCase()) ?? []).find((u) => !usedUndated.has(u.id)) : undefined;
      if (undated) {
        usedUndated.add(undated.id);
        return {
          ...r, errors, op: 'update', targetId: undated.id, changes: { terminatedAt: { from: null, to: date } },
          [RESOLVED]: { organizationId: organizationId!, departmentId: departmentId!, crewId, position: null, names: names!, extraPhones: [], issues: { terminatedAt: null } },
        };
      }
      const position = v.position ? (refs.positions.get(normName(String(v.position)))?.name ?? String(v.position).trim().replace(/\s+/g, ' ')) : null;
      return {
        ...r, errors, op: 'create',
        [RESOLVED]: { organizationId: organizationId!, departmentId: departmentId!, crewId, position, names: names!, extraPhones: normalizeExtraPhones(extra, issues.phone ? null : (v.phone as string | null)), issues },
      };
    });
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    const audits: Parameters<ApplyCtx['audit']['recordMany']>[1] = [];
    const positions = new Map((await tx.hrPosition.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } })).map((p) => [normName(p.name), p]));
    const codes: string[] = [];
    for (const row of rows as WithResolved[]) {
      const res = row[RESOLVED];
      if (!res) continue;
      const v = row.values;
      if (row.op === 'update' && row.targetId) {
        // S11: огноогүй бүртгэлд гарсан огноог нөхөх
        const before = await tx.hrEmployee.findFirstOrThrow({ where: { id: row.targetId, tenantId: ctx.tenantId }, select: { ...OUT_SELECT, dataIssues: true } });
        const { dataIssues, ...beforeOut } = before;
        await tx.hrEmployee.update({
          where: { id: row.targetId },
          data: { terminatedAt: new Date(`${String(v.terminatedAt)}T00:00:00Z`), dataIssues: toJson(applyIssues(readIssues(dataIssues), res.issues)) },
          select: { id: true },
        });
        const after = await tx.hrEmployee.findFirstOrThrow({ where: { id: row.targetId, tenantId: ctx.tenantId }, select: OUT_SELECT });
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'employee', entityId: after.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: EMPLOYEE_AUDIT_FIELDS, before: beforeOut, after, summaryParams: { code: after.employeeCode, name: after.fullName } });
        codes.push(after.employeeCode);
        updated++;
        continue;
      }
      if (row.op !== 'create') continue;
      // Түүхийн албан тушаал: идэвхгүй ч болно; байхгүй бол каталогт нэмнэ
      let pos = res.position ? positions.get(normName(res.position)) : undefined;
      if (res.position && !pos) {
        pos = await tx.hrPosition.create({ data: { tenantId: ctx.tenantId, name: res.position.slice(0, 100) }, select: { id: true, name: true } });
        positions.set(normName(pos.name), pos);
      }
      const e = await tx.hrEmployee.create({
        data: {
          tenantId: ctx.tenantId, campId: ctx.campId,
          organizationId: res.organizationId, departmentId: res.departmentId, crewId: res.crewId,
          employeeCode: String(v.employeeCode), ...res.names,
          position: pos?.name ?? null, positionId: pos?.id ?? null,
          phone: res.issues.phone ? null : ((v.phone as string | null) ?? null), email: res.issues.email ? null : ((v.email as string | null) ?? null),
          status: CampEmployeeStatus.TERMINATED,
          terminatedAt: v.terminatedAt ? new Date(`${String(v.terminatedAt)}T00:00:00Z`) : null,
          dataIssues: toJson(applyIssues([], res.issues)),
          terminationReason: v.terminationReason as CampTerminationReason,
          terminationNote: (v.terminationNote as string | null) ?? null,
        },
        select: { id: true },
      });
      if (res.extraPhones.length) await replaceExtraPhones(tx, ctx.tenantId, e.id, res.extraPhones);
      const after = await tx.hrEmployee.findFirstOrThrow({ where: { id: e.id, tenantId: ctx.tenantId }, select: OUT_SELECT });
      audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'employee', entityId: e.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: EMPLOYEE_AUDIT_FIELDS, before: null, after, summaryParams: { code: after.employeeCode, name: after.fullName } });
      codes.push(after.employeeCode);
      created++;
    }
    await linkRehireChains(tx, ctx.tenantId, codes);
    await ctx.audit.recordMany(tx, audits);
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.hrEmployee.findMany({
      where: { tenantId: ctx.tenantId, campId: ctx.campId, status: CampEmployeeStatus.TERMINATED },
      select: {
        employeeCode: true, lastName: true, firstName: true, familyName: true, position: true, phone: true, email: true,
        terminatedAt: true, terminationReason: true, terminationNote: true,
        extraPhones: { select: { phone: true }, orderBy: { sortOrder: 'asc' } },
        positionRef: { select: { name: true } }, organization: { select: { name: true, regNumber: true } }, department: { select: { code: true } }, crew: { select: { code: true } },
      },
      orderBy: [{ employeeCode: 'asc' }, { terminatedAt: 'asc' }],
    });
    return rows.map((e): Record<string, CellValue> => ({
      employeeCode: e.employeeCode, lastName: e.lastName, firstName: e.firstName, familyName: e.familyName,
      position: e.positionRef?.name ?? e.position, phone: e.phone, extraPhones: e.extraPhones.map((p) => p.phone).join(', ') || null, email: e.email,
      organization: e.organization.regNumber || e.organization.name, department: e.department.code, crew: e.crew?.code ?? null,
      terminatedAt: e.terminatedAt ? e.terminatedAt.toISOString().slice(0, 10) : null, terminationReason: e.terminationReason, terminationNote: e.terminationNote,
    }));
  },
};
