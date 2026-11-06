/** Backend (core-kernel feed) DTO-той ТАМ АДИЛ нэр, хэлбэр (R20). */
export interface FeedImageVariantDto {
  w: number
  h: number
  url: string
}

export interface FeedImageDto {
  id: string
  width: number
  height: number
  /** base64 */
  thumbhash: string
  /** өргөнөөр өсөх дараалалтай */
  variants: FeedImageVariantDto[]
}

export interface FeedAuthorDto {
  id: string
  name: string
}

export interface FeedPostDto {
  id: string
  author: FeedAuthorDto
  body: string
  images: FeedImageDto[]
  likeCount: number
  commentCount: number
  likedByMe: boolean
  reportedByMe: boolean
  isMine: boolean
  canEdit: boolean
  canDelete: boolean
  editedAt: string | null
  hidden: boolean
  createdAt: string
}

export interface FeedCommentDto {
  id: string
  postId: string
  author: FeedAuthorDto
  body: string
  reportedByMe: boolean
  isMine: boolean
  canEdit: boolean
  canDelete: boolean
  editedAt: string | null
  hidden: boolean
  createdAt: string
}

export interface FeedRevisionListDto {
  current: string
  editedAt: string | null
  /** шинээс хуучин рүү */
  revisions: { body: string; replacedAt: string }[]
}

export type FeedReportReason = 'SPAM' | 'OFFENSIVE' | 'PRIVACY' | 'OTHER'

export const FEED_REPORT_REASONS: readonly FeedReportReason[] = ['SPAM', 'OFFENSIVE', 'PRIVACY', 'OTHER']
