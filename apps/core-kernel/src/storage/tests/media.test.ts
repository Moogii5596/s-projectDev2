import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { ImageProcessorService } from '../image-processor.service';
import { LocalDiskStorage } from '../local-disk.storage';
import { MediaService, mediaImageDto, parseVariants, pickVariant } from '../media.service';
import { MediaUrlSigner, mediaUrlSecret } from '../media-url';
import { storageDir } from '../storage.module';

const T = '0190f0a0-0000-7000-8000-00000000000a';
const M = '0190f0a0-0000-7000-8000-00000000000b';

describe('MediaUrlSigner — гарын үсэгтэй зургийн URL', () => {
  const s = new MediaUrlSigner('x'.repeat(32));
  const now = Date.UTC(2026, 10, 7, 12);

  it('зөв гарын үсэг → tenant; өөр зураг / өргөн / tenant / төрөл → null', () => {
    const q = s.sign('f', T, M, 480, now);
    expect(s.verify('f', M, 480, q, now)).toBe(T);
    expect(s.verify('f', M, 1080, q, now)).toBeNull();
    expect(s.verify('b', M, 480, q, now)).toBeNull();
    expect(s.verify('f', T, 480, q, now)).toBeNull();
    expect(s.verify('f', M, 480, { ...q, t: M }, now)).toBeNull();
    expect(s.verify('f', M, 480, { ...q, s: q.s.slice(0, -1) + (q.s.endsWith('A') ? 'B' : 'A') }, now)).toBeNull();
    expect(s.verify('f', M, 480, {}, now)).toBeNull();
  });

  it('өөр нууц үгээр зурсан → null', () => {
    const q = new MediaUrlSigner('y'.repeat(32)).sign('f', T, M, 480, now);
    expect(s.verify('f', M, 480, q, now)).toBeNull();
  });

  it('хугацаа: 7 хоногийн хувин — долоо хоногт URL тогтвортой (кэш), 7–14 хоног хүчинтэй, дуусвал null', () => {
    const a = s.sign('f', T, M, 480, now);
    const b = s.sign('f', T, M, 480, now + 3600_000);
    expect(b).toEqual(a);
    const left = a.e * 1000 - now;
    expect(left).toBeGreaterThan(7 * 86400_000 - 1);
    expect(left).toBeLessThanOrEqual(14 * 86400_000);
    expect(s.verify('f', M, 480, a, a.e * 1000)).toBeNull();
  });

  it('нууц үг: MEDIA_URL_SECRET → JWT_SECRET; богино бол алдаа', () => {
    expect(mediaUrlSecret({ MEDIA_URL_SECRET: 'm', JWT_SECRET: 'j' })).toBe('m');
    expect(mediaUrlSecret({ JWT_SECRET: 'j' })).toBe('j');
    expect(() => new MediaUrlSigner('short')).toThrow();
  });
});

describe('parseVariants / pickVariant / mediaImageDto', () => {
  const vs = [
    { w: 1080, h: 810, key: 'k/b.webp', bytes: 2, fmt: 'webp', hash: 'h2' },
    { w: 480, h: 360, key: 'k/a.webp', bytes: 1, fmt: 'webp', hash: 'h1' },
    { bad: true },
  ];

  it('буруу мөрийг алгасаж өргөнөөр эрэмбэлнэ', () => {
    expect(parseVariants(vs).map((v) => v.w)).toEqual([480, 1080]);
    expect(parseVariants('x')).toEqual([]);
  });

  it('pickVariant — яг / дараагийн том / хамгийн том', () => {
    const p = parseVariants(vs);
    expect(pickVariant(p, 480)?.w).toBe(480);
    expect(pickVariant(p, 600)?.w).toBe(1080);
    expect(pickVariant(p, 4000)?.w).toBe(1080);
    expect(pickVariant([], 480)).toBeNull();
  });

  it('DTO — хувилбар бүрт гарын үсэгтэй URL (v = hash)', () => {
    const d = mediaImageDto(new MediaUrlSigner('x'.repeat(32)), 'f', '/api/v1/core/feed/media', T, {
      id: M, width: 1080, height: 810, thumbhash: 'th', variants: vs,
    });
    expect(d.variants).toHaveLength(2);
    expect(d.variants[0]!.url).toMatch(new RegExp(`^/api/v1/core/feed/media/${M}/480\\?t=${T}&e=\\d+&s=[\\w-]+&v=h1$`));
  });
});

describe('MediaService — хадгалах / устгах (LocalDiskStorage, бодит sharp)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-'));
  const storage = new LocalDiskStorage(dir);
  const svc = new MediaService(storage, new ImageProcessorService());
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const png = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: '#3a7' } }).png().toBuffer();

  it('3000×2000 → 480/1080/2048 WebP, key-д tenant/ns, thumbhash', async () => {
    const m = await svc.store(T, 'feed', await png(3000, 2000));
    expect(m.variants.map((v) => v.w)).toEqual([480, 1080, 2048]);
    expect(m.variants.every((v) => v.key.startsWith(`${T}/feed/`) && v.key.endsWith(`-${v.w}.webp`))).toBe(true);
    expect(m.thumbhash.length).toBeGreaterThan(10);
    expect(m.totalBytes).toBe(m.variants.reduce((s, v) => s + v.bytes, 0));
    for (const v of m.variants) expect(await storage.exists(v.key)).toBe(true);
    await svc.remove(m.variants);
    for (const v of m.variants) expect(await storage.exists(v.key)).toBe(false);
  });

  it('ижил зургийг 2 удаа → өөр key (нэгийг устгахад нөгөө үлдэнэ)', async () => {
    const buf = await png(300, 200);
    const [a, b] = await svc.storeMany(T, 'feed', [buf, buf]);
    expect(a!.variants[0]!.key).not.toBe(b!.variants[0]!.key);
    await svc.remove(a!.variants);
    expect(await storage.exists(b!.variants[0]!.key)).toBe(true);
  });

  it('storeMany — дундаас алдаа гарвал өмнө бичсэн файлууд устна', async () => {
    const before = await storage.usage(T);
    await expect(svc.storeMany(T, 'feed', [await png(200, 200), Buffer.from('not an image')])).rejects.toThrow();
    expect(await storage.usage(T)).toEqual(before);
  });
});

describe('storageDir', () => {
  it('STORAGE_DIR → эс бөгөөс repo root/storage', () => {
    expect(storageDir({ STORAGE_DIR: '/data/s' }, '/x')).toBe(resolve('/data/s'));
    expect(storageDir({}, process.cwd())).toMatch(/[\\/]storage$/);
  });
});
