import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveMrDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
