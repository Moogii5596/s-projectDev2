import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

const LANGUAGES = ['mn', 'en', 'zh'] as const;

export class UpdateTenantProfileDto {
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  logoPath?: string | null;

  @IsOptional() @IsString() @MaxLength(100)
  timeZone?: string;

  @IsOptional() @IsIn(LANGUAGES)
  defaultLanguage?: (typeof LANGUAGES)[number];

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ArrayUnique() @IsIn(LANGUAGES, { each: true })
  activeLanguages?: (typeof LANGUAGES)[number][];

  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/)
  baseCurrency?: string;

  @IsOptional() @IsIn(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'])
  dateFormat?: string;
}

export class UpdateTenantSecurityPolicyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(6) @Max(72)
  passwordMinLength?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(20)
  loginFailureLimit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440)
  loginLockoutMinutes?: number;

  /** 0 = хугацаагүй; бусад утга нь дээд session нас, минутаар */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(43200)
  sessionDurationMinutes?: number;
}
