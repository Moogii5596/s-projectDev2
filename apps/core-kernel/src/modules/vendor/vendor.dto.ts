import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { queryBool } from '../../common/utils/query-bool';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateVendorDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(200)
  name!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  regNumber?: string;
}

export class UpdateVendorDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  regNumber?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QueryVendorDto {
  @IsOptional() @Transform(queryBool) @IsBoolean()
  activeOnly?: boolean;
}
