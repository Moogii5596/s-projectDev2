import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMrItemDto } from './create-mr-item.dto';

export class CreateMrDto {
  @IsString()
  @IsNotEmpty({ message: 'title шаардлагатай' })
  title!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsDateString({}, { message: 'requiredDate ISO огноо байх ёстой (YYYY-MM-DD)' })
  requiredDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray({ message: 'items массив байх ёстой' })
  @ArrayMinSize(1, { message: 'Хамгийн багадаа 1 бараа мөр байх ёстой' })
  @ValidateNested({ each: true })
  @Type(() => CreateMrItemDto)
  items!: CreateMrItemDto[];
}
