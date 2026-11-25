import type { CampDataImportType } from '@prisma/client';
import type { CellValue, ParsedTableRow, TableSpec } from '../../../common/xlsx/table-spec';
import type { AuditService } from '../platform/audit.service';
import type { Tx } from '../platform/tenant-tx';

type RowOp = 'create' | 'update' | 'unchanged' | 'error';

export interface PlannedRow extends ParsedTableRow {
  op: RowOp;
  targetId?: string;
  changes?: Record<string, { from: CellValue; to: CellValue }>;
}

/** Импорт/экспортын хүрээ (CORE-10): `scopeId` = модулийн тодорхойлсон хүрээ (одоогийн бүх handler-т ажлын байр / кемп) */
export interface ImportCtx {
  tenantId: string;
  scopeId: string;
}

/**
 * Хүрээний эрх шалгалт — handler-ийг бүртгэж буй модуль өгнө (цөм нь хүрээ юу болохыг мэдэхгүй; ADR-009).
 * Эрхгүй → 403; хүрээ байхгүй → 404 (эрх шалгасны ДАРАА — оршин буйг илчлэхгүй).
 */
export interface DataTransferScope {
  /** Бичих/урьдчилан харах: handler-ийн эрхийн аль нэг. Буцаах = actor `core_users.id` */
  requirePermission(tx: Tx, tenantId: string, authId: string, scopeId: string, permission: string | string[]): Promise<string>;
  /** Унших (түүх, экспорт): хүрээнд хандах эрх */
  requireAccess(tx: Tx, tenantId: string, authId: string, scopeId: string): Promise<void>;
  /** Хүрээ байгаа эсэх (404) + экспортын файлын нэрд орох код */
  describe(tx: Tx, tenantId: string, scopeId: string): Promise<{ code: string }>;
}

export interface ApplyCtx extends ImportCtx {
  actorUserId: string;
  importId: string;
  audit: AuditService;
}

export interface DataImportHandler {
  type: CampDataImportType;
  spec: TableSpec;
  /** Эрхийн код(ууд) — `DataTransferScope.requirePermission`-д дамжина */
  permission: string | string[];
  plan(tx: Tx, ctx: ImportCtx, rows: ParsedTableRow[]): Promise<PlannedRow[]>;
  apply(tx: Tx, ctx: ApplyCtx, rows: PlannedRow[]): Promise<{ created: number; updated: number }>;
  exportRows(tx: Tx, ctx: ImportCtx): Promise<Record<string, CellValue>[]>;
}

export const has = (row: ParsedTableRow, key: string) => Object.prototype.hasOwnProperty.call(row.values, key);
export const upper = (value: CellValue | undefined) => typeof value === 'string' ? value.trim().toUpperCase() : '';
