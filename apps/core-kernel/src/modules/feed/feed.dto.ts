import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FeedReportReason, FeedReportStatus } from '@prisma/client';
import { trim, trimOrNull } from '../camp/common/camp-dto.util';
import type { MediaImageDto } from '../../storage/media.service';
import { COMMENT_BODY_MAX, COMMENT_PAGE_MAX, FEED_PAGE_MAX, POST_BODY_MAX } from './feed-rules';

// ── Request ───────────────────────────────────────────────────
export class UpdatePostDto {
  @Transform(trim) @IsString() @MaxLength(POST_BODY_MAX)
  body!: string;
}

export class FeedListQueryDto {
  @IsOptional() @IsString() @MaxLength(200)
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(FEED_PAGE_MAX)
  limit?: number;
}

export class CommentListQueryDto {
  @IsOptional() @IsString() @MaxLength(200)
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(COMMENT_PAGE_MAX)
  limit?: number;
}

export class CommentBodyDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'body шаардлагатай' }) @MaxLength(COMMENT_BODY_MAX)
  body!: string;
}

export class CreateReportDto {
  @ValidateIf((o: CreateReportDto) => !o.commentId) @IsUUID()
  postId?: string;

  @ValidateIf((o: CreateReportDto) => !o.postId) @IsUUID()
  commentId?: string;

  @IsEnum(FeedReportReason, { message: 'reason: SPAM | OFFENSIVE | PRIVACY | OTHER' })
  reason!: FeedReportReason;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  note?: string | null;
}

export class ReportListQueryDto {
  @IsOptional() @IsEnum(FeedReportStatus)
  status?: FeedReportStatus;
}

export class ResolveReportDto {
  /** DISMISS — агуулга хэвээр (нуулт арилна); REMOVE — агуулгыг устгана */
  @IsIn(['DISMISS', 'REMOVE'], { message: 'action: DISMISS | REMOVE' })
  action!: 'DISMISS' | 'REMOVE';
}

export class MediaQueryDto {
  @IsOptional() @IsString() @MaxLength(64) t?: string;
  @IsOptional() @IsString() @MaxLength(20) e?: string;
  @IsOptional() @IsString() @MaxLength(64) s?: string;
  @IsOptional() @IsString() @MaxLength(64) v?: string;
}

// ── Response (frontend-тэй ТАМ АДИЛ нэр, R20) ─────────────────
export interface FeedAuthorDto {
  id: string;
  name: string;
}

/** Зураг — storage/media.service `MediaImageDto` (санал хүсэлттэй нийтлэг) */
export type FeedImageDto = MediaImageDto;

export interface FeedPostDto {
  id: string;
  author: FeedAuthorDto;
  body: string;
  images: FeedImageDto[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  reportedByMe: boolean;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  editedAt: string | null;
  /** report-оор нуугдсан (зөвхөн зохиогч / модератор харна) */
  hidden: boolean;
  createdAt: string;
}

export interface FeedListDto {
  data: FeedPostDto[];
  nextCursor: string | null;
  canModerate: boolean;
}

export interface FeedCommentDto {
  id: string;
  postId: string;
  author: FeedAuthorDto;
  body: string;
  reportedByMe: boolean;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  editedAt: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface FeedCommentListDto {
  data: FeedCommentDto[];
  nextCursor: string | null;
}

export interface FeedLikeDto {
  liked: boolean;
  likeCount: number;
}

export interface FeedRevisionDto {
  body: string;
  /** энэ хувилбар хүчинтэй байсан хугацааны төгсгөл (солигдсон мөч) */
  replacedAt: string;
}

export interface FeedRevisionListDto {
  current: string;
  editedAt: string | null;
  /** шинээс хуучин руу */
  revisions: FeedRevisionDto[];
}

export interface FeedReportItemDto {
  id: string;
  targetType: 'POST' | 'COMMENT';
  postId: string;
  commentId: string | null;
  /** агуулгын эхний 200 тэмдэгт */
  excerpt: string;
  contentAuthor: FeedAuthorDto;
  contentHidden: boolean;
  contentDeleted: boolean;
  reporter: FeedAuthorDto;
  reason: FeedReportReason;
  note: string | null;
  status: FeedReportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface FeedReportResultDto {
  /** нийт OPEN report (энэ агуулга) */
  reportCount: number;
  hidden: boolean;
}
