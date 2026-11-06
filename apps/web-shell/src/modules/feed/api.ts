import apiClient from '../../api/client'
import type {
  FeedCommentDto,
  FeedPostDto,
  FeedReportReason,
  FeedRevisionListDto,
} from './types'

/**
 * v0.2.3 Блок 5 (FEED-01) — Feed (`/api/v1/core/feed`). DTO нэр backend `feed.dto.ts`-тэй ТАМ АДИЛ (RULE-20) → `types.ts`.
 */
export interface FeedListDto {
  data: FeedPostDto[]
  nextCursor: string | null
  canModerate: boolean
}

export interface FeedCommentListDto {
  data: FeedCommentDto[]
  nextCursor: string | null
}

export interface FeedLikeDto {
  liked: boolean
  likeCount: number
}

export type FeedReportStatus = 'OPEN' | 'DISMISSED' | 'REMOVED'

export interface CreateReportDto {
  postId?: string
  commentId?: string
  reason: FeedReportReason
  note?: string | null
}

export interface FeedReportResultDto {
  reportCount: number
  hidden: boolean
}

export interface FeedReportItemDto {
  id: string
  targetType: 'POST' | 'COMMENT'
  postId: string
  commentId: string | null
  excerpt: string
  contentAuthor: { id: string; name: string }
  contentHidden: boolean
  contentDeleted: boolean
  reporter: { id: string; name: string }
  reason: FeedReportReason
  note: string | null
  status: FeedReportStatus
  createdAt: string
  resolvedAt: string | null
}

const BASE = '/api/v1/core/feed'

export const feedKeys = {
  all: ['core', 'feed'] as const,
  list: () => ['core', 'feed', 'list'] as const,
  comments: (postId: string) => ['core', 'feed', 'comments', postId] as const,
  revisions: (kind: 'post' | 'comment', id: string) => ['core', 'feed', 'revisions', kind, id] as const,
  reports: (status: FeedReportStatus) => ['core', 'feed', 'reports', status] as const,
}

/** Зурагтай бол multipart (`body` + `images`), эс бөгөөс JSON */
export function postPayload(body: string, images: readonly File[]): FormData | { body: string } {
  if (images.length === 0) return { body }
  const fd = new FormData()
  fd.append('body', body)
  for (const f of images) fd.append('images', f, f.name)
  return fd
}

export const feedApi = {
  list: async (cursor?: string | null, limit = 10): Promise<FeedListDto> =>
    (await apiClient.get<FeedListDto>(BASE, { params: { cursor: cursor || undefined, limit } })).data,
  get: async (id: string): Promise<FeedPostDto> => (await apiClient.get<FeedPostDto>(`${BASE}/${id}`)).data,
  create: async (body: string, images: readonly File[]): Promise<FeedPostDto> =>
    // зураг боловсруулалт удаан байж болно (≤6 × 15 MB) — анхдагч timeout-ыг уртасгана
    (await apiClient.post<FeedPostDto>(BASE, postPayload(body, images), { timeout: 120_000 })).data,
  update: async (id: string, body: string): Promise<FeedPostDto> =>
    (await apiClient.patch<FeedPostDto>(`${BASE}/${id}`, { body })).data,
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/${id}`)
  },
  like: async (id: string, on: boolean): Promise<FeedLikeDto> =>
    on
      ? (await apiClient.post<FeedLikeDto>(`${BASE}/${id}/like`)).data
      : (await apiClient.delete<FeedLikeDto>(`${BASE}/${id}/like`)).data,
  comments: async (postId: string, cursor?: string | null): Promise<FeedCommentListDto> =>
    (await apiClient.get<FeedCommentListDto>(`${BASE}/${postId}/comments`, { params: { cursor: cursor || undefined } })).data,
  addComment: async (postId: string, body: string): Promise<FeedCommentDto> =>
    (await apiClient.post<FeedCommentDto>(`${BASE}/${postId}/comments`, { body })).data,
  updateComment: async (id: string, body: string): Promise<FeedCommentDto> =>
    (await apiClient.patch<FeedCommentDto>(`${BASE}/comments/${id}`, { body })).data,
  removeComment: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/comments/${id}`)
  },
  revisions: async (kind: 'post' | 'comment', id: string): Promise<FeedRevisionListDto> =>
    (await apiClient.get<FeedRevisionListDto>(kind === 'post' ? `${BASE}/${id}/revisions` : `${BASE}/comments/${id}/revisions`)).data,
  report: async (dto: CreateReportDto): Promise<FeedReportResultDto> =>
    (await apiClient.post<FeedReportResultDto>(`${BASE}/reports`, dto)).data,
  reports: async (status: FeedReportStatus = 'OPEN'): Promise<FeedReportItemDto[]> =>
    (await apiClient.get<FeedReportItemDto[]>(`${BASE}/reports`, { params: { status } })).data,
  resolveReport: async (id: string, action: 'DISMISS' | 'REMOVE'): Promise<{ resolved: number }> =>
    (await apiClient.patch<{ resolved: number }>(`${BASE}/reports/${id}`, { action })).data,
}
