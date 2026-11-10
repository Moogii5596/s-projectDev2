import { describe, expect, it, vi } from 'vitest';
import { ScheduledJobRegistry } from './scheduled-job.registry';

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
  });
});
