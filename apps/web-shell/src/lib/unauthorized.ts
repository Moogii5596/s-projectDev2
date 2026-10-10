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
