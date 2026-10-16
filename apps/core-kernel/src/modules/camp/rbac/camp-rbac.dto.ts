import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CampTemplateScope } from '@prisma/client';
import { trim, trimOrNull } from '../common/camp-dto.util';

export class CreateCampRoleDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(100)
  name!: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  description?: string | null;

  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true })
  permissionCodes?: string[];
}

export class UpdateCampRoleDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
  description?: string | null;
}

export class SetRolePermissionsDto {
  @IsArray() @ArrayUnique() @ArrayMaxSize(100) @IsString({ each: true })
  permissionCodes!: string[];
}

export class AssignUserRoleDto {
  /** core_users.id (RULE-13) — authId БИШ */
  @IsUUID('all', { message: 'userId UUID байх ёстой' })
  userId!: string;

  @IsUUID('all', { message: 'roleId UUID байх ёстой' })
  roleId!: string;

  /** null / байхгүй = бүх кемп */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'campId UUID байх ёстой' })
  campId?: string | null;
}

export class QueryUserRolesDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsUUID() campId?: string;
}

export class QueryMyPermissionsDto {
  @IsOptional() @IsUUID() campId?: string;
}

// ── v0.2.2 Блок 1 (ADR-003 §2.4) ─────────────────────────────

/** Шууд (DIRECT) эрх олгох */
export class GrantDirectPermissionDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  permissionCode!: string;

  /** null / байхгүй = бүх кемп */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'campId UUID байх ёстой' })
  campId?: string | null;
}

export class PositionTemplateItemDto {
  @IsUUID('all', { message: 'roleId UUID байх ёстой' })
  roleId!: string;

  @IsEnum(CampTemplateScope)
  scope!: CampTemplateScope;
}

/** Албан тушаалын загварын багцыг бүхэлд нь солино */
export class SetPositionTemplatesDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PositionTemplateItemDto)
  templates!: PositionTemplateItemDto[];
}

// ── v0.2.2 Блок 2 (ADR-003 §2.1) ─────────────────────────────

/** Ажилтан ↔ хэрэглэгч; null = салгах */
export class LinkEmployeeUserDto {
  @ValidateIf((_o, v) => v !== null) @IsUUID('all', { message: 'userId UUID байх ёстой' })
  userId!: string | null;
}

export class PositionPreviewQueryDto {
  /** 'none' = албан тушаалгүй */
  @ValidateIf((_o, v) => v !== 'none') @IsUUID('all', { message: 'positionId UUID эсвэл none' })
  positionId!: string;
}

// ── v0.2.2 Блок 3 (ADR-003 §2.3) ─────────────────────────────

/** Ажилтны картаас хэрэглэгч үүсгэх. email: байхгүй → картынх; null → имэйлгүй (дотоод хаяг) */
export class CreateEmployeeUserDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEmail({}, { message: 'Зөв имэйл оруулна уу' })
  email?: string | null;
}

export class CampInviteDto {
  @IsIn(['LINK', 'EMAIL'])
  channel!: 'LINK' | 'EMAIL';
}

/** v0.2.2 Блок 4 (B4-Q2): PATCH /camp/users/:userId { isActive } */
export class SetUserActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
