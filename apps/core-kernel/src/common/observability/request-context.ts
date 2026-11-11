import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * v0.2.5 H3 (#18) — хүсэлтийн контекст (JSON лог, Sentry): `requestId` нь лог бүрт, хариуны `x-request-id` толгойд.
 * Ирсэн `x-request-id` (Render/Vercel proxy) зөв хэлбэртэй бол хэрэглэнэ, үгүй бол шинээр.
 */
export interface RequestContext {
  requestId: string;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveRequestId(header: string | string[] | undefined): string {
  const v = Array.isArray(header) ? header[0] : header;
  return v && VALID_ID.test(v) ? v : randomUUID();
}

export const currentRequestId = (): string | undefined => requestStorage.getStore()?.requestId;

export function registerRequestContext(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (req, reply, done) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    reply.header('x-request-id', requestId);
    requestStorage.run({ requestId }, done);
  });
}
