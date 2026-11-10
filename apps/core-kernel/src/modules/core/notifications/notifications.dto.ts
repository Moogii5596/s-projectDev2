import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListNotificationsDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean() unreadOnly?: boolean;
  @IsOptional() @IsISO8601() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class NotificationPrefItemDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/) type!: string;
  @IsBoolean() inApp!: boolean;
  @IsBoolean() email!: boolean;
}

export class UpdateNotificationPrefsDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => NotificationPrefItemDto) items!: NotificationPrefItemDto[];
}
