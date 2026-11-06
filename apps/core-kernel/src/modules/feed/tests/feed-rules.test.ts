import { describe, expect, it } from 'vitest';
import { canDelete, canEdit, canReport, canView, clampLimit, isEmptyPost, pageOf, parseCursor } from '../feed-rules';

const me = { userId: 'u1', isModerator: false };
const mod = { userId: 'm1', isModerator: true };
const live = { authorId: 'u2', deletedAt: null, hiddenAt: null };
const mine = { ...live, authorId: 'u1' };
const hidden = { ...live, hiddenAt: new Date() };
const deleted = { ...live, deletedAt: new Date() };

describe('feed-rules — харагдах, засах, устгах, report', () => {
  it('устгасныг хэн ч харахгүй; нуусныг зөвхөн зохиогч / модератор', () => {
    expect(canView(live, me)).toBe(true);
    expect(canView(deleted, mod)).toBe(false);
    expect(canView(hidden, me)).toBe(false);
    expect(canView({ ...hidden, authorId: 'u1' }, me)).toBe(true);
    expect(canView(hidden, mod)).toBe(true);
  });

  it('засах — зөвхөн зохиогч (модератор ч биш); устгах — зохиогч эсвэл модератор', () => {
    expect(canEdit(mine, me)).toBe(true);
    expect(canEdit(live, me)).toBe(false);
    expect(canEdit(live, mod)).toBe(false);
    expect(canEdit({ ...mine, deletedAt: new Date() }, me)).toBe(false);
    expect(canDelete(mine, me)).toBe(true);
    expect(canDelete(live, me)).toBe(false);
    expect(canDelete(live, mod)).toBe(true);
  });

  it('report — өөрийнхийг ✖, харагдахгүйг ✖', () => {
    expect(canReport(live, me)).toBe(true);
    expect(canReport(mine, me)).toBe(false);
    expect(canReport(hidden, me)).toBe(false);
  });
});

describe('feed-rules — cursor, хуудас', () => {
  const id = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

  it('cursor = uuid; буруу → false; хоосон → null', () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor('')).toBeNull();
    expect(parseCursor(id(1).toUpperCase())).toBe(id(1));
    expect(parseCursor('abc')).toBe(false);
    expect(parseCursor(`${id(1)}' OR 1=1`)).toBe(false);
  });

  it('pageOf — limit+1 бол дараагийн cursor = сүүлийн харагдсан мөр', () => {
    const rows = [1, 2, 3].map((n) => ({ id: id(n) }));
    expect(pageOf(rows, 3)).toEqual({ items: rows, nextCursor: null });
    expect(pageOf(rows, 2)).toEqual({ items: rows.slice(0, 2), nextCursor: id(2) });
  });

  it('clampLimit, хоосон пост', () => {
    expect(clampLimit(undefined, 10, 30)).toBe(10);
    expect(clampLimit(100, 10, 30)).toBe(30);
    expect(clampLimit(0, 10, 30)).toBe(10);
    expect(isEmptyPost('  ', 0)).toBe(true);
    expect(isEmptyPost('', 1)).toBe(false);
    expect(isEmptyPost('сайн уу', 0)).toBe(false);
  });
});
