/**
 * v0.1.6.1 [FE-007] — API 401 (session серверт хүчингүй) үед хийх үйлдэл.
 *
 * Өмнө: зөвхөн `window.location.href = '/login'` → localStorage-ийн session хэвээр → LoginPage "нэвтэрсэн" гэж
 * үзэж нүүр (/camp) руу буцаана → дахин 401 → /login … төгсгөлгүй давталт.
 * Одоо: эхлээд ЛОКАЛ session-ийг устгана (серверт хүсэлтгүй), дараа нь /login (аль хэдийн тэнд бол шилжихгүй).
 * Цэвэр функц — supabase импортгүй (FE-005), unit тестлэгдэнэ.
 */
export interface UnauthorizedDeps {
  /** supabase.auth.signOut({ scope: 'local' }) */
  signOutLocal: () => Promise<unknown>
  currentPath: () => string
  redirect: (path: string) => void
}

export async function handleUnauthorized(deps: UnauthorizedDeps): Promise<void> {
  try {
    await deps.signOutLocal()
  } catch {
    // локал цэвэрлэгээ амжаагүй ч /login руу явна
  }
  if (deps.currentPath() !== '/login') deps.redirect('/login')
}

/**
 * v0.2.2 Блок 6б (№3): серверт хэрэглэгч ИДЭВХГҮЙ болсон / байгууллагаас хасагдсан — токен хүчинтэй ч 403.
 *   `auth.not_member` (guard), `camp.err.access.1` (кемп/HR — хэрэглэгч идэвхгүй). 401-тэй адил: локал session → /login.
 * Бусад 403 (эрх дутуу) → хэвээр (хуудсанд «эрх алга» мессеж).
 */
export const SESSION_REVOKED_CODES: readonly string[] = ['auth.not_member', 'camp.err.access.1']

export function isSessionRevoked(error: unknown): boolean {
  const r = (error as { response?: { status?: number; data?: { code?: string } } } | null)?.response
  return r?.status === 403 && SESSION_REVOKED_CODES.includes(r.data?.code ?? '')
}
