import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampEmployeeStatus, CampOrgServiceType, CampOrgType, CampRoomStatus, CampShiftType } from '@prisma/client';
import { ISO_DATE, toBool, trim, trimOrNull } from '../common/camp-dto.util';

const CODE = /^[A-Za-z0-9._-]+$/;
const CODE_MSG = 'code зөвхөн латин үсэг, тоо, . _ - агуулна';

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

export class QueryActiveOnlyDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  activeOnly?: boolean;
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

  /** FB-07: байр үүсгэхдээ өрөөнүүдийг нэг transaction-д (заавал биш) */
  @IsOptional() @ValidateNested() @Type(() => BulkRoomsDto)
  rooms?: BulkRoomsDto;
}

export class UpdateBuildingDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

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

// ── Байгууллага ──────────────────────────────────────────────
export class CreateOrganizationDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(30)
  regNumber?: string | null;

  @IsEnum(CampOrgType, { message: 'orgType: MAIN | SUBCONTRACTOR | CONTRACTOR' })
  orgType!: CampOrgType;

  /** Үйлчилгээний төрөл (олон): CATERING, WASTE_TRANSPORT, SEWAGE_TRANSPORT, WASTE_DISPOSAL, SEWAGE_DISPOSAL, OTHER */
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(6) @IsEnum(CampOrgServiceType, { each: true, message: 'serviceTypes буруу утга' })
  serviceTypes?: CampOrgServiceType[];

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(200)
  contactName?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_o, v) => v !== null) @IsEmail({}, { message: 'email буруу' }) @MaxLength(200)
  email?: string | null;
}

export class UpdateOrganizationDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(30)
  regNumber?: string | null;

  @IsOptional() @IsEnum(CampOrgType)
  orgType?: CampOrgType;

  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(6) @IsEnum(CampOrgServiceType, { each: true, message: 'serviceTypes буруу утга' })
  serviceTypes?: CampOrgServiceType[];

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(200)
  contactName?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @Transform(trimOrNull) @ValidateIf((_o, v) => v !== null) @IsEmail({}, { message: 'email буруу' }) @MaxLength(200)
  email?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QueryOrganizationsDto {
  @IsOptional() @Transform(toBool) @IsBoolean() activeOnly?: boolean;
  /** Тухайн үйлчилгээг үзүүлдэг байгууллагууд (жнь SEWAGE_DISPOSAL) */
  @IsOptional() @IsEnum(CampOrgServiceType) serviceType?: CampOrgServiceType;
  @IsOptional() @IsEnum(CampOrgType) orgType?: CampOrgType;
}

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

  @IsUUID('all', { message: 'mealLocationId UUID байх ёстой' })
  mealLocationId!: string;

  /** Үүсгэхдээ ээлжийн загвар өгч болно (заавал биш) */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => ShiftSegmentDto)
  shiftPattern?: ShiftSegmentDto[];
}

export class UpdateDepartmentDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

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

  @IsOptional() @IsEnum(CampEmployeeStatus)
  status?: CampEmployeeStatus;
}

export class QueryEmployeesDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() departmentId?: string;
  /** UUID эсвэл 'none' (ростергүй, v0.2.0) */
  @IsOptional() @Matches(/^(none|[0-9a-fA-F-]{36})$/, { message: 'crewId UUID эсвэл none' }) crewId?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsEnum(CampEmployeeStatus) status?: CampEmployeeStatus;
  /** Код эсвэл нэрээр хайх (хэсэгчилсэн, том жижиг үсэг үл хамаарна) */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}
