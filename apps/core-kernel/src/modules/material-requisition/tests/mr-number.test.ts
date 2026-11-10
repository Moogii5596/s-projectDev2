/**
 * C4 CORE-06 — MR дугаарлалт төвийн tenant sequence ашиглана.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaterialRequisitionService } from '../services/material-requisition.service';
import { todayUb } from '../../camp/common/camp-date';

const T = '00000000-0000-0000-0000-000000000003';

function make() {
  const tx = {};
  const next = vi.fn(async (_tx: unknown, input: { year: number }) => `MR-${input.year}-0042`);
  const svc = new MaterialRequisitionService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    { register: vi.fn() } as never, { next } as never,
  );
  const gen = (svc as unknown as { generateMrNumber: (tx: unknown, t: string) => Promise<string> }).generateMrNumber.bind(svc);
  return { tx, next, run: () => gen(tx, T) };
}

describe('generateMrNumber (CORE-06)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('central sequence-д tenant/module/type/year өгч дугаарыг авна', async () => {
    const m = make();
    expect(await m.run()).toBe(`MR-${todayUb().slice(0, 4)}-0042`);
    expect(m.next).toHaveBeenCalledWith({}, {
      tenantId: T,
      module: 'mr',
      key: 'material_requisition.number',
      year: Number(todayUb().slice(0, 4)),
    });
  });

  it('Монголын өдрийн жил солигдсоныг тооцно', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T16:30:00.000Z'));
    const m = make();
    await m.run();
    expect(m.next.mock.calls[0]?.[1].year).toBe(2027);
  });
});
