import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { FeedLinksService } from '../feed-links.service';

function setup() {
  const svc = new FeedLinksService();
  svc.register({
    objectType: 'CAMP_MAINTENANCE', module: 'camp', labelKey: 'feed.link.type.maintenance',
    statuses: async (_tx, _t, ids) => new Map(ids.map((id) => [id, { statusKey: 'feed.link.status.maintenance.open', closed: false, ref: 'ZAS-1' }])),
    viewLink: async (_tx, _t, userId, id) => (userId === 'staff' ? `/camp/c1/maintenance/${id}` : null),
  });
  const tx = {
    feedPost: { findFirst: vi.fn().mockResolvedValue({ body: 'Ус гоожиж байна', authorId: 'author' }) },
    feedLink: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ postId: 'p1', objectType: 'CAMP_MAINTENANCE', objectId: 'm1' }, { postId: 'p1', objectType: 'UNKNOWN', objectId: 'x' }]),
    },
  };
  return { svc, tx };
}

describe('FeedLinksService (FEED-04)', () => {
  it('зөвхөн модуль manifest-д зарласан object type бүртгэнэ', () => {
    const svc = new FeedLinksService();
    expect(() => svc.register({
      objectType: 'UNDECLARED_OBJECT', module: 'camp', labelKey: 'x',
      statuses: async () => new Map(),
      viewLink: async () => null,
    })).toThrow('Feed object type manifest-д бүртгэгдээгүй: UNDECLARED_OBJECT');
    expect(() => svc.register({
      objectType: 'KNOWN_OBJECT', module: 'missing', labelKey: 'x',
      statuses: async () => new Map(),
      viewLink: async () => null,
    })).toThrow('Feed object module manifest-д байхгүй: missing');
  });

  it('пост дээр төлөв + дугаар; линк зөвхөн объектын эрхтэй хүнд (PII/зардал ✖)', async () => {
    const { svc, tx } = setup();
    const staff = (await svc.forPosts(tx as never, 't', ['p1'], 'staff')).get('p1')!;
    const other = (await svc.forPosts(tx as never, 't', ['p1'], 'other')).get('p1')!;
    expect(staff).toEqual([{ objectType: 'CAMP_MAINTENANCE', labelKey: 'feed.link.type.maintenance', statusKey: 'feed.link.status.maintenance.open', closed: false, ref: 'ZAS-1', link: '/camp/c1/maintenance/m1' }]);
    expect(other[0].link).toBeNull();
    expect(Object.keys(other[0]).sort()).toEqual(['closed', 'labelKey', 'link', 'objectType', 'ref', 'statusKey']);
  });

  it('харагдахгүй пост → 404, давхар холбоос → 409, бүртгэлгүй төрөл → 404', async () => {
    const { svc, tx } = setup();
    await expect(svc.assertLinkable(tx as never, 't', 'p1', 'u', 'NOPE')).rejects.toMatchObject({ status: 404 });
    tx.feedLink.count.mockResolvedValueOnce(1);
    await expect(svc.assertLinkable(tx as never, 't', 'p1', 'u', 'CAMP_MAINTENANCE')).rejects.toMatchObject({ status: 409 });
    tx.feedPost.findFirst.mockResolvedValueOnce(null);
    await expect(svc.assertLinkable(tx as never, 't', 'p1', 'u', 'CAMP_MAINTENANCE')).rejects.toMatchObject({ status: 404 });
    tx.feedLink.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(svc.link(tx as never, 't', { postId: 'p1', objectType: 'CAMP_MAINTENANCE', objectId: 'm1', userId: 'u' })).rejects.toMatchObject({ status: 409 });
  });
});
