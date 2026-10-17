import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampEmployeeStatus, CampTerminationReason } from '@prisma/client';
import { toBool, trim, trimOrNull } from '../../camp/common/camp-dto.util';

// ── Ажилтан ──────────────────────────────────────────────────
export class CreateEmployeeDto {
  @IsUUID('all', { message: 'organizationId UUID байх ёстой' })
  organizationId!: string;

  @IsUUID('all', { message: 'departmentId UUID байх ёстой' })
  departmentId!: string;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'crewId UUID байх ёстой' })
  crewId?: string | null;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'employeeCode шаардлагатай' }) @MaxLength(50)
  employeeCode!: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'fullName шаардлагатай' }) @MaxLength(200)
  fullName!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  position?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50)
  phone?: string | null;

  /** v0.2.0 — ADR-003-ын бэлтгэл (заавал биш) */
  @IsOptional() @Transform(trimOrNull) @IsEmail({}, { message: 'email буруу байна' }) @MaxLength(254)
  email?: string | null;

  /** v0.2.1 (C-01): каталогийн албан тушаал. null = хасах. Өгвөл `position` текстийг үл тоомсорлоно */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'positionId UUID байх ёстой' })
  positionId?: string | null;

  /** v0.2.1 (Q1): ажлын хоолны байршил — ЭЦСИЙН. null = албан тушаалын анхдагч / кемпийн анхдагч */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'mealLocationId UUID байх ёстой' })
  mealLocationId?: string | null;

  /** v0.2.1 (Q3): хоол авах — ЭЦСИЙН. null = албан тушаалын анхдагч (эсвэл тийм) */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsBoolean()
  mealsIncluded?: boolean | null;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsUUID('all', { message: 'organizationId UUID байх ёстой' })
  organizationId?: string;

  @IsOptional() @IsUUID('all', { message: 'departmentId UUID байх ёстой' })
  departmentId?: string;

  /** null = багаас хасах (ростергүй) */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'crewId UUID байх ёстой' })
  crewId?: string | null;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50)
  employeeCode?: string;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  fullName?: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  position?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsEmail({}, { message: 'email буруу байна' }) @MaxLength(254)
  email?: string | null;

  /** TERMINATED-ийг зөвхөн «Ажлаас гаргах» урсгалаар (v0.2.2 Блок 5) */
  @IsOptional() @IsIn([CampEmployeeStatus.ACTIVE, CampEmployeeStatus.INACTIVE], { message: 'status: ACTIVE эсвэл INACTIVE' })
  status?: CampEmployeeStatus;

  /** v0.2.1 (C-01): каталогийн албан тушаал. null = хасах. Өгвөл `position` текстийг үл тоомсорлоно */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'positionId UUID байх ёстой' })
  positionId?: string | null;

  /** v0.2.1 (Q1): ажлын хоолны байршил — ЭЦСИЙН. null = албан тушаалын анхдагч / кемпийн анхдагч */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'mealLocationId UUID байх ёстой' })
  mealLocationId?: string | null;

  /** v0.2.1 (Q3): хоол авах — ЭЦСИЙН. null = албан тушаалын анхдагч (эсвэл тийм) */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsBoolean()
  mealsIncluded?: boolean | null;
}

export class QueryEmployeesDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() departmentId?: string;
  /** UUID эсвэл 'none' (ростергүй, v0.2.0) */
  @IsOptional() @Matches(/^(none|[0-9a-fA-F-]{36})$/, { message: 'crewId UUID эсвэл none' }) crewId?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsEnum(CampEmployeeStatus) status?: CampEmployeeStatus;
  /** v0.2.1: UUID эсвэл 'none' (албан тушаалгүй) */
  @IsOptional() @Matches(/^(none|[0-9a-fA-F-]{36})$/, { message: 'positionId UUID эсвэл none' }) positionId?: string;
  /** v0.2.1: хоол авах эсэх (эффектив биш — ажилтан дээр тохируулсан утга) */
  @IsOptional() @Transform(toBool) @IsBoolean() mealsIncluded?: boolean;
  /** Код эсвэл нэрээр хайх (хэсэгчилсэн, том жижиг үсэг үл хамаарна) */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}

/** v0.2.1 (Д-2) — олон ажилтанд нэг дор: хоол авах / ажлын хоолны байршил / албан тушаал */
export class BulkEmployeesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true })
  ids!: string[];

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsBoolean()
  mealsIncluded?: boolean | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all')
  mealLocationId?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all')
  positionId?: string | null;
}

// ── v0.2.2 Блок 5: ажлаас гаргах, дахин ажилд авах (Q8, Q-C, D-07) ─────────────
export class TerminateEmployeeDto {
  /** Ажлаас гарсан өдөр (YYYY-MM-DD) — өнөөдөр эсвэл өмнө (B5-Q3) */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD' })
  date!: string;

  @IsEnum(CampTerminationReason)
  reason!: CampTerminationReason;

  /** OTHER бол заавал (B5-Q4) */
  @Transform(trimOrNull) @ValidateIf((o: TerminateEmployeeDto, v) => o.reason === CampTerminationReason.OTHER || (v !== null && v !== undefined))
  @IsString() @IsNotEmpty({ message: 'note шаардлагатай (OTHER)' }) @MaxLength(500)
  note?: string | null;
}

/**
 * Дахин ажилд авах — хуучин (TERMINATED) бүртгэлээс ШИНЭ бүртгэл (Q8). Өгөөгүй талбар хуучнаасаа.
 * `status`-ийг үл тооно (шинэ бүртгэл ACTIVE). `transferUser` (анхдагч true, Q-C (1)): хуучин нэвтрэх эрхийг шилжүүлж идэвхжүүлнэ.
 */
export class RehireEmployeeDto extends UpdateEmployeeDto {
  @IsOptional() @IsBoolean()
  transferUser?: boolean;
}

export class QueryPiiViewsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
