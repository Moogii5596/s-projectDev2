import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalEngineService } from './approval-engine.service';
import { ApprovalEntityRegistry } from './approval-entity.registry';
import { normalizeApprovalSteps, stepsForAmount, approvalDenialCode, type ApprovalActorPerms } from './approval-steps';

type Log = { stepOrder: number; actorId: string; onBehalfOf: string | null; action: string };

const USERS: Record<string, { role: string; perms?: Array<{ campId: string | null; permissionCode: string }> }> = {
  req: { role: 'REQUESTER' },
  reqAllowed: { role: 'REQUESTER', perms: [{ campId: 's1', permissionCode: 'mr.request.approve' }] },
  a1: { role: 'REQUESTER', perms: [{ campId: 's1', permissionCode: 'mr.request.approve' }] },
  a2: { role: 'REQUESTER', perms: [{ campId: null, permissionCode: 'mr.request.approve' }] },
  other: { role: 'REQUESTER', perms: [{ campId: 's2', permissionCode: 'mr.request.approve' }] },
  admin: { role: 'ADMIN' },
  deleg: { role: 'VIEWER' },
};

function setup(opts: { steps?: unknown; delegation?: boolean; status?: string; current?: number; requesterId?: string } = {}) {
  const logs: Log[] = [];
  const instance = {
    id: 'i1', entity_type: 'MATERIAL_REQUISITION', entity_id: 'e1', status: opts.status ?? 'PENDING', current_step: opts.current ?? 0,
    resolved_steps: opts.steps ?? [{ order: 0, permission: 'mr.request.approve', quorum: 1 }],
    requester_id: opts.requesterId ?? 'req', site_id: 's1', title: 'MR-1', link: '/debug/modules/mr/e1', sla_hours: 24, delegation_enabled: opts.delegation ?? false,
  };
  const tx = {
    $queryRaw: vi.fn(async () => [instance]),
    workflowStepLog: {
      findFirst: vi.fn(async ({ where }: { where: Partial<Log> }) => logs.find((l) => l.actorId === where.actorId && l.action === where.action && l.stepOrder === where.stepOrder) ?? null),
      create: vi.fn(async ({ data }: { data: Log }) => { logs.push({ ...data, onBehalfOf: data.onBehalfOf ?? null }); return data; }),
      findMany: vi.fn(async ({ where }: { where: Partial<Log> }) => logs.filter((l) => l.stepOrder === where.stepOrder && l.action === where.action)),
      count: vi.fn(async ({ where }: { where: { stepOrder: { lt: number }; OR: Array<{ actorId?: string; onBehalfOf?: string | null }> } }) =>
        logs.filter((l) => l.action === 'APPROVED' && l.stepOrder < where.stepOrder.lt && where.OR.some((o) => (o.actorId ? l.actorId === o.actorId && l.onBehalfOf === null : l.onBehalfOf === o.onBehalfOf))).length),
    },
    workflowInstance: { update: vi.fn(async ({ data }: { data: { status?: string; currentStep?: number } }) => { Object.assign(instance, { status: data.status ?? instance.status, current_step: data.currentStep ?? instance.current_step }); }) },
    workflowSlaLog: { updateMany: vi.fn(), create: vi.fn() },
    workflowDelegation: { findMany: vi.fn(async ({ where }: { where: { delegateId: string } }) => (where.delegateId === 'deleg' ? [{ delegatorId: 'a2' }] : [])) },
    coreUser: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (USERS[where.id] ? { id: where.id, role: USERS[where.id].role, fullName: where.id, email: `${where.id}@x` } : null)),
      findMany: vi.fn(async () => [{ id: 'admin' }]),
    },
    coreUserPermission: { findMany: vi.fn(async ({ where }: { where: { userId: string } }) => USERS[where.userId]?.perms ?? []) },
  };
  const registry = new ApprovalEntityRegistry();
  const onStep = vi.fn();
  const onFinal = vi.fn();
  registry.register({ entityType: 'MATERIAL_REQUISITION', module: 'mr', labelKey: 'approval.entity.mr', approvePermissions: ['mr.request.approve'], onStep, onFinal });
  const notifications = { notify: vi.fn().mockResolvedValue(1) };
  const engine = new ApprovalEngineService(registry, notifications as never);
  return { engine, tx, logs, instance, onStep, onFinal, notifications };
}

const decide = (s: ReturnType<typeof setup>, actorId: string, action: 'APPROVED' | 'REJECTED' = 'APPROVED') =>
  s.engine.decide(s.tx as never, 't1', { instanceId: 'i1', actorId, action, comment: 'ok' });

describe('ApprovalEngineService (WF-06)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('эрх тухайн ажлын байранд → батлана, урсгал дуусч onFinal + хүсэгчид мэдэгдэл', async () => {
    const r = await decide(s, 'a1');
    expect(r).toMatchObject({ changed: true, final: true, status: 'APPROVED', currentStep: 1, totalSteps: 1 });
    expect(s.onFinal).toHaveBeenCalledWith(s.tx, expect.objectContaining({ status: 'APPROVED', actorId: 'a1', entityId: 'e1' }));
    expect(s.notifications.notify).toHaveBeenCalledWith(s.tx, 't1', expect.objectContaining({ type: 'core.approval.decided', recipients: ['req'] }));
  });

  it('өөр ажлын байрны эрх, эрхгүй хэрэглэгч, хүсэгч өөрөө → 403', async () => {
    await expect(decide(s, 'other')).rejects.toMatchObject({ status: 403 });
    await expect(decide(s, 'deleg')).rejects.toMatchObject({ status: 403 });
    await expect(decide(s, 'req')).rejects.toMatchObject({ status: 403 });
    expect(s.logs).toHaveLength(0);
  });

  it('урсгал хүсэгч өөрөө зөвшөөрсөн үед тухайн хүсэгч эрхийн шалгалтаа давж батална', async () => {
    s = setup({
      requesterId: 'reqAllowed',
      steps: [{ order: 0, permission: 'mr.request.approve', quorum: 1, allowRequester: true }],
    });
    await expect(decide(s, 'reqAllowed')).resolves.toMatchObject({ final: true, status: 'APPROVED' });
    await expect(decide(setup({
      requesterId: 'req',
      steps: [{ order: 0, permission: 'mr.request.approve', quorum: 1, allowRequester: true }],
    }), 'req')).rejects.toMatchObject({ status: 403 });
  });

  it('quorum 2 (зэрэгцээ): эхний батлалтаар алхам хэвээр, давтан батлалт idempotent, 2 дахь хүнээр дараагийн алхам', async () => {
    s = setup({ steps: [{ order: 0, permission: 'mr.request.approve', quorum: 2 }, { order: 1, role: 'ADMIN', quorum: 1 }] });
    expect(await decide(s, 'a1')).toMatchObject({ changed: true, final: false, currentStep: 0 });
    expect(await decide(s, 'a1')).toMatchObject({ changed: false });
    expect(await decide(s, 'a2')).toMatchObject({ changed: true, final: false, currentStep: 1 });
    expect(s.notifications.notify).toHaveBeenCalledWith(s.tx, 't1', expect.objectContaining({ type: 'core.approval.requested', recipients: ['admin'] }));
    // 1-р алхмыг баталсан хүн 2-р алхмыг батлахгүй (admin override байсан ч)
    await expect(decide(s, 'a1')).rejects.toMatchObject({ status: 403 });
    expect(await decide(s, 'admin')).toMatchObject({ final: true, status: 'APPROVED' });
  });

  it('татгалзвал шууд REJECTED; дуусцан урсгалд дахин шийдвэр 409', async () => {
    expect(await decide(s, 'a2', 'REJECTED')).toMatchObject({ final: true, status: 'REJECTED' });
    expect(s.onFinal).toHaveBeenCalledWith(s.tx, expect.objectContaining({ status: 'REJECTED' }));
    await expect(decide(s, 'a1')).rejects.toMatchObject({ status: 409 });
  });

  it('орлон гүйцэтгэгч: зөвхөн delegation идэвхтэй урсгалд, эзний өмнөөс тоологдоно', async () => {
    await expect(decide(s, 'deleg')).rejects.toMatchObject({ status: 403 });
    s = setup({ delegation: true });
    expect(await decide(s, 'deleg')).toMatchObject({ final: true });
    expect(s.logs[0]).toMatchObject({ actorId: 'deleg', onBehalfOf: 'a2' });
  });
});

describe('approval-steps (WF-06)', () => {
  it('хуучин role алхам, шинэ permission алхмыг уншина; хоосон бол fallback', () => {
    expect(normalizeApprovalSteps([{ order: 1, role: 'ADMIN' }, { order: 0, permission: 'mr.request.approve', quorum: 2 }])).toEqual([
      { order: 0, permission: 'mr.request.approve', quorum: 2 },
      { order: 1, role: 'ADMIN', quorum: 1 },
    ]);
    expect(normalizeApprovalSteps(null)).toEqual([{ order: 0, role: 'APPROVER', quorum: 1 }]);
    expect(normalizeApprovalSteps({ amount_rules: [] })).toHaveLength(1);
  });

  it('дүнгийн нөхцөл: хүрээнд байгаа алхам л үлдэнэ', () => {
    const steps = [
      { order: 0, permission: 'p.a.b', quorum: 1 },
      { order: 1, permission: 'p.a.c', quorum: 1, minAmount: 1_000_000 },
    ];
    expect(stepsForAmount(steps, 500_000).map((x) => x.permission)).toEqual(['p.a.b']);
    expect(stepsForAmount(steps, 2_000_000).map((x) => x.permission)).toEqual(['p.a.b', 'p.a.c']);
    expect(stepsForAmount(steps, null)).toHaveLength(2);
  });

  it('OWNER/ADMIN override, хүсэгч өөрөө хориотой', () => {
    const admin: ApprovalActorPerms = { id: 'x', role: 'OWNER', global: [], bySite: {} };
    expect(approvalDenialCode(admin, 'y', { order: 0, permission: 'p.a.b', quorum: 1 }, null)).toBeNull();
    expect(approvalDenialCode(admin, 'x', { order: 0, permission: 'p.a.b', quorum: 1 }, null)).toBe('core.approvals.self');
  });
});
