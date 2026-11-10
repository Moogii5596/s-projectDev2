import apiClient from '../../api/client'
import type { FeedImageDto } from './feed-bridge'

/**
 * v0.2.3 Блок F — Санал хүсэлт (`/api/v1/core/feedback`). DTO нэр backend `core-feedback.dto.ts`-тэй ТАМ АДИЛ (RULE-20).
 */
export type FeedbackKind = 'BUG' | 'IDEA' | 'REQUEST'
export type FeedbackStatus = 'NEW' | 'ACCEPTED' | 'PLANNED' | 'DONE' | 'REJECTED'

export const FEEDBACK_KINDS: FeedbackKind[] = ['BUG', 'IDEA', 'REQUEST']
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['NEW', 'ACCEPTED', 'PLANNED', 'DONE', 'REJECTED']

export interface FeedbackItemDto {
  id: string
  kind: FeedbackKind
  title: string
  body: string
  pagePath: string | null
  appVersion: string | null
  status: FeedbackStatus
  adminReply: string | null
  repliedAt: string | null
  doneVersion: string | null
  voteCount: number
  votedByMe: boolean
  isMine: boolean
  canEdit: boolean
  authorName: string
  createdAt: string
  updatedAt: string
  attachments: FeedImageDto[]
}

export interface FeedbackListDto {
  data: FeedbackItemDto[]
  total: number
  canManage: boolean
}

export interface QueryFeedbackDto {
  status?: FeedbackStatus
  kind?: FeedbackKind
  mine?: boolean
  q?: string
  sort?: 'new' | 'votes'
  limit?: number
}

export interface CreateFeedbackDto {
  kind: FeedbackKind
  title: string
  body?: string
  pagePath?: string | null
}

export type UpdateFeedbackDto = Partial<Pick<CreateFeedbackDto, 'kind' | 'title' | 'body'>>

export interface SetFeedbackStatusDto {
  status: FeedbackStatus
  adminReply?: string | null
  doneVersion?: string | null
}

const BASE = '/api/v1/core/feedback'

export const feedbackKeys = {
  all: ['core', 'feedback'] as const,
  list: (q: QueryFeedbackDto) => ['core', 'feedback', 'list', q] as const,
}

export const feedbackApi = {
  list: async (q: QueryFeedbackDto = {}): Promise<FeedbackListDto> =>
    (await apiClient.get<FeedbackListDto>(BASE, { params: { ...q, mine: q.mine ? 'true' : undefined, q: q.q || undefined } })).data,
  create: async (dto: CreateFeedbackDto): Promise<FeedbackItemDto> => (await apiClient.post<FeedbackItemDto>(BASE, dto)).data,
  /** v0.2.4 FEED-05: Feed-ийн постоос */
  createFromPost: async (postId: string, dto: CreateFeedbackDto): Promise<FeedbackItemDto> =>
    (await apiClient.post<FeedbackItemDto>(`${BASE}/from-post/${postId}`, dto)).data,
  update: async (id: string, dto: UpdateFeedbackDto): Promise<FeedbackItemDto> =>
    (await apiClient.patch<FeedbackItemDto>(`${BASE}/${id}`, dto)).data,
  addAttachments: async (id: string, files: File[]): Promise<FeedImageDto[]> => {
    const form = new FormData()
    files.forEach((file) => form.append('images', file))
    return (
      await apiClient.post<FeedImageDto[]>(`${BASE}/${id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
    ).data
  },
  removeAttachment: async (attId: string): Promise<void> => {
    await apiClient.delete(`${BASE}/attachments/${attId}`)
  },
  setStatus: async (id: string, dto: SetFeedbackStatusDto): Promise<FeedbackItemDto> =>
    (await apiClient.patch<FeedbackItemDto>(`${BASE}/${id}/status`, dto)).data,
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/${id}`)
  },
  vote: async (id: string, on: boolean): Promise<FeedbackItemDto> =>
    on
      ? (await apiClient.post<FeedbackItemDto>(`${BASE}/${id}/vote`)).data
      : (await apiClient.delete<FeedbackItemDto>(`${BASE}/${id}/vote`)).data,
  exportXlsx: async (): Promise<Blob> => (await apiClient.get<Blob>(`${BASE}/export`, { responseType: 'blob' })).data,
}
