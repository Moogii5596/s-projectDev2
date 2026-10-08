/**
 * Sprint 8 DoD: NODE_CLUSTER_WORKERS=4 → 4 worker асна, нэг нь унавал дахин асна — Phase 3.4 (2026-10-08)
 *
 * Ажиллуулах (repo root; Supabase + Redis асаалттай, `pnpm dev` унтраалттай байж болно — өөр порт ашиглана):
 *   pnpm --filter @s-project/core-kernel build
 *   pnpm --filter e2e exec tsx tests/cluster-check.ts
 *
 * Алхам: build хийсэн backend-ийг 4 worker-тэй асаана → бүгд online + /health 200 →
 *        нэг worker-ийг kill → "died — restarting" + шинэ worker online → /health 200 хэвээр → цэвэрлэнэ.
 *
 * Env: CLUSTER_CHECK_PORT (3100), CLUSTER_CHECK_WORKERS (4),
 *      CLUSTER_CHECK_MAIN (apps/core-kernel/dist/src/main.js — Dockerfile-тэй ижил)
 */
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const rootEnv = resolve(ROOT, '.env');
const loadEnvFile = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
if (existsSync(rootEnv) && loadEnvFile) loadEnvFile(rootEnv);

const MAIN = resolve(process.env.CLUSTER_CHECK_MAIN ?? resolve(ROOT, 'apps/core-kernel/dist/src/main.js'));
const PORT = process.env.CLUSTER_CHECK_PORT ?? '3100';
const WORKERS = Number.parseInt(process.env.CLUSTER_CHECK_WORKERS ?? '4', 10);
const HEALTH = `http://127.0.0.1:${PORT}/api/v1/health`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(HEALTH, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function waitFor(cond: () => boolean | Promise<boolean>, ms: number, what: string): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await cond()) return;
    await sleep(250);
  }
  throw new Error(`Хугацаа дууссан (${ms / 1000}с): ${what}`);
}

async function main() {
  if (!existsSync(MAIN)) {
    throw new Error(`${MAIN} алга — эхлээд: pnpm --filter @s-project/core-kernel build`);
  }

  const online: number[] = [];
  const died: number[] = [];
  const tail: string[] = [];
  const child: ChildProcess = spawn(process.execPath, [MAIN], {
    cwd: resolve(ROOT, 'apps/core-kernel'), // ConfigModule .env-г cwd-ээс уншина (pnpm dev-тэй ижил)
    env: { ...process.env, NODE_CLUSTER_WORKERS: String(WORKERS), PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onLine = (line: string) => {
    tail.push(line);
    if (tail.length > 30) tail.shift();
    const on = /Worker (\d+) online/.exec(line);
    if (on) online.push(Number(on[1]));
    const d = /Worker (\d+) died/.exec(line);
    if (d) died.push(Number(d[1]));
  };
  for (const stream of [child.stdout!, child.stderr!]) {
    let buf = '';
    stream.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      lines.forEach(onLine);
    });
  }

  const alive = (pid: number) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  // Master-ийг эхэлж зогсооно (worker-ууд disconnect-оор гарна), дараа нь үлдсэн worker бүрийг
  const cleanup = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill();
      await Promise.race([exited, sleep(5000)]);
    }
    for (const pid of new Set(online)) {
      if (alive(pid)) { try { process.kill(pid); } catch { /* */ } }
    }
    await waitFor(() => [...new Set(online)].every((pid) => !alive(pid)), 10_000, 'worker процессууд зогсох')
      .catch(() => console.warn('⚠️ Зарим worker процесс зогсоогүй байж магадгүй'));
  };

  try {
    // Crash loop (env/DB алдаа) — worker-ууд эхлэхгүй бол удаан хүлээлгүй зогсооно
    const crashLoop = () => died.length > WORKERS * 2;
    const crashError = () =>
      new Error(`Crash loop — worker-ууд эхлэхгүй ${died.length} удаа унасан (env/DB/Redis?). Доорх log-ийг үз`);

    console.log(`Master PID ${child.pid}: ${WORKERS} worker, port ${PORT}`);
    await waitFor(() => crashLoop() || online.length >= WORKERS, 60_000, `${WORKERS} worker online`);
    if (crashLoop()) throw crashError();
    await waitFor(async () => {
      if (crashLoop()) throw crashError();
      return healthy();
    }, 60_000, `${HEALTH} → 200`);
    console.log(`✅ ${online.length} worker online: ${online.join(', ')}; /health 200`);

    const victim = online[0];
    const before = online.length;
    console.log(`Worker ${victim}-г зогсооно...`);
    process.kill(victim);

    let healthFailures = 0;
    let healthChecks = 0;
    await waitFor(async () => {
      healthChecks++;
      if (!(await healthy())) healthFailures++;
      return died.includes(victim) && online.length > before;
    }, 30_000, `worker ${victim} дахин асах`);
    await waitFor(healthy, 30_000, 'restart дараа /health 200');

    const replacement = online[online.length - 1];
    console.log(`✅ Worker ${victim} унасан → шинэ worker ${replacement} online`);
    console.log(`✅ Restart хугацаанд /health: ${healthChecks - healthFailures}/${healthChecks} амжилттай`);
    console.log('\n── Sprint 8 DoD ──\n✅ NODE_CLUSTER_WORKERS — бүх worker асна, унасан worker дахин асна');
  } catch (err) {
    console.error(`❌ ${(err as Error).message}\n── Сүүлийн log ──\n${tail.join('\n')}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

void main();
