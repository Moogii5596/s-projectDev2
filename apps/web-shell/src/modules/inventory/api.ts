import apiClient from '../../api/client'

/** Phase 6.0.2 — `/api/v1/inventory` (backend: InventoryController) */
export interface InventoryItem {
  id: string
  sku: string
  name: string
  unit: string
  /** decimal string, жнь '12.5' */
  quantity: string
  minThreshold: string
  lowStock: boolean
  createdAt: string
}

export interface InventoryPage {
  data: InventoryItem[]
  nextCursor: string | null
  hasMore: boolean
}

export interface CreateInventoryInput {
  sku: string
  name: string
  unit?: string
  quantity?: number
  minThreshold?: number
}

export async function listInventory(params: { cursor?: string | null; lowStock?: boolean; limit?: number }): Promise<InventoryPage> {
  const { data } = await apiClient.get<InventoryPage>('/api/v1/inventory/items', {
    params: {
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.lowStock ? { lowStock: true } : {}),
      limit: params.limit ?? 20,
    },
  })
  return data
}

export async function createInventoryItem(input: CreateInventoryInput): Promise<void> {
  await apiClient.post('/api/v1/inventory/items', input)
}

export async function adjustInventoryItem(id: string, delta: number): Promise<InventoryItem> {
  const { data } = await apiClient.patch<InventoryItem>(`/api/v1/inventory/items/${id}/adjust`, { delta })
  return data
}
