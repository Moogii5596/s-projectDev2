import apiClient from '../../api/client'
import type { TenantModuleId } from '../../lib/modules'

export interface TenantModuleView {
  id: TenantModuleId
  active: boolean
  required: boolean
  debugOnly: boolean
  dependencies: TenantModuleId[]
}

export const tenantModulesQueryKey = ['tenant-modules'] as const

export const tenantModulesApi = {
  getMine: async () => (await apiClient.get<{ modules: TenantModuleId[] }>('/api/v1/me/modules')).data.modules,
  list: async () => (await apiClient.get<TenantModuleView[]>('/api/v1/core/modules')).data,
  setActive: async (id: TenantModuleId, active: boolean) =>
    (await apiClient.patch<TenantModuleView[]>(`/api/v1/core/modules/${id}`, { active })).data,
}
