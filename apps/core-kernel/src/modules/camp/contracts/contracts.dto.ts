import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ISO_DATE, toBool, trim, trimOrNull } from '../common/camp-dto.util';
import { CURRENCY, RATE } from '../../core/exchange-rates/exchange-rates.dto';
export { CURRENCY, RATE } from '../../core/exchange-rates/exchange-rates.dto';
import {
  CONTRACT_MEAL_TYPES,
  MANUAL_AMENDMENT_TYPES,
  PAYMENT_TERM_RULES,
  QUANTITY_RULES,
  QUANTITY_SOURCES,
  RATE_POLICIES,
  type ContractMealType,
  type ManualAmendmentType,
  type PaymentTermRule,
  type QuantityRule,
  type QuantitySource,
  type RatePolicy,
} from './contract.types';

/** v0.2.3 Блок 6б — гэрээ, каталог, ханш. Мөнгө/ханш/хуваагч — string (Decimal) */
const CATALOG_CODE = /^[A-Z][A-Z0-9_]{0,39}$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const VAT_RATE = /^\d{1,2}(\.\d{1,2})?$/;
const DIVISOR = /^\d{1,6}(\.\d{1,2})?$/;

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

// ── Каталог ──────────────────────────────────────────────────
class CatalogNamesDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'nameMn шаардлагатай' }) @MaxLength(100) nameMn!: string;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) nameEn?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) nameZh?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}

export class CreateUnitDto extends CatalogNamesDto {
  @Transform(upper) @Matches(CATALOG_CODE, { message: 'code — A-Z, 0-9, _ (≤40)' }) code!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(4) decimals?: number;
}

export class UpdateUnitDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) nameMn?: string;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) nameEn?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) nameZh?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(4) decimals?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateServiceTypeDto extends CatalogNamesDto {
  @Transform(upper) @Matches(CATALOG_CODE, { message: 'code — A-Z, 0-9, _ (≤40)' }) code!: string;
  @IsIn(QUANTITY_SOURCES) quantitySource!: QuantitySource;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all') defaultUnitId?: string | null;
}

export class UpdateServiceTypeDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) nameMn?: string;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) nameEn?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) nameZh?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @IsIn(QUANTITY_SOURCES) quantitySource?: QuantitySource;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all') defaultUnitId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Гэрээ ────────────────────────────────────────────────────
export class PaymentTermDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) percent!: number;
  @IsIn(PAYMENT_TERM_RULES) rule!: PaymentTermRule;
  @Type(() => Number) @IsInt() @Min(0) @Max(3650) n!: number;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(200) note?: string | null;
}

export class CreateContractDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'contractNo шаардлагатай' }) @MaxLength(60) contractNo!: string;
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'title шаардлагатай' }) @MaxLength(200) title!: string;
  @IsUUID('all') organizationId!: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all') customerOrganizationId?: string | null;
  @Matches(ISO_DATE) startDate!: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(ISO_DATE) endDate?: string | null;
  @Transform(upper) @Matches(CURRENCY, { message: 'currency — ISO 4217 (жнь MNT, CNY)' }) currency!: string;
  @Transform(upper) @Matches(CURRENCY, { message: 'paymentCurrency — ISO 4217' }) paymentCurrency!: string;
  @Matches(VAT_RATE, { message: 'vatRate — 0…99.99' }) vatRate!: string;
  @IsIn(RATE_POLICIES) ratePolicy!: RatePolicy;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RATE, { message: 'fixedRate — тоо (≤6 орон)' }) fixedRate?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => PaymentTermDto) paymentTerms?: PaymentTermDto[];
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(2000) note?: string | null;
}

/** DRAFT — бүх талбар; ACTIVE — contractNo / organizationId / currency / startDate / endDate түгжигдэнэ (сунгалт → amendments) */
export class UpdateContractDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(60) contractNo?: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsUUID('all') organizationId?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID('all') customerOrganizationId?: string | null;
  @IsOptional() @Matches(ISO_DATE) startDate?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(ISO_DATE) endDate?: string | null;
  @IsOptional() @Transform(upper) @Matches(CURRENCY) currency?: string;
  @IsOptional() @Transform(upper) @Matches(CURRENCY) paymentCurrency?: string;
  @IsOptional() @Matches(VAT_RATE) vatRate?: string;
  @IsOptional() @IsIn(RATE_POLICIES) ratePolicy?: RatePolicy;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RATE) fixedRate?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => PaymentTermDto) paymentTerms?: PaymentTermDto[];
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(2000) note?: string | null;
  /** ACTIVE гэрээнд нөхцөл өөрчлөхөд — TERMS нэмэлт өөрчлөлтийн баримтын дугаар */
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(60) documentNo?: string | null;
}

export class QueryContractsDto {
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'TERMINATED']) status?: 'DRAFT' | 'ACTIVE' | 'TERMINATED';
  /** Тухайн өдөр хүчинтэй (ACTIVE/TERMINATED, хугацаандаа) */
  @IsOptional() @Matches(ISO_DATE) activeOn?: string;
}

export class TerminateContractDto {
  @Matches(ISO_DATE) terminatedAt!: string;
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'note шаардлагатай' }) @MaxLength(1000) note!: string;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(60) documentNo?: string | null;
}

// ── Гэрээний ажил ────────────────────────────────────────────
export class CreateContractItemDto {
  @IsUUID('all') serviceTypeId!: string;
  @IsOptional() @IsUUID('all') unitId?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(QUANTITY_RULES) quantityRule?: QuantityRule | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DIVISOR, { message: 'quantityDivisor — эерэг тоо' }) quantityDivisor?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(CONTRACT_MEAL_TYPES) mealType?: ContractMealType | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) description?: string | null;
}

export class UpdateContractItemDto {
  @IsOptional() @IsUUID('all') unitId?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(QUANTITY_RULES) quantityRule?: QuantityRule | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DIVISOR) quantityDivisor?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(CONTRACT_MEAL_TYPES) mealType?: ContractMealType | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) description?: string | null;
}

export class AddContractPriceDto {
  @Matches(ISO_DATE) effectiveFrom!: string;
  @Matches(MONEY, { message: 'unitPrice — тоо (≤2 орон)' }) unitPrice!: string;
  @Transform(toBool) @IsBoolean() vatIncluded!: boolean;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) note?: string | null;
  /** ACTIVE гэрээнд — PRICE_CHANGE нэмэлт өөрчлөлтийн баримтын дугаар */
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(60) documentNo?: string | null;
}

// ── Нэмэлт өөрчлөлт ──────────────────────────────────────────
export class AddAmendmentDto {
  @IsIn(MANUAL_AMENDMENT_TYPES) amendmentType!: ManualAmendmentType;
  @Matches(ISO_DATE) effectiveDate!: string;
  /** EXTENSION — заавал */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(ISO_DATE) newEndDate?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(60) documentNo?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(1000) note?: string | null;
}

export class QuoteDto {
  @IsUUID('all') itemId!: string;
  @Matches(ISO_DATE) date!: string;
  @Matches(/^\d{1,11}(\.\d{1,4})?$/, { message: 'quantity — тоо (≤4 орон)' }) quantity!: string;
}
