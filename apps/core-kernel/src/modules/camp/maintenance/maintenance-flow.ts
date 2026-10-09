import { CampMaintenanceStatus as S } from '@prisma/client';
import { CAMP_PERMISSIONS as P, CampPermission } from '../common/camp-permissions';

/**
 * Засварын төлвийн машин (Шат 4.4) — цэвэр өгөгдөл, unit тестээр бүрэн хамрагдана.
 *
 *   OPEN ──start──▶ IN_PROGRESS ──complete──▶ DONE ──close──▶ CLOSED (зардал бичигдэнэ, түгжигдэнэ)
 *     │                 ▲  │                    │
 *     └──cancel──┐      └──┼────reopen──────────┘
 *                ▼         │
 *            CANCELLED ◀───┘ cancel
 *
 * room: 'lock' = blocks_room бол өрөөг MAINTENANCE; 'release' = өөр түгжээ байхгүй бол ACTIVE.
 * reporterMay: хүсэлт үүсгэсэн хүн (maintenance.create эрхтэй) эрхийн кодгүйгээр хийж болох эсэх.
 */
export type MaintenanceAction = 'start' | 'complete' | 'reopen' | 'close' | 'cancel';

export interface TransitionRule {
  from: readonly S[];
  to: S;
  perms: readonly CampPermission[];
  reporterMay: boolean;
  room: 'lock' | 'release' | 'none';
}

export const TRANSITIONS: Readonly<Record<MaintenanceAction, TransitionRule>> = {
  start: { from: [S.OPEN], to: S.IN_PROGRESS, perms: [P.MAINTENANCE_PARTS], reporterMay: false, room: 'none' },
  complete: { from: [S.IN_PROGRESS], to: S.DONE, perms: [P.MAINTENANCE_PARTS], reporterMay: false, room: 'release' },
  reopen: { from: [S.DONE], to: S.IN_PROGRESS, perms: [P.MAINTENANCE_CLOSE], reporterMay: false, room: 'lock' },
  close: { from: [S.DONE], to: S.CLOSED, perms: [P.MAINTENANCE_CLOSE], reporterMay: false, room: 'none' },
  cancel: { from: [S.OPEN, S.IN_PROGRESS], to: S.CANCELLED, perms: [P.MAINTENANCE_CLOSE], reporterMay: true, room: 'release' },
};

/** Өрөөг түгжиж байгаа ("нээлттэй") төлвүүд */
export const OPEN_STATUSES: readonly S[] = [S.OPEN, S.IN_PROGRESS];
/** Сэлбэг нэмэх/засах/устгах боломжтой төлвүүд (CLOSED/CANCELLED → DB trigger ч хамгаална) */
export const PARTS_EDITABLE: readonly S[] = [S.OPEN, S.IN_PROGRESS, S.DONE];
/** Гарчиг/тайлбар/зэрэглэл засах боломжтой */
export const DETAILS_EDITABLE: readonly S[] = [S.OPEN, S.IN_PROGRESS];

export const STATUS_LABEL: Readonly<Record<S, string>> = {
  OPEN: 'Нээлттэй',
  IN_PROGRESS: 'Хийгдэж буй',
  DONE: 'Дууссан',
  CLOSED: 'Хаагдсан',
  CANCELLED: 'Цуцлагдсан',
};

/** ZAS-{campCode}-{YYYY}-{0001} (4-өөс их бол өргөсөнө) */
export const formatRequestNo = (campCode: string, year: string, n: number): string => `ZAS-${campCode}-${year}-${String(n).padStart(4, '0')}`;
export const requestNoPrefix = (campCode: string, year: string): string => `ZAS-${campCode}-${year}-`;
