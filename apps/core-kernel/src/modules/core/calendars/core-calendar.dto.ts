import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHolidayCalendarDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,39}$/)
  code!: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;
}

export class UpdateHolidayCalendarDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateCalendarHolidayDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  name!: string;

  @IsIn(['ONCE', 'ANNUAL'])
  recurrence!: 'ONCE' | 'ANNUAL';

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  holidayDate?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31)
  day?: number;
}
