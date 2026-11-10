import { describe, expect, it } from 'vitest';
import { DataTransferRegistry } from './data-transfer.registry';

describe('DataTransferRegistry', () => {
  it('registers manifest-declared import and export handlers', () => {
    const registry = new DataTransferRegistry();
    const handler = { run: () => 'ok' };
    registry.registerImport({ module: 'hr', type: 'employees', specType: 'employees', handler });
    registry.registerExport({ module: 'hr', type: 'employees', specType: 'employees', handler });

    expect(registry.getImport('employees')).toBe(handler);
    expect(registry.getExport('employees')).toBe(handler);
    expect(registry.importTypes()).toEqual(['employees']);
  });

  it('rejects undeclared, mismatched and duplicate import registrations', () => {
    const registry = new DataTransferRegistry();

    expect(() => registry.registerImport({
      module: 'hr', type: 'unknown', specType: 'unknown', handler: {},
    })).toThrow(/manifest/);
    expect(() => registry.registerImport({
      module: 'hr', type: 'employees', specType: 'departments', handler: {},
    })).toThrow(/зөрүүтэй/);

    registry.registerImport({ module: 'hr', type: 'employees', specType: 'employees', handler: {} });
    expect(() => registry.registerImport({
      module: 'hr', type: 'employees', specType: 'employees', handler: {},
    })).toThrow(/дахин бүртгэгдсэн/);
  });
});
