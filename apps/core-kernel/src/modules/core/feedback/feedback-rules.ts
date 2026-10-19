import { CoreFeedbackStatus, UserRole } from '@prisma/client';

/**
 * v0.2.3 Блок F (FB-SYS-01a) — санал хүсэлтийн цэвэр дүрэм (DB-гүй, unit тест).
 * Хэрэглэгчийн шийдвэр (2026-10-19 15:41): бүгд бусдынхыг харж «+1» дарна; төлөв / хариу — OWNER / ADMIN.
 */

export const FEEDBACK_ADMIN_ROLES: readonly UserRole[] = [UserRole.OWNER, UserRole.ADMIN];

export const isFeedbackAdmin = (role: UserRole): boolean => FEEDBACK_ADMIN_ROLES.includes(role);

/** Зохиогч өөрийн саналаа зөвхөн «Шинэ» (хариу аваагүй) үед засна / устгана; админ хэзээ ч. */
export function canEditFeedback(
  fb: { authorId: string; status: CoreFeedbackStatus },
  actor: { userId: string; isAdmin: boolean },
): boolean {
  if (actor.isAdmin) return true;
  return fb.authorId === actor.userId && fb.status === CoreFeedbackStatus.NEW;
}

const VERSION_RE = /^v?(\d+(?:\.\d+){1,3})$/;

/** '0.2.3' | 'v0.2.3' | ' V0.2.3 ' → 'v0.2.3'; буруу бол null */
export function normalizeVersion(v: string | null | undefined): string | null {
  if (v == null) return null;
  const m = VERSION_RE.exec(v.trim().toLowerCase());
  return m ? `v${m[1]}` : null;
}

export interface StatusPatch {
  status: CoreFeedbackStatus;
  doneVersion?: string | null;
}

/**
 * Төлөв солих: DONE → хувилбар заавал (нормчилсон); бусад төлөвт хувилбарыг арилгана.
 * @returns хадгалах `doneVersion`, эсвэл `'invalid'` (DONE-д хувилбар алга / буруу)
 */
export function resolveDoneVersion(patch: StatusPatch): string | null | 'invalid' {
  if (patch.status !== CoreFeedbackStatus.DONE) return null;
  return normalizeVersion(patch.doneVersion) ?? 'invalid';
}

/** Жагсаалтын эрэмбэ: 'votes' — «+1» олноос, дараа нь шинээс; 'new' — шинээс */
export type FeedbackSort = 'new' | 'votes';

/** Илгээгчийн харагдах нэр: бүтэн нэр → нэвтрэх нэр → имэйлийн @-ийн өмнөх хэсэг (дотоод .login.invalid имэйлийг харуулахгүй) */
export function displayAuthor(u: { fullName: string | null; username: string | null; email: string }): string {
  if (u.fullName?.trim()) return u.fullName.trim();
  if (u.username?.trim()) return u.username.trim();
  return u.email.split('@')[0] ?? '';
}
