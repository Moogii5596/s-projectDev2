import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CoreFeedbackKind, CoreFeedbackStatus } from '@prisma/client';
import { toBool, trim, trimOrNull } from '../../camp/common/camp-dto.util';
import type { MediaImageDto } from '../../../storage/media.service';

// ── Санал хүсэлт (v0.2.3 Блок F) ─────────────────────────────
export class CreateFeedbackDto {
  @IsEnum(CoreFeedbackKind, { message: 'kind: BUG | IDEA | REQUEST' })
  kind!: CoreFeedbackKind;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'title шаардлагатай' }) @MaxLength(200)
  title!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  body?: string;

  /** Илгээсэн хуудас (frontend автоматаар) */
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(300)
  pagePath?: string | null;
}

export class UpdateFeedbackDto {
  @IsOptional() @IsEnum(CoreFeedbackKind, { message: 'kind: BUG | IDEA | REQUEST' })
  kind?: CoreFeedbackKind;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty({ message: 'title шаардлагатай' }) @MaxLength(200)
  title?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  body?: string;
}

/** Админ: төлөв, хариу, хэрэгжсэн хувилбар */
export class SetFeedbackStatusDto {
  @IsEnum(CoreFeedbackStatus, { message: 'status: NEW | ACCEPTED | PLANNED | DONE | REJECTED' })
  status!: CoreFeedbackStatus;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(5000)
  adminReply?: string | null;

  /** DONE үед заавал: 'v0.2.3' (эсвэл '0.2.3') */
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(20)
  doneVersion?: string | null;
}

export class QueryFeedbackDto {
  @IsOptional() @IsEnum(CoreFeedbackStatus)
  status?: CoreFeedbackStatus;

  @IsOptional() @IsEnum(CoreFeedbackKind)
  kind?: CoreFeedbackKind;

  /** true → зөвхөн миний илгээсэн */
  @IsOptional() @Transform(toBool)
  mine?: boolean;

  /** Гарчиг / тайлбараар хайх */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsIn(['new', 'votes'])
  sort?: 'new' | 'votes';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;
}

// ── Хариу (frontend `api/feedback.ts`-тэй ТАМ АДИЛ — RULE-20) ──
export interface FeedbackItemDto {
  id: string;
  kind: CoreFeedbackKind;
  title: string;
  body: string;
  pagePath: string | null;
  appVersion: string | null;
  status: CoreFeedbackStatus;
  adminReply: string | null;
  repliedAt: string | null;
  doneVersion: string | null;
  voteCount: number;
  votedByMe: boolean;
  isMine: boolean;
  canEdit: boolean;
  authorName: string;
  /** v0.2.3 Блок 5 (5.7) — дэлгэцийн зураг (≤3) */
  attachments: MediaImageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackListDto {
  data: FeedbackItemDto[];
  total: number;
  /** Одоогийн хэрэглэгч OWNER / ADMIN эсэх (төлөв, хариу өөрчлөх) */
  canManage: boolean;
}
