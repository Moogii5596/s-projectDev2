import apiClient from '../../api/client'

export type SiteType = 'CAMP' | 'OFFICE' | 'MINE' | 'OTHER'

export interface Site {
  id: string
  type: SiteType
  code: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SiteInput {
  type: SiteType
  code: string
  name: string
}

const BASE = '/api/v1/core/sites'

export const sitesApi = {
  list: async () => (await apiClient.get<Site[]>(BASE)).data,
  create: async (body: SiteInput) => (await apiClient.post<Site>(BASE, body)).data,
  update: async (id: string, body: Partial<SiteInput> & { isActive?: boolean }) =>
    (await apiClient.patch<Site>(`${BASE}/${id}`, body)).data,
  archive: async (id: string) => (await apiClient.delete<Site>(`${BASE}/${id}`)).data,
}

export const sitesQueryKey = ['core', 'sites'] as const
