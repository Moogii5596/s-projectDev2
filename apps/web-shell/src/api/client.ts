import axios from 'axios'
import { supabase } from '../lib/supabase'
import { handleUnauthorized, isSessionRevoked } from '../lib/unauthorized'
import { handlePasswordChangeRequired, isPasswordChangeRequired } from '../lib/password-change'
import { currentLang } from '../i18n'

// VITE_API_BASE_URL хоосон бол '' (same origin) → Vite proxy '/api' → localhost:3000
// Тиймээс CORS алдаа гарахгүй
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: Supabase session-с JWT авч header-д нэмэх
apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // v0.2.0 §0.7: backend-ийн алдааны мессеж, Excel загварын хэл
  config.headers['Accept-Language'] = currentLang()

  return config
})

// Response interceptor: 401 → локал session устгаад /login [FE-007]
// (зөвхөн redirect хийвэл localStorage-ийн хүчингүй session-оор /login ↔ нүүр хуудас төгсгөлгүй давтагддаг байсан)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // v0.2.2 D-06: нууц үг солих шаардлагатай → /change-password
    if (isPasswordChangeRequired(error)) {
      handlePasswordChangeRequired({ currentPath: () => window.location.pathname, redirect: (path) => { window.location.href = path } })
    }
    // №3 (Блок 6б): идэвхгүй болсон / ажлаас гарсан хэрэглэгч (403 auth.not_member) — 401-тэй адил гаргана
    if (error.response?.status === 401 || isSessionRevoked(error)) {
      await handleUnauthorized({
        signOutLocal: () => supabase.auth.signOut({ scope: 'local' }),
        currentPath: () => window.location.pathname,
        redirect: (path) => { window.location.href = path },
      })
    }
    return Promise.reject(error)
  },
)

export default apiClient
