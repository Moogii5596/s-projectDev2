import type { Readable } from 'node:stream';

/**
 * Файл хадгалалтын хийсвэрлэл (v0.2.3 Блок 5, FEED-01). Одоо `LocalDiskStorage` (нэг PC-ийн диск, нөөцлөлтөд орно);
 * хостинг шийдэгдвэл (ADR-002, v0.2.4) S3 / Supabase Storage-оор солино — дуудагч код өөрчлөгдөхгүй.
 *
 * Түлхүүр (key) — `/`-ээр тусгаарласан харьцангуй зам, өргөтгөлтэй (`<tenantId>/feed/<id>.webp`).
 * Tenant-ийн хандалтыг энд ШАЛГАХГҮЙ — дуудагч (backend proxy) DB-ээс (RLS) эзэмшлийг шалгаад key-г өгнө.
 */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StoredObjectStream extends StoredObject {
  stream: Readable;
}

export interface StorageService {
  /** Бичнэ (байвал дарж бичнэ). Хагас бичигдсэн файл үлдэхгүй (атомик). */
  put(key: string, data: Buffer): Promise<StoredObject>;
  /** Унших stream; байхгүй бол `null` */
  get(key: string): Promise<StoredObjectStream | null>;
  exists(key: string): Promise<boolean>;
  /** Устгана; байхгүй бол алдаагүй (idempotent) */
  delete(key: string): Promise<void>;
  /** Нийт хэмжээ (`pilot.ps1 status`, дискний анхааруулга); `prefix` — жнь tenant */
  usage(prefix?: string): Promise<{ bytes: number; files: number }>;
}

/** Nest DI token — Блок 5-д `{ provide: STORAGE_SERVICE, useFactory: () => new LocalDiskStorage(dir) }` */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** Өргөтгөлөөс content-type (дискэнд метадата хадгалахгүй) */
export function contentTypeOf(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

/**
 * Key-г шалгана: харьцангуй, `..` / `.` / хоосон сегментгүй, `\`-гүй, зөвхөн [A-Za-z0-9_.-].
 * Path traversal-аас хамгаалах эхний давхарга (LocalDiskStorage root-оос гарахгүйг дахин шалгана).
 */
export function assertValidKey(key: string): void {
  const segs = key.split('/');
  const ok = key.length > 0 && key.length <= 512 && segs.every((s) => SEGMENT.test(s) && !/^\.+$/.test(s));
  if (!ok) throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
}
