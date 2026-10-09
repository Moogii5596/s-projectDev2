import { ArrayMaxSize, ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
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
