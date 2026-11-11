/**
 * v0.2.5 H3 (#18) — Sentry (backend). main.ts-ийн ЭХНИЙ import байна (бусад модулиас өмнө instrument хийнэ).
 * `SENTRY_DSN` хоосон бол юу ч хийхгүй (dev, тест). PII илгээхгүй: толгой, cookie, body, хэрэглэгчийн имэйл/IP-г хасна,
 * мессеж/stack дахь токен, нууц үг, имэйл, утсыг `maskSecrets`-ээр нууцална.
 */
import * as Sentry from '@sentry/nestjs';
import { APP_VERSION } from './config/app-version';
import { maskSecrets } from './common/logging/mask-secrets';
import { currentRequestId } from './common/observability/request-context';
import { tenantStorage } from './db/tenant-storage';

type SentryEvent = Sentry.ErrorEvent;

/** Илгээхийн өмнө PII цэвэрлэх (unit тесттэй) */
export function scrubSentryEvent(event: SentryEvent): SentryEvent {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { method, url: url ? url.split('?')[0] : url };
  }
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  if (event.message) event.message = maskSecrets(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = maskSecrets(ex.value);
  }
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = maskSecrets(b.message);
    if (b.data) delete b.data;
  }
  const requestId = currentRequestId();
  const tenantId = tenantStorage.getStore()?.tenantId;
  event.tags = { ...event.tags, ...(requestId ? { requestId } : {}), ...(tenantId ? { tenantId } : {}) };
  return event;
}

export function sentryRelease(env: Record<string, string | undefined> = process.env): string {
  const sha = (env['GIT_COMMIT'] ?? env['RENDER_GIT_COMMIT'] ?? '').slice(0, 12);
  return `s-project-api@${APP_VERSION}${sha ? `+${sha}` : ''}`;
}

export const sentryEnabled = (env: Record<string, string | undefined> = process.env): boolean => !!env['SENTRY_DSN']?.trim();

if (sentryEnabled()) {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
    release: sentryRelease(),
    // PII цуглуулахгүй (Sentry 11 `dataCollection`); beforeSend нь давхар хамгаалалт
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? 0) || 0,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}
