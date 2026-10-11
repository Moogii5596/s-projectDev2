import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { createHash } from 'crypto';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { requireRole } from '../helpers/require-role.helper';
import { cellText, looksLikeXlsx, normToken } from '../xlsx/cells';
import { badRequest } from './app-error';
import { catalog } from './catalog';
import { isLang, Lang, LANGS } from './i18n-context';
import { I18nOverridesLoader } from './i18n.interceptor';
import { I18nParams, t, templateVars } from './translate';

const ADMIN_ROLES = [UserRole.OWNER, UserRole.ADMIN];
const CACHE_MS = 60_000;
export const I18N_MAX_TEXT = 500;
const MAX_BYTES = 2 * 1024 * 1024;

type Tx = Parameters<Parameters<PrismaTenantClientService['$transaction']>[0]>[0];

export interface I18nChange {
  key: string;
  lang: Lang;
  /** Одоогийн (засвар ?? анхдагч) */
  from: string;
  /** null = анхдагч руу буцаах */
  to: string | null;
}
export interface I18nRowError {
  row: number;
  key: string;
  lang?: Lang;
  code: string;
  params: I18nParams;
  message: string;
}

/** CSV (RFC 4180): UTF-8 BOM, таслал / цэг таслал / tab-ыг толгойгоос таньна */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = [';', '\t', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** xlsx/csv → [толгой, ...мөрүүд] (текст) */
async function readGrid(buffer: Buffer, fileName: string): Promise<string[][]> {
  if (buffer.length > MAX_BYTES) throw badRequest('import.file_too_large', { max: 2 });
  if (looksLikeXlsx(buffer)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw badRequest('import.unreadable');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest('import.no_sheet');
    const out: string[][] = [];
    const width = ws.columnCount;
    ws.eachRow({ includeEmpty: false }, (row) => {
      out.push(Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value)));
    });
    return out;
  }
  if (!/\.csv$/i.test(fileName) && buffer.includes(0)) throw badRequest('i18n.bad_file');
  return parseCsv(buffer.toString('utf8'));
}

/**
 * v0.2.0 §0.7 — Байгууллагын орчуулгын засвар: ачаалах (≤60с cache, бичихэд шууд цэвэрлэнэ), Excel/CSV экспорт-импорт,
 * анхдагч руу буцаах, түүх. Засах эрх: OWNER/ADMIN.
 */
@Injectable()
export class I18nOverridesService extends I18nOverridesLoader {
  private cache = new Map<string, { at: number; map: Map<string, string>; version: string }>();

  constructor(private readonly prisma: PrismaTenantClientService) {
    super();
  }

  private tx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  private async entry(tenantId: string) {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const rows = await this.tx(tenantId, (tx) => tx.i18nOverride.findMany({ where: { tenantId }, select: { key: true, lang: true, text: true, updatedAt: true } }));
    const map = new Map(rows.map((r) => [`${r.lang}:${r.key}`, r.text]));
    const version = createHash('sha1')
      .update(rows.map((r) => `${r.lang}:${r.key}:${r.updatedAt.getTime()}`).sort().join('|'))
      .digest('hex')
      .slice(0, 12);
    const e = { at: Date.now(), map, version };
    this.cache.set(tenantId, e);
    return e;
  }

  async load(tenantId: string): Promise<ReadonlyMap<string, string>> {
    return (await this.entry(tenantId)).map;
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }

  /** GET /i18n/web/:lang — frontend-ийн засварууд (хувилбартай; ETag) */
  async webMessages(tenantId: string, lang: Lang) {
    const { map, version } = await this.entry(tenantId);
    const messages: Record<string, string> = {};
    const cat = catalog();
    for (const [k, text] of map) {
      const [l, key] = [k.slice(0, 2), k.slice(3)];
      if (l === lang && cat.get(key)?.section === 'web') messages[key] = text;
    }
    return { lang, version, messages };
  }

  // ── Админ ────────────────────────────────────────────────

  async exportXlsx(tenantId: string, authId: string): Promise<Buffer> {
    await this.tx(tenantId, (tx) => requireRole(tx, tenantId, authId, ADMIN_ROLES));
    const { map } = await this.entry(tenantId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t('i18n.sheet_name'));
    ws.columns = [
      { header: 'key', key: 'key', width: 40 },
      { header: t('i18n.col.section'), key: 'section', width: 10 },
      { header: t('i18n.col.default_mn'), key: 'def', width: 40 },
      ...LANGS.map((l) => ({ header: l, key: l, width: 44 })),
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
    for (const e of catalog().values()) {
      ws.addRow({ key: e.key, section: e.section, def: e.defaults.mn, ...Object.fromEntries(LANGS.map((l) => [l, map.get(`${l}:${e.key}`) ?? e.defaults[l]])) });
    }
    const help = wb.addWorksheet(t('xlsx.help_sheet'));
    help.getColumn(1).width = 120;
    help.getCell('A1').value = t('i18n.help');
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Файл → өөрчлөлтийн жагсаалт (хуучин → шинэ) + алдаа. Юу ч бичихгүй. */
  async preview(tenantId: string, authId: string, buffer: Buffer, fileName: string) {
    await this.tx(tenantId, (tx) => requireRole(tx, tenantId, authId, ADMIN_ROLES));
    const grid = await readGrid(buffer, fileName);
    if (grid.length === 0) throw badRequest('import.empty');
    const header = grid[0].map((h) => normToken(h));
    const keyCol = header.indexOf('KEY');
    if (keyCol < 0) throw badRequest('i18n.no_key_column');
    const langCols = LANGS.map((l) => [l, header.indexOf(l.toUpperCase())] as const).filter(([, i]) => i >= 0);
    const { map } = await this.entry(tenantId);
    const cat = catalog();
    const changes: I18nChange[] = [];
    const errors: I18nRowError[] = [];
    let unchanged = 0;
    const err = (row: number, key: string, code: string, params: I18nParams, lang?: Lang) => errors.push({ row, key, lang, code, params, message: t(code, params) });
    grid.slice(1).forEach((cells, i) => {
      const row = i + 2;
      const key = (cells[keyCol] ?? '').trim();
      if (!key) return;
      const entry = cat.get(key);
      if (!entry) return err(row, key, 'i18n.unknown_key', { key });
      for (const [lang, col] of langCols) {
        const raw = (cells[col] ?? '').replace(/\r\n/g, '\n').trim();
        const current = map.get(`${lang}:${key}`) ?? entry.defaults[lang];
        const to = raw === '' || raw === entry.defaults[lang] ? null : raw;
        const effective = to ?? entry.defaults[lang];
        if (effective === current) {
          unchanged++;
          continue;
        }
        if (to !== null) {
          if (to.length > I18N_MAX_TEXT) {
            err(row, key, 'i18n.too_long', { max: I18N_MAX_TEXT }, lang);
            continue;
          }
          const got = templateVars(to);
          if (got.join(',') !== entry.vars.join(',')) {
            err(row, key, 'i18n.vars_mismatch', { expected: entry.vars.map((v) => `{${v}}`).join(' ') || '—', got: got.map((v) => `{${v}}`).join(' ') || '—' }, lang);
            continue;
          }
        }
        changes.push({ key, lang, from: current, to });
      }
    });
    return { changes, errors, unchanged };
  }

  /** Урьдчилсан харагдацаас баталгаажуулсан өөрчлөлт — дахин шалгаад бичнэ (+ түүх), cache шууд цэвэрлэнэ */
  async apply(tenantId: string, authId: string, changes: { key: string; lang: string; to: string | null }[]) {
    const cat = catalog();
    for (const c of changes) {
      const entry = cat.get(c.key);
      if (!entry) throw badRequest('i18n.unknown_key', { key: c.key });
      if (!isLang(c.lang)) throw badRequest('i18n.unknown_key', { key: `${c.lang}:${c.key}` });
      if (c.to !== null) {
        if (c.to.length > I18N_MAX_TEXT) throw badRequest('i18n.too_long', { max: I18N_MAX_TEXT });
        const got = templateVars(c.to);
        if (got.join(',') !== entry.vars.join(',')) {
          throw badRequest('i18n.vars_mismatch', { expected: entry.vars.map((v) => `{${v}}`).join(' ') || '—', got: got.map((v) => `{${v}}`).join(' ') || '—' });
        }
      }
    }
    const applied = await this.tx(tenantId, async (tx) => {
      const userId = await requireRole(tx, tenantId, authId, ADMIN_ROLES);
      let n = 0;
      for (const c of changes) {
        const entry = cat.get(c.key)!;
        const to = c.to === null || c.to === entry.defaults[c.lang as Lang] ? null : c.to;
        const cur = await tx.i18nOverride.findUnique({ where: { tenantId_key_lang: { tenantId, key: c.key, lang: c.lang } }, select: { text: true } });
        if ((cur?.text ?? null) === to) continue;
        if (to === null) await tx.i18nOverride.delete({ where: { tenantId_key_lang: { tenantId, key: c.key, lang: c.lang } } });
        else {
          await tx.i18nOverride.upsert({
            where: { tenantId_key_lang: { tenantId, key: c.key, lang: c.lang } },
            create: { tenantId, key: c.key, lang: c.lang, text: to, updatedBy: userId },
            update: { text: to, updatedBy: userId, updatedAt: new Date() },
          });
        }
        await tx.i18nOverrideHistory.create({ data: { tenantId, key: c.key, lang: c.lang, oldText: cur?.text ?? null, newText: to, source: c.to === null ? 'RESET' : 'IMPORT', changedBy: userId } });
        n++;
      }
      return n;
    });
    this.invalidate(tenantId);
    return { applied };
  }

  async history(tenantId: string, authId: string, key?: string) {
    return this.tx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, ADMIN_ROLES);
      const rows = await tx.i18nOverrideHistory.findMany({ where: { tenantId, ...(key ? { key } : {}) }, orderBy: [{ changedAt: 'desc' }, { id: 'desc' }], take: 200 });
      const users = await tx.coreUser.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.changedBy))] } }, select: { id: true, fullName: true, email: true } });
      const name = new Map(users.map((u) => [u.id, u.fullName || u.email]));
      return rows.map((r) => ({ ...r, changedByName: name.get(r.changedBy) ?? null }));
    });
  }

  /** Одоогийн засварын жагсаалт (UI) */
  async listOverrides(tenantId: string, authId: string) {
    return this.tx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, ADMIN_ROLES);
      const rows = await tx.i18nOverride.findMany({ where: { tenantId }, orderBy: [{ key: 'asc' }, { lang: 'asc' }] });
      const cat = catalog();
      return rows.map((r) => ({ key: r.key, lang: r.lang, text: r.text, default: cat.get(r.key)?.defaults[r.lang as Lang] ?? null, updatedAt: r.updatedAt }));
    });
  }
}
