/**
 * v0.2.2 D-06 — backend 403 `auth.password_change_required` → /change-password.
 * Цэвэр функц — supabase/API импортгүй (FE-005), unit тестлэгдэнэ.
 */
export const CHANGE_PASSWORD_PATH = '/change-password'
const PASSWORD_CHANGE_REQUIRED = 'auth.password_change_required'
/** GoTrue-ийн нийтлэг доод босго; хэрэглэгчийн tenant policy-г backend тусад нь буцаана. */
export const MIN_PASSWORD_LENGTH = 6

export function isPasswordChangeRequired(error: unknown): boolean {
  const r = (error as { response?: { status?: number; data?: { code?: string } } } | null)?.response
  return r?.status === 403 && r.data?.code === PASSWORD_CHANGE_REQUIRED
}

export function handlePasswordChangeRequired(deps: { currentPath: () => string; redirect: (path: string) => void }): void {
  if (deps.currentPath() !== CHANGE_PASSWORD_PATH) deps.redirect(CHANGE_PASSWORD_PATH)
}

/** Backend-ийн алдааны body → харуулах мессеж (ValidationPipe: message нь массив байж болно) */
export function apiErrorMessage(body: unknown, fallback: string): string {
  const m = (body as { message?: unknown } | null)?.message
  if (Array.isArray(m)) return m.filter((x) => typeof x === 'string').join(', ') || fallback
  return typeof m === 'string' && m.length > 0 ? m : fallback
}

/** Толгойн мөрөнд харагдах нэр: дотоод `.login.invalid` имэйлийг (ADR-003 §2.2) хэзээ ч харуулахгүй */
export function displayLogin(me: { fullName?: string | null; username?: string | null; phone?: string | null; email?: string | null } | null | undefined, fallbackEmail?: string | null): string {
  const email = me?.email ?? fallbackEmail ?? ''
  const realEmail = email && !email.endsWith('.login.invalid') ? email : ''
  return me?.fullName?.trim() || me?.username || me?.phone || realEmail
}
