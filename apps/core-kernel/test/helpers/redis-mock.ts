/**
 * Integration тестийн НИЙТЛЭГ Redis (ioredis) mock — [TEST-003]
 *
 * Апп-ын `src/`-д ашиглагддаг БҮХ Redis командыг агуулна.
 * `src/common/tests/redis-mock-coverage.test.ts` нь src-д шинэ Redis команд нэмэгдэхэд
 * энэ mock-д байхгүй бол unit тестийг унагана → integration тест 500-аар унахаас сэргийлнэ.
 *
 * Зан төлөв:
 *   get        → null үргэлж (cache miss → DB-ээс уншина)
 *   incr       → 1 үргэлж    (TenantRateLimitGuard тестэд 429 өгөхгүй)
 *   scanStream → хоосон stream
 */
import { Readable } from 'stream';

export function createRedisMock() {
  const mock = {
    get: async (_key: string): Promise<string | null> => null,
    set: async (..._args: unknown[]): Promise<'OK'> => 'OK',
    setex: async (..._args: unknown[]): Promise<'OK'> => 'OK',
    del: async (..._keys: string[]): Promise<number> => 1,
    incr: async (_key: string): Promise<number> => 1,
    pexpire: async (_key: string, _ms: number): Promise<number> => 1,
    publish: async (_channel: string, _message: string): Promise<number> => 0,
    scanStream: (_opts?: unknown): Readable => Readable.from([] as string[][]),
    on: (..._args: unknown[]) => mock,
    quit: async (): Promise<'OK'> => 'OK',
    disconnect: (): void => undefined,
  };
  return mock;
}
