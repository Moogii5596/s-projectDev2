import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ShiftSegmentDto } from '../../hr/org/hr-org.dto';

/**
 * Кемп × албан тушаалын анхдагч (Q1, Д-1, Д-2). Талбар бүр: null = анхдагч руу буцаах (кемпийн байршил / тийм / хэлтсийн загвар).
 * Өгөөгүй талбар өөрчлөгдөхгүй.
 */
export class UpsertPositionSettingDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('all', { message: 'mealLocationId UUID байх ёстой' })
  mealLocationId?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean()
  mealsIncluded?: boolean | null;

  /** [] = загваргүй (хэлтсийнх хэрэглэгдэнэ) */
  @IsOptional() @IsArray() @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => ShiftSegmentDto)
  shiftPattern?: ShiftSegmentDto[];
}

export class PositionIdParam {
  @IsUUID() positionId!: string;
}
