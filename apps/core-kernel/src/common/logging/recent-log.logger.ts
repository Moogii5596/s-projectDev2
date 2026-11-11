import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { tenantStorage } from '../../db/tenant-storage';
import { currentRequestId } from '../observability/request-context';
import { maskSecrets } from './mask-secrets';

export { maskSecrets };

export interface RecentLogEntry {
  at: string;
  level: 'error' | 'warn';
  context: string | null;
  message: string;
}

const MAX = 300;
const buffer: RecentLogEntry[] = [];


/**
 * v0.2.4 Блок 10 (DBG-01) — Nest Logger-ийн error/warn-ийг санах ойн цагираган буферт (≤300) хадгалж Debug цэсэнд харуулна.
 * Процессын түвшинд (бүх tenant) — Debug API зөвхөн нэг tenant-тай deploy эсвэл super admin-д харуулна.
 */
export class RecentLogLogger extends ConsoleLogger {
  static entries(level?: 'error' | 'warn'): RecentLogEntry[] {
    return buffer.filter((e) => !level || e.level === level).slice().reverse();
  }

  static record(level: 'error' | 'warn', message: unknown, context?: unknown): void {
    const text = message instanceof Error ? `${message.message}\n${message.stack ?? ''}` : typeof message === 'string' ? message : JSON.stringify(message);
    buffer.push({ at: new Date().toISOString(), level, context: typeof context === 'string' ? context : null, message: maskSecrets(String(text)).slice(0, 4000) });
    if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  }

  static clear(): void {
    buffer.length = 0;
  }

  /**
   * v0.2.5 H3 (#18): `LOG_FORMAT=json` → нэг мөр JSON (Render лог хайлт): `requestId`, `tenantId` нэмж, нууцыг нууцална.
   * Бусад үед Nest-ийн энгийн өнгөт лог (dev).
   */
  static create(env: Record<string, string | undefined> = process.env): RecentLogLogger {
    return env['LOG_FORMAT']?.trim().toLowerCase() === 'json'
      ? new RecentLogLogger({ json: true, colors: false })
      : new RecentLogLogger();
  }

  protected override getJsonLogObject(
    message: unknown,
    options: { context: string; logLevel: LogLevel; writeStreamType?: 'stdout' | 'stderr'; errorStack?: unknown },
  ) {
    const obj = super.getJsonLogObject(typeof message === 'string' ? maskSecrets(message) : message, options);
    const extra = obj as Record<string, unknown>;
    if (typeof extra['stack'] === 'string') extra['stack'] = maskSecrets(extra['stack']);
    const requestId = currentRequestId();
    const tenantId = tenantStorage.getStore()?.tenantId;
    if (requestId) extra['requestId'] = requestId;
    if (tenantId) extra['tenantId'] = tenantId;
    return obj;
  }

  override error(message: unknown, ...rest: unknown[]): void {
    const context = rest.length ? rest[rest.length - 1] : this.context;
    const stack = rest.length > 1 ? rest[0] : undefined;
    RecentLogLogger.record('error', typeof stack === 'string' && stack ? `${String(message)}\n${stack}` : message, context);
    super.error(message, ...(rest as []));
  }

  override warn(message: unknown, ...rest: unknown[]): void {
    RecentLogLogger.record('warn', message, rest.length ? rest[rest.length - 1] : this.context);
    super.warn(message, ...(rest as []));
  }
}
