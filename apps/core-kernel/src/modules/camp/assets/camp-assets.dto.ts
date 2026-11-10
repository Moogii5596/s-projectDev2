import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampAssetCondition } from '@prisma/client';
import { ISO_DATE, toBool, trim, trimOrNull } from '../common/camp-dto.util';
import { CatalogNameI18nDto } from '../common/common.dto';

export class CreateAssetCategoryDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(100)
  name!: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CatalogNameI18nDto)
  nameI18n?: CatalogNameI18nDto;
}

export class UpdateAssetCategoryDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CatalogNameI18nDto)
  nameI18n?: CatalogNameI18nDto;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QueryCategoriesDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  activeOnly?: boolean;
}

export class CreateAssetDto {
  @IsUUID('all', { message: 'categoryId UUID байх ёстой' })
  categoryId!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'inventoryNo шаардлагатай' }) @MaxLength(50)
  inventoryNo!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  serialNo?: string | null;

  /** null / байхгүй = агуулахад */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'roomId UUID байх ёстой' })
  roomId?: string | null;

  /** v0.2.1 (C-12): өрөөгүй, байранд (коридор, гал тогоо г.м.). roomId-тай хамт өгч болохгүй */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'buildingId UUID байх ёстой' })
  buildingId?: string | null;

  @IsOptional() @IsEnum(CampAssetCondition)
  condition?: CampAssetCondition;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(ISO_DATE, { message: 'acquiredDate YYYY-MM-DD' })
  acquiredDate?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  acquiredCost?: number | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(1000)
  note?: string | null;
}

/** Байршил → move, актлах → write-off (энд биш) */
export class UpdateAssetDto {
  @IsOptional() @IsUUID('all', { message: 'categoryId UUID байх ёстой' })
  categoryId?: string;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50)
  inventoryNo?: string;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  serialNo?: string | null;

  /** GOOD / DAMAGED (WRITTEN_OFF → write-off endpoint) */
  @IsOptional() @IsEnum(CampAssetCondition)
  condition?: CampAssetCondition;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @Matches(ISO_DATE, { message: 'acquiredDate YYYY-MM-DD' })
  acquiredDate?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  acquiredCost?: number | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(1000)
  note?: string | null;
}

export class MoveAssetDto {
  /** null = агуулах руу */
  @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'toRoomId UUID эсвэл null' })
  toRoomId!: string | null;

  /** v0.2.1 (C-12): байр руу (өрөөгүй). toRoomId = null үед л */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'toBuildingId UUID эсвэл null' })
  toBuildingId?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  reason?: string | null;
}

export class WriteOffAssetDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'reason шаардлагатай' }) @MaxLength(500)
  reason!: string;
}

export class QueryAssetsDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  /** өрөөний UUID эсвэл 'warehouse' (агуулах) */
  @IsOptional() @IsString() @Matches(/^(warehouse|[0-9a-fA-F-]{36})$/, { message: "roomId UUID эсвэл 'warehouse'" }) roomId?: string;
  /** v0.2.1: байрны бүх хөрөнгө (байранд шууд + тухайн байрны өрөөнүүдэд) */
  @IsOptional() @IsUUID('all', { message: 'buildingId UUID байх ёстой' }) buildingId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(CampAssetCondition) condition?: CampAssetCondition;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}
