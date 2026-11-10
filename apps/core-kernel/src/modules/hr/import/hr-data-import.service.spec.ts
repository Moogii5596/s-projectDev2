import { describe, expect, it } from 'vitest';
import { employeesHandler } from './employees.handler';
import { HrDataImportService } from './hr-data-import.service';
import { DataTransferRegistry } from '../../core/import-export/data-transfer.registry';

function createService() {
  return new HrDataImportService({} as never, {} as never, {} as never, new DataTransferRegistry());
}

describe('HrDataImportService manifest registration', () => {
  it('accepts a declared HR handler', () => {
    const service = createService();
    expect(service.types()).toContain('employees');
    expect(service['transfers'].getImport('employees')).toBe(employeesHandler);
  });

  it('rejects undeclared import and export types', () => {
    const service = createService();
    expect(() => service.registerHandler('unknown', employeesHandler, 'hr')).toThrow(/importTypes manifest/);
    expect(() => service.registerExport('unknown', { spec: employeesHandler.spec, rows: async () => [] }, 'hr'))
      .toThrow(/exportTypes manifest/);
  });

  it('rejects an export whose declared key does not match its format', () => {
    const service = createService();
    expect(() => service.registerExport('employees', {
      spec: { ...employeesHandler.spec, type: 'departments' },
      rows: async () => [],
    }, 'hr')).toThrow(/spec төрөл зөрүүтэй/);
  });
});
