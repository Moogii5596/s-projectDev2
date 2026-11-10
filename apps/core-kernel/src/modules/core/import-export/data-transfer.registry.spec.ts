import { describe, expect, it } from 'vitest';
import { CampDataImportType } from '@prisma/client';
import { DataTransferRegistry } from './data-transfer.registry';
import type { DataImportHandler } from './data-transfer.types';

describe('DataTransferRegistry', () => {
  it('registers manifest-declared import and export handlers', () => {
    const registry = new DataTransferRegistry();
    const handler = createHandler();
    registry.registerHandler('hr', handler);

    expect(registry.getImport('employees')).toBe(handler);
    expect(registry.getExport('employees')).toBe(handler);
    expect(registry.importTypes()).toEqual(['employees']);
  });

  it('rejects undeclared, mismatched and duplicate import registrations', () => {
    const registry = new DataTransferRegistry();
    const handler = createHandler();

    expect(() => registry.registerImport({
      module: 'hr', type: 'unknown', specType: 'unknown', handler,
    })).toThrow(/manifest/);
    expect(() => registry.registerImport({
      module: 'hr', type: 'employees', specType: 'departments', handler,
    })).toThrow(/зөрүүтэй/);

    registry.registerImport({ module: 'hr', type: 'employees', specType: 'employees', handler });
    expect(() => registry.registerImport({
      module: 'hr', type: 'employees', specType: 'employees', handler,
    })).toThrow(/дахин бүртгэгдсэн/);
  });
});

function createHandler(): DataImportHandler {
  return {
    type: CampDataImportType.EMPLOYEES,
    spec: { type: 'employees', title: 'table.employees', columns: [] },
    permission: [],
    plan: async () => [],
    apply: async () => ({ created: 0, updated: 0 }),
    exportRows: async () => [],
  };
}
