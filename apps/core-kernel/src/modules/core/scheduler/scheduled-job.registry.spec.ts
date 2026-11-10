import { describe, expect, it, vi } from 'vitest';
import { ScheduledJobRegistry } from './scheduled-job.registry';

const sql = (call: unknown[]) => (call[0] as string[]).join('?');

describe('ScheduledJobRegistry', () => {
  it('allows only one overlapping execution for the same job', async () => {
    let claims = 0;
    const system = {
      $queryRaw: vi.fn(async () => (++claims === 1 ? [{ job_key: 'notification-mail' }] : [])),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const scheduler = { getCronJob: vi.fn() };
    const registry = new ScheduledJobRegistry(system as never, scheduler as never);
    registry.register({ id: 'notification-mail', module: 'core', cron: '0 * * * * *' });

    let release!: () => void;
    const running = new Promise<void>((resolve) => { release = resolve; });
    const task = vi.fn(async () => running);
    const first = registry.run('notification-mail', task);
    const second = await registry.run('notification-mail', task);

    expect(second).toEqual({ executed: false });
    expect(task).toHaveBeenCalledOnce();
    release();
    await expect(first).resolves.toEqual({ executed: true, result: undefined });
    expect(system.$executeRaw).toHaveBeenCalledOnce();
    expect(sql(system.$executeRaw.mock.calls[0])).toContain('WHERE job_key = ? AND lock_token = ?::uuid');
  });

  it('records task failure and releases only its own lease', async () => {
    const system = {
      $queryRaw: vi.fn().mockResolvedValue([{ job_key: 'notification-mail' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const registry = new ScheduledJobRegistry(system as never, { getCronJob: vi.fn() } as never);
    registry.register({ id: 'notification-mail', module: 'core', cron: '0 * * * * *' });

    await expect(registry.run('notification-mail', async () => { throw new Error('SMTP unavailable'); }))
      .rejects.toThrow('SMTP unavailable');
    expect(sql(system.$executeRaw.mock.calls[0])).toContain('last_status');
    expect(system.$executeRaw.mock.calls[0]).toContain('FAILED');
    expect(system.$executeRaw.mock.calls[0]).toContain('SMTP unavailable');
    expect(sql(system.$executeRaw.mock.calls[0])).toContain('WHERE job_key = ? AND lock_token = ?::uuid');
  });

  it('can claim a job after the previous instance lease expires', async () => {
    let attempts = 0;
    const system = {
      $queryRaw: vi.fn(async () => (++attempts === 1 ? [] : [{ job_key: 'notification-mail' }])),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const registry = new ScheduledJobRegistry(system as never, { getCronJob: vi.fn() } as never);
    registry.register({ id: 'notification-mail', module: 'core', cron: '0 * * * * *' });

    expect(await registry.run('notification-mail', async () => 'first')).toEqual({ executed: false });
    const claimSql = sql(system.$queryRaw.mock.calls[0] ?? []);
    await expect(registry.run('notification-mail', async () => 'reclaimed'))
      .resolves.toEqual({ executed: true, result: 'reclaimed' });
    expect(claimSql).toContain('lease_until <= now()');
  });
});
