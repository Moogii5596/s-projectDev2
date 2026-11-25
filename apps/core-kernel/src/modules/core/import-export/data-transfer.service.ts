import { Injectable } from '@nestjs/common';
import { CampDataImportSource, CampDataImportStatus, CampDataImportType, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { currentLang } from '../../../common/i18n/i18n-context';
import { t } from '../../../common/i18n/translate';
import {
  buildExport,
  buildTemplate,
  localizeRowErrors,
  ParsedTableRow,
  parseTableRows,
  parseTableXlsx,
} from '../../../common/xlsx/table-spec';
import { AuditService } from '../platform/audit.service';
import { inTenantTx, Tx } from '../platform/tenant-tx';
import { withAppErrors } from '../platform/db-errors';
import type { DataImportHandler, DataTransferScope, PlannedRow } from './data-transfer.types';
import { DataTransferRegistry } from './data-transfer.registry';

/** Core owns the shared preview/confirm/export flow; business modules register typed handlers. */
const CONFIRM_TX = { timeout: 120_000, maxWait: 10_000 };
const IMPORT_SELECT = {
  id: true, type: true, source: true, fileName: true, status: true, totalRows: true, createRows: true, updateRows: true,
  unchangedRows: true, errorRows: true, createdAt: true, confirmedAt: true,
} as const;

export type ImportInput = { kind: 'xlsx'; fileName: string; buffer: Buffer } | { kind: 'rows'; rows: Record<string, unknown>[] };

function counts(plan: PlannedRow[]) {
  const n = (op: PlannedRow['op']) => plan.filter((r) => r.op === op).length;
  return { totalRows: plan.length, createRows: n('create'), updateRows: n('update'), unchangedRows: n('unchanged'), errorRows: n('error') };
}

/** Хариуны мөр: хэрэглэгчийн хэлээр алдаа + төлөвийн шошго */
function viewRows(h: DataImportHandler, plan: PlannedRow[]) {
  const lang = currentLang();
  return plan.map((r) => ({
    row: r.row,
    op: r.op,
    opLabel: t(`import.row.${r.op}`, {}, lang),
    values: r.values,
    changes: r.changes ?? {},
    errors: localizeRowErrors(r.errors, h.spec, lang),
    /** v0.2.3 Блок D (S9): «Мэдээлэл дутуу» — оруулахад саад болохгүй */
    warnings: localizeRowErrors(r.issues ?? [], h.spec, lang),
  }));
}

/** Хадгалах: зөвхөн задлагдсан мөр (DB-ийн шалгалтыг confirm дахин хийнэ) */
const storable = (rows: ParsedTableRow[]) => rows.map(({ row, values, errors, issues }) => ({ row, values, errors, ...(issues ? { issues } : {}) })) as unknown as Prisma.InputJsonValue;

/**
 * Shared master-data import/export flow; the existing HR-facing API and import history remain compatible.
 * Урсгал: preview (задлах → DB-тэй шалгах → PREVIEW хадгалах) → confirm (түгжээ → ДАХИН шалгах → бичих → түүх IMPORT)
 *   - skipErrors=false (анхдагч): алдаатай мөр байвал юу ч бичихгүй (409, мөрийн алдаатай)
 *   - skipErrors=true: зөв мөрүүдийг л бичнэ ("Алдаатай мөрийг алгасаж бусдыг оруулах")
 */
@Injectable()
export class DataTransferService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly audit: AuditService,
    private readonly transfers: DataTransferRegistry,
  ) {}

  /** Бүртгэлтэй импортын төрлүүд (URL) */
  types(): string[] {
    return this.transfers.importTypes();
  }

  private handlerFor(type: string): DataImportHandler {
    const h = this.transfers.getImport(type);
    if (!h) throw badRequest('import.unknown_type', { type });
    return h;
  }

  private handlerOf(type: CampDataImportType): DataImportHandler {
    const h = this.types().map((key) => this.transfers.getImport(key))
      .find((handler) => handler?.type === type);
    if (!h) throw badRequest('import.unknown_type', { type });
    return h;
  }

  private anyScope(): DataTransferScope {
    const first = this.types()[0];
    const scope = first ? this.transfers.scopeOf(first) : undefined;
    if (!scope) throw badRequest('import.unknown_type', { type: '' });
    return scope;
  }

  /** CORE-10: хүрээний эрх шалгалтыг handler-ийг бүртгэсэн модуль өгнө */
  private scopeOf(h: DataImportHandler): DataTransferScope {
    const scope = this.transfers.scopeOf(h.spec.type);
    if (!scope) throw badRequest('import.unknown_type', { type: h.spec.type });
    return scope;
  }

  template(type: string): Promise<Buffer> {
    return buildTemplate(this.handlerFor(type).spec, currentLang());
  }

  async preview(tenantId: string, authId: string, scopeId: string, type: string, input: ImportInput) {
    const h = this.handlerFor(type);
    const parsed = input.kind === 'xlsx' ? await parseTableXlsx(input.buffer, h.spec) : parseTableRows(input.rows, h.spec);
    return withAppErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const scope = this.scopeOf(h);
        const actorId = await scope.requirePermission(tx, tenantId, authId, scopeId, h.permission);
        await scope.describe(tx, tenantId, scopeId);
        const plan = await h.plan(tx, { tenantId, scopeId }, parsed);
        const imp = await tx.campDataImport.create({
          data: {
            tenantId, campId: scopeId, type: h.type,
            source: input.kind === 'xlsx' ? CampDataImportSource.XLSX : CampDataImportSource.GRID,
            fileName: input.kind === 'xlsx' ? input.fileName.slice(0, 200) || 'import.xlsx' : null,
            ...counts(plan),
            parsedRows: storable(parsed),
            uploadedBy: actorId,
          },
          select: IMPORT_SELECT,
        });
        return { import: imp, rows: viewRows(h, plan) };
      }),
    );
  }

  async list(tenantId: string, authId: string, scopeId: string, type?: string) {
    const h = type ? this.handlerFor(type) : null;
    // Түүх нь хүрээгээр (ажлын байр) — төрөл заагаагүй бол аль ч бүртгэлтэй төрлийн хүрээний шалгалт (нэг хүрээнд ижил)
    const scope = h ? this.scopeOf(h) : this.anyScope();
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await scope.requireAccess(tx, tenantId, authId, scopeId);
      return tx.campDataImport.findMany({
        where: { tenantId, campId: scopeId, ...(h ? { type: h.type } : {}) },
        select: IMPORT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
    });
  }

  /** Одоогийн DB-тэй дахин харьцуулсан харагдац (зөвхөн унших) */
  async get(tenantId: string, authId: string, scopeId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const imp = await this.load(tx, tenantId, scopeId, id);
      const h = this.handlerOf(imp.type);
      await this.scopeOf(h).requirePermission(tx, tenantId, authId, scopeId, h.permission);
      const plan = await h.plan(tx, { tenantId, scopeId }, imp.parsedRows as unknown as ParsedTableRow[]);
      const { parsedRows: _omit, ...rest } = imp;
      return { import: rest, rows: viewRows(h, plan) };
    });
  }

  private async load(tx: Tx, tenantId: string, scopeId: string, id: string) {
    const imp = await tx.campDataImport.findFirst({ where: { id, tenantId, campId: scopeId }, select: { ...IMPORT_SELECT, parsedRows: true } });
    if (!imp) throw notFound('import.not_found');
    return imp;
  }

  async confirm(tenantId: string, authId: string, scopeId: string, id: string, skipErrors = false) {
    const result = await withAppErrors(() =>
      inTenantTx(
        this.prisma,
        tenantId,
        async (tx) => {
          const peek = await this.load(tx, tenantId, scopeId, id);
          const h = this.handlerOf(peek.type);
          const actorUserId = await this.scopeOf(h).requirePermission(tx, tenantId, authId, scopeId, h.permission);
          // Нэг хүрээний мастер өгөгдлийн импорт дараалан (зэрэгцээ confirm / давхар дарах); түлхүүрийн нэр хуучнаараа
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`camp-data-import:${scopeId}`}))`;
          const imp = await this.load(tx, tenantId, scopeId, id);
          if (imp.status !== CampDataImportStatus.PREVIEW) throw conflict('import.not_preview', { status: imp.status });
          const plan = await h.plan(tx, { tenantId, scopeId }, imp.parsedRows as unknown as ParsedTableRow[]);
          const c = counts(plan);
          if (c.errorRows > 0 && !skipErrors) {
            await tx.campDataImport.update({ where: { id }, data: c });
            return { ok: false as const, h, plan, c };
          }
          const applied = await h.apply(tx, { tenantId, scopeId, actorUserId, importId: id, audit: this.audit }, plan.filter((r) => r.op === 'create' || r.op === 'update'));
          await tx.campDataImport.update({
            where: { id },
            data: { ...c, status: CampDataImportStatus.CONFIRMED, confirmedBy: actorUserId, confirmedAt: new Date() },
          });
          return { ok: true as const, applied, c };
        },
        CONFIRM_TX,
      ),
    );
    if (!result.ok) {
      throw conflict('import.has_errors', { n: result.c.errorRows }, { rows: viewRows(result.h, result.plan.filter((r) => r.op === 'error')) });
    }
    return { status: CampDataImportStatus.CONFIRMED, ...result.applied, skipped: result.c.errorRows, unchanged: result.c.unchangedRows };
  }

  async cancel(tenantId: string, authId: string, scopeId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const imp = await this.load(tx, tenantId, scopeId, id);
      const h = this.handlerOf(imp.type);
      await this.scopeOf(h).requirePermission(tx, tenantId, authId, scopeId, h.permission);
      const res = await tx.campDataImport.updateMany({ where: { id, tenantId, campId: scopeId, status: CampDataImportStatus.PREVIEW }, data: { status: CampDataImportStatus.CANCELLED } });
      if (res.count !== 1) throw conflict('import.not_preview', { status: imp.status });
      return { status: CampDataImportStatus.CANCELLED };
    });
  }

  /** Экспорт = импортын формат (хэрэглэгчийн хэлээр) */
  async export(tenantId: string, authId: string, scopeId: string, type: string): Promise<{ buffer: Buffer; fileName: string }> {
    const handler = this.transfers.getExport(type);
    if (!handler) throw badRequest('import.unknown_type', { type });
    const lang = currentLang();
    const scope = this.scopeOf(handler);
    const { spec, rows, scopeCode } = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await scope.requireAccess(tx, tenantId, authId, scopeId);
      const { code } = await scope.describe(tx, tenantId, scopeId);
      return { spec: handler.spec, rows: await handler.exportRows(tx, { tenantId, scopeId }), scopeCode: code };
    });
    const date = new Date().toISOString().slice(0, 10);
    return { buffer: await buildExport(spec, rows, lang), fileName: `${scopeCode}-${type}-${date}.xlsx` };
  }
}
