import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMrItemDto } from './create-mr-item.dto';

export class UpdateMrDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsDateString({}, { message: 'requiredDate ISO огноо байх ёстой (YYYY-MM-DD)' })
  requiredDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray({ message: 'items массив байх ёстой' })
  @ArrayMinSize(1, { message: 'Items өгсөн бол хамгийн багадаа 1 мөр байх ёстой' })
  @ValidateNested({ each: true })
  @Type(() => CreateMrItemDto)
  items?: CreateMrItemDto[];
}
