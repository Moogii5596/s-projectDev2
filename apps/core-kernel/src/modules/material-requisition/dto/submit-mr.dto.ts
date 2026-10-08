import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitMrDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
