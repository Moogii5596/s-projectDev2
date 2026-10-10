import apiClient from '../../api/client'

/** Phase 6.0.3 — `/api/v1/vendors` (backend: VendorController) */
export interface Vendor {
  id: string
  name: string
  regNumber: string | null
  isActive: boolean
  createdAt: string
}

export interface VendorInput {
  name?: string
  regNumber?: string
  isActive?: boolean
}

export async function listVendors(activeOnly: boolean): Promise<Vendor[]> {
  const { data } = await apiClient.get<Vendor[]>('/api/v1/vendors', { params: activeOnly ? { activeOnly: true } : {} })
  return data
}

export async function createVendor(input: { name: string; regNumber?: string }): Promise<Vendor> {
  const { data } = await apiClient.post<Vendor>('/api/v1/vendors', input)
  return data
}

export async function updateVendor(id: string, input: VendorInput): Promise<Vendor> {
  const { data } = await apiClient.patch<Vendor>(`/api/v1/vendors/${id}`, input)
  return data
}
