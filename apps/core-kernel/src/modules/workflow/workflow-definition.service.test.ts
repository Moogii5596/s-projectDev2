/**
 * Phase 4.8.5 [SEC-002] + 4.9.1 [SEC-003] — WorkflowDefinitionService
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowDefinitionService } from './workflow-definition.service';

const T = '00000000-0000-0000-0000-00000000000a';
const ID = '0192a3b4-0000-7000-8000-000000000001';
const AUTH = 'auth-1';

describe('WorkflowDefinitionService', () => {
  let tx: {
    $executeRaw: ReturnType<typeof vi.fn>;
    coreUser: { findFirst: ReturnType<typeof vi.fn> };
    workflowDefinition: {
      updateMany: ReturnType<typeof vi.fn>;
      findFirstOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let cache: { invalidateTenant: ReturnType<typeof vi.fn> };
  let svc: WorkflowDefinitionService;

  beforeEach(() => {
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      coreUser: { findFirst: vi.fn().mockResolvedValue({ id: 'cu', role: UserRole.ADMIN }) },
      workflowDefinition: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: ID, tenantId: T, name: 'n' }),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: ID }),
      },
    };
    cache = { invalidateTenant: vi.fn() };
    const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))) };
    svc = new WorkflowDefinitionService(prisma as never, cache as never);
  });

  it('update: tenantId-аар шүүж засна (id-аар л биш), set_config эхэлж, cache цэвэрлэнэ', async () => {
    const r = await svc.update(T, AUTH, ID, { name: 'n', stepsConfig: [] });
    expect(tx.workflowDefinition.updateMany).toHaveBeenCalledWith({ where: { id: ID, tenantId: T }, data: { name: 'n', stepsConfig: [] } });
    expect(tx.workflowDefinition.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(T);
    expect(r).toMatchObject({ id: ID });
    expect(cache.invalidateTenant).toHaveBeenCalledWith(T);
  });

  it('update: өөр tenant-ийн (эсвэл байхгүй) id → 404, cache хөндөхгүй', async () => {
    tx.workflowDefinition.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.update(T, AUTH, ID, { name: 'x', stepsConfig: [] })).rejects.toThrow(NotFoundException);
    expect(cache.invalidateTenant).not.toHaveBeenCalled();
  });

  it.each([UserRole.REQUESTER, UserRole.APPROVER, UserRole.VIEWER])('%s → create/update 403, DB-д бичихгүй [SEC-003]', async (role) => {
    tx.coreUser.findFirst.mockResolvedValue({ id: 'cu', role });
    await expect(svc.create(T, AUTH, { name: 'x', stepsConfig: [] })).rejects.toThrow(ForbiddenException);
    await expect(svc.update(T, AUTH, ID, { name: 'x', stepsConfig: [] })).rejects.toThrow(ForbiddenException);
    expect(tx.workflowDefinition.create).not.toHaveBeenCalled();
    expect(tx.workflowDefinition.updateMany).not.toHaveBeenCalled();
  });

  it('OWNER → create; эрхийн шалгалт tenant + authId-аар', async () => {
    tx.coreUser.findFirst.mockResolvedValue({ id: 'cu', role: UserRole.OWNER });
    await svc.create(T, AUTH, { name: 'x', stepsConfig: [] });
    expect(tx.coreUser.findFirst.mock.calls[0][0].where).toMatchObject({ authId: AUTH, tenantId: T, isActive: true });
    expect(tx.workflowDefinition.create).toHaveBeenCalledWith({ data: { tenantId: T, name: 'x', stepsConfig: [] } });
  });
});
