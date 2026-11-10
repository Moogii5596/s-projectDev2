import type { CampDataImportType } from '@prisma/client';
import type { CellValue, ParsedTableRow, TableSpec } from '../../../common/xlsx/table-spec';
import type { CampPermission } from '../../camp/common/camp-permissions';
import type { CampAuditService } from '../../camp/common/camp-audit.service';
import type { Tx } from '../../camp/common/camp-tx';

type RowOp = 'create' | 'update' | 'unchanged' | 'error';

export interface PlannedRow extends ParsedTableRow {
  op: RowOp;
  targetId?: string;
  changes?: Record<string, { from: CellValue; to: CellValue }>;
}

export interface ImportCtx {
  tenantId: string;
  campId: string;
}

export interface ApplyCtx extends ImportCtx {
  actorUserId: string;
  importId: string;
  audit: CampAuditService;
}

export interface DataImportHandler {
  type: CampDataImportType;
  spec: TableSpec;
  permission: CampPermission | CampPermission[];
  plan(tx: Tx, ctx: ImportCtx, rows: ParsedTableRow[]): Promise<PlannedRow[]>;
  apply(tx: Tx, ctx: ApplyCtx, rows: PlannedRow[]): Promise<{ created: number; updated: number }>;
  exportRows(tx: Tx, ctx: ImportCtx): Promise<Record<string, CellValue>[]>;
}

export const has = (row: ParsedTableRow, key: string) => Object.prototype.hasOwnProperty.call(row.values, key);
export const upper = (value: CellValue | undefined) => typeof value === 'string' ? value.trim().toUpperCase() : '';
