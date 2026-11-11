/**
 * #32 — процесс доторх (L1) богино хугацааны cache: хүсэлт бүрийн Redis `GET`-ийг багасгана (Upstash Free = 500K команд/сар).
 * Redis = үнэний эх сурвалж хэвээр (L2); L1 нь зөвхөн TTL-ээр (≤ 30 с) хуучирна. Ижил процесс доторх invalidate → L1-ээс шууд устгана.
 * Олон процесс (cluster worker, олон instance) үед өөр процессын invalidate L1-д хамгийн ихдээ TTL хүртэл хоцорно — Render = 1 instance, 1 worker.
 * `AUTH_L1_CACHE_TTL_SECONDS=0` → унтраана.
 */
export const DEFAULT_L1_TTL_SECONDS = 30;
const DEFAULT_MAX_ENTRIES = 5_000;

export function l1TtlSeconds(raw: string | undefined = process.env['AUTH_L1_CACHE_TTL_SECONDS']): number {
  if (raw === undefined || raw === '') return DEFAULT_L1_TTL_SECONDS;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= DEFAULT_L1_TTL_SECONDS ? n : DEFAULT_L1_TTL_SECONDS;
}

export class L1Cache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get enabled(): boolean {
    return this.ttlMs > 0;
  }

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  /** `ttlMs` — энэ утгын TTL (L1-ийн TTL-ээс урт байж болохгүй; жнь Redis-ийн үлдсэн хугацаа) */
  set(key: string, value: V, ttlMs = this.ttlMs): void {
    const ttl = Math.min(ttlMs, this.ttlMs);
    if (ttl <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: this.now() + ttl });
  }

  delete(...keys: string[]): void {
    for (const k of keys) this.map.delete(k);
  }

  get size(): number {
    return this.map.size;
  }
}
