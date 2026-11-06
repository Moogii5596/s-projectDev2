import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { trim } from '../common/camp-dto.util';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class MealOrderLineDto {
  @IsIn(MEAL_TYPES) mealType!: (typeof MEAL_TYPES)[number];
  @IsUUID('all') mealLocationId!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) baseCount!: number;
}

/** PUT — мөрүүдийг бүхэлд нь солино */
export class UpsertMealOrderDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500)
  note?: string | null;

  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MealOrderLineDto)
  lines!: MealOrderLineDto[];
}

export class AddMealExtraDto {
  @IsIn(MEAL_TYPES) mealType!: (typeof MEAL_TYPES)[number];
  @IsUUID('all') mealLocationId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) guestCount!: number;
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'note шаардлагатай' }) @MaxLength(300) note!: string;
}

export class MealReasonDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'reason шаардлагатай' }) @MaxLength(500) reason!: string;
}

export class RequestMealChangeDto extends MealReasonDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MealOrderLineDto)
  lines!: MealOrderLineDto[];
}

export class QueryMealOrdersDto {
  @Matches(ISO_DATE) from!: string;
  @Matches(ISO_DATE) to!: string;
}

export class PutMealTemplateDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MealOrderLineDto)
  lines!: MealOrderLineDto[];
}
