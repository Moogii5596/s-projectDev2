import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { CampOrgType } from '@prisma/client';
import { toBool, trim, trimOrNull } from '../../camp/common/camp-dto.util';

// ── Байгууллага ──────────────────────────────────────────────
export class CreateOrganizationDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(30)
  regNumber?: string | null;

  @IsEnum(CampOrgType, { message: 'orgType: MAIN | SUBCONTRACTOR | CONTRACTOR' })
  orgType!: CampOrgType;

  /** Үйлчилгээний төрөл нь tenant-ийн үйлчилгээний каталогийн код байна. */
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) @Matches(/^[A-Z][A-Z0-9_]{0,39}$/, { each: true })
  serviceTypes?: string[];

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

  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true }) @Matches(/^[A-Z][A-Z0-9_]{0,39}$/, { each: true })
  serviceTypes?: string[];

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
  /** Тухайн үйлчилгээг үзүүлдэг байгууллагуудын каталогийн код */
  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,39}$/) serviceType?: string;
  @IsOptional() @IsEnum(CampOrgType) orgType?: CampOrgType;
}
