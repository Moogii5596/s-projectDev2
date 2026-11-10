/**
 * C4 CORE-06 — MR дугаарлалт төвийн tenant sequence ашиглана.
 */
import { describe, expect, it, vi } from 'vitest';
import { MaterialRequisitionService } from '../services/material-requisition.service';

const T = '00000000-0000-0000-0000-000000000003';
const year = new Date().getFullYear();

function make() {
  const tx = {};
  const next = vi.fn(async (_tx: unknown, _input: unknown) => `MR-${year}-0042`);
  const svc = new MaterialRequisitionService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    { register: vi.fn() } as never, { next } as never,
  );
  const gen = (svc as unknown as { generateMrNumber: (tx: unknown, t: string) => Promise<string> }).generateMrNumber.bind(svc);
  return { tx, next, run: () => gen(tx, T) };
}

describe('generateMrNumber (CORE-06)', () => {
  it('central sequence-д tenant/module/type/year өгч дугаарыг авна', async () => {
    const m = make();
    expect(await m.run()).toBe(`MR-${year}-0042`);
    expect(m.next).toHaveBeenCalledWith({}, {
      tenantId: T,
      module: 'mr',
      key: 'material_requisition.number',
      year,
    });
  });
});
