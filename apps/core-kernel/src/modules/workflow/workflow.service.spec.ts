import { NotFoundException } from '@nestjs/common';
import { WorkflowService }        from './workflow.service';
import { PessimisticLockService } from './pessimistic-lock.service';

// Unit тест pattern: new Class(mockDep as never) — RULE-10
// RULE-13 шалгах: actorId = core_users.id (authId биш)

const TENANT_ID     = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INSTANCE_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DEFINITION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ENTITY_ID     = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const AUTH_ID       = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';  // Supabase auth_id
const CORE_USER_ID  = 'ffffffff-ffff-ffff-ffff-ffffffffffff';  // core_users.id (RULE-13)

// 2-алхамт definition
const TWO_STEP_DEF = {
  stepsConfig: [
    { order: 0, role: 'APPROVER', quorum: 1 },
    { order: 1, role: 'ADMIN',    quorum: 1 },
  ],
};

describe('WorkflowService', () => {
  let service: WorkflowService;
  let mockPrisma: any;
  let mockTx: any;
  let mockLockSvc: PessimisticLockService;
  let mockEventBusSvc: any;
  let mockLifecycle: { onApproved: ReturnType<typeof vi.fn>; onRejected: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      workflowInstance: {
        create:              vi.fn(),
        findUniqueOrThrow:   vi.fn(),
        update:              vi.fn().mockResolvedValue({}),
      },
      workflowStepLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
      // resolveUserId-д хэрэгтэй
      coreUser: {
        findFirst: vi.fn().mockResolvedValue({ id: CORE_USER_ID }),
      },
    };
    mockLockSvc = {
      acquireLock:  vi.fn().mockResolvedValue({}),
      releaseLock:  vi.fn().mockResolvedValue(undefined),
    } as any;

    // Sprint 3: EventBusService mock
    mockEventBusSvc = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    // Phase 4: MrLifecycleService mock
    mockLifecycle = { onApproved: vi.fn().mockResolvedValue(undefined), onRejected: vi.fn().mockResolvedValue(undefined) };

    service = new WorkflowService(mockPrisma as never, mockLockSvc as never, mockEventBusSvc as never, mockLifecycle as never);
  });

  // ── createInstance ──────────────────────────────────────────
  describe('createInstance()', () => {
    it("status: 'PENDING'-тэй instance үүсгэнэ", async () => {
      const mockInstance = {
        id: INSTANCE_ID, tenantId: TENANT_ID,
        definitionId: DEFINITION_ID, entityId: ENTITY_ID,
        entityType: 'MATERIAL_REQUISITION',
        status: 'PENDING', currentStep: 0,
      };
      mockTx.workflowInstance.create.mockResolvedValue(mockInstance);

      const result = await service.createInstance({
        tenantId: TENANT_ID, definitionId: DEFINITION_ID, entityId: ENTITY_ID,
      });

      expect(result.status).toBe('PENDING');
      expect(result.currentStep).toBe(0);
      // RULE-03: set_config дуудагдсан
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('entityType default → MATERIAL_REQUISITION', async () => {
      mockTx.workflowInstance.create.mockResolvedValue({
        entityType: 'MATERIAL_REQUISITION', status: 'PENDING', currentStep: 0,
      });

      const result = await service.createInstance({
        tenantId: TENANT_ID, definitionId: DEFINITION_ID, entityId: ENTITY_ID,
      });

      expect(result.entityType).toBe('MATERIAL_REQUISITION');
    });
  });

  // ── approveStep ─────────────────────────────────────────────
  describe('approveStep()', () => {
    it('WorkflowStepLog нэмэгдэнэ, currentStep ахина (дунд алхам)', async () => {
      // currentStep=0, 2 алхамт definition → дараагийн алхам руу шилжинэ
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({
        id: INSTANCE_ID, tenantId: TENANT_ID,
        currentStep: 0, status: 'PENDING',
        definition: { ...TWO_STEP_DEF },
      });

      await service.approveStep({
        authId: AUTH_ID, tenantId: TENANT_ID,
        instanceId: INSTANCE_ID, comment: 'OK',
      });

      // Step log нэмэгдсэн
      expect(mockTx.workflowStepLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: CORE_USER_ID,   // RULE-13: core_users.id
            action:  'APPROVED',
            stepOrder: 0,
          }),
        }),
      );
      // currentStep ахисан, APPROVED биш
      expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentStep: 1 }),
        }),
      );
      const updateCall = mockTx.workflowInstance.update.mock.calls[0][0];
      expect(updateCall.data.status).toBeUndefined();
    });

    it('Бүх step дуусвал → status=APPROVED, mr_headers sync', async () => {
      // currentStep=1, 2 алхамт definition → сүүлийн алхам
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({
        id: INSTANCE_ID, tenantId: TENANT_ID,
        currentStep: 1, status: 'PENDING',
        definition: { ...TWO_STEP_DEF },
      });

      await service.approveStep({
        authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID,
      });

      // status=APPROVED болсон
      expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      // mr_headers sync ($executeRaw дуудагдсан — set_config + UPDATE)
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('RULE-13: actorId = core_users.id (authId биш)', async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({
        id: INSTANCE_ID, tenantId: TENANT_ID,
        currentStep: 0, status: 'PENDING',
        definition: { ...TWO_STEP_DEF },
      });

      await service.approveStep({
        authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID,
      });

      const stepLogCall = mockTx.workflowStepLog.create.mock.calls[0][0];
      // actorId нь AUTH_ID биш, CORE_USER_ID байна
      expect(stepLogCall.data.actorId).toBe(CORE_USER_ID);
      expect(stepLogCall.data.actorId).not.toBe(AUTH_ID);
    });

    it('NotFoundException — coreUser олдохгүй бол (RULE-13)', async () => {
      mockPrisma.coreUser.findFirst.mockResolvedValue(null);

      await expect(
        service.approveStep({
          authId: 'unknown-auth-id', tenantId: TENANT_ID, instanceId: INSTANCE_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── rejectStep ──────────────────────────────────────────────
  describe('rejectStep()', () => {
    it("status='REJECTED' болгоно, mr_headers sync", async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({
        id: INSTANCE_ID, tenantId: TENANT_ID,
        currentStep: 0, status: 'PENDING',
      });

      await service.rejectStep({
        authId: AUTH_ID, tenantId: TENANT_ID,
        instanceId: INSTANCE_ID, comment: 'No budget',
      });

      // status=REJECTED
      expect(mockTx.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
      // step log REJECTED action
      expect(mockTx.workflowStepLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action:  'REJECTED',
            actorId: CORE_USER_ID,  // RULE-13
          }),
        }),
      );
      // mr_headers sync ($executeRaw: set_config + UPDATE)
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('RULE-13: actorId = core_users.id (authId биш)', async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({
        id: INSTANCE_ID, currentStep: 0, status: 'PENDING', tenantId: TENANT_ID,
      });

      await service.rejectStep({
        authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID,
      });

      const stepLogCall = mockTx.workflowStepLog.create.mock.calls[0][0];
      expect(stepLogCall.data.actorId).toBe(CORE_USER_ID);
      expect(stepLogCall.data.actorId).not.toBe(AUTH_ID);
    });
  });

  // Phase 4.1: MR батлах 2 дахь зам — MrLifecycleService hook
  describe('MrLifecycle hook (Phase 4.1)', () => {
    const MR_INSTANCE = {
      id: INSTANCE_ID, tenantId: TENANT_ID, currentStep: 1, status: 'PENDING',
      entityType: 'MATERIAL_REQUISITION', entityId: ENTITY_ID,
      definition: { ...TWO_STEP_DEF },
    };

    it('сүүлийн алхам батлагдвал onApproved(tx, tenant, MR id)', async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue(MR_INSTANCE);
      await service.approveStep({ authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID });
      expect(mockLifecycle.onApproved).toHaveBeenCalledWith(mockTx, TENANT_ID, ENTITY_ID);
    });

    it('дунд алхам → onApproved дуудахгүй', async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({ ...MR_INSTANCE, currentStep: 0 });
      await service.approveStep({ authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID });
      expect(mockLifecycle.onApproved).not.toHaveBeenCalled();
    });

    it('reject → onRejected(tx, tenant, MR id)', async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue(MR_INSTANCE);
      await service.rejectStep({ authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID });
      expect(mockLifecycle.onRejected).toHaveBeenCalledWith(mockTx, TENANT_ID, ENTITY_ID);
    });

    it('MR биш entity → hook дуудахгүй', async () => {
      mockTx.workflowInstance.findUniqueOrThrow.mockResolvedValue({ ...MR_INSTANCE, entityType: 'OTHER' });
      await service.approveStep({ authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID });
      await service.rejectStep({ authId: AUTH_ID, tenantId: TENANT_ID, instanceId: INSTANCE_ID });
      expect(mockLifecycle.onApproved).not.toHaveBeenCalled();
      expect(mockLifecycle.onRejected).not.toHaveBeenCalled();
    });
  });
});
