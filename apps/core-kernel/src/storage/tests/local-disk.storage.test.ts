import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDiskStorage } from '../local-disk.storage';
import { contentTypeOf } from '../storage.service';

const T = '0190f000-0000-7000-8000-000000000001';

async function readAll(s: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sp-storage-'));
    storage = new LocalDiskStorage(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('put → get (stream, хэмжээ, content-type) → exists', async () => {
    const data = Buffer.from('hello-image');
    expect(await storage.put(`${T}/feed/a.webp`, data)).toEqual({ key: `${T}/feed/a.webp`, size: data.length, contentType: 'image/webp' });

    const got = await storage.get(`${T}/feed/a.webp`);
    expect(got).toMatchObject({ size: data.length, contentType: 'image/webp' });
    expect(await readAll(got!.stream)).toEqual(data);
    expect(await storage.exists(`${T}/feed/a.webp`)).toBe(true);
  });

  it('дарж бичнэ; түр (.tmp-*) файл үлдэхгүй', async () => {
    await storage.put(`${T}/x.jpg`, Buffer.from('one'));
    await storage.put(`${T}/x.jpg`, Buffer.from('second'));
    expect(await readAll((await storage.get(`${T}/x.jpg`))!.stream)).toEqual(Buffer.from('second'));
    expect(await readdir(join(root, T))).toEqual(['x.jpg']);
  });

  it('байхгүй key → get null, exists false; delete idempotent', async () => {
    expect(await storage.get(`${T}/none.webp`)).toBeNull();
    expect(await storage.exists(`${T}/none.webp`)).toBe(false);
    await storage.put(`${T}/d.webp`, Buffer.from('d'));
    await storage.delete(`${T}/d.webp`);
    await storage.delete(`${T}/d.webp`);
    expect(await storage.exists(`${T}/d.webp`)).toBe(false);
  });

  it('хавтсыг файл гэж буцаахгүй', async () => {
    await storage.put(`${T}/feed/a.webp`, Buffer.from('a'));
    expect(await storage.get(`${T}/feed`)).toBeNull();
    expect(await storage.exists(T)).toBe(false);
  });

  it('usage — нийт ба prefix-ээр (өөр tenant тооцогдохгүй); хоосон root 0', async () => {
    expect(await storage.usage()).toEqual({ bytes: 0, files: 0 });
    const other = '0190f000-0000-7000-8000-000000000002';
    await storage.put(`${T}/feed/a.webp`, Buffer.alloc(10));
    await storage.put(`${T}/feed/thumb/a.webp`, Buffer.alloc(5));
    await storage.put(`${other}/feed/b.webp`, Buffer.alloc(7));
    expect(await storage.usage()).toEqual({ bytes: 22, files: 3 });
    expect(await storage.usage(T)).toEqual({ bytes: 15, files: 2 });
    expect(await storage.usage('0190f000-0000-7000-8000-00000000ffff')).toEqual({ bytes: 0, files: 0 });

    const fresh = new LocalDiskStorage(join(root, 'not-created-yet'));
    expect(await fresh.usage()).toEqual({ bytes: 0, files: 0 });
  });

  it.each([
    '../escape.webp',
    `${T}/../../escape.webp`,
    `${T}/./a.webp`,
    '/abs.webp',
    `${T}//a.webp`,
    `${T}\\..\\a.webp`,
    'C:/x.webp',
    `${T}/.hidden`,
    `${T}/a b.webp`,
    '',
  ])('буруу key-г татгалзана: %j', async (key) => {
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
    await expect(storage.get(key)).rejects.toThrow(/Invalid storage key/);
    await expect(storage.delete(key)).rejects.toThrow(/Invalid storage key/);
  });
});

describe('contentTypeOf', () => {
  it.each([
    ['a/b.webp', 'image/webp'],
    ['a/b.JPG', 'image/jpeg'],
    ['a/b.jpeg', 'image/jpeg'],
    ['a/b.png', 'image/png'],
    ['a/b.bin', 'application/octet-stream'],
    ['a/noext', 'application/octet-stream'],
  ])('%s → %s', (key, ct) => expect(contentTypeOf(key)).toBe(ct));
});
