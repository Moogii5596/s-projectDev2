import apiClient from '../api/client'

export interface AppPermissions {
  userId: string
  isTenantAdmin: boolean
  campId: string | null
  permissions: string[]
  byCamp: Record<string, string[]>
  modules: string[]
}

const RBAC = '/api/v1/core/rbac'

export const permissionApi = {
  myPermissions: async (campId?: string): Promise<AppPermissions> =>
    (await apiClient.get<AppPermissions>(`${RBAC}/me/permissions`, { params: campId ? { campId } : undefined })).data,
}
