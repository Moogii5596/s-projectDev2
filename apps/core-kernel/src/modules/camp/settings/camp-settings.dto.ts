import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { HHMM, toBool, trim } from '../common/camp-dto.util';
import { CatalogNameI18nDto } from '../common/common.dto';

/** PUT — бүх талбар заавал (бүтэн тохиргоо) */
export class UpdateCampSettingsDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(99.99)
  vatRate!: number;

  /** 0 = Ням … 3 = Лхагва … 6 = Бямба (PostgreSQL EXTRACT(DOW)) */
  @Type(() => Number) @IsInt() @Min(0) @Max(6)
  changeoverWeekday!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(28)
  rosterOnDays!: number;

  /** Амралт = замын 2 хоног (ирэх + явах) орно → ≥ 2 (DB CHECK 20261010001) */
  @Type(() => Number) @IsInt() @Min(2, { message: 'rosterOffDays ≥ 2 (ирэх, явах замын хоног амралтад орно)' }) @Max(28)
  rosterOffDays!: number;

  /** 'HH:MM' эсвэл null (хязгааргүй) */
  @ValidateIf((_o, v) => v !== null) @IsString() @Matches(HHMM, { message: 'mealOrderCutoffTime HH:MM байх ёстой' })
  mealOrderCutoffTime!: string | null;

  @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'defaultMealLocationId UUID байх ёстой' })
  defaultMealLocationId!: string | null;

  /** Катерингийн үйлчилгээ үзүүлэгч (CATERING төрөлтэй байгууллага). Өгөөгүй = өөрчлөхгүй, null = арилгах */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'cateringOrganizationId UUID байх ёстой' })
  cateringOrganizationId?: string | null;

  /** v0.2.3 R7: кодгүй ажилтны автомат кодын угтвар (1–3 латин том үсэг). Өгөөгүй = өөрчлөхгүй */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsString()
  @Matches(/^[A-Z]{1,3}$/, { message: 'autoCodePrefix 1–3 латин том үсэг' })
  autoCodePrefix?: string;

  /** v0.2.3 Блок 6а — хоолны захиалгын урсгал (G-8). Өгөөгүй = өөрчлөхгүй */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(30)
  mealOrderLeadDays?: number;

  @IsOptional() @IsIn(['BLOCK', 'APPROVAL', 'FREE'])
  mealOrderAfterCutoff?: 'BLOCK' | 'APPROVAL' | 'FREE';

  @IsOptional() @Transform(toBool) @IsBoolean()
  mealOrderRequiresAccept?: boolean;

  @IsOptional() @IsIn(['FORBID', 'ALLOW', 'TWO_SIDED'])
  mealOrderEditAfterAccept?: 'FORBID' | 'ALLOW' | 'TWO_SIDED';

  @IsOptional() @IsIn(['EMPTY', 'COPY_PREV', 'TEMPLATE'])
  mealOrderDefaultFill?: 'EMPTY' | 'COPY_PREV' | 'TEMPLATE';

  @IsOptional() @Transform(toBool) @IsBoolean()
  mealOrderAllowSelfAccept?: boolean;
}

export class CreateMealLocationDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(100)
  name!: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CatalogNameI18nDto)
  nameI18n?: CatalogNameI18nDto;
}

export class UpdateMealLocationDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CatalogNameI18nDto)
  nameI18n?: CatalogNameI18nDto;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QueryActiveDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  activeOnly?: boolean;
}
