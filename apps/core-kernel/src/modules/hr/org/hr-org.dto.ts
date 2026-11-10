import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampShiftType } from '@prisma/client';
import { ISO_DATE, trim, trimOrNull } from '../../camp/common/camp-dto.util';
import { CatalogNameI18nDto, CODE, CODE_MSG } from '../../camp/common/common.dto';

// ── Хэлтэс + ээлжийн загвар ──────────────────────────────────
export class ShiftSegmentDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(28)
  dayFrom!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(28)
  dayTo!: number;

  @IsEnum(CampShiftType, { message: 'shift: DAY | NIGHT' })
  shift!: CampShiftType;
}

export class SetShiftPatternDto {
  /** Хоосон массив = загварыг арилгах (ээлж "тодорхойгүй" болно) */
  @IsArray() @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => ShiftSegmentDto)
  segments!: ShiftSegmentDto[];
}

export class CreateDepartmentDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'code шаардлагатай' }) @MaxLength(30) @Matches(CODE, { message: CODE_MSG })
  code!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CatalogNameI18nDto)
  nameI18n?: CatalogNameI18nDto;

  /** v0.2.1 (Q1): ҮЛ ТООГДОНО — хоолны байршил ажилтан / албан тушаал дээр. Хуучин клиентийн хүсэлт эвдрэхгүйн тулд хүлээн авна */
  @IsOptional() @IsUUID('all', { message: 'mealLocationId UUID байх ёстой' })
  mealLocationId?: string;

  /** Үүсгэхдээ ээлжийн загвар өгч болно (заавал биш) */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => ShiftSegmentDto)
  shiftPattern?: ShiftSegmentDto[];
}

export class UpdateDepartmentDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CatalogNameI18nDto)
  nameI18n?: CatalogNameI18nDto;

  /** v0.2.1 (Q1): ҮЛ ТООГДОНО (хуучин клиент) */
  @IsOptional() @IsUUID('all', { message: 'mealLocationId UUID байх ёстой' })
  mealLocationId?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// ── Баг ──────────────────────────────────────────────────────
export class CreateCrewDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'code шаардлагатай' }) @MaxLength(10) @Matches(CODE, { message: CODE_MSG })
  code!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  name?: string | null;

  /** 'YYYY-MM-DD' — багийн ирэх нэг өдөр; гараг нь кемпийн солигдох гарагтай таарна */
  @IsString() @Matches(ISO_DATE, { message: 'rosterAnchorDate YYYY-MM-DD' })
  rosterAnchorDate!: string;
}

export class UpdateCrewDto {
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  name?: string | null;

  @IsOptional() @IsString() @Matches(ISO_DATE, { message: 'rosterAnchorDate YYYY-MM-DD' })
  rosterAnchorDate?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
