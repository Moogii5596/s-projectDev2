import type { FastifyRequest } from 'fastify';
import { badRequest, payloadTooLarge } from '../../../common/i18n/app-error';

type Part =
  | { type: 'file'; fieldname: string; filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }
  | { type: 'field'; fieldname: string; value: unknown };

type MultipartReq = {
  isMultipart?: () => boolean;
  parts?: (opts?: { limits?: Record<string, number> }) => AsyncIterableIterator<Part>;
};

export interface UploadedFile {
  fileName: string;
  data: Buffer;
}

/** multipart `files` (≤ maxFiles, тус бүр ≤ maxBytes) — v0.2.4 FILE-01 */
export async function readFileUpload(req: FastifyRequest, maxFiles: number, maxBytes: number): Promise<UploadedFile[]> {
  const r = req as unknown as MultipartReq;
  if (!r.isMultipart?.() || typeof r.parts !== 'function') throw badRequest('core.files.multipart_required');
  const files: UploadedFile[] = [];
  try {
    const parts = r.parts({ limits: { fileSize: maxBytes, files: maxFiles, fields: 5, fieldSize: 1024 } });
    for await (const p of parts) {
      if (p.type !== 'file') continue;
      const data = await p.toBuffer();
      if (data.length > 0) files.push({ fileName: p.filename || 'file', data });
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw payloadTooLarge('core.files.too_large', { max: Math.round(maxBytes / 1024 / 1024) });
    if (code === 'FST_FILES_LIMIT') throw badRequest('core.files.too_many', { max: maxFiles });
    if (code === 'FST_FIELDS_LIMIT' || code === 'FST_PARTS_LIMIT') throw badRequest('core.files.multipart_required');
    throw err;
  }
  if (files.length === 0) throw badRequest('core.files.empty');
  return files;
}
