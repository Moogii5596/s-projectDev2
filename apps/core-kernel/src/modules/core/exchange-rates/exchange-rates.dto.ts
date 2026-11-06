import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ISO_DATE, trimOrNull } from '../../camp/common/camp-dto.util';
import { CURRENCY, RATE } from '../../camp/contracts/contracts.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

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
