/**
 * v0.2.2 Блок 3 (D-03) — урилга / нууц үг сэргээх токен. Цэвэр функц (DB/API импортгүй).
 * Токен = 32 санамсаргүй байт (base64url, 43 тэмдэгт); DB-д зөвхөн SHA-256 hex.
 */
import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TTL_MS = 72 * 3600_000; // ADR-003 §2.3
export const RESET_TTL_MS = 60 * 60_000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export type InviteState = 'ok' | 'used' | 'revoked' | 'expired';

export function inviteState(row: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date = new Date()): InviteState {
  if (row.usedAt) return 'used';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'ok';
}

/** Хэрэглэгчийн нэвтрэх нэрийн сануулга (токен эзэмшигчид л): утас → username → жинхэнэ имэйл */
export function loginHint(u: { phone: string | null; username: string | null; email: string }): string | null {
  if (u.phone) return u.phone;
  if (u.username) return u.username;
  return isInternalEmail(u.email) ? null : u.email;
}

/** ADR-003 §2.2: имэйлгүй хэрэглэгчийн GoTrue хаяг — RFC 2606 `.invalid` (хэзээ ч хүргэгдэхгүй) */
export const isInternalEmail = (email: string) => email.toLowerCase().endsWith('.login.invalid');
export const internalEmail = (opaqueId: string, tenantSlug: string) =>
  `u-${opaqueId.toLowerCase().replace(/[^a-z0-9]/g, '')}@${tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, '')}.login.invalid`;
