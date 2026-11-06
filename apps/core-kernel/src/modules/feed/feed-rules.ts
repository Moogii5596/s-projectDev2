/**
 * Feed v0 (FEED-01) — цэвэр дүрмүүд (DB-гүй, unit тест: tests/feed-rules.test.ts).
 */

export const FEED_MAX_IMAGES = 6;
export const FEED_PAGE_DEFAULT = 10;
export const FEED_PAGE_MAX = 30;
export const COMMENT_PAGE_DEFAULT = 20;
export const COMMENT_PAGE_MAX = 50;
export const POST_BODY_MAX = 5000;
export const COMMENT_BODY_MAX = 2000;

export interface FeedViewer {
  userId: string;
  isModerator: boolean;
}

/** Агуулгын төлөв — пост ба сэтгэгдэлд ижил */
export interface FeedContentState {
  authorId: string;
  deletedAt: Date | null;
  hiddenAt: Date | null;
}

/**
 * Харагдах эсэх: устгасныг хэн ч харахгүй; report-оор нуусныг зөвхөн зохиогч ба модератор
 * (зохиогч «нуугдсан» гэж харна — модератор шийдэх хүртэл).
 */
export function canView(c: FeedContentState, v: FeedViewer): boolean {
  if (c.deletedAt) return false;
  if (c.hiddenAt) return v.isModerator || c.authorId === v.userId;
  return true;
}

/** Засах — зөвхөн зохиогч (модератор засахгүй: бусдын үгийг өөрчлөх ✖) */
export const canEdit = (c: FeedContentState, v: FeedViewer): boolean => !c.deletedAt && c.authorId === v.userId;

/** Устгах — зохиогч эсвэл модератор */
export const canDelete = (c: FeedContentState, v: FeedViewer): boolean =>
  !c.deletedAt && (c.authorId === v.userId || v.isModerator);

/** Report — өөрийнхөө агуулгыг биш, харагдаж байгааг */
export const canReport = (c: FeedContentState, v: FeedViewer): boolean => canView(c, v) && c.authorId !== v.userId;

// ── Cursor = мөрийн id (uuid_generate_v7 — цагаар эрэмбэлэгдэнэ; PG uuid харьцуулалт байтаар).
// created_at-аар биш: PG микросекунд ↔ JS миллисекунд — ижил мс-ийн мөр алгасагдах эрсдэлтэй.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Буруу cursor → `false` (дуудагч 400 өгнө); байхгүй → null */
export function parseCursor(s: string | undefined | null): string | null | false {
  if (!s) return null;
  return UUID.test(s) ? s.toLowerCase() : false;
}

/** limit+1 мөрөөс хуудас ба дараагийн cursor */
export function pageOf<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: items[items.length - 1]!.id };
}

export const clampLimit = (n: number | undefined, def: number, max: number): number =>
  Math.min(Math.max(Math.trunc(n ?? def) || def, 1), max);

/** Пост: текст эсвэл зураг заавал */
export function isEmptyPost(body: string, imageCount: number): boolean {
  return body.trim().length === 0 && imageCount === 0;
}
