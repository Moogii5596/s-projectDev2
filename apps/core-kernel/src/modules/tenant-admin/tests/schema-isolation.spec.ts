/**
 * Sprint 6: Schema Isolation Unit Tests
 *
 * RULE-08: unplugin-swc шаардлагатай (vitest.config.ts-д аль хэдийн тохируулсан)
 * RULE-01: overrideProvider() ашиглах
 * RULE-06: afterAll-д optional chaining ?.
 * RULE-10: prototype patch ХОРИГЛОНО — instance patch ашиглана
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SchemaRouterService } from '../schema-router.service';
import { TenantProvisioningService } from '../tenant-provisioning.service';

// ── Mock PrismaTenantClientService ───────────────────────────
const createMockPrisma = () => ({
  tenant: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
});

// ── SchemaRouterService Unit Tests ───────────────────────────
describe('SchemaRouterService', () => {
  let service: SchemaRouterService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new SchemaRouterService(mockPrisma as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 6.3.1 getSchemaName ────────────────────────────────────
  describe('getSchemaName()', () => {
    it('shared tenant → "public" буцаана', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: null });

      const result = await service.getSchemaName('tenant-shared-uuid');

      expect(result).toBe('public');
    });

    it('enterprise tenant → schema нэрийг буцаана', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        schemaName: 'tenant_abc12345',
      });

      const result = await service.getSchemaName('tenant-enterprise-uuid');

      expect(result).toBe('tenant_abc12345');
    });

    it('хоёр дахин дуудахад DB query нэг удаа дуудна (cache)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: null });

      await service.getSchemaName('tenant-cached-uuid');
      await service.getSchemaName('tenant-cached-uuid');

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('tenant олдохгүй бол NotFoundException', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getSchemaName('non-existent')).rejects.toThrow(
        'Tenant олдсонгүй',
      );
    });
  });

  // ── 6.3.2 withSchema ──────────────────────────────────────
  describe('withSchema()', () => {
    it('shared tenant → search_path = "public" тохируулна', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: null });

      let capturedSearchPath = '';

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          $executeRaw: vi.fn().mockImplementation((template: any, ...values: any[]) => {
            // template strings-аас set_config утгыг авна
            capturedSearchPath = values[0];
            return Promise.resolve();
          }),
        };
        return fn(mockTx);
      });

      await service.withSchema('tenant-shared-uuid', async (_tx) => 'ok');

      expect(capturedSearchPath).toBe('public');
    });

    it('enterprise tenant → search_path = "tenant_xxx,public" тохируулна', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        schemaName: 'tenant_abc12345',
      });

      let capturedSearchPath = '';

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          $executeRaw: vi.fn().mockImplementation((template: any, ...values: any[]) => {
            capturedSearchPath = values[0];
            return Promise.resolve();
          }),
        };
        return fn(mockTx);
      });

      await service.withSchema('tenant-enterprise-uuid', async (_tx) => 'ok');

      expect(capturedSearchPath).toBe('tenant_abc12345,public');
    });

    it('callback-н буцаасан утгыг зөв буцаана', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: null });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = { $executeRaw: vi.fn().mockResolvedValue(undefined) };
        return fn(mockTx);
      });

      const result = await service.withSchema('tenant-uuid', async (_tx) => ({
        id: 'mr-123',
        title: 'Test MR',
      }));

      expect(result).toEqual({ id: 'mr-123', title: 'Test MR' });
    });

    it('tenant олдохгүй бол transaction ажиллахгүй', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.withSchema('non-existent', async () => 'never'),
      ).rejects.toThrow('Tenant олдсонгүй');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── 6.3.3 invalidateCache ─────────────────────────────────
  describe('invalidateCache()', () => {
    it('cache invalidate дараа DB дахин дуудна', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: null });

      // 1. Cache warm-up
      await service.getSchemaName('tenant-cached-uuid');
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);

      // 2. Invalidate
      service.invalidateCache('tenant-cached-uuid');

      // 3. Дахин дуудахад DB query шинэ дуудлага хийнэ
      await service.getSchemaName('tenant-cached-uuid');
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  // ── 6.3.4 isEnterpriseSchema ──────────────────────────────
  describe('isEnterpriseSchema()', () => {
    it('shared tenant → false', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: null });
      expect(await service.isEnterpriseSchema('shared-tenant')).toBe(false);
    });

    it('enterprise tenant → true', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        schemaName: 'tenant_abc12345',
      });
      expect(await service.isEnterpriseSchema('enterprise-tenant')).toBe(true);
    });
  });
});

// ── TenantProvisioningService Unit Tests ─────────────────────
describe('TenantProvisioningService', () => {
  let service: TenantProvisioningService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockSchemaRouter: {
    invalidateCache: ReturnType<typeof vi.fn>;
    getSchemaName: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockSchemaRouter = {
      invalidateCache: vi.fn(),
      getSchemaName: vi.fn(),
    };
    service = new TenantProvisioningService(
      mockPrisma as any,
      mockSchemaRouter as any,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 6.5.1 upgradeToEnterprise ─────────────────────────────
  describe('upgradeToEnterprise()', () => {
    it('амжилттай provision хийгдэж schema нэрийг буцаана', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'test-tenant',
        schemaName: null, // shared tier
      });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const mockTx = {
          $queryRaw: vi.fn().mockResolvedValue([
            { provision_tenant_schema: 'tenant_abc12345' },
          ]),
          $executeRaw: vi.fn().mockResolvedValue(undefined),
        };
        return fn(mockTx);
      });

      const result = await service.upgradeToEnterprise('tenant-uuid');

      expect(result.schemaName).toBe('tenant_abc12345');
      expect(mockSchemaRouter.invalidateCache).toHaveBeenCalledWith('tenant-uuid');
    });

    it('tenant олдохгүй бол NotFoundException', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.upgradeToEnterprise('non-existent')).rejects.toThrow(
        'Tenant олдсонгүй',
      );
    });

    it('аль хэдийн enterprise бол ConflictException', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'test-tenant',
        schemaName: 'tenant_abc12345', // аль хэдийн enterprise
      });

      await expect(service.upgradeToEnterprise('tenant-uuid')).rejects.toThrow(
        'аль хэдийн enterprise schema',
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── 6.5.2 downgradeToShared ───────────────────────────────
  describe('downgradeToShared()', () => {
    it('enterprise schema устгагдаж cache invalidate болно', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'test-tenant',
        schemaName: 'tenant_abc12345',
      });
      mockPrisma.$executeRaw.mockResolvedValue(undefined);

      await service.downgradeToShared('tenant-uuid');

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockSchemaRouter.invalidateCache).toHaveBeenCalledWith('tenant-uuid');
    });

    it('shared tenant downgrade → BadRequestException', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'test-tenant',
        schemaName: null,
      });

      await expect(service.downgradeToShared('tenant-uuid')).rejects.toThrow(
        'enterprise schema-гүй',
      );
    });
  });

  // ── 6.5.3 checkSchemaHealth ───────────────────────────────
  describe('checkSchemaHealth()', () => {
    it('shared tenant → healthy: true, isEnterprise: false', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        schemaName: null,
      });

      const result = await service.checkSchemaHealth('tenant-uuid');

      expect(result.isEnterprise).toBe(false);
      expect(result.healthy).toBe(true);
      expect(result.tables).toHaveLength(0);
    });

    it('enterprise tenant бүх хүснэгттэй → healthy: true', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        schemaName: 'tenant_abc12345',
      });

      mockPrisma.$queryRaw.mockResolvedValue([
        { tablename: 'mr_headers' },
        { tablename: 'mr_items' },
        { tablename: 'approval_logs' },
        { tablename: 'workflow_instances' },
        { tablename: 'workflow_step_logs' },
        { tablename: 'outbox_events' },
      ]);

      const result = await service.checkSchemaHealth('tenant-uuid');

      expect(result.isEnterprise).toBe(true);
      expect(result.healthy).toBe(true);
      expect(result.tables.every((t) => t.exists)).toBe(true);
    });

    it('enterprise tenant хүснэгт дутуу бол → healthy: false', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-uuid',
        schemaName: 'tenant_abc12345',
      });

      // mr_items дутуу
      mockPrisma.$queryRaw.mockResolvedValue([
        { tablename: 'mr_headers' },
        { tablename: 'approval_logs' },
        { tablename: 'workflow_instances' },
        { tablename: 'workflow_step_logs' },
        { tablename: 'outbox_events' },
      ]);

      const result = await service.checkSchemaHealth('tenant-uuid');

      expect(result.healthy).toBe(false);
      const mrItems = result.tables.find((t) => t.name === 'mr_items');
      expect(mrItems?.exists).toBe(false);
    });
  });
});
