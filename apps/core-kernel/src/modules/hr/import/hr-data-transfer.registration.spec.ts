import { describe, expect, it } from 'vitest';
import { DataTransferRegistry } from '../../core/import-export/data-transfer.registry';
import { HrDataTransferRegistration } from './hr-data-transfer.registration';
import { employeesHandler } from './employees.handler';

/** v0.2.4 C4: устгасан `hr-data-import.service.spec.ts`-ийн manifest бүртгэлийн хамрах хүрээг шинэ registry-д хадгална */
const scope = { requirePermission: async () => 'actor', requireAccess: async () => undefined, describe: async () => ({ code: 'S1' }) };

describe('HrDataTransferRegistration', () => {
  function registered() {
    const registry = new DataTransferRegistry();
    new HrDataTransferRegistration(registry, scope as never).onModuleInit();
    return registry;
  }

  it('registers every manifest-declared HR handler for import and export', () => {
    const registry = registered();
    const types = ['departments', 'employees', 'former-employees', 'positions'];
    expect(registry.importTypes()).toEqual(types);
    for (const type of types) {
      expect(registry.getImport(type)?.spec.type).toBe(type);
      expect(registry.getExport(type)).toBe(registry.getImport(type));
    }
    expect(registry.getImport('employees')).toBe(employeesHandler);
    expect(registry.scopeOf('employees')).toBe(scope); // CORE-10: хүрээний шалгалт handler-тай хамт бүртгэгдэнэ
  });

  it('rejects a second registration and an undeclared export type', () => {
    const registry = registered();
    expect(() => registry.registerHandler('hr', employeesHandler, scope)).toThrow(/дахин бүртгэгдсэн/);
    expect(() => registry.registerExport({ module: 'hr', type: 'unknown', specType: 'unknown', handler: employeesHandler, scope }))
      .toThrow(/exportTypes manifest/);
  });
});
