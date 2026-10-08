import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { TenantOnboardingService } from './tenant-onboarding.service';

// RULE-10: new MyService(mockDep as never) — app.get() ХОРИГЛОНО
// RULE-13: core_users.authId → Supabase UUID (authId шууд FK болохгүй)
// RULE-04: $transaction дотор бүх бичилт

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID     = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AUTH_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // Supabase UUID (RULE-13)
const WORKFLOW_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const BASE_DTO = {
  name: 'Test Tenant',
  slug: 'test-tenant',
  tier: 'TIER1' as const,
  adminEmail: 'admin@test.com',
  adminFullName: 'Test Admin',
  adminPassword: 'Password123!',
};

describe('TenantOnboardingService', () => {
  let service: TenantOnboardingService;
  let mockPrisma: any;
  let mockTx: any;
  let mockSupabaseCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Supabase Admin API mock
    mockSupabaseCreate = vi.fn().mockResolvedValue({
      data: { user: { id: AUTH_ID } },
      error: null,
    });

    mockTx = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue(null), // slug давхардаагүй
        create: vi.fn().mockResolvedValue({ id: TENANT_ID, slug: BASE_DTO.slug }),
      },
      coreUser: {
        create: vi.fn().mockResolvedValue({ id: USER_ID, authId: AUTH_ID, email: BASE_DTO.adminEmail }),
      },
      workflowDefinition: {
        create: vi.fn().mockResolvedValue({ id: WORKFLOW_ID }),
      },
    };

    mockPrisma = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(mockTx)),
    };

    // RULE-10: new Service(mockDep as never)
    service = new TenantOnboardingService(mockPrisma as never);

    // Supabase admin client mock — private field override
    (service as any).supabaseAdmin = {
      auth: {
        admin: {
          createUser: mockSupabaseCreate,
        },
      },
    };
  });

  // ✓ createTenant() → tenants + core_users (authId-тэй) хоёуланд бичигдэнэ
  it('createTenant() → tenant болон core_users хоёуланд бичигдэнэ', async () => {
    const result = await service.createTenant(BASE_DTO);

    expect(mockTx.tenant.create).toHaveBeenCalledTimes(1);
    expect(mockTx.coreUser.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      tenant: { id: TENANT_ID },
      user: { id: USER_ID },
    });
  });

  // ✓ core_users.authId → Supabase-аас авсан UUID (RULE-13)
  it('RULE-13: core_users.authId = Supabase UUID (sheer FK биш)', async () => {
    await service.createTenant(BASE_DTO);

    const coreUserCall = mockTx.coreUser.create.mock.calls[0][0];
    expect(coreUserCall.data.authId).toBe(AUTH_ID);           // Supabase UUID
    expect(coreUserCall.data.tenantId).toBe(TENANT_ID);       // core_users.tenantId
    // authId нь tenantId биш — тусдаа field
    expect(coreUserCall.data.authId).not.toBe(TENANT_ID);
  });

  // ✓ Default workflow_definition seed хийгдэнэ
  it('createTenant() → Default WorkflowDefinition seed хийгдэнэ', async () => {
    await service.createTenant(BASE_DTO);

    expect(mockTx.workflowDefinition.create).toHaveBeenCalledTimes(1);
    const wfCall = mockTx.workflowDefinition.create.mock.calls[0][0];
    expect(wfCall.data.tenantId).toBe(TENANT_ID);
    expect(wfCall.data.name).toBe('Default Approval');
    expect(wfCall.data.stepsConfig).toEqual([{ order: 0, role: 'APPROVER', quorum: 1 }]);
    expect(wfCall.data.isActive).toBe(true);
  });

  // ✓ slug давхардвал ConflictException
  it('slug давхардвал ConflictException шиддэг', async () => {
    // slug аль хэдийн байгаа
    mockTx.tenant.findUnique = vi.fn().mockResolvedValue({ id: TENANT_ID, slug: BASE_DTO.slug });

    await expect(service.createTenant(BASE_DTO)).rejects.toThrow(ConflictException);
    // coreUser, workflowDefinition бичигдэхгүй
    expect(mockTx.coreUser.create).not.toHaveBeenCalled();
  });

  // ✓ Supabase Auth error → ConflictException
  it('Supabase Auth error → ConflictException шиддэг', async () => {
    mockSupabaseCreate.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email already registered' },
    });

    await expect(service.createTenant(BASE_DTO)).rejects.toThrow(ConflictException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  // ✓ $transaction дотор tenant + coreUser + workflow нэгэн зэрэг бичигдэнэ (RULE-04)
  it('RULE-04: бүх бичилт $transaction дотор явагдана', async () => {
    await service.createTenant(BASE_DTO);

    // $transaction нэг л удаа дуудагдах ёстой
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Бүх 3 бичилт transaction дотор
    expect(mockTx.tenant.create).toHaveBeenCalled();
    expect(mockTx.coreUser.create).toHaveBeenCalled();
    expect(mockTx.workflowDefinition.create).toHaveBeenCalled();
  });
});
