import { describe, expect, it, vi } from 'vitest';
import { requestStorage, resolveRequestId } from './request-context';
import { RecentLogLogger } from '../logging/recent-log.logger';
import { tenantStorage } from '../../db/tenant-storage';
import { scrubSentryEvent, sentryEnabled, sentryRelease } from '../../instrument';
import { deployedCommit } from '../../modules/health/health.controller';

describe('observability (v0.2.5 H3 #18)', () => {
  it('requestId: зөв толгойг хэрэглэнэ, буруу/алга → UUID', () => {
    expect(resolveRequestId('abc-12345678')).toBe('abc-12345678');
    expect(resolveRequestId(['req_0123456789'])).toBe('req_0123456789');
    expect(resolveRequestId('bad id with spaces')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('LOG_FORMAT=json → нэг мөр JSON + requestId, tenantId; нууц үг, имэйл нууцлагдана', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const logger = RecentLogLogger.create({ LOG_FORMAT: 'json' });
      requestStorage.run({ requestId: 'req-00000001' }, () =>
        tenantStorage.run({ tenantId: 't-1', userId: 'u-1' }, () => logger.log('login bat@sino.mn password=hunter2', 'Auth')),
      );
      const line = String(write.mock.calls.at(-1)?.[0]);
      const obj = JSON.parse(line) as Record<string, unknown>;
      expect(obj).toMatchObject({ level: 'log', context: 'Auth', requestId: 'req-00000001', tenantId: 't-1' });
      expect(obj['message']).toBe('login b***@sino.mn password=***');
      expect(line.trim().split('\n')).toHaveLength(1);
    } finally {
      write.mockRestore();
    }
  });

  it('LOG_FORMAT хоосон → энгийн (JSON биш) logger', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      RecentLogLogger.create({}).log('hello', 'X');
      expect(() => JSON.parse(String(write.mock.calls.at(-1)?.[0]))).toThrow();
    } finally {
      write.mockRestore();
    }
  });

  it('Sentry scrub: толгой/body/cookie/query, хэрэглэгчийн имэйл/IP хасна; мессеж нууцална; requestId/tenantId tag', () => {
    const event = requestStorage.run({ requestId: 'req-00000002' }, () =>
      tenantStorage.run({ tenantId: 't-9', userId: 'u' }, () =>
        scrubSentryEvent({
          type: undefined,
          message: 'Bearer abc.def.ghi failed for x@y.mn',
          request: { method: 'POST', url: 'https://api/x?token=1', headers: { authorization: 'Bearer z' }, data: { password: 'p' }, cookies: { a: 'b' } },
          user: { id: 'u1', email: 'x@y.mn', ip_address: '1.2.3.4' },
          exception: { values: [{ type: 'Error', value: 'password=secret' }] },
          breadcrumbs: [{ message: 'q 99112233', data: { sql: 'x' } }],
        }),
      ),
    );
    expect(event.request).toEqual({ method: 'POST', url: 'https://api/x' });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.message).toBe('Bearer *** failed for x***@y.mn');
    expect(event.exception?.values?.[0].value).toBe('password=***');
    expect(event.breadcrumbs?.[0]).toEqual({ message: 'q 99****33' });
    expect(event.tags).toMatchObject({ requestId: 'req-00000002', tenantId: 't-9' });
  });

  it('Sentry идэвхжих нөхцөл, release; health commit', () => {
    expect(sentryEnabled({})).toBe(false);
    expect(sentryEnabled({ SENTRY_DSN: ' ' })).toBe(false);
    expect(sentryEnabled({ SENTRY_DSN: 'https://k@o.ingest.sentry.io/1' })).toBe(true);
    expect(sentryRelease({ RENDER_GIT_COMMIT: '0123456789abcdef' })).toMatch(/^s-project-api@\d+\.\d+\.\d+.*\+0123456789ab$/);
    expect(deployedCommit({ RENDER_GIT_COMMIT: 'abc' })).toBe('abc');
    expect(deployedCommit({})).toBeNull();
  });
});
