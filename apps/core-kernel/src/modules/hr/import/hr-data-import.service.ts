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
  type CellValue,
  type TableSpec,
} from '../../../common/xlsx/table-spec';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { getCampOr404 } from '../../camp/common/camp-lookup';
import { inTenantTx, Tx } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { departmentsHandler } from './departments.handler';
import { employeesHandler } from './employees.handler';
import { formerEmployeesHandler } from './former-employees.handler';
import { positionsHandler } from './positions.handler';
import { DataImportHandler, ImportCtx, PlannedRow } from './import-types';

/**
 * URL-ийн төрөл → handler. HR-ийн өөрийнх энд; бусад модуль `registerHandler`-ээр нэмнэ
 * (v0.2.3 Блок D: Кемп — building-types, buildings, rooms, room-allocations, `CampHrBridge`).
 */
const BUILT_IN: Record<string, DataImportHandler> = {
  employees: employeesHandler,
  'former-employees': formerEmployeesHandler,
  departments: departmentsHandler,
  positions: positionsHandler,
};
/** Экспортын нэмэлт төрөл (HR-ийн импортын handler-гүй) — бусад модуль бүртгэнэ (жишээ нь Кемпийн `rooms`, v0.2.2 H1) */
export interface ExtraExport {
  spec: TableSpec;
  rows(tx: Tx, ctx: ImportCtx): Promise<Record<string, CellValue>[]>;
}
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
  }));
}

/** Хадгалах: зөвхөн задлагдсан мөр (DB-ийн шалгалтыг confirm дахин хийнэ) */
const storable = (rows: ParsedTableRow[]) => rows.map(({ row, values, errors }) => ({ row, values, errors })) as unknown as Prisma.InputJsonValue;

/**
 * v0.2.0 §0.5 — Мастер өгөгдлийн импорт (ажилтан FB-08, хэлтэс FB-02) ба экспорт (+ өрөө §2.4).
 * Урсгал: preview (задлах → DB-тэй шалгах → PREVIEW хадгалах) → confirm (түгжээ → ДАХИН шалгах → бичих → түүх IMPORT)
 *   - skipErrors=false (анхдагч): алдаатай мөр байвал юу ч бичихгүй (409, мөрийн алдаатай)
 *   - skipErrors=true: зөв мөрүүдийг л бичнэ ("Алдаатай мөрийг алгасаж бусдыг оруулах")
 */
@Injectable()
export class HrDataImportService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  private readonly extraExports = new Map<string, ExtraExport>();
  private readonly handlers = new Map<string, DataImportHandler>(Object.entries(BUILT_IN));
  private readonly byEnum = new Map<CampDataImportType, DataImportHandler>(Object.values(BUILT_IN).map((h) => [h.type, h]));

  /** Импортын нэмэлт төрөл бүртгэх (Кемп: өрөөний тохиргоо, байрлуулалт) — `CampHrBridge.onModuleInit` */
  registerHandler(type: string, handler: DataImportHandler): void {
    this.handlers.set(type, handler);
    this.byEnum.set(handler.type, handler);
  }

  /** Бүртгэлтэй импортын төрлүүд (URL) */
  types(): string[] {
    return [...this.handlers.keys()];
  }

  private handlerFor(type: string): DataImportHandler {
    const h = this.handlers.get(type);
    if (!h) throw badRequest('import.unknown_type', { type });
    return h;
  }

  private handlerOf(type: CampDataImportType): DataImportHandler {
    const h = this.byEnum.get(type);
    if (!h) throw badRequest('import.unknown_type', { type });
    return h;
  }

  /** Нэмэлт экспорт бүртгэх (Кемп: `rooms`) — `CampHrBridge.onModuleInit` */
  registerExport(type: string, exporter: ExtraExport): void {
    this.extraExports.set(type, exporter);
  }

  template(type: string): Promise<Buffer> {
    return buildTemplate(this.handlerFor(type).spec, currentLang());
  }

  async preview(tenantId: string, authId: string, campId: string, type: string, input: ImportInput) {
    const h = this.handlerFor(type);
    const parsed = input.kind === 'xlsx' ? await parseTableXlsx(input.buffer, h.spec) : parseTableRows(input.rows, h.spec);
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.require(tx, tenantId, authId, campId, h.permission);
        await getCampOr404(tx, tenantId, campId);
        const plan = await h.plan(tx, { tenantId, campId }, parsed);
        const imp = await tx.campDataImport.create({
          data: {
            tenantId, campId, type: h.type,
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

  async list(tenantId: string, authId: string, campId: string, type?: string) {
    const h = type ? this.handlerFor(type) : null;
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      return tx.campDataImport.findMany({
        where: { tenantId, campId, ...(h ? { type: h.type } : {}) },
        select: IMPORT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
    });
  }

  /** Одоогийн DB-тэй дахин харьцуулсан харагдац (зөвхөн унших) */
  async get(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const imp = await this.load(tx, tenantId, campId, id);
      const h = this.handlerOf(imp.type);
      await this.access.require(tx, tenantId, authId, campId, h.permission);
      const plan = await h.plan(tx, { tenantId, campId }, imp.parsedRows as unknown as ParsedTableRow[]);
      const { parsedRows: _omit, ...rest } = imp;
      return { import: rest, rows: viewRows(h, plan) };
    });
  }

  private async load(tx: Tx, tenantId: string, campId: string, id: string) {
    const imp = await tx.campDataImport.findFirst({ where: { id, tenantId, campId }, select: { ...IMPORT_SELECT, parsedRows: true } });
    if (!imp) throw notFound('import.not_found');
    return imp;
  }

  async confirm(tenantId: string, authId: string, campId: string, id: string, skipErrors = false) {
    const result = await withCampErrors(() =>
      inTenantTx(
        this.prisma,
        tenantId,
        async (tx) => {
          const peek = await this.load(tx, tenantId, campId, id);
          const h = this.handlerOf(peek.type);
          const actorUserId = await this.access.require(tx, tenantId, authId, campId, h.permission);
          // Нэг кемпийн мастер өгөгдлийн импорт дараалан (зэрэгцээ confirm / давхар дарах)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`camp-data-import:${campId}`}))`;
          const imp = await this.load(tx, tenantId, campId, id);
          if (imp.status !== CampDataImportStatus.PREVIEW) throw conflict('import.not_preview', { status: imp.status });
          const plan = await h.plan(tx, { tenantId, campId }, imp.parsedRows as unknown as ParsedTableRow[]);
          const c = counts(plan);
          if (c.errorRows > 0 && !skipErrors) {
            await tx.campDataImport.update({ where: { id }, data: c });
            return { ok: false as const, h, plan, c };
          }
          const applied = await h.apply(tx, { tenantId, campId, actorUserId, importId: id, audit: this.audit }, plan.filter((r) => r.op === 'create' || r.op === 'update'));
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

  async cancel(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const imp = await this.load(tx, tenantId, campId, id);
      await this.access.require(tx, tenantId, authId, campId, this.handlerOf(imp.type).permission);
      const res = await tx.campDataImport.updateMany({ where: { id, tenantId, campId, status: CampDataImportStatus.PREVIEW }, data: { status: CampDataImportStatus.CANCELLED } });
      if (res.count !== 1) throw conflict('import.not_preview', { status: imp.status });
      return { status: CampDataImportStatus.CANCELLED };
    });
  }

  /** Экспорт = импортын формат (хэрэглэгчийн хэлээр) */
  async export(tenantId: string, authId: string, campId: string, type: string): Promise<{ buffer: Buffer; fileName: string }> {
    const extra = this.extraExports.get(type);
    if (!extra && !this.handlers.has(type)) throw badRequest('import.unknown_type', { type });
    const lang = currentLang();
    const { spec, rows, campCode } = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const camp = await getCampOr404(tx, tenantId, campId);
      const ctx = { tenantId, campId };
      if (extra) return { spec: extra.spec, rows: await extra.rows(tx, ctx), campCode: camp.code };
      const h = this.handlerFor(type);
      return { spec: h.spec, rows: await h.exportRows(tx, ctx), campCode: camp.code };
    });
    const date = new Date().toISOString().slice(0, 10);
    return { buffer: await buildExport(spec, rows, lang), fileName: `${campCode}-${type}-${date}.xlsx` };
  }
}
