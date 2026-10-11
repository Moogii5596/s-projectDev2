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
  /** v0.2.2 — нэвтрэх нэр (D-13) */
  phone?: string | null
  username?: string | null
  /** v0.2.2 D-06 — true бол /change-password */
  mustChangePassword?: boolean
}

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>('/api/v1/auth/me')
  return data
}
