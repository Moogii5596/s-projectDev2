/**
 * Phase 4.8.5 [SEC-002] — WorkflowDefinitionService.update tenant шүүлттэй
 */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowDefinitionService } from './workflow-definition.service';

const T = '00000000-0000-0000-0000-00000000000a';
const ID = '0192a3b4-0000-7000-8000-000000000001';

describe('WorkflowDefinitionService.update', () => {
  let tx: {
    $executeRaw: ReturnType<typeof vi.fn>;
    workflowDefinition: { updateMany: ReturnType<typeof vi.fn>; findFirstOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
  let cache: { invalidateTenant: ReturnType<typeof vi.fn> };
  let svc: WorkflowDefinitionService;

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workflowDefinition: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: ID, tenantId: T, name: 'n' }),
        update: vi.fn(),
      },
    };
    cache = { invalidateTenant: vi.fn() };
    const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))) };
    svc = new WorkflowDefinitionService(prisma as never, cache as never);
  });

  it('tenantId-аар шүүж засна (id-аар л биш), set_config эхэлж, cache цэвэрлэнэ', async () => {
    const r = await svc.update(T, ID, { name: 'n', stepsConfig: [] });
    expect(tx.workflowDefinition.updateMany).toHaveBeenCalledWith({ where: { id: ID, tenantId: T }, data: { name: 'n', stepsConfig: [] } });
    expect(tx.workflowDefinition.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(T);
    expect(r).toMatchObject({ id: ID });
    expect(cache.invalidateTenant).toHaveBeenCalledWith(T);
  });

  it('өөр tenant-ийн (эсвэл байхгүй) id → 404, cache хөндөхгүй', async () => {
    tx.workflowDefinition.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.update(T, ID, { name: 'x', stepsConfig: [] })).rejects.toThrow(NotFoundException);
    expect(cache.invalidateTenant).not.toHaveBeenCalled();
  });
});
