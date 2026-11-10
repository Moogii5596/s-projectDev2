import { describe, expect, it, vi } from 'vitest';
import { resolveSequencePattern, SequenceService } from './sequence.service';

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

  it('preserves both prefix and suffix around the padded sequence', () => {
    const format = resolveSequencePattern('X-{campCode}-{YYYY}-{NNN}-END', 2027, { campCode: 'C1' });
    expect(format).toEqual({ prefix: 'X-C1-2027-', suffix: '-END', digits: 3 });
    expect(`${format.prefix}${String(9).padStart(format.digits, '0')}${format.suffix}`).toBe('X-C1-2027-009-END');
  });

  it('returns localized application errors for missing values and digit mismatches', async () => {
    expect(() => resolveSequencePattern('ZAS-{campCode}-{YYYY}-{NNNN}', 2027))
      .toThrow(expect.objectContaining({ code: 'core.sequence.value_missing' }));

    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await expect(new SequenceService().next(tx as never, {
      tenantId: 'tenant-1', module: 'mr', key: 'material_requisition.number', year: 2027,
    })).rejects.toMatchObject({ code: 'core.sequence.digits_mismatch', params: { digits: 4 } });
  });
});
