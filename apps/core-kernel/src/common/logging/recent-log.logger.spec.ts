import { afterEach, describe, expect, it, vi } from 'vitest';
import { maskSecrets, RecentLogLogger } from './recent-log.logger';

describe('RecentLogLogger (DBG-01)', () => {
  afterEach(() => RecentLogLogger.clear());

  it('нууц мэдээллийг нууцална', () => {
    const out = maskSecrets('Authorization: Bearer abc.def-123 password=Secret1 postgres://u:pw@db:5432/x bat@mail.mn 99112233 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig');
    expect(out).not.toMatch(/abc\.def-123|Secret1|:pw@|bat@mail|99112233|eyJhbGci/);
    expect(out).toContain('b***@mail.mn');
  });

  it('error/warn-ийг буферт (шинэ нь эхэнд), бусдыг оруулахгүй', () => {
    const logger = new RecentLogLogger('T');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    logger.log('info');
    logger.warn('w1');
    logger.error('boom', 'stack-line', 'Ctx');
    const all = RecentLogLogger.entries();
    expect(all.map((e) => e.level)).toEqual(['error', 'warn']);
    expect(all[0]).toMatchObject({ context: 'Ctx', message: 'boom\nstack-line' });
    expect(RecentLogLogger.entries('warn')).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
