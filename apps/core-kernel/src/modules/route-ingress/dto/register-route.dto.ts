import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class RegisterRouteDto {
  @IsString()
  moduleId!: string;

  @IsString()
  version!: string;

  @IsString()
  basePath!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort!: number;

  @IsOptional()
  @IsString()
  targetHost?: string;
}
