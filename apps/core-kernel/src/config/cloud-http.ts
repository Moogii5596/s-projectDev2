/**
 * v0.2.5 H3 (#18) — үүлэн орчны HTTP тохиргоо (Render ↔ Vercel).
 * - `TRUST_PROXY`: Render-ийн proxy-ийн ард бодит IP (`X-Forwarded-For`). Хоосон = итгэхгүй (пилот Caddy: `clientIpOf`-ийн X-Real-IP),
 *   тоо = итгэх hop-ийн тоо (Render: 1), `true` = бүгд (зөвхөн proxy-гүй сүлжээнд хэрэглэхгүй), эсвэл IP/CIDR жагсаалт.
 * - `CORS_ORIGINS`: таслалаар (`https://staging.gobiverse.website`). Хоосон = CORS асаахгүй (same-origin: dev proxy, пилот Caddy).
 */
export type TrustProxy = boolean | number | string[];

export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const v = raw?.trim();
  if (!v || v.toLowerCase() === 'false') return false;
  if (v.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  const list = (raw ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  for (const o of list) {
    if (!/^https?:\/\/[^/\s*]+$/.test(o)) throw new Error(`CORS_ORIGINS: буруу origin "${o}" (жишээ: https://staging.gobiverse.website)`);
  }
  return list;
}
