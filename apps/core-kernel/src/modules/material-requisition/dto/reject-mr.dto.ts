import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectMrDto {
  @IsNotEmpty({ message: 'Татгалзах шалтгаан заавал оруулна уу' })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
