import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CampImportStatus, CampMealType, CampMovementDirection, CampShiftAdjustmentReason, CampShiftType } from '@prisma/client';
import { ISO_DATE, toBool, trimOrNull } from '../common/camp-dto.util';

const DATE_MSG = (f: string) => ({ message: `${f} YYYY-MM-DD` });

export class DateQueryDto {
  @IsString() @Matches(ISO_DATE, DATE_MSG('date'))
  date!: string;
}

export class RangeQueryDto {
  @IsString() @Matches(ISO_DATE, DATE_MSG('from'))
  from!: string;

  @IsString() @Matches(ISO_DATE, DATE_MSG('to'))
  to!: string;

  @IsOptional() @IsUUID() employeeId?: string;

  /** FB-14 (v0.2.0): хэлтэс, ростер, албан тушаал, код/нэрээр шүүх */
  @IsOptional() @IsUUID() departmentId?: string;
  /** UUID эсвэл 'none' (ростергүй) */
  @IsOptional() @Matches(/^(none|[0-9a-fA-F-]{36})$/) crewId?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(100) position?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(100) q?: string;
}

/** FB-14 (v0.2.0) — олон ажилтны ирц нэг дор → ирцийн импортын урсгал (PREVIEW → confirm) */
export class ManualMovementsDto {
  @IsString() @Matches(ISO_DATE, DATE_MSG('date'))
  date!: string;

  @IsEnum(CampMovementDirection, { message: 'direction: ARRIVAL | DEPARTURE' })
  direction!: CampMovementDirection;

  /** Хоосон/алга = ростерын анхдагч; [] = хоол идэхгүй (NONE) */
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(4) @IsEnum(CampMealType, { each: true })
  meals?: CampMealType[] | null;

  @IsOptional() @IsEnum(CampShiftType)
  shift?: CampShiftType;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true, message: 'employeeIds UUID байх ёстой' })
  employeeIds!: string[];
}

export class CalendarQueryDto {
  @IsString() @Matches(ISO_DATE, DATE_MSG('from'))
  from!: string;

  @IsString() @Matches(ISO_DATE, DATE_MSG('to'))
  to!: string;

  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() crewId?: string;
}

/** Гараар нэг ирэлт/явалт (импортын дүрэмтэй ижил — planImport) */
export class CreateMovementDto {
  @IsUUID('all', { message: 'employeeId UUID байх ёстой' })
  employeeId!: string;

  @IsString() @Matches(ISO_DATE, DATE_MSG('date'))
  date!: string;

  @IsEnum(CampMovementDirection, { message: 'direction: ARRIVAL | DEPARTURE' })
  direction!: CampMovementDirection;

  /** Ростерын бол заавал биш (анхдагч); ээлжийн бус бол ЗААВАЛ ([] = хоол идэхгүй) */
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(4) @IsEnum(CampMealType, { each: true })
  meals?: CampMealType[];

  /** Зөвхөн ирэлтэд — ээлжийн зохицуулалт үүсгэнэ */
  @IsOptional() @IsEnum(CampShiftType)
  shift?: CampShiftType;
}

export class CreateShiftAdjustmentsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true, message: 'employeeIds UUID байх ёстой' })
  employeeIds!: string[];

  @IsString() @Matches(ISO_DATE, DATE_MSG('startDate'))
  startDate!: string;

  @IsString() @Matches(ISO_DATE, DATE_MSG('endDate'))
  endDate!: string;

  @IsEnum(CampShiftType, { message: 'shift: DAY | NIGHT' })
  shift!: CampShiftType;

  @IsEnum(CampShiftAdjustmentReason, { message: 'reasonType: EARLY_ARRIVAL | SHIFT_CHANGE | OTHER' })
  reasonType!: CampShiftAdjustmentReason;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  reason?: string | null;
}

export class CreateRoomAllocationDto {
  @IsUUID('all', { message: 'employeeId UUID байх ёстой' })
  employeeId!: string;

  @IsUUID('all', { message: 'roomId UUID байх ёстой' })
  roomId!: string;

  @IsString() @Matches(ISO_DATE, DATE_MSG('startDate'))
  startDate!: string;

  /** true = одоогийн өрөөг startDate-ийн өмнөх өдрөөр дуусгаж шилжүүлнэ */
  @IsOptional() @Transform(toBool) @IsBoolean()
  replaceCurrent?: boolean;
}

export class EndRoomAllocationDto {
  /** Сүүлийн хонох өдөр (хамруулна) */
  @IsString() @Matches(ISO_DATE, DATE_MSG('endDate'))
  endDate!: string;
}

export class QueryAllocationsDto {
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() @Matches(ISO_DATE, DATE_MSG('date')) date?: string;
}

export class QueryImportsDto {
  @IsOptional() @IsEnum(CampImportStatus) status?: CampImportStatus;
}
