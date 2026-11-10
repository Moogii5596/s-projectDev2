import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { badRequest, conflict } from '../../../common/i18n/app-error';
import { TENANT_MODULES, type ModuleManifest } from '../modules/module-registry';

type Tx = Prisma.TransactionClient;
const SEQUENCE_MARKER = '\0';

export interface SequenceInput {
  tenantId: string;
  module: string;
  key: string;
  year: number;
  scopeKey?: string;
  values?: Readonly<Record<string, string | number>>;
}

const SEQUENCES: readonly ModuleSequence[] = TENANT_MODULES.flatMap((manifest: ModuleManifest) =>
  (manifest.numberingPatterns ?? []).map((definition) => ({ module: manifest.id, ...definition })),
);

interface ModuleSequence {
  module: string;
  key: string;
  pattern: string;
}

export function resolveSequencePattern(
  pattern: string,
  year: number,
  values: Readonly<Record<string, string | number>> = {},
): { prefix: string; suffix: string; digits: number } {
  const token = /\{(N+)\}/g;
  const match = token.exec(pattern);
  if (!match || token.exec(pattern)) throw badRequest('core.sequence.pattern_invalid', { pattern });
  const digitsToken = match[1];
  if (!digitsToken) throw badRequest('core.sequence.pattern_invalid', { pattern });
  const format = pattern.replace(/\{(N+)\}|\{([A-Za-z][A-Za-z0-9]*)\}/g, (_token, width: string | undefined, name: string | undefined) => {
    if (width) return SEQUENCE_MARKER;
    if (name === 'YYYY') return String(year);
    if (!name) throw badRequest('core.sequence.pattern_invalid', { pattern });
    const value = values[name];
    if (value === undefined) throw badRequest('core.sequence.value_missing', { name });
    return String(value);
  });
  if (/\{[^}]+\}/.test(format)) throw badRequest('core.sequence.pattern_invalid', { pattern });
  const marker = format.indexOf(SEQUENCE_MARKER);
  if (marker < 0 || format.indexOf(SEQUENCE_MARKER, marker + 1) >= 0) {
    throw badRequest('core.sequence.pattern_invalid', { pattern });
  }
  return {
    prefix: format.slice(0, marker),
    suffix: format.slice(marker + SEQUENCE_MARKER.length),
    digits: digitsToken.length,
  };
}

@Injectable()
export class SequenceService {
  async next(tx: Tx, input: SequenceInput): Promise<string> {
    const definition = SEQUENCES.find((sequence) => sequence.module === input.module && sequence.key === input.key);
    if (!definition) throw badRequest('core.sequence.type_unknown', { module: input.module, key: input.key });
    const { prefix, suffix, digits } = resolveSequencePattern(definition.pattern, input.year, input.values);
    const rows = await tx.$queryRaw<{ current_value: number }[]>`
      INSERT INTO core_sequences (tenant_id, sequence_type, scope_key, prefix, sequence_year, digits, current_value)
      VALUES (
        ${input.tenantId}::uuid,
        ${input.key},
        ${input.scopeKey ?? ''},
        ${prefix},
        ${input.year},
        ${digits},
        1
      )
      ON CONFLICT (tenant_id, sequence_type, scope_key, prefix, sequence_year)
      DO UPDATE SET
        current_value = core_sequences.current_value + 1,
        updated_at = now()
      WHERE core_sequences.digits = EXCLUDED.digits
      RETURNING current_value
    `;
    const value = rows[0]?.current_value;
    if (value === undefined) throw conflict('core.sequence.digits_mismatch', { key: input.key, digits });
    if (!Number.isSafeInteger(value) || value < 1) throw conflict('core.sequence.counter_invalid', { key: input.key });
    return `${prefix}${String(value).padStart(digits, '0')}${suffix}`;
  }
}
