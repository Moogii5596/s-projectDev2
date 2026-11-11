import { AsyncLocalStorage } from 'node:async_hooks';

/** Хүсэлтийн tenant контекст (TenantContextInterceptor). Хамааралгүй файл — Sentry instrument, logger-ээс Prisma ачаалахгүй импортлоно */
export interface TenantContext {
  tenantId: string;
  userId: string;
}

// AsyncLocalStorage — request бүрт tenant context хадгална
export const tenantStorage = new AsyncLocalStorage<TenantContext>();
