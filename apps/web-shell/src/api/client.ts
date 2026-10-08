import axios from 'axios'
import { supabase } from '../lib/supabase'

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

  return config
})

// Response interceptor: 401 → login redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default apiClient
