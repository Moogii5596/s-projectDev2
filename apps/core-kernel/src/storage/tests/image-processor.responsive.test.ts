import { HttpStatus } from '@nestjs/common';
import sharp from 'sharp';
import { thumbHashToRGBA } from 'thumbhash';
import { describe, expect, it } from 'vitest';
import { IMAGE_ERR, IMAGE_VARIANT_WIDTHS, ImageProcessorService } from '../image-processor.service';

const svc = new ImageProcessorService();

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366aa' } })
    .jpeg()
    .toBuffer();

describe('ImageProcessorService.processResponsive', () => {
  it('том зураг: 480/1080/2048 гурван хувилбар, өргөнөөр өсөх', async () => {
    const r = await svc.processResponsive(await jpeg(4000, 3000));
    expect(r.variants.map((v) => v.width)).toEqual([...IMAGE_VARIANT_WIDTHS]);
    expect(r.variants.map((v) => v.height)).toEqual([360, 810, 1536]);
    expect([r.width, r.height]).toEqual([2048, 1536]);
    expect(r.variants.every((v) => v.format === 'webp' && v.bytes === v.data.length)).toBe(true);
  });

  it('босоо зураг: өргөнөөр хэмжинэ', async () => {
    const r = await svc.processResponsive(await jpeg(3000, 4000));
    expect(r.variants.map((v) => [v.width, v.height])).toEqual([
      [480, 640],
      [1080, 1440],
      [2048, 2731],
    ]);
    expect([r.width, r.height]).toEqual([2048, 2731]);
  });

  it('жижиг зураг: давхардал хасагдаж хамгийн багадаа 1 хувилбар', async () => {
    const small = await svc.processResponsive(await jpeg(300, 200));
    expect(small.variants).toHaveLength(1);
    expect([small.width, small.height]).toEqual([300, 200]);

    const mid = await svc.processResponsive(await jpeg(800, 600));
    expect(mid.variants.map((v) => v.width)).toEqual([480, 800]);
    expect(mid.width).toBe(800);
  });

  it('hash: 16 hex, ижил оролтод тогтвортой, өөр хувилбарт өөр', async () => {
    const input = await jpeg(2500, 1000);
    const a = await svc.processResponsive(input);
    const b = await svc.processResponsive(input);
    expect(a.variants.map((v) => v.hash)).toEqual(b.variants.map((v) => v.hash));
    for (const v of a.variants) expect(v.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(a.variants.map((v) => v.hash)).size).toBe(a.variants.length);
  });

  it('thumbhash base64 decode хийгдэнэ', async () => {
    const r = await svc.processResponsive(await jpeg(1200, 800));
    const hash = new Uint8Array(Buffer.from(r.thumbhash, 'base64'));
    expect(hash.length).toBeGreaterThan(0);
    const { w, h, rgba } = thumbHashToRGBA(hash);
    expect(w).toBeGreaterThan(0);
    expect(rgba.length).toBe(w * h * 4);
  });

  it('EXIF/GPS үлдэхгүй, Orientation-оор эргүүлнэ', async () => {
    const input = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#3366aa' } })
      .withExif({ IFD0: { Make: 'QA-Cam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 55/1 0/1' } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const r = await svc.processResponsive(input);
    expect([r.width, r.height]).toEqual([200, 300]);
    for (const v of r.variants) {
      const m = await sharp(v.data).metadata();
      expect(m.exif).toBeUndefined();
      expect(m.orientation).toBeUndefined();
      expect(v.data.includes('QA-Cam')).toBe(false);
    }
  });

  it('алдаа: process()-тай ижил кодууд', async () => {
    const code = async (p: Promise<unknown>) =>
      (await p.then(
        () => null,
        (e: unknown) => e,
      )) as { getStatus(): number; code: string };
    const empty = await code(svc.processResponsive(Buffer.alloc(0)));
    expect([empty.getStatus(), empty.code]).toEqual([HttpStatus.BAD_REQUEST, IMAGE_ERR.unreadable]);
    const junk = await code(svc.processResponsive(Buffer.from('not an image')));
    expect(junk.code).toBe(IMAGE_ERR.unreadable);
    const big = await code(svc.processResponsive(await jpeg(100, 100), { maxInputBytes: 10 }));
    expect([big.getStatus(), big.code]).toEqual([HttpStatus.PAYLOAD_TOO_LARGE, IMAGE_ERR.tooLarge]);
    const svg = await code(svc.processResponsive(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>')));
    expect(svg.code).toBe(IMAGE_ERR.unsupported);
  });
});
