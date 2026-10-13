import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { CampOrgServiceType, CampOrgType } from '@prisma/client';
import { toBool, trim, trimOrNull } from '../../camp/common/camp-dto.util';

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
