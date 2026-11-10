import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './i18n' // v0.2.0 §0.7 — App-аас өмнө
import App from './App'

// v0.2.2 Блок 6 (PIL-10): шинэ хувилбар байршсаны дараа хуучин tab хуучин chunk-ийн hash-ийг
// ачаалахаар оролдоход (файл алга) — хуудсыг НЭГ удаа дахин ачаална (давталтаас хамгаалж 60 сек).
const RELOAD_KEY = 's-project.chunk-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  } catch {
    /* хувийн цонх — шалгахгүй */
  }
  if (Date.now() - last < 60_000) return // саяхан дахин ачаалсан → алдааг жирийн байдлаар үлдээнэ
  event.preventDefault()
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element олдсонгүй')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
