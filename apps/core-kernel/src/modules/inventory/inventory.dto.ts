import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateInventoryItemDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'sku шаардлагатай' }) @MaxLength(100)
  sku!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(20)
  unit?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  quantity?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  minThreshold?: number;
}

export class AdjustInventoryDto {
  /** + орлого, − зарлага. Үлдэгдэл сөрөг болохгүй (DB CHECK + атомик UPDATE) */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }, { message: 'delta тоо байх ёстой' })
  delta!: number;
}

export class QueryInventoryDto {
  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  lowStock?: boolean;
}
