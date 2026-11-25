import { describe, expect, it, vi } from 'vitest';
import { CampDataImportType } from '@prisma/client';
import { DataTransferRegistry } from './data-transfer.registry';
import { DataTransferService } from './data-transfer.service';
import type { DataImportHandler, DataTransferScope } from './data-transfer.types';

/** CORE-10 — цөмийн урсгал хүрээний эрх шалгалтыг бүртгэсэн модулийн `DataTransferScope`-оор хийнэ (Кемпийг мэдэхгүй) */
function setup() {
  const calls: string[] = [];
  const scope: DataTransferScope = {
    requirePermission: vi.fn(async () => { calls.push('permission'); return 'actor-1'; }),
    requireAccess: vi.fn(async () => { calls.push('access'); }),
    describe: vi.fn(async () => { calls.push('describe'); return { code: 'S1' }; }),
  };
  const handler: DataImportHandler = {
    type: CampDataImportType.EMPLOYEES,
    spec: { type: 'employees', title: 'table.employees', columns: [{ key: 'name', label: 'col.position.name', type: 'text' }] },
    permission: ['hr.employee.manage'],
    plan: vi.fn(async (_tx, ctx, rows) => { calls.push(`plan:${ctx.scopeId}`); return rows.map((r) => ({ ...r, op: 'create' as const })); }),
    apply: vi.fn(async () => ({ created: 0, updated: 0 })),
    exportRows: vi.fn(async (_tx, ctx) => { calls.push(`export:${ctx.scopeId}`); return []; }),
  };
  const registry = new DataTransferRegistry();
  registry.registerHandler('hr', handler, scope);
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    campDataImport: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'imp-1', ...args.data })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const svc = new DataTransferService(prisma as never, {} as never, registry);
  return { svc, scope, handler, tx, calls };
}

describe('DataTransferService (CORE-10)', () => {
  it('preview: эрх → хүрээ байгаа эсэх → төлөвлөлт; мөрийг хүрээний id-тай хадгална', async () => {
    const { svc, scope, tx, calls } = setup();
    await svc.preview('t1', 'auth-1', 'scope-1', 'employees', { kind: 'rows', rows: [{ name: 'A' }] });
    expect(calls).toEqual(['permission', 'describe', 'plan:scope-1']);
    expect(scope.requirePermission).toHaveBeenCalledWith(tx, 't1', 'auth-1', 'scope-1', ['hr.employee.manage']);
    expect(tx.campDataImport.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', campId: 'scope-1', uploadedBy: 'actor-1' });
  });

  it('preview: эрхгүй (scope татгалзсан) → хүрээг шалгахгүй, юу ч бичихгүй', async () => {
    const { svc, scope, tx } = setup();
    vi.mocked(scope.requirePermission).mockRejectedValueOnce(new Error('forbidden'));
    await expect(svc.preview('t1', 'auth-1', 'scope-1', 'employees', { kind: 'rows', rows: [{ name: 'A' }] })).rejects.toThrow('forbidden');
    expect(scope.describe).not.toHaveBeenCalled();
    expect(tx.campDataImport.create).not.toHaveBeenCalled();
  });

  it('list: хандах эрх шалгаад зөвхөн тухайн tenant + хүрээний түүх', async () => {
    const { svc, scope, tx } = setup();
    await svc.list('t1', 'auth-1', 'scope-1');
    expect(scope.requireAccess).toHaveBeenCalledWith(tx, 't1', 'auth-1', 'scope-1');
    expect(tx.campDataImport.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', campId: 'scope-1' });
  });

  it('get / confirm / cancel: өөр хүрээ (эсвэл tenant)-ийн импорт → 404, эрхийн шалгалтад хүрэхгүй', async () => {
    const { svc, scope, tx } = setup();
    await expect(svc.get('t1', 'auth-1', 'scope-2', 'imp-1')).rejects.toMatchObject({ status: 404 });
    await expect(svc.confirm('t1', 'auth-1', 'scope-2', 'imp-1')).rejects.toMatchObject({ status: 404 });
    await expect(svc.cancel('t1', 'auth-1', 'scope-2', 'imp-1')).rejects.toMatchObject({ status: 404 });
    expect(tx.campDataImport.findFirst.mock.calls[0][0].where).toEqual({ id: 'imp-1', tenantId: 't1', campId: 'scope-2' });
    expect(scope.requirePermission).not.toHaveBeenCalled();
  });

  it('export: хандах эрх → хүрээний код файлын нэрд; бүртгэлгүй төрөл → 400', async () => {
    const { svc, calls } = setup();
    const out = await svc.export('t1', 'auth-1', 'scope-1', 'employees');
    expect(calls).toEqual(['access', 'describe', 'export:scope-1']);
    expect(out.fileName).toMatch(/^S1-employees-\d{4}-\d{2}-\d{2}\.xlsx$/);
    await expect(svc.export('t1', 'auth-1', 'scope-1', 'nope')).rejects.toMatchObject({ status: 400 });
  });
});
