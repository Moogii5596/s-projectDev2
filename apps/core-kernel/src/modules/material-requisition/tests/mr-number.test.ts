/**
 * Phase 6.4.7 [CONC-002] — MR дугаар: tenant+он advisory lock → тоон max + 1
 */
import { describe, expect, it, vi } from 'vitest';
import { MaterialRequisitionService } from '../services/material-requisition.service';

const T = '00000000-0000-0000-0000-000000000003';
const year = new Date().getFullYear();

function make(max: number | null) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      calls.push(`exec:${strings.join('?')}|${vals.join(',')}`);
      return 1;
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      calls.push(`query:${strings.join('?')}|${vals.join(',')}`);
      return [{ max }];
    }),
  };
  const svc = new MaterialRequisitionService({} as never, {} as never, {} as never, {} as never, {} as never);
  const gen = (svc as unknown as { generateMrNumber: (tx: unknown, t: string) => Promise<string> }).generateMrNumber.bind(svc);
  return { tx, calls, run: () => gen(tx, T) };
}

describe('generateMrNumber [CONC-002]', () => {
  it('эхлээд tenant+он advisory lock, дараа нь max — дараалал чухал', async () => {
    const m = make(null);
    expect(await m.run()).toBe(`MR-${year}-0001`);
    expect(m.calls).toHaveLength(2);
    expect(m.calls[0]).toMatch(/^exec:SELECT pg_advisory_xact_lock\(hashtext\(\?\)\)/);
    expect(m.calls[0]).toContain(`mr-number:${T}:${year}`);
    expect(m.calls[1]).toMatch(/^query:/);
    expect(m.calls[1]).toContain(`MR-${year}-%`);
  });

  it('тоон max + 1 (текст эрэмбэ биш): 9999 → 10000, 41 → 0042', async () => {
    expect(await make(9999).run()).toBe(`MR-${year}-10000`);
    expect(await make(41).run()).toBe(`MR-${year}-0042`);
  });
});
