import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateMrItemDto {
  @IsString()
  @IsNotEmpty({ message: 'description шаардлагатай' })
  description!: string;

  @IsNumber({}, { message: 'quantity тоо байх ёстой' })
  @Min(0.0001, { message: 'quantity 0-ээс их байх ёстой' })
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber({}, { message: 'unitPrice тоо байх ёстой' })
  @Min(0)
  @Type(() => Number)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
