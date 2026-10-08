import apiClient from './client'
import type {
  MrHeader,
  CreateMrDto,
  UpdateMrDto,
  SubmitMrDto,
  ApproveMrDto,
  RejectMrDto,
} from '../types/mr.types'

const BASE = '/api/v1/requisitions'

export interface CursorMrResponse {
  data: MrHeader[]
  nextCursor: string | null
  hasMore: boolean
}

export interface MrListParams {
  cursor?: string
  limit?: number
  order?: 'asc' | 'desc'
}

export async function getMRList(params: MrListParams = {}): Promise<CursorMrResponse> {
  const res = await apiClient.get<CursorMrResponse>(BASE, { params })
  return res.data
}

export async function getMRDetail(id: string): Promise<MrHeader> {
  const res = await apiClient.get<MrHeader>(`${BASE}/${id}`)
  return res.data
}

export async function createMR(dto: CreateMrDto): Promise<MrHeader> {
  const res = await apiClient.post<MrHeader>(BASE, dto)
  return res.data
}

export async function updateMR(id: string, dto: UpdateMrDto): Promise<MrHeader> {
  const res = await apiClient.put<MrHeader>(`${BASE}/${id}`, dto)
  return res.data
}

export async function deleteMR(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`)
}

export async function submitMR(id: string, dto: SubmitMrDto = {}): Promise<MrHeader> {
  const res = await apiClient.post<MrHeader>(`${BASE}/${id}/submit`, dto)
  return res.data
}

export async function approveMR(id: string, dto: ApproveMrDto = {}): Promise<MrHeader> {
  const res = await apiClient.post<MrHeader>(`${BASE}/${id}/approve`, dto)
  return res.data
}

export async function rejectMR(id: string, dto: RejectMrDto): Promise<MrHeader> {
  const res = await apiClient.post<MrHeader>(`${BASE}/${id}/reject`, dto)
  return res.data
}
