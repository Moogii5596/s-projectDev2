import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TENANT_MODULES, type ModuleManifest } from '../modules/module-registry';

type Tx = Prisma.TransactionClient;

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

@Injectable()
export class SequenceService {
  async next(tx: Tx, input: SequenceInput): Promise<string> {
    const definition = SEQUENCES.find((sequence) => sequence.module === input.module && sequence.key === input.key);
    if (!definition) throw new Error(`Дугаарлалтын төрөл manifest-д бүртгэгдээгүй: ${input.module}.${input.key}`);

    const token = /\{(N+)\}/g;
    const match = token.exec(definition.pattern);
    if (!match || token.exec(definition.pattern)) throw new Error(`Дугаарлалтын загвар буруу: ${input.key}`);
    const digitsToken = match[1];
    if (!digitsToken) throw new Error(`Дугаарлалтын загвар буруу: ${input.key}`);
    const digits = digitsToken.length;
    const format = definition.pattern.replace(/\{(N+)\}|\{([A-Za-z][A-Za-z0-9]*)\}/g, (_token, width: string | undefined, name: string | undefined) => {
      if (width) return '{sequence}';
      if (name === 'YYYY') return String(input.year);
      if (!name) throw new Error(`Дугаарлалтын загвар буруу: ${input.key}`);
      const value = input.values?.[name];
      if (value === undefined) throw new Error(`Дугаарлалтын утга дутуу: ${name}`);
      return String(value);
    });
    const sequenceMarker = format.indexOf('{sequence}');
    if (sequenceMarker < 0 || format.indexOf('{sequence}', sequenceMarker + 1) >= 0) {
      throw new Error(`Дугаарлалтын загварын sequence token буруу: ${input.key}`);
    }
    const prefix = format.slice(0, sequenceMarker);
    const suffix = format.slice(sequenceMarker + '{sequence}'.length);
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
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Дугаарлалтын өгөгдөл буруу: ${input.key}`);
    return `${prefix}${String(value).padStart(digits, '0')}${suffix}`;
  }
}
