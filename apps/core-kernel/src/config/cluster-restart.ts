/**
 * Phase 3.6.4 — Cluster worker crash-loop backoff (2026-10-10)
 *
 * Асуудал: main.ts worker унах бүрт ТЭР ДОР нь шинийг fork хийдэг байв. Эхлэх үедээ унадаг
 * worker (жнь DB/Redis асаагүй, .env буруу) секундэд олон удаа fork → CPU/лог дүүрнэ.
 *
 * Бодлого (дангаар унасан worker-т зан төлөв ӨӨРЧЛӨГДӨХГҮЙ):
 *   - Сүүлийн `windowMs` доторх унасан тоо n.
 *   - n = 1 → шууд (0ms) дахин асаана (cluster-check.ts-ийн "нэг worker kill" сценари хэвээр).
 *   - n ≥ 2 → baseDelayMs · 2^(n−2), дээд хязгаар maxDelayMs (1с, 2с, 4с … 30с).
 *   - Хэзээ ч "бууж өгөхгүй" — эрүүл worker-уудыг унагахгүй, хамгийн ихдээ maxDelayMs тутам оролдоно.
 */

export interface RestartPolicyOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  windowMs: number;
}

export const DEFAULT_RESTART_POLICY: RestartPolicyOptions = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  windowMs: 60_000,
};

const positiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** CLUSTER_RESTART_BASE_MS / CLUSTER_RESTART_MAX_MS / CLUSTER_RESTART_WINDOW_MS — буруу утга → default */
export function resolveRestartPolicyOptions(env: NodeJS.ProcessEnv = process.env): RestartPolicyOptions {
  const baseDelayMs = positiveInt(env.CLUSTER_RESTART_BASE_MS, DEFAULT_RESTART_POLICY.baseDelayMs);
  const maxDelayMs = Math.max(baseDelayMs, positiveInt(env.CLUSTER_RESTART_MAX_MS, DEFAULT_RESTART_POLICY.maxDelayMs));
  const windowMs = positiveInt(env.CLUSTER_RESTART_WINDOW_MS, DEFAULT_RESTART_POLICY.windowMs);
  return { baseDelayMs, maxDelayMs, windowMs };
}

export class RestartPolicy {
  private exits: number[] = [];

  constructor(
    private readonly options: RestartPolicyOptions = DEFAULT_RESTART_POLICY,
    private readonly now: () => number = Date.now,
  ) {}

  /** Worker унасныг бүртгээд дахин асаах хүртэл хүлээх хугацааг (ms) буцаана */
  nextDelayMs(): number {
    const t = this.now();
    this.exits = this.exits.filter((e) => t - e < this.options.windowMs);
    this.exits.push(t);
    const n = this.exits.length;
    if (n <= 1) return 0;
    // 2^(n−2) хэт томрохоос сэргийлж зэргийг 30-аар хязгаарлана (дараа нь maxDelayMs таслана)
    const delay = this.options.baseDelayMs * 2 ** Math.min(n - 2, 30);
    return Math.min(delay, this.options.maxDelayMs);
  }

  /** Сүүлийн цонхонд бүртгэгдсэн унасан тоо (лог/тестэд) */
  recentExits(): number {
    const t = this.now();
    return this.exits.filter((e) => t - e < this.options.windowMs).length;
  }
}

/** main.ts-ийн primary процессын логик — тестлэхийн тулд cluster/timer-ийг гаднаас өгнө */
export interface ClusterWorkerLike {
  process: { pid?: number };
  exitedAfterDisconnect?: boolean;
}
export interface ClusterLike {
  fork(): unknown;
  on(event: 'online', cb: (worker: ClusterWorkerLike) => void): unknown;
  on(event: 'exit', cb: (worker: ClusterWorkerLike, code: number | null, signal: string | null) => void): unknown;
}
export interface ClusterPrimaryDeps {
  schedule: (fn: () => void, ms: number) => unknown;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export function startClusterPrimary(
  c: ClusterLike,
  workers: number,
  policy: RestartPolicy,
  deps: ClusterPrimaryDeps = { schedule: (fn, ms) => setTimeout(fn, ms), log: console.log, warn: console.warn },
): void {
  for (let index = 0; index < workers; index += 1) c.fork();
  // Phase 3.4: apps/e2e/tests/cluster-check.ts энэ мөрүүдийг (online / died) regex-ээр танина — форматыг бүү өөрчил
  c.on('online', (worker) => deps.log(`Worker ${worker.process.pid} online`));
  c.on('exit', (worker, code, signal) => {
    // disconnect()/kill()-ээр санаатай зогсоосон (shutdown) worker-ийг дахин асаахгүй
    if (worker.exitedAfterDisconnect) {
      deps.log(`Worker ${worker.process.pid} stopped (disconnect) — not restarting`);
      return;
    }
    const delayMs = policy.nextDelayMs();
    const why = signal ? `signal ${signal}` : `code ${code}`;
    if (delayMs === 0) {
      deps.warn(`Worker ${worker.process.pid} died (${why}) — restarting`);
      c.fork();
      return;
    }
    deps.warn(
      `Worker ${worker.process.pid} died (${why}) — restarting in ${delayMs}ms ` +
        `(crash-loop backoff: ${policy.recentExits()} exits in window)`,
    );
    deps.schedule(() => c.fork(), delayMs);
  });
}
