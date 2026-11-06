import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { assertValidKey, contentTypeOf, type StorageService, type StoredObject, type StoredObjectStream } from './storage.service';

/**
 * Локал дискний storage (пилот: нэг PC, `storage/` хавтас — нөөцлөлтөд орно).
 * Бичихдээ `<file>.tmp-<uuid>` → rename (атомик) — тасарвал хагас файл үлдэхгүй.
 */
export class LocalDiskStorage implements StorageService {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathOf(key: string): string {
    assertValidKey(key);
    const p = resolve(this.root, ...key.split('/'));
    if (!p.startsWith(this.root + sep)) throw new Error(`Storage key escapes root: ${JSON.stringify(key)}`);
    return p;
  }

  async put(key: string, data: Buffer): Promise<StoredObject> {
    const p = this.pathOf(key);
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${randomUUID()}`;
    try {
      await writeFile(tmp, data);
      await rename(tmp, p);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    return { key, size: data.length, contentType: contentTypeOf(key) };
  }

  async get(key: string): Promise<StoredObjectStream | null> {
    const p = this.pathOf(key);
    const st = await statFile(p);
    if (!st) return null;
    return { key, size: st.size, contentType: contentTypeOf(key), stream: createReadStream(p) };
  }

  async exists(key: string): Promise<boolean> {
    return (await statFile(this.pathOf(key))) !== null;
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async usage(prefix?: string): Promise<{ bytes: number; files: number }> {
    const dir = prefix ? this.pathOf(prefix) : this.root;
    let bytes = 0;
    let files = 0;
    let entries: string[];
    try {
      entries = (await readdir(dir, { recursive: true })) as string[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { bytes, files };
      throw e;
    }
    for (const rel of entries) {
      const st = await statFile(join(dir, rel));
      if (st) {
        bytes += st.size;
        files += 1;
      }
    }
    return { bytes, files };
  }
}

/** Файл бол stat, байхгүй / хавтас бол null */
async function statFile(p: string): Promise<{ size: number } | null> {
  try {
    const st = await stat(p);
    return st.isFile() ? { size: st.size } : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
