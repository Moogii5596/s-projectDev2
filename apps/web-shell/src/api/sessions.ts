import apiClient from './client'

/** v0.2.3 Блок 4б (PIL-15, D-3) — `GET /api/v1/auth/sessions`: нэвтэрсэн төхөөрөмж (GoTrue session) */
export interface DeviceSession {
  id: string
  /** Энэ хүсэлтийг илгээж буй төхөөрөмж */
  current: boolean
  userAgent: string | null
  ip: string | null
  createdAt: string | null
  lastActiveAt: string | null
}

export const sessionKeys = { all: ['auth', 'sessions'] as const }

export async function listSessions(): Promise<DeviceSession[]> {
  const { data } = await apiClient.get<DeviceSession[]>('/api/v1/auth/sessions')
  return data
}

export async function revokeSession(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/auth/sessions/${encodeURIComponent(id)}`)
}

export async function revokeOtherSessions(): Promise<number> {
  const { data } = await apiClient.delete<{ revoked: number }>('/api/v1/auth/sessions/others')
  return data.revoked
}
