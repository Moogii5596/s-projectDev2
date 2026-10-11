import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
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
