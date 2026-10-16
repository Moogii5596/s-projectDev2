/**
 * v0.2.2 Блок 4 (B4-Q3) — хэрэглэгчийн жагсаалтын мөр: утас/username, холбогдсон ажилтан, сүүлийн урилгын төлөв.
 * Цэвэр функц — unit тестлэгдэнэ.
 */
import { isInternalEmail } from '../../../auth/invite-token';

export type InviteStatus = 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface InviteLike {
  channel: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Хүчингүй болгосон → REVOKED · ашигласан → USED · хугацаа өнгөрсөн → EXPIRED · бусад → PENDING */
export function inviteStatus(inv: Pick<InviteLike, 'expiresAt' | 'usedAt' | 'revokedAt'>, now: Date): InviteStatus {
  if (inv.revokedAt) return 'REVOKED';
  if (inv.usedAt) return 'USED';
  if (inv.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'PENDING';
}

export interface UserRowInput {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  role: string;
  phone: string | null;
  username: string | null;
}

export interface EmployeeLink {
  id: string;
  userId: string | null;
  employeeCode: string;
  fullName: string;
  campId: string;
  camp: { code: string };
}

export interface CampUserRow extends UserRowInput {
  /** Дотоод `…@<slug>.login.invalid` хаяг (имэйлгүй хэрэглэгч) — UI имэйл гэж харуулахгүй */
  internalEmail: boolean;
  employee: { id: string; employeeCode: string; fullName: string; campId: string; campCode: string } | null;
  invite: { status: InviteStatus; channel: string; expiresAt: string; createdAt: string } | null;
}

/** Хэрэглэгч бүрт ажилтан (нэг) ба хамгийн сүүлийн урилгыг (createdAt desc-ээр эрэмбэлсэн жагсаалтын эхнийх) нийлүүлнэ */
export function buildUserRows(
  users: UserRowInput[],
  employees: EmployeeLink[],
  invites: (InviteLike & { userId: string })[],
  now: Date,
): CampUserRow[] {
  const empBy = new Map<string, EmployeeLink>();
  for (const e of employees) if (e.userId && !empBy.has(e.userId)) empBy.set(e.userId, e);
  const invBy = new Map<string, InviteLike>();
  for (const i of invites) if (!invBy.has(i.userId)) invBy.set(i.userId, i);
  return users.map((u) => {
    const e = empBy.get(u.id);
    const i = invBy.get(u.id);
    return {
      ...u,
      internalEmail: isInternalEmail(u.email),
      employee: e ? { id: e.id, employeeCode: e.employeeCode, fullName: e.fullName, campId: e.campId, campCode: e.camp.code } : null,
      invite: i ? { status: inviteStatus(i, now), channel: i.channel, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() } : null,
    };
  });
}

/** B4-Q2: идэвхгүй болгох хориг — өөрийгөө, сүүлийн идэвхтэй OWNER */
export function deactivateBlocker(
  target: { id: string; role: string; isActive: boolean },
  actorUserId: string,
  activeOwners: number,
): 'camp.err.user.1' | 'camp.err.user.2' | null {
  if (target.id === actorUserId) return 'camp.err.user.1';
  if (target.role === 'OWNER' && target.isActive && activeOwners <= 1) return 'camp.err.user.2';
  return null;
}
