import { describe, expect, it, vi } from 'vitest';
import { SequenceService } from './sequence.service';

describe('SequenceService', () => {
  it('renders the manifest pattern exactly once and persists an atomic counter', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ current_value: 1 }]),
    };

    await expect(new SequenceService().next(tx as never, {
      tenantId: 'tenant-1',
      module: 'mr',
      key: 'material_requisition.number',
      year: 2027,
    })).resolves.toBe('MR-2027-0001');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('renders scoped module values in the sequence prefix', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ current_value: 42 }]),
    };

    await expect(new SequenceService().next(tx as never, {
      tenantId: 'tenant-1',
      module: 'camp',
      key: 'maintenance.request_no',
      scopeKey: 'camp-1',
      year: 2027,
      values: { campCode: 'C1' },
    })).resolves.toBe('ZAS-C1-2027-0042');
  });
});
