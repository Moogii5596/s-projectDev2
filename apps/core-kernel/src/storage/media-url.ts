import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Зургийн гарын үсэгтэй URL (v0.2.3 Блок 5, FEED-01).
 *
 * Нэвтрэлт нь `Authorization: Bearer` header-ээр явдаг тул `<img src>` түүнийг илгээж чадахгүй. API нь харах эрхтэй
 * хэрэглэгчид HMAC-аар гарын үсэг зурсан, хугацаатай URL өгнө (S3 presigned / CDN signed URL-ийн загвар) →
 * хөтөч `srcset`, `loading="lazy"`, HTTP кэшийг шууд ашиглана.
 *
 * Хугацааг 7 хоногийн «хувинд» дугуйлна: нэг долоо хоногийн турш URL өөрчлөгдөхгүй (кэш онох), хүчинтэй хугацаа 7–14 хоног.
 * Payload-д tenant, төрөл, media id, өргөн, хугацаа орно — өөр зураг / tenant / өргөнд ашиглагдахгүй.
 */
export type MediaKind = 'f' | 'b'; // f = feed_post_media, b = core_feedback_attachments

const WEEK_SEC = 7 * 24 * 3600;

export interface MediaSignature {
  t: string;
  e: number;
  s: string;
}

export class MediaUrlSigner {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.length < 16) throw new Error('MediaUrlSigner: secret хэт богино');
    // JWT нууцыг шууд биш — зориулалтын дэд түлхүүр
    this.key = createHmac('sha256', secret).update('s-project/media-url/v1').digest();
  }

  static expiryFor(nowMs: number): number {
    const now = Math.floor(nowMs / 1000);
    return Math.floor(now / WEEK_SEC) * WEEK_SEC + 2 * WEEK_SEC;
  }

  private mac(kind: MediaKind, tenantId: string, mediaId: string, w: number, exp: number): string {
    return createHmac('sha256', this.key)
      .update(`${kind}|${tenantId}|${mediaId}|${w}|${exp}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }

  sign(kind: MediaKind, tenantId: string, mediaId: string, w: number, nowMs = Date.now()): MediaSignature {
    const e = MediaUrlSigner.expiryFor(nowMs);
    return { t: tenantId, e, s: this.mac(kind, tenantId, mediaId, w, e) };
  }

  /** Query string: `t=…&e=…&s=…&v=<hash>` (`v` — агуулга солигдвол URL солигдоно) */
  query(kind: MediaKind, tenantId: string, mediaId: string, w: number, hash: string, nowMs = Date.now()): string {
    const { t, e, s } = this.sign(kind, tenantId, mediaId, w, nowMs);
    return `t=${t}&e=${e}&s=${s}&v=${hash}`;
  }

  verify(kind: MediaKind, mediaId: string, w: number, q: { t?: string; e?: string | number; s?: string }, nowMs = Date.now()): string | null {
    const exp = Number(q.e);
    if (!q.t || !q.s || !Number.isInteger(exp) || exp * 1000 <= nowMs) return null;
    const expected = Buffer.from(this.mac(kind, q.t, mediaId, w, exp));
    const given = Buffer.from(String(q.s));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return q.t;
  }
}

export const MEDIA_URL_SIGNER = Symbol('MEDIA_URL_SIGNER');

/** MEDIA_URL_SECRET (заавал биш) → JWT_SECRET (EnvConfig эхлэхэд шалгагдсан) */
export function mediaUrlSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env['MEDIA_URL_SECRET'] || env['JWT_SECRET'] || '';
}
