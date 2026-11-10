import { describe, expect, it } from 'vitest';
import { ApprovalEntityRegistry } from './approval-entity.registry';

const handler = {
  entityType: 'MATERIAL_REQUISITION',
  module: 'mr',
  labelKey: 'approval.entity.mr',
  approvePermissions: ['mr.request.approve'],
};

describe('ApprovalEntityRegistry', () => {
  it('registers approval handlers declared by their module manifest', () => {
    const registry = new ApprovalEntityRegistry();
    registry.register(handler);

    expect(registry.get('MATERIAL_REQUISITION')).toEqual(handler);
  });

  it('rejects handlers for modules missing from the module registry', () => {
    const registry = new ApprovalEntityRegistry();

    expect(() => registry.register({ ...handler, module: 'missing' }))
      .toThrow('Approval entity модуль manifest-д байхгүй: missing');
  });

  it('rejects approval types not declared by the module manifest', () => {
    const registry = new ApprovalEntityRegistry();

    expect(() => registry.register({ ...handler, entityType: 'UNKNOWN_APPROVAL' }))
      .toThrow('Approval entity type manifest-д бүртгэгдээгүй: UNKNOWN_APPROVAL');
  });
});
