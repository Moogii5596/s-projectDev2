import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampRoomStatus } from '@prisma/client';
import { trim, trimOrNull } from '../common/camp-dto.util';
import { CODE, CODE_MSG } from '../common/common.dto';

// ── Кемп ─────────────────────────────────────────────────────
export class CreateCampDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'code шаардлагатай' }) @MaxLength(30) @Matches(CODE, { message: CODE_MSG })
  code!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(300)
  location?: string | null;
}

/** code өөрчлөгдөхгүй (лавлагааны тогтвортой түлхүүр) */
export class UpdateCampDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(300)
  location?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// ── Байр, өрөө ───────────────────────────────────────────────
/** FB-07 (v0.2.0) — олон өрөө нэг дор: дугаар = угтвар + (эхлэх…дуусах, padTo оронтой тэгээр дүүргэсэн) */
export class BulkRoomsDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(99999)
  from!: number;

  @Type(() => Number) @IsInt() @Min(0) @Max(99999)
  to!: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) @Matches(/^[^\s]*$/, { message: 'prefix зайгүй байна' })
  prefix?: string;

  /** 0 = дүүргэхгүй (1, 2 … 10); 2 → 01, 02 … 10 */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6)
  padTo?: number;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(-5) @Max(100)
  floor?: number | null;

  @Type(() => Number) @IsInt() @Min(1) @Max(50)
  capacity!: number;

  /** true (анхдагч) = байгаа дугаарыг алгасна; false = байвал бүгдийг зогсооно (409) */
  @IsOptional() @IsBoolean()
  skipExisting?: boolean;
}

export class CreateBuildingDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'code шаардлагатай' }) @MaxLength(30) @Matches(CODE, { message: CODE_MSG })
  code!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  /** v0.2.1 (C-12): байрны төрөл (каталог) */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'typeId UUID байх ёстой' })
  typeId?: string | null;

  /** FB-07: байр үүсгэхдээ өрөөнүүдийг нэг transaction-д (заавал биш) */
  @IsOptional() @ValidateNested() @Type(() => BulkRoomsDto)
  rooms?: BulkRoomsDto;
}

export class UpdateBuildingDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  /** v0.2.1 (C-12): null = төрөлгүй */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'typeId UUID байх ёстой' })
  typeId?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateRoomDto {
  @IsUUID('all', { message: 'buildingId UUID байх ёстой' })
  buildingId!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'roomNo шаардлагатай' }) @MaxLength(30)
  roomNo!: string;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(-5) @Max(100)
  floor?: number | null;

  @Type(() => Number) @IsInt({ message: 'capacity бүхэл тоо' }) @Min(1, { message: 'capacity ≥ 1' }) @Max(50)
  capacity!: number;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  note?: string | null;
}

export class UpdateRoomDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(30)
  roomNo?: string;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(-5) @Max(100)
  floor?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  capacity?: number;

  @IsOptional() @IsEnum(CampRoomStatus)
  status?: CampRoomStatus;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  note?: string | null;
}

export class QueryRoomsDto {
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsEnum(CampRoomStatus) status?: CampRoomStatus;
}
