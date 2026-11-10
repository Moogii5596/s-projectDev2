import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

/**
 * v0.2.4 Блок 8 (FILE-01, M-7) — хавсралтын файлын шифрлэлт (AES-256-GCM).
 * Диск дээрх формат: `SPF1` (4) | iv (12) | tag (16) | ciphertext. Нөөц (backup) шифрлэгдсэн хэвээр хуулагдана.
 * Түлхүүр: `FILE_ENCRYPTION_KEY` (base64, 32 байт) → эс бөгөөс `JWT_SECRET`-ээс HKDF (dev/staging; production-д тусдаа түлхүүр зөвлөнө).
 * `keyId` = түлхүүрийн sha256-ийн эхний 16 тэмдэгт — түлхүүр солигдсон эсэхийг мөр бүрт тэмдэглэнэ.
 */
const MAGIC = Buffer.from('SPF1');
const IV_LEN = 12;
const TAG_LEN = 16;

export interface FileKey {
  id: string;
  key: Buffer;
  derived: boolean;
}

export function resolveFileKey(env: NodeJS.ProcessEnv = process.env): FileKey {
  const raw = env['FILE_ENCRYPTION_KEY']?.trim();
  let key: Buffer;
  let derived = false;
  if (raw) {
    key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('FILE_ENCRYPTION_KEY: base64 32 байт байх ёстой (openssl rand -base64 32)');
  } else {
    const secret = env['JWT_SECRET'];
    if (!secret) throw new Error('FILE_ENCRYPTION_KEY эсвэл JWT_SECRET тохируулаагүй');
    key = Buffer.from(hkdfSync('sha256', secret, 's-project', 'file-encryption-v1', 32));
    derived = true;
  }
  return { id: createHash('sha256').update(key).digest('hex').slice(0, 16), key, derived };
}

export function encryptFile(plain: Buffer, key: FileKey): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key.key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** Буруу түлхүүр / эвдэрсэн файл → throw (GCM tag) */
export function decryptFile(data: Buffer, key: FileKey): Buffer {
  if (data.length < MAGIC.length + IV_LEN + TAG_LEN || !data.subarray(0, 4).equals(MAGIC)) throw new Error('Шифрлэгдсэн файлын формат буруу');
  const iv = data.subarray(4, 4 + IV_LEN);
  const tag = data.subarray(4 + IV_LEN, 4 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key.key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(4 + IV_LEN + TAG_LEN)), decipher.final()]);
}

export const sha256Hex = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

/** Файлын эхний байтаар бодит төрлийг тогтоох (MIME-д итгэхгүй). Танигдаагүй → null */
export function sniffMime(buf: Buffer): string | null {
  const b = buf;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'application/zip';
  return null;
}

/** Зөвшөөрөгдсөн төрөл: sniff + өргөтгөл. Office (zip) нь өргөтгөлөөр ялгагдана; текст/CSV нь UTF-8 + NUL-гүй. */
export function detectFileType(buf: Buffer, fileName: string): string | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const sniffed = sniffMime(buf);
  if (sniffed === 'application/zip') {
    if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return null;
  }
  if (sniffed) return sniffed;
  if ((ext === 'txt' || ext === 'csv') && !buf.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return ext === 'csv' ? 'text/csv' : 'text/plain';
    } catch {
      return null;
    }
  }
  return null;
}

/** Файлын нэрийг цэвэрлэх: зам, хяналтын тэмдэгт хасна, ≤255 */
export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  // eslint-disable-next-line no-control-regex -- хяналтын тэмдэгтийг зориуд арилгана
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '_').trim().slice(0, 255);
  return clean || 'file';
}
