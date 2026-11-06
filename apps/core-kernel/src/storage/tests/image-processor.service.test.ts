import { HttpStatus } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { IMAGE_ERR, IMAGE_MAX_INPUT_BYTES, ImageProcessorService } from '../image-processor.service';

const svc = new ImageProcessorService();

const solid = (width: number, height: number, alpha = false) =>
  sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 200, g: 10, b: 10, alpha: 0.5 } : '#3366aa' } });

/** Утасны зураг шиг: EXIF (камер, GPS) + Orientation=6 (90° эргүүлэх) */
const phoneJpeg = (width: number, height: number) =>
  solid(width, height)
    .withExif({ IFD0: { Make: 'QA-Cam', Model: 'Secret-Model' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 55/1 0/1' } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

async function expectAppError(p: Promise<unknown>, status: number, code: string) {
  const err = (await p.then(
    () => null,
    (e: unknown) => e,
  )) as { getStatus(): number; code: string } | null;
  expect(err, 'алдаа шидэх ёстой').not.toBeNull();
  expect(err!.getStatus()).toBe(status);
  expect(err!.code).toBe(code);
}

describe('ImageProcessorService', () => {
  it('том зургийг урт талаар ≤2048px WebP болгоно, thumbnail ≤400px', async () => {
    const r = await svc.process(await solid(4000, 3000).jpeg().toBuffer());
    expect([r.main.width, r.main.height]).toEqual([2048, 1536]);
    expect([r.thumbnail.width, r.thumbnail.height]).toEqual([400, 300]);
    expect(r.main).toMatchObject({ format: 'webp', ext: 'webp', contentType: 'image/webp' });
    expect((await sharp(r.main.data).metadata()).format).toBe('webp');
    expect(r.main.bytes).toBe(r.main.data.length);
  });

  it('EXIF (камер, GPS) арилгана; Orientation-оор эргүүлээд тагийг хасна', async () => {
    const input = await phoneJpeg(300, 200);
    expect((await sharp(input).metadata()).exif).toBeDefined(); // урьдчилсан нөхцөл

    const r = await svc.process(input);
    for (const v of [r.main, r.thumbnail]) {
      const m = await sharp(v.data).metadata();
      expect(m.exif).toBeUndefined();
      expect(m.icc).toBeUndefined();
      expect(m.orientation).toBeUndefined();
      expect(v.data.includes('QA-Cam')).toBe(false);
    }
    expect([r.main.width, r.main.height]).toEqual([200, 300]); // 90° эргэсэн
  });

  it('JPEG гаралт: EXIF-гүй, ил тод хэсгийг цагаанаар дүүргэнэ', async () => {
    const r = await svc.process(await solid(500, 500, true).png().toBuffer(), { format: 'jpeg' });
    const m = await sharp(r.main.data).metadata();
    expect(r.main).toMatchObject({ format: 'jpeg', ext: 'jpg', contentType: 'image/jpeg' });
    expect(m.format).toBe('jpeg');
    expect(m.hasAlpha).toBe(false);
    expect(m.exif).toBeUndefined();

    const exifJpeg = await svc.process(await phoneJpeg(100, 80), { format: 'jpeg' });
    expect((await sharp(exifJpeg.main.data).metadata()).exif).toBeUndefined();
  });

  it('жижиг зургийг томруулахгүй', async () => {
    const r = await svc.process(await solid(320, 240).webp().toBuffer());
    expect([r.main.width, r.main.height]).toEqual([320, 240]);
    expect([r.thumbnail.width, r.thumbnail.height]).toEqual([320, 240]);
  });

  it('15 MB-ээс их → 413 media.too_large (задлахгүй)', async () => {
    await expectAppError(svc.process(Buffer.alloc(IMAGE_MAX_INPUT_BYTES + 1)), HttpStatus.PAYLOAD_TOO_LARGE, IMAGE_ERR.tooLarge);
  });

  it('пикселийн хязгаар хэтэрвэл → 400 media.too_many_pixels', async () => {
    const input = await solid(1000, 1000).png().toBuffer();
    await expectAppError(svc.process(input, { maxPixels: 999_999 }), HttpStatus.BAD_REQUEST, IMAGE_ERR.tooManyPixels);
  });

  it('зураг биш / хоосон → 400 media.unreadable', async () => {
    await expectAppError(svc.process(Buffer.from('not an image at all')), HttpStatus.BAD_REQUEST, IMAGE_ERR.unreadable);
    await expectAppError(svc.process(Buffer.alloc(0)), HttpStatus.BAD_REQUEST, IMAGE_ERR.unreadable);
  });

  it('эвдэрсэн JPEG (толгой зөв, өгөгдөл тасарсан) → 400 media.unreadable', async () => {
    const full = await solid(800, 600).jpeg().toBuffer();
    await expectAppError(svc.process(full.subarray(0, Math.floor(full.length / 2))), HttpStatus.BAD_REQUEST, IMAGE_ERR.unreadable);
  });

  it('SVG (скрипт агуулж болох) → 400 media.unsupported_type', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expectAppError(svc.process(svg), HttpStatus.BAD_REQUEST, IMAGE_ERR.unsupported);
  });
});
