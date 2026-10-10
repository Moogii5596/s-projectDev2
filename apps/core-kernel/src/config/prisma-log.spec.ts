import { describe, expect, it } from 'vitest';
import { DEFAULT_PRISMA_LOG_LEVELS, resolvePrismaLogLevels } from './prisma-log';

describe('resolvePrismaLogLevels (Phase 3.6.6)', () => {
  it('тохиргоогүй/хоосон → warn,error (production-ийн зан төлөв өөрчлөгдөхгүй)', () => {
    expect(resolvePrismaLogLevels(undefined)).toEqual(['warn', 'error']);
    expect(resolvePrismaLogLevels('  ')).toEqual(DEFAULT_PRISMA_LOG_LEVELS);
  });

  it('"warn" → зөвхөн warn (integration тест); "none" → []', () => {
    expect(resolvePrismaLogLevels('warn')).toEqual(['warn']);
    expect(resolvePrismaLogLevels(' NONE ')).toEqual([]);
  });

  it('жагсаалт: том/жижиг үсэг, зай, давхардал; буруу утгыг алгасна; бүгд буруу → default', () => {
    expect(resolvePrismaLogLevels('Warn, error ,warn,bogus')).toEqual(['warn', 'error']);
    expect(resolvePrismaLogLevels('bogus')).toEqual(['warn', 'error']);
  });

  it('default массивыг гаднаас өөрчилж болохгүй (хуулбар буцаана)', () => {
    resolvePrismaLogLevels(undefined).push('query');
    expect(DEFAULT_PRISMA_LOG_LEVELS).toEqual(['warn', 'error']);
  });
});
