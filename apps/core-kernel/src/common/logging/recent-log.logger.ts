import { ConsoleLogger } from '@nestjs/common';

export interface RecentLogEntry {
  at: string;
  level: 'error' | 'warn';
  context: string | null;
  message: string;
}

const MAX = 300;
const buffer: RecentLogEntry[] = [];

/** Токен, нууц үг, имэйл, утас — Debug-ийн лог дээр нууцлах (QA-20 / D-1) */
export function maskSecrets(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '***jwt***')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)("?)[^\s",;]+/gi, '$1$2***')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1***@')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `${m[0]}***@${m.split('@')[1]}`)
    .replace(/\b(\d{2})\d{4}(\d{2})\b/g, '$1****$2');
}

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
