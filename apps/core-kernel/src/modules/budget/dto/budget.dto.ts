import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { queryBool } from '../../../common/utils/query-bool';

const BUDGET_PERIOD_TYPES = ['ANNUAL', 'QUARTERLY', 'MONTHLY'] as const;
export type BudgetPeriodType = (typeof BUDGET_PERIOD_TYPES)[number];

export class CreateBudgetPeriodDto {
  @IsString()
  @IsNotEmpty({ message: 'name шаардлагатай' })
  @MaxLength(200)
  name!: string;

  @IsIn(BUDGET_PERIOD_TYPES, { message: 'periodType: ANNUAL | QUARTERLY | MONTHLY' })
  periodType!: BudgetPeriodType;

  @IsDateString({}, { message: 'startDate ISO огноо (YYYY-MM-DD)' })
  startDate!: string;

  @IsDateString({}, { message: 'endDate ISO огноо (YYYY-MM-DD)' })
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBudgetAllocationDto {
  @IsUUID('all', { message: 'periodId UUID байх ёстой' })
  periodId!: string;

  @IsString()
  @IsNotEmpty({ message: 'department шаардлагатай' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  department!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'totalAmount тоо (2 орон хүртэлх бутархай)' })
  @Min(0.01, { message: 'totalAmount 0-ээс их байх ёстой' })
  totalAmount!: number;
}

export class UpdateBudgetAllocationDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'totalAmount тоо (2 орон хүртэлх бутархай)' })
  @Min(0.01, { message: 'totalAmount 0-ээс их байх ёстой' })
  totalAmount!: number;
}

export class QueryBudgetAllocationsDto {
  @IsOptional()
  @IsUUID('all', { message: 'periodId UUID байх ёстой' })
  periodId?: string;
}

export class QueryBudgetPeriodsDto {
  @IsOptional()
  @Transform(queryBool)
  @IsBoolean()
  activeOnly?: boolean;
}

export class CheckBudgetDto {
  @IsString()
  @IsNotEmpty({ message: 'department шаардлагатай' })
  department!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}
