import apiClient from './client'
import { currentLang } from '../i18n'
import { apiErrorMessage } from '../lib/password-change'

/** v0.2.2 D-10 — `POST /api/v1/auth/sign-in` хариу (Supabase session) */
export interface SignInSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt: number | null
  tokenType: string
  mustChangePassword: boolean
}

/**
 * Утас / нэвтрэх нэр / имэйл + нууц үг → server-ээр нэвтрэх.
 * apiClient биш `fetch`: 401 (буруу нууц үг) нь "session хүчингүй" interceptor-ийг (FE-007) өдөөх ёсгүй.
 */
export async function signInRequest(identifier: string, password: string, fallbackError: string): Promise<SignInSession> {
  const base = import.meta.env.VITE_API_BASE_URL || ''
  const res = await fetch(`${base}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': currentLang() },
    body: JSON.stringify({ identifier, password }),
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(apiErrorMessage(body, fallbackError))
  return body as SignInSession
}

export async function changePasswordRequest(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/api/v1/auth/change-password', { currentPassword, newPassword })
}

export async function getPasswordPolicy(): Promise<{ passwordMinLength: number }> {
  return (await apiClient.get<{ passwordMinLength: number }>('/api/v1/auth/password-policy')).data
}

// ── v0.2.2 Блок 3: урилга / нууц үг сэргээх (нэвтрэлтгүй — fetch, interceptor-гүй) ──

export type InviteInfo =
  | { valid: true; purpose: 'INVITE' | 'RESET'; expiresAt: string; name: string | null; login: string | null; passwordMinLength: number }
  | { valid: false; reason: 'invalid' | 'used' | 'revoked' | 'expired' }

async function publicRequest<T>(method: 'GET' | 'POST', path: string, body: unknown, fallbackError: string): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL || ''
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept-Language': currentLang() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(apiErrorMessage(data, fallbackError))
  return data as T
}

export const inspectInvite = (token: string, fallbackError: string) =>
  publicRequest<InviteInfo>('GET', `/api/v1/auth/invites/${encodeURIComponent(token)}`, undefined, fallbackError)

export const acceptInvite = (token: string, password: string, fallbackError: string) =>
  publicRequest<{ done: true; login: string | null }>('POST', `/api/v1/auth/invites/${encodeURIComponent(token)}/accept`, { password }, fallbackError)

export const forgotPassword = (identifier: string, fallbackError: string) =>
  publicRequest<{ ok: true }>('POST', '/api/v1/auth/forgot-password', { identifier }, fallbackError)
