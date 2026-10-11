import { ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBool, trim } from '../common/camp-dto.util';
import { ShiftSegmentDto } from '../master/camp-master.dto';

/** v0.2.1 (C-01, Q2) — албан тушаал / (C-12, Q4) — байрны төрөл: байгууллагын каталог (нэр л) */
export class CreateCatalogItemDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(100)
  name!: string;
}

export class UpdateCatalogItemDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QueryCatalogDto {
  @IsOptional() @Transform(toBool) @IsBoolean() activeOnly?: boolean;
}

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
