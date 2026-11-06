import type { FastifyRequest } from 'fastify';
import { badRequest, payloadTooLarge } from '../common/i18n/app-error';
import { IMAGE_MAX_INPUT_BYTES } from './image-processor.service';

type Part =
  | { type: 'file'; fieldname: string; toBuffer: () => Promise<Buffer> }
  | { type: 'field'; fieldname: string; value: unknown };

type MultipartReq = {
  isMultipart?: () => boolean;
  parts?: (opts?: { limits?: Record<string, number> }) => AsyncIterableIterator<Part>;
};

export interface ImageUpload {
  files: Buffer[];
  fields: Record<string, string>;
}

/**
 * multipart зураг (Feed ≤6, санал хүсэлт ≤3): глобал хязгаарыг (2 MB, 1 файл — ирцийн xlsx) энэ хүсэлтэд дарна.
 * Multipart биш бол `null` (JSON body). Төрлийг энд шалгахгүй — ImageProcessorService байтаас таньна.
 */
export async function readImageUpload(req: FastifyRequest, maxFiles: number): Promise<ImageUpload | null> {
  const r = req as unknown as MultipartReq;
  if (!r.isMultipart?.() || typeof r.parts !== 'function') return null;
  const files: Buffer[] = [];
  const fields: Record<string, string> = {};
  try {
    const parts = r.parts({ limits: { fileSize: IMAGE_MAX_INPUT_BYTES, files: maxFiles, fields: 10, fieldSize: 64 * 1024 } });
    for await (const p of parts) {
      if (p.type === 'file') {
        const buf = await p.toBuffer();
        if (buf.length > 0) files.push(buf);
      } else if (typeof p.value === 'string') {
        fields[p.fieldname] = p.value;
      }
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw payloadTooLarge('media.too_large', { max: Math.round(IMAGE_MAX_INPUT_BYTES / 1024 / 1024) });
    if (code === 'FST_FILES_LIMIT') throw badRequest('feed.err.too_many_images', { max: maxFiles });
    if (code === 'FST_FIELDS_LIMIT' || code === 'FST_PARTS_LIMIT') throw badRequest('feed.err.upload');
    throw err;
  }
  return { files, fields };
}
