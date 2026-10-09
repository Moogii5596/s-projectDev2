import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampMaintenancePriority, CampMaintenanceStatus, CampPartSource } from '@prisma/client';
import { trim, trimOrNull } from '../common/camp-dto.util';

export class CreateMaintenanceDto {
  /** Өрөө ба/эсвэл хөрөнгө (хоёулаа байхгүй бол 400). Зөвхөн хөрөнгө өгвөл түүний одоогийн өрөө авна */
  @IsOptional() @IsUUID('all', { message: 'roomId UUID байх ёстой' })
  roomId?: string;

  @IsOptional() @IsUUID('all', { message: 'assetId UUID байх ёстой' })
  assetId?: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'title шаардлагатай' }) @MaxLength(200)
  title!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsEnum(CampMaintenancePriority)
  priority?: CampMaintenancePriority;

  /** true = өрөөг засварт (MAINTENANCE) оруулж, засвар дуусахад/цуцлахад буцаана */
  @IsOptional() @IsBoolean()
  blocksRoom?: boolean;
}

export class UpdateMaintenanceDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  title?: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsEnum(CampMaintenancePriority)
  priority?: CampMaintenancePriority;
}

export class CancelMaintenanceDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'reason шаардлагатай' }) @MaxLength(500)
  reason!: string;
}

export class QueryMaintenanceDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsEnum(CampMaintenanceStatus) status?: CampMaintenanceStatus;
  @IsOptional() @IsEnum(CampMaintenancePriority) priority?: CampMaintenancePriority;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}

export class CreatePartDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'partName шаардлагатай' }) @MaxLength(200)
  partName!: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }, { message: 'quantity тоо (≤3 орон)' }) @Min(0.001)
  quantity!: number;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20)
  unit?: string;

  /** CATERING_PURCHASED үед заавал (зардалд орно) */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }, { message: 'unitPrice тоо (≤2 орон)' }) @Min(0)
  unitPrice?: number | null;

  @IsOptional() @IsBoolean()
  vatIncluded?: boolean;

  @IsEnum(CampPartSource, { message: 'source: MINE_SUPPLIED | CATERING_PURCHASED' })
  source!: CampPartSource;
}

export class UpdatePartDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  partName?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001)
  quantity?: number;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20)
  unit?: string;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  unitPrice?: number | null;

  @IsOptional() @IsBoolean()
  vatIncluded?: boolean;

  @IsOptional() @IsEnum(CampPartSource)
  source?: CampPartSource;
}
