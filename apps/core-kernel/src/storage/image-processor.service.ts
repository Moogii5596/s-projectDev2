import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { rgbaToThumbHash } from 'thumbhash';
import sharp, { type Metadata, type Sharp } from 'sharp';
import { badRequest, payloadTooLarge } from '../common/i18n/app-error';

/**
 * Хэрэглэгчийн зургийг хадгалахад бэлтгэнэ (v0.2.3 Блок 5, FEED-01):
 * ≤15 MB оролт → EXIF-ийн дагуу эргүүлж, ≤2048px WebP/JPEG, бүх метадата (EXIF, GPS, ICC) арилгана + thumbnail.
 * Төрлийг client-ийн mimetype-аас биш, байтаас (sharp) таньна; SVG/PDF/бусад → татгалзана.
 */
export const IMAGE_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const IMAGE_MAX_EDGE = 2048;
const IMAGE_THUMB_EDGE = 400;
/** Decompression bomb хамгаалалт (~ 100 MP — утасны панорам багтана) */
const IMAGE_MAX_PIXELS = 100_000_000;

/** Алдааны код — `common/i18n/messages.ts`-д mn/en/zh (Блок 5) */
export const IMAGE_ERR = {
  tooLarge: 'media.too_large', // { max } MB
  tooManyPixels: 'media.too_many_pixels', // { max } MP
  unsupported: 'media.unsupported_type', // { type }
  unreadable: 'media.unreadable',
} as const;

const ACCEPTED_INPUT = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff']);

export type ImageOutputFormat = 'webp' | 'jpeg';

interface ImageVariant {
  data: Buffer;
  format: ImageOutputFormat;
  /** Storage key-ийн өргөтгөл */
  ext: 'webp' | 'jpg';
  contentType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
}

export interface ProcessedImage {
  main: ImageVariant;
  thumbnail: ImageVariant;
}

export interface ImageProcessOptions {
  format?: ImageOutputFormat;
  maxEdge?: number;
  thumbEdge?: number;
  maxInputBytes?: number;
  maxPixels?: number;
}

const QUALITY = { main: 82, thumbnail: 72 } as const;

/** Responsive хувилбарын өргөнүүд (Feed) */
export const IMAGE_VARIANT_WIDTHS = [480, 1080, 2048] as const;
const VARIANT_QUALITY: Record<number, number> = { 480: 75, 1080: 80, 2048: 82 };

interface HashedVariant extends ImageVariant {
  /** sha256(data) hex-ийн эхний 16 тэмдэгт */
  hash: string;
}

export interface ResponsiveImage {
  /** EXIF-ээр эргүүлсний дараах, хамгийн том хувилбарын хэмжээ */
  width: number;
  height: number;
  /** base64 (thumbhash) */
  thumbhash: string;
  /** Өргөнөөр өсөх дараалал; жижиг эх зургийн давхардал хасагдсан */
  variants: HashedVariant[];
}

@Injectable()
export class ImageProcessorService {
  async process(input: Buffer, opts: ImageProcessOptions = {}): Promise<ProcessedImage> {
    const { base, format } = await this.prepare(input, opts);
    try {
      const [main, thumbnail] = await Promise.all([
        encode(base.clone(), opts.maxEdge ?? IMAGE_MAX_EDGE, format, QUALITY.main),
        encode(base.clone(), opts.thumbEdge ?? IMAGE_THUMB_EDGE, format, QUALITY.thumbnail),
      ]);
      return { main, thumbnail };
    } catch {
      throw badRequest(IMAGE_ERR.unreadable);
    }
  }

  async processResponsive(input: Buffer, opts: ImageProcessOptions = {}): Promise<ResponsiveImage> {
    const { base, format } = await this.prepare(input, opts);
    try {
      const encoded = await Promise.all(
        IMAGE_VARIANT_WIDTHS.map((w) => encodeWidth(base.clone(), w, format, VARIANT_QUALITY[w] ?? 80)),
      );
      // withoutEnlargement: жижиг эх зурагт хэд хэдэн өргөн ижил хэмжээтэй гарна — давхардлыг хасна
      const variants: HashedVariant[] = [];
      for (const v of encoded) {
        if (!variants.some((x) => x.width === v.width)) variants.push({ ...v, hash: hashOf(v.data) });
      }
      const largest = variants[variants.length - 1]!;
      const { data, info } = await base
        .clone()
        .resize({ width: 100, height: 100, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const thumbhash = Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64');
      return { width: largest.width, height: largest.height, thumbhash, variants };
    } catch {
      throw badRequest(IMAGE_ERR.unreadable);
    }
  }

  /** Оролтын шалгалт + EXIF-ийн дагуу эргүүлсэн sharp pipeline (process/processResponsive-д нийтлэг) */
  private async prepare(input: Buffer, opts: ImageProcessOptions): Promise<{ base: Sharp; format: ImageOutputFormat }> {
    const format = opts.format ?? 'webp';
    const maxBytes = opts.maxInputBytes ?? IMAGE_MAX_INPUT_BYTES;
    const maxPixels = opts.maxPixels ?? IMAGE_MAX_PIXELS;
    if (input.length > maxBytes) throw payloadTooLarge(IMAGE_ERR.tooLarge, { max: Math.round(maxBytes / 1024 / 1024) });
    if (input.length === 0) throw badRequest(IMAGE_ERR.unreadable);

    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: false }).metadata();
    } catch {
      throw badRequest(IMAGE_ERR.unreadable);
    }
    if (!meta.format || !ACCEPTED_INPUT.has(meta.format)) throw badRequest(IMAGE_ERR.unsupported, { type: meta.format ?? '?' });
    if ((meta.width ?? 0) * (meta.height ?? 0) > maxPixels) {
      throw badRequest(IMAGE_ERR.tooManyPixels, { max: Math.round(maxPixels / 1_000_000) });
    }

    // rotate() — EXIF Orientation-оор эргүүлнэ (дараа нь метадата хаягдана). withMetadata() дуудахгүй = EXIF/GPS/ICC арилна.
    const base = sharp(input, { failOn: 'error', limitInputPixels: maxPixels }).rotate();
    return { base, format };
  }
}

function hashOf(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

async function encode(img: Sharp, edge: number, format: ImageOutputFormat, quality: number): Promise<ImageVariant> {
  return finish(img.resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }), format, quality);
}

async function encodeWidth(img: Sharp, width: number, format: ImageOutputFormat, quality: number): Promise<ImageVariant> {
  return finish(img.resize({ width, fit: 'inside', withoutEnlargement: true }), format, quality);
}

async function finish(img: Sharp, format: ImageOutputFormat, quality: number): Promise<ImageVariant> {
  const out =
    format === 'jpeg'
      ? img.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true })
      : img.webp({ quality });
  const { data, info } = await out.toBuffer({ resolveWithObject: true });
  return {
    data,
    format,
    ext: format === 'jpeg' ? 'jpg' : 'webp',
    contentType: format === 'jpeg' ? 'image/jpeg' : 'image/webp',
    width: info.width,
    height: info.height,
    bytes: data.length,
  };
}
