import { CampDataImportType } from '@prisma/client';
import { CellValue, ParsedTableRow, TableSpec } from '../../../common/xlsx/table-spec';
import { CampPermission } from '../../camp/common/camp-permissions';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { Tx } from '../../camp/common/camp-tx';

type RowOp = 'create' | 'update' | 'unchanged' | 'error';

/** Төлөвлөсөн мөр: задлагдсан мөр + DB-тэй харьцуулсан үйлдэл */
export interface PlannedRow extends ParsedTableRow {
  op: RowOp;
  /** update/unchanged: одоогийн бичлэгийн id */
  targetId?: string;
  /** update: өөрчлөгдөх талбарууд (UI-д "хуучин → шинэ") */
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

/** Импортын төрөл бүрийн дүрэм (§0.5): spec + DB-тэй шалгах + бичих + экспорт */
export interface DataImportHandler {
  type: CampDataImportType;
  spec: TableSpec;
  permission: CampPermission | CampPermission[];
  plan(tx: Tx, ctx: ImportCtx, rows: ParsedTableRow[]): Promise<PlannedRow[]>;
  /** Зөвхөн create/update мөрүүд ирнэ; transaction дотор */
  apply(tx: Tx, ctx: ApplyCtx, rows: PlannedRow[]): Promise<{ created: number; updated: number }>;
  exportRows(tx: Tx, ctx: ImportCtx): Promise<Record<string, CellValue>[]>;
}

/** Тухайн мөрийн утга (багана файлд байхгүй бол undefined) */
export const has = (row: ParsedTableRow, key: string) => Object.prototype.hasOwnProperty.call(row.values, key);
export const upper = (v: CellValue | undefined) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
