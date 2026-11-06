/**
 * v0.2.3 Блок 5 (FEED-01) — Feed v0 integration: бодит PostgreSQL + RLS (app_user), бодит sharp + LocalDiskStorage (tmp).
 * Ажиллуулах: pnpm --filter core-kernel exec vitest run --config vitest.integration.config.ts test/feed.integration.spec.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeedReportReason, PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { FeedService } from '../src/modules/feed/feed.service';
import { FeedReportsService } from '../src/modules/feed/feed-reports.service';
import { ImageProcessorService } from '../src/storage/image-processor.service';
import { LocalDiskStorage } from '../src/storage/local-disk.storage';
import { MediaService } from '../src/storage/media.service';
import { MediaUrlSigner } from '../src/storage/media-url';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

describe('v0.2.3 Блок 5 — Feed v0 (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const dir = mkdtempSync(join(tmpdir(), 'feed-int-'));
  const storage = new LocalDiskStorage(dir);
  const media = new MediaService(storage, new ImageProcessorService());
  const signer = new MediaUrlSigner('x'.repeat(32));
  // Эрхийн кэшгүй (тест бүр шинэ эрх)
  const cache = { buildKey: () => 'k', get: async () => null, set: async () => undefined, del: async () => undefined };
  const access = new CampAccessService(cache as never);
  const feed = new FeedService(rls as never, access, media, signer);
  const reports = new FeedReportsService(rls as never, feed, media);

  const sfx = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let tA: string;
  let tB: string;
  const auth = { owner: randomUUID(), u1: randomUUID(), u2: randomUUID(), u3: randomUUID(), u4: randomUUID(), off: randomUUID(), ownerB: randomUUID() };

  const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#28c' } }).png().toBuffer();
  const q = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams) as { t: string; e: string; s: string };
  const mediaOf = (url: string) => {
    const m = /\/media\/([0-9a-f-]{36})\/(\d+)\?/.exec(url)!;
    return { id: m[1]!, w: Number(m[2]) };
  };

  beforeAll(async () => {
    const mk = async (slug: string) => (await admin.tenant.create({ data: { name: `FD ${slug}`, slug: `fd-${slug}-${sfx}` } })).id;
    tA = await mk('a');
    tB = await mk('b');
    tenantIds.push(tA, tB);
    const user = (tenantId: string, authId: string, role: UserRole, fullName: string, isActive = true) =>
      admin.coreUser.create({ data: { tenantId, authId, email: `${authId}@example.com`, fullName, role, isActive } });
    await user(tA, auth.owner, UserRole.OWNER, 'Эзэмшигч');
    for (const [k, n] of [['u1', 'Бат'], ['u2', 'Дорж'], ['u3', 'Сараа'], ['u4', 'Номин']] as const) {
      await user(tA, auth[k], UserRole.REQUESTER, n);
    }
    await user(tA, auth.off, UserRole.REQUESTER, 'Идэвхгүй', false);
    await user(tB, auth.ownerB, UserRole.OWNER, 'B эзэмшигч');
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => undefined);
    await admin?.$disconnect();
    await rls?.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  let postId: string;
  let imgUrl: string;

  it('ролгүй ажилтан текст + 2 зурагтай пост бичнэ — хувилбар, thumbhash, гарын үсэгтэй URL', async () => {
    const p = await feed.create(tA, auth.u1, '  Өнөөдрийн цэс  ', [await png(3000, 2000), await png(800, 1200)]);
    postId = p.id;
    expect(p).toMatchObject({ body: 'Өнөөдрийн цэс', isMine: true, canEdit: true, canDelete: true, likeCount: 0, hidden: false, author: { name: 'Бат' } });
    expect(p.images).toHaveLength(2);
    expect(p.images[0]!.variants.map((v) => v.w)).toEqual([480, 1080, 2048]);
    expect(p.images[1]!.variants.map((v) => v.w)).toEqual([480, 800]);
    expect(p.images[0]!.thumbhash.length).toBeGreaterThan(10);
    imgUrl = p.images[0]!.variants[0]!.url;
  });

  it('зураг: гарын үсэгтэй URL → хувилбар; хуурамч / өөр өргөн → 404', async () => {
    const { id, w } = mediaOf(imgUrl);
    const v = await feed.mediaVariant(id, w, q(imgUrl));
    expect(v.w).toBe(480);
    expect(await storage.exists(v.key)).toBe(true);
    await expect(feed.mediaVariant(id, 1080, q(imgUrl))).rejects.toBeInstanceOf(NotFoundException);
    await expect(feed.mediaVariant(id, w, { ...q(imgUrl), s: 'AAAAAAAAAAAAAAAAAAAAAA' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('хоосон пост, 7 зураг, зураг биш файл → 400 (файл үлдэхгүй)', async () => {
    await expect(feed.create(tA, auth.u1, '  ', [])).rejects.toBeInstanceOf(BadRequestException);
    const seven = await Promise.all(Array.from({ length: 7 }, () => png(10, 10)));
    await expect(feed.create(tA, auth.u1, 'x', seven)).rejects.toBeInstanceOf(BadRequestException);
    const before = await storage.usage(tA);
    await expect(feed.create(tA, auth.u1, 'x', [await png(50, 50), Buffer.from('<svg/>')])).rejects.toBeInstanceOf(BadRequestException);
    expect(await storage.usage(tA)).toEqual(before);
  });

  it('идэвхгүй хэрэглэгч, өөр tenant (RLS) — бичих / харах ✖', async () => {
    await expect(feed.create(tA, auth.off, 'x', [])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(feed.get(tB, auth.ownerB, postId)).rejects.toBeInstanceOf(NotFoundException);
    expect((await feed.list(tB, auth.ownerB, {})).data).toHaveLength(0);
    // Tenant B-ийн нэрээр гарын үсэг зурсан URL A-ийн зургийг өгөхгүй
    const { id, w } = mediaOf(imgUrl);
    await expect(feed.mediaVariant(id, w, signer.sign('f', tB, id, w))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('жагсаалт: шинэ нь эхэнд, cursor-оор хуудаслана (давхардал / алгасалтгүй)', async () => {
    const ids = [postId];
    for (let i = 0; i < 4; i++) ids.push((await feed.create(tA, auth.u2, `пост ${i}`, [])).id);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await feed.list(tA, auth.u3, { limit: 2, cursor });
      seen.push(...page.data.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.filter((id) => ids.includes(id))).toEqual([...ids].reverse());
    await expect(feed.list(tA, auth.u3, { cursor: 'bad' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('засах: зөвхөн зохиогч; өмнөх текст түүхэнд; бүгд харна', async () => {
    await expect(feed.update(tA, auth.u2, postId, 'хакер')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(feed.update(tA, auth.owner, postId, 'админ')).rejects.toBeInstanceOf(ForbiddenException);
    const e1 = await feed.update(tA, auth.u1, postId, 'Өнөөдрийн цэс (засвар)');
    expect(e1.editedAt).not.toBeNull();
    await feed.update(tA, auth.u1, postId, 'Өнөөдрийн цэс (засвар 2)');
    const h = await feed.revisions(tA, auth.u3, 'post', postId);
    expect(h.current).toBe('Өнөөдрийн цэс (засвар 2)');
    expect(h.revisions.map((r) => r.body)).toEqual(['Өнөөдрийн цэс (засвар)', 'Өнөөдрийн цэс']);
  });

  it('лайк: давхар дарахад нэг, буцаахад 0', async () => {
    await feed.like(tA, auth.u2, postId, true);
    expect(await feed.like(tA, auth.u2, postId, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await feed.like(tA, auth.u3, postId, true)).toEqual({ liked: true, likeCount: 2 });
    expect(await feed.like(tA, auth.u2, postId, false)).toEqual({ liked: false, likeCount: 1 });
    expect((await feed.get(tA, auth.u3, postId)).likedByMe).toBe(true);
  });

  let commentId: string;
  it('сэтгэгдэл: нэмэх, засах (түүх), устгах — тоолуур', async () => {
    const c = await feed.addComment(tA, auth.u2, postId, ' Амттай байсан ');
    commentId = c.id;
    expect(c).toMatchObject({ body: 'Амттай байсан', isMine: true, author: { name: 'Дорж' } });
    const c2 = await feed.addComment(tA, auth.u3, postId, 'Баярлалаа');
    expect((await feed.get(tA, auth.u1, postId)).commentCount).toBe(2);
    await expect(feed.updateComment(tA, auth.u1, commentId, 'x')).rejects.toBeInstanceOf(ForbiddenException);
    await feed.updateComment(tA, auth.u2, commentId, 'Маш амттай байсан');
    expect((await feed.revisions(tA, auth.u1, 'comment', commentId)).revisions.map((r) => r.body)).toEqual(['Амттай байсан']);
    await feed.removeComment(tA, auth.u3, c2.id);
    const list = await feed.listComments(tA, auth.u1, postId, {});
    expect(list.data.map((x) => x.body)).toEqual(['Маш амттай байсан']);
    expect((await feed.get(tA, auth.u1, postId)).commentCount).toBe(1);
  });

  it('report: өөрийнхийг ✖, давхар ✖; 3 өөр хүн → автоматаар нуугдана (зохиогч, модератор л харна)', async () => {
    const r = (who: string) => reports.create(tA, who, { postId, reason: FeedReportReason.SPAM });
    await expect(r(auth.u1)).rejects.toBeInstanceOf(BadRequestException);
    expect(await r(auth.u2)).toEqual({ reportCount: 1, hidden: false });
    await expect(r(auth.u2)).rejects.toBeInstanceOf(ConflictException);
    await r(auth.u3);
    expect(await r(auth.u4)).toEqual({ reportCount: 3, hidden: true });
    await expect(feed.get(tA, auth.u2, postId)).rejects.toBeInstanceOf(NotFoundException);
    expect((await feed.list(tA, auth.u2, {})).data.map((p) => p.id)).not.toContain(postId);
    expect((await feed.get(tA, auth.u1, postId)).hidden).toBe(true);
    expect((await feed.get(tA, auth.owner, postId)).hidden).toBe(true);
  });

  it('модератор: жагсаалт (зөвхөн модератор), DISMISS → нуулт арилна, бүх OPEN хамт шийдэгдэнэ', async () => {
    await expect(reports.list(tA, auth.u2, {})).rejects.toBeInstanceOf(ForbiddenException);
    const open = await reports.list(tA, auth.owner, {});
    expect(open.filter((x) => x.postId === postId)).toHaveLength(3);
    expect(open[0]).toMatchObject({ targetType: 'POST', contentHidden: true, contentAuthor: { name: 'Бат' } });
    expect(await reports.resolve(tA, auth.owner, open[0]!.id, { action: 'DISMISS' })).toEqual({ resolved: 3 });
    await expect(reports.resolve(tA, auth.owner, open[0]!.id, { action: 'REMOVE' })).rejects.toBeInstanceOf(ConflictException);
    expect((await feed.get(tA, auth.u2, postId)).hidden).toBe(false);
  });

  it('сэтгэгдлийн report → REMOVE: сэтгэгдэл устна, тоолуур буурна', async () => {
    await reports.create(tA, auth.u3, { commentId, reason: FeedReportReason.OFFENSIVE, note: 'бүдүүлэг' });
    const [rep] = (await reports.list(tA, auth.owner, {})).filter((x) => x.commentId === commentId);
    expect(rep).toMatchObject({ targetType: 'COMMENT', postId, note: 'бүдүүлэг' });
    await reports.resolve(tA, auth.owner, rep!.id, { action: 'REMOVE' });
    expect((await feed.listComments(tA, auth.u1, postId, {})).data).toHaveLength(0);
    expect((await feed.get(tA, auth.u1, postId)).commentCount).toBe(0);
  });

  it('пост устгах: бусад ✖, модератор ✓ — зургийн файл устна, URL 404', async () => {
    await expect(feed.remove(tA, auth.u2, postId)).rejects.toBeInstanceOf(ForbiddenException);
    const { id, w } = mediaOf(imgUrl);
    const key = (await feed.mediaVariant(id, w, q(imgUrl))).key;
    await feed.remove(tA, auth.owner, postId);
    expect(await storage.exists(key)).toBe(false);
    await expect(feed.get(tA, auth.u1, postId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(feed.mediaVariant(id, w, q(imgUrl))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('feed.content.moderate каталогт; босго tenants.settings-ээс (2)', async () => {
    expect(await admin.corePermission.findUnique({ where: { code: 'feed.content.moderate' } })).toMatchObject({ module: 'feed' });
    await admin.tenant.update({ where: { id: tA }, data: { settings: { feed: { autoHideReports: 2 } } } });
    const p = await feed.create(tA, auth.u1, 'босго', []);
    await reports.create(tA, auth.u2, { postId: p.id, reason: FeedReportReason.OTHER });
    expect(await reports.create(tA, auth.u3, { postId: p.id, reason: FeedReportReason.OTHER })).toEqual({ reportCount: 2, hidden: true });
  });
});
