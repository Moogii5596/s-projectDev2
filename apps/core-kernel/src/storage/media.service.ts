import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ImageProcessorService } from './image-processor.service';
import type { MediaKind, MediaUrlSigner } from './media-url';
import { STORAGE_SERVICE, type StorageService, type StoredObjectStream } from './storage.service';

/**
 * Хэрэглэгчийн зургийг (Feed, санал хүсэлт) хадгалах, унших (v0.2.3 Блок 5, FEED-01).
 * Зураг бүр → 480/1080/2048 WebP хувилбар (`processResponsive`) + thumbhash. DB-д `variants` JSONB.
 * Key: `<tenantId>/<ns>/<uuid>-<w>.webp` — нэг зургийг хоёр удаа оруулсан ч key давхцахгүй (нэгийг устгахад нөгөө нь үлдэнэ).
 * Агуулгын `hash` — ETag / URL-ийн `v` (immutable кэш).
 */
export type MediaNamespace = 'feed' | 'feedback';

export interface MediaVariantRef {
  w: number;
  h: number;
  key: string;
  bytes: number;
  fmt: 'webp' | 'jpeg';
  hash: string;
}

export interface StoredMedia {
  width: number;
  height: number;
  thumbhash: string;
  variants: MediaVariantRef[];
  totalBytes: number;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly images: ImageProcessorService,
  ) {}

  /** Боловсруулж бүх хувилбарыг бичнэ. Алдаа гарвал бичсэнээ буцааж устгана. */
  async store(tenantId: string, ns: MediaNamespace, input: Buffer): Promise<StoredMedia> {
    const img = await this.images.processResponsive(input);
    const id = randomUUID();
    const variants: MediaVariantRef[] = [];
    try {
      for (const v of img.variants) {
        const key = `${tenantId}/${ns}/${id}-${v.width}.${v.ext}`;
        await this.storage.put(key, v.data);
        variants.push({ w: v.width, h: v.height, key, bytes: v.bytes, fmt: v.format, hash: v.hash });
      }
    } catch (err) {
      await this.remove(variants);
      throw err;
    }
    return {
      width: img.width,
      height: img.height,
      thumbhash: img.thumbhash,
      variants,
      totalBytes: variants.reduce((s, v) => s + v.bytes, 0),
    };
  }

  /** Хэд хэдэн зургийг дараалан (CPU / санах ойг хэмнэж) хадгална; аль нэг нь алдаа өгвөл өмнөхийг устгана */
  async storeMany(tenantId: string, ns: MediaNamespace, inputs: readonly Buffer[]): Promise<StoredMedia[]> {
    const out: StoredMedia[] = [];
    try {
      for (const input of inputs) out.push(await this.store(tenantId, ns, input));
    } catch (err) {
      await this.remove(out.flatMap((m) => m.variants));
      throw err;
    }
    return out;
  }

  /** Best-effort устгал (DB commit-ийн дараа; алдааг залгина) */
  async remove(variants: readonly { key: string }[]): Promise<void> {
    await Promise.all(variants.map((v) => this.storage.delete(v.key).catch(() => undefined)));
  }

  open(key: string): Promise<StoredObjectStream | null> {
    return this.storage.get(key);
  }
}

/** DB-ийн JSONB → шалгасан хувилбарууд (өргөнөөр өсөх) */
export function parseVariants(json: unknown): MediaVariantRef[] {
  if (!Array.isArray(json)) return [];
  const out: MediaVariantRef[] = [];
  for (const v of json) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (typeof r.w !== 'number' || typeof r.h !== 'number' || typeof r.key !== 'string' || typeof r.hash !== 'string') continue;
    out.push({
      w: r.w,
      h: r.h,
      key: r.key,
      bytes: typeof r.bytes === 'number' ? r.bytes : 0,
      fmt: r.fmt === 'jpeg' ? 'jpeg' : 'webp',
      hash: r.hash,
    });
  }
  return out.sort((a, b) => a.w - b.w);
}

/** Яг тэр өргөн; байхгүй бол түүнээс том хамгийн бага; бүгд жижиг бол хамгийн том */
export function pickVariant(variants: readonly MediaVariantRef[], w: number): MediaVariantRef | null {
  if (variants.length === 0) return null;
  const sorted = [...variants].sort((a, b) => a.w - b.w);
  return sorted.find((v) => v.w >= w) ?? sorted[sorted.length - 1]!;
}

/** API-д буцаах зураг (Feed, санал хүсэлт) — frontend-ийн `FeedImageDto`-тэй ижил (R20) */
export interface MediaImageDto {
  id: string;
  width: number;
  height: number;
  thumbhash: string;
  /** өргөнөөр өсөх (srcset); url — гарын үсэгтэй, хугацаатай */
  variants: { w: number; h: number; url: string }[];
}

export function mediaImageDto(
  signer: MediaUrlSigner,
  kind: MediaKind,
  base: string,
  tenantId: string,
  row: { id: string; width: number; height: number; thumbhash: string; variants: unknown },
  nowMs = Date.now(),
): MediaImageDto {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    thumbhash: row.thumbhash,
    variants: parseVariants(row.variants).map((v) => ({
      w: v.w,
      h: v.h,
      url: `${base}/${row.id}/${v.w}?${signer.query(kind, tenantId, row.id, v.w, v.hash, nowMs)}`,
    })),
  };
}
