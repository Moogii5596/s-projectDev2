import apiClient from './client'
import type { UserRole } from '../lib/roles'

/** Phase 6.0.1 — Одоогийн хэрэглэгч (`GET /api/v1/auth/me`) */
export interface Me {
  id: string
  email: string
  fullName: string | null
  role: UserRole
  tenantId: string
  isActive: boolean
  /** v0.2.0 §0.7 — mn | en | zh */
  locale?: string
}

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>('/api/v1/auth/me')
  return data
}
