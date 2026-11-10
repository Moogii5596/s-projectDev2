import { CampDataImportType } from '@prisma/client';
import { CellValue, TableSpec } from '../../../common/xlsx/table-spec';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { normalizeName } from '../../../common/name-normalization';
import { DataImportHandler, has, PlannedRow } from './import-types';

/**
 * v0.2.3 Блок D (S4) — Албан тушаал: Excel / хүснэгтээр оруулах, шинэчлэх (НЭРЭЭР — каталогийн түлхүүр), экспорт.
 * Каталог = байгууллагын түвшин (кемпээс үл хамаарна). Код = ажлын байрны индекс (жнь 1322-11) — давхардаж болно.
 * Дараалал: хэлтэс → албан тушаал → ажилтан (ажилтны импорт албан тушаалыг нэрээр холбоно).
 */
const POSITIONS_SPEC: TableSpec = {
  type: 'positions',
  title: 'table.positions',
  keyColumn: 'name',
  columns: [
    { key: 'name', label: 'col.position.name', type: 'text', required: true, maxLength: 100, aliases: ['name', 'нэр', 'албан тушаал', 'position'], examples: ['Тогооч', 'Автобусны жолооч'], width: 30 },
    { key: 'code', label: 'col.position.code', type: 'text', maxLength: 30, aliases: ['code', 'код', 'индекс', 'ажлын байрны индекс'], examples: ['5120-11', '8331-11'], width: 16 },
    { key: 'active', label: 'col.position.active', type: 'bool', aliases: ['active', 'is_active', 'идэвхтэй', 'төлөв'], examples: [true, true] },
  ],
};

const SELECT = { id: true, name: true, code: true, isActive: true } as const;
const clean = (s: CellValue) => String(s ?? '').trim().replace(/\s+/g, ' ');

export const positionsHandler: DataImportHandler = {
  type: CampDataImportType.POSITIONS,
  spec: POSITIONS_SPEC,
  permission: CAMP_PERMISSIONS.MASTER_MANAGE,

  async plan(tx, ctx, rows) {
    const [all, activeCounts] = await Promise.all([
      tx.hrPosition.findMany({ where: { tenantId: ctx.tenantId }, select: SELECT }),
      tx.hrEmployee.groupBy({ by: ['positionId'], where: { tenantId: ctx.tenantId, status: 'ACTIVE', positionId: { not: null } }, _count: { _all: true } }),
    ]);
    const byName = new Map(all.map((p) => [normalizeName(p.name), p]));
    const active = new Map(activeCounts.map((c) => [c.positionId, c._count._all]));

    return rows.map((r): PlannedRow => {
      const v = r.values;
      const errors = [...r.errors];
      const cur = typeof v.name === 'string' ? byName.get(normalizeName(v.name)) : undefined;
      if (cur && v.active === false && cur.isActive && (active.get(cur.id) ?? 0) > 0) {
        errors.push({ column: 'active', code: 'row.position_has_active', params: { n: active.get(cur.id) ?? 0 } });
      }
      if (errors.length > 0) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create' };
      const changes: Record<string, { from: CellValue; to: CellValue }> = {};
      if (has(r, 'code') && (v.code ?? null) !== (cur.code ?? null)) changes.code = { from: cur.code, to: v.code ?? null };
      if (has(r, 'active') && v.active !== null && v.active !== cur.isActive) changes.active = { from: cur.isActive, to: v.active };
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: cur.id, changes };
    });
  },

  async apply(tx, ctx, rows) {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const v = row.values;
      if (row.op === 'create') {
        await tx.hrPosition.create({ data: { tenantId: ctx.tenantId, name: clean(v.name).slice(0, 100), code: (v.code as string | null) ?? null, isActive: v.active !== false } });
        created++;
      } else if (row.op === 'update' && row.targetId) {
        await tx.hrPosition.update({
          where: { id: row.targetId },
          data: {
            ...(has(row, 'code') ? { code: (v.code as string | null) ?? null } : {}),
            ...(has(row, 'active') && v.active !== null ? { isActive: Boolean(v.active) } : {}),
          },
        });
        updated++;
      }
    }
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.hrPosition.findMany({ where: { tenantId: ctx.tenantId }, select: SELECT, orderBy: { name: 'asc' } });
    return rows.map((p) => ({ name: p.name, code: p.code, active: p.isActive }));
  },
};
