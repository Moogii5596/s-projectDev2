import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { toBool, trim } from '../../camp/common/camp-dto.util';

/** Кемпийн кодын дүрэмтэй ижил (CODE, camp/common) + 40 тэмдэгт — DB check `core_sites_code_check` */
export const SITE_CODE = /^[A-Za-z0-9._-]{1,40}$/;

export const SITE_TYPES = ['CAMP', 'OFFICE', 'MINE', 'OTHER'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export class CreateSiteDto {
  @IsIn(SITE_TYPES)
  type!: SiteType;

  @Transform(trim) @IsString() @Matches(SITE_CODE)
  code!: string;

  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name!: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsIn(SITE_TYPES)
  type?: SiteType;

  @IsOptional() @Transform(trim) @IsString() @Matches(SITE_CODE)
  code?: string;

  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QuerySitesDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  activeOnly?: boolean;
}
