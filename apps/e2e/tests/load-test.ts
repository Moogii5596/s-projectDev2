/**
 * Sprint 8 DoD load test — Phase 3.2 (2026-10-08)
 *
 * Шалгана:
 *   1. 100 concurrent, LOAD_TEST_DURATION сек → p99 < 500ms, 2xx-ээс бусад хариу = 0 (429/500 ч алдаа)
 *   2. Redis cache hit rate > 80%  (Redis INFO keyspace_hits/misses — тестийн өмнө/дараах зөрүү)
 *   3. Cursor pagination (10,000+ MR) — дараалсан 20 хуудас, хуудас бүр < 100ms (cache-гүй анхны хүсэлт)
 *
 * Ажиллуулах (repo root, backend + Supabase + Redis асаалттай):
 *   pnpm --filter e2e exec tsx tests/load-test.ts
 * Backend-ийг load test-д өндөр rate limit-тэй асаана (эс тэгвээс 429):
 *   RATE_LIMIT_SHORT=1000000 RATE_LIMIT_MEDIUM=1000000 RATE_LIMIT_LONG=1000000
 * 10k MR: supabase/dev/seed_perf_10k_mr.sql
 *
 * Env (root .env-ээс автоматаар уншина): SUPABASE_URL, SUPABASE_ANON_KEY, REDIS_URL
 * Сонголттой: API_URL (http://localhost:3000), TEST_EMAIL/TEST_PASSWORD (admin@test.mn/test1234),
 *   TEST_TOKEN (өгвөл нэвтрэхгүй), LOAD_TEST_DURATION (30), LOAD_TEST_CONNECTIONS (100)
 */
import autocannon from 'autocannon';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';

// ── .env (dependency-гүй — Node ≥ 20.12 process.loadEnvFile) ──
const rootEnv = resolve(__dirname, '../../../.env');
const loadEnvFile = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
if (existsSync(rootEnv) && loadEnvFile) loadEnvFile(rootEnv);

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const LIST_URL = `${API_URL}/api/v1/requisitions`;
const DURATION = Number.parseInt(process.env.LOAD_TEST_DURATION ?? '30', 10);
const CONNECTIONS = Number.parseInt(process.env.LOAD_TEST_CONNECTIONS ?? '100', 10);

const THRESHOLDS = { p99Ms: 500, cacheHitRate: 0.8, cursorPageMs: 100, cursorPages: 20, minRows: 10_000 };

// ── 1. Token ──────────────────────────────────────────────────
async function getToken(): Promise<string> {
  if (process.env.TEST_TOKEN) return process.env.TEST_TOKEN;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY байхгүй (root .env эсвэл TEST_TOKEN)');
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_EMAIL ?? 'admin@test.mn',
      password: process.env.TEST_PASSWORD ?? 'test1234',
    }),
  });
  const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Supabase нэвтрэлт амжилтгүй (${res.status}): ${body.error_description ?? body.msg ?? ''}`);
  }
  return body.access_token;
}

// ── 2. Redis INFO (RESP, dependency-гүй) ──────────────────────
export function parseRedisStats(info: string): { hits: number; misses: number } {
  const read = (k: string): number => {
    const m = new RegExp(`^${k}:(\\d+)`, 'm').exec(info);
    if (!m) throw new Error(`Redis INFO-д ${k} алга`);
    return Number(m[1]);
  };
  return { hits: read('keyspace_hits'), misses: read('keyspace_misses') };
}

function redisInfo(redisUrl: string): Promise<string> {
  const u = new URL(redisUrl);
  return new Promise((resolveInfo, reject) => {
    const socket = createConnection({ host: u.hostname, port: Number(u.port || 6379) });
    let buf = '';
    const cmd = (...args: string[]) => `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('')}`;
    socket.setTimeout(5000, () => socket.destroy(new Error('Redis timeout')));
    socket.on('connect', () => {
      if (u.password) socket.write(cmd('AUTH', decodeURIComponent(u.password)));
      socket.write(cmd('INFO', 'stats'));
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const m = /\$(\d+)\r\n/.exec(buf);
      if (m && Buffer.byteLength(buf.slice(m.index + m[0].length)) >= Number(m[1])) {
        socket.end();
        resolveInfo(buf.slice(m.index + m[0].length));
      } else if (buf.startsWith('-')) {
        socket.end();
        reject(new Error(`Redis: ${buf.trim()}`));
      }
    });
    socket.on('error', reject);
  });
}

// ── 3. Cursor ─────────────────────────────────────────────────
// apps/core-kernel/src/common/utils/cursor.ts encodeCursor-тэй ижил формат
const encodeCursor = (id: string, createdAt: string) =>
  Buffer.from(JSON.stringify({ id, createdAt: new Date(createdAt).toISOString() })).toString('base64url');

async function getJson(url: string, token: string): Promise<{ status: number; ms: number; body: any }> {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  return { status: res.status, ms: performance.now() - t0, body };
}

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const checks: Check[] = [];
  const token = await getToken();

  // Preflight — тохиргооны алдааг load test эхлэхээс өмнө тодорхой мессежээр барина
  const pre = await getJson(`${LIST_URL}?limit=20`, token);
  if (pre.status !== 200) {
    const hint: Record<number, string> = {
      401: 'Token хүчингүй — SUPABASE_URL/ANON_KEY backend-тэй ижил эсэх',
      403: 'Tenant эсвэл membership (SEC-001) — core_users.auth_id нь Supabase auth.users.id-тай таарч байгаа эсэх',
      429: 'Rate limit — backend-ийг RATE_LIMIT_SHORT/MEDIUM/LONG=1000000-тай асаана',
    };
    throw new Error(`Preflight GET /requisitions → ${pre.status}. ${hint[pre.status] ?? JSON.stringify(pre.body)}`);
  }
  const total: number = pre.body?.total ?? 0;
  console.log(`Preflight OK — tenant-ийн MR: ${total}`);

  // ── Load test + cache hit rate ──
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  let before: { hits: number; misses: number } | null = null;
  try {
    before = parseRedisStats(await redisInfo(redisUrl));
  } catch (e) {
    // Шалгаж чадаагүй DoD-ийг "давсан" гэж харуулахгүй
    checks.push({ name: `Cache hit rate > ${THRESHOLDS.cacheHitRate * 100}%`, ok: false, detail: `Redis INFO уншиж чадсангүй (${redisUrl}): ${(e as Error).message}` });
  }

  console.log(`Load test: ${CONNECTIONS} connections × ${DURATION}s → ${LIST_URL}`);
  const result = await autocannon({
    url: LIST_URL,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { Authorization: `Bearer ${token}` },
  });

  const status429 = result.statusCodeStats?.['429']?.count ?? 0;
  const badResponses = result.non2xx + result.errors + result.timeouts;
  checks.push({ name: `p99 < ${THRESHOLDS.p99Ms}ms`, ok: result.latency.p99 < THRESHOLDS.p99Ms, detail: `p99=${result.latency.p99}ms, avg=${result.latency.average}ms, ${Math.round(result.requests.average)} req/s` });
  checks.push({
    name: 'Алдаа 0% (non-2xx + socket + timeout)',
    ok: badResponses === 0,
    detail: `2xx=${result['2xx']}, non2xx=${result.non2xx} (429=${status429}), errors=${result.errors}, timeouts=${result.timeouts}` +
      (status429 > 0 ? ' → backend-ийг RATE_LIMIT_*=1000000-тай асаа' : ''),
  });

  if (before) {
    const after = parseRedisStats(await redisInfo(redisUrl));
    const hits = after.hits - before.hits;
    const misses = after.misses - before.misses;
    const rate = hits + misses > 0 ? hits / (hits + misses) : 0;
    checks.push({ name: `Cache hit rate > ${THRESHOLDS.cacheHitRate * 100}%`, ok: rate > THRESHOLDS.cacheHitRate, detail: `${(rate * 100).toFixed(1)}% (hits=${hits}, misses=${misses}; Redis GET бүгд — MR list + tenant/membership cache)` });
  }

  // ── Cursor pagination (10k+) — дараалсан хуудас бүр анхны (cache-гүй) хүсэлт ──
  if (total < THRESHOLDS.minRows) {
    checks.push({ name: `Cursor pagination (${THRESHOLDS.minRows}+ MR)`, ok: false, detail: `MR ${total} ширхэг — supabase/dev/seed_perf_10k_mr.sql ажиллуул` });
  } else {
    const times: number[] = [];
    let failure: string | null = null;
    let last = pre.body.data[pre.body.data.length - 1];
    for (let i = 0; i < THRESHOLDS.cursorPages && last; i++) {
      const r = await getJson(`${LIST_URL}?limit=20&cursor=${encodeCursor(last.id, last.createdAt)}`, token);
      if (r.status !== 200) {
        failure = `хуудас ${i + 1} → ${r.status} ${JSON.stringify(r.body)}`;
        break;
      }
      times.push(r.ms);
      last = r.body.hasMore ? r.body.data[r.body.data.length - 1] : null;
    }
    const max = times.length ? Math.max(...times) : NaN;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : NaN;
    checks.push({
      name: `Cursor pagination хуудас < ${THRESHOLDS.cursorPageMs}ms`,
      ok: !failure && times.length > 0 && max < THRESHOLDS.cursorPageMs,
      detail: failure ?? `${times.length} хуудас, max=${max.toFixed(1)}ms, avg=${avg.toFixed(1)}ms (HTTP, ${total} MR)`,
    });
  }

  console.log('\n── Sprint 8 DoD ──────────────────────────────');
  for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}\n     ${c.detail}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`❌ ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
