import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const CURRENCY = /^[A-Z]{3}$/;
export const RATE = /^\d{1,12}(\.\d{1,6})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const trimOrNull = ({ value }: { value: unknown }) => {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export interface ExchangeRateView {
  id: string;
  rateDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  sourceNote: string | null;
  createdAt: string;
}

/** v0.2.3 Блок 6б (V2-07) — 1 baseCurrency = rate quoteCurrency. Ижил (огноо, хос) → солино */
export class UpsertExchangeRateDto {
  @Matches(ISO_DATE) rateDate!: string;
  @Transform(upper) @Matches(CURRENCY, { message: 'baseCurrency — ISO 4217' }) baseCurrency!: string;
  @Transform(upper) @Matches(CURRENCY, { message: 'quoteCurrency — ISO 4217' }) quoteCurrency!: string;
  @Matches(RATE, { message: 'rate — эерэг тоо (≤6 орон)' }) rate!: string;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(300) sourceNote?: string | null;
}

export class QueryExchangeRatesDto {
  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;
  @IsOptional() @Transform(upper) @Matches(CURRENCY) currency?: string;
}
