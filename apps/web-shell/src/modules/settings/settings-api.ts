import apiClient from '../../api/client'

export interface TenantProfile {
  name: string
  logoPath: string | null
  timeZone: string
  defaultLanguage: 'mn' | 'en' | 'zh'
  activeLanguages: ('mn' | 'en' | 'zh')[]
  baseCurrency: string
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY'
}

export interface TenantSecurityPolicy {
  passwordMinLength: number
  loginFailureLimit: number
  loginLockoutMinutes: number
  sessionDurationMinutes: number
}

export interface TenantSettingsView {
  profile: TenantProfile
  security: TenantSecurityPolicy
  updatedAt: string
}

const BASE = '/api/v1/core/settings'

export const settingsApi = {
  get: async () => (await apiClient.get<TenantSettingsView>(BASE)).data,
  updateProfile: async (body: Partial<TenantProfile>) =>
    (await apiClient.patch<TenantSettingsView>(`${BASE}/profile`, body)).data,
  updateSecurity: async (body: Partial<TenantSecurityPolicy>) =>
    (await apiClient.patch<TenantSettingsView>(`${BASE}/security`, body)).data,
}

export const settingsQueryKey = ['core-settings'] as const
