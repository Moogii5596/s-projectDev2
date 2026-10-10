/**
 * Phase 3.6.4 — Cluster crash-loop backoff
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ClusterWorkerLike,
  DEFAULT_RESTART_POLICY,
  RestartPolicy,
  resolveRestartPolicyOptions,
  startClusterPrimary,
} from './cluster-restart';

const OPTS = { baseDelayMs: 1_000, maxDelayMs: 30_000, windowMs: 60_000 };

describe('RestartPolicy', () => {
  it('эхний унасан → 0ms; цонх дотор давтагдвал 1с, 2с, 4с … 30с-ээр таслана', () => {
    let t = 0;
    const p = new RestartPolicy(OPTS, () => t);
    const delays: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      delays.push(p.nextDelayMs());
      t += 100;
    }
    expect(delays).toEqual([0, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(p.recentExits()).toBe(8);
  });

  it('цонх (60с) өнгөрсөн унасан тоологдохгүй → дахин 0ms', () => {
    let t = 0;
    const p = new RestartPolicy(OPTS, () => t);
    p.nextDelayMs();
    t = 1_000;
    expect(p.nextDelayMs()).toBe(1_000);
    t = 61_001; // хоёулаа цонхноос гарсан
    expect(p.nextDelayMs()).toBe(0);
    expect(p.recentExits()).toBe(1);
  });

  it('маш олон унасан ч Infinity/NaN болохгүй (maxDelayMs)', () => {
    const p = new RestartPolicy(OPTS, () => 0);
    let last = 0;
    for (let i = 0; i < 200; i += 1) last = p.nextDelayMs();
    expect(last).toBe(30_000);
  });
});

describe('resolveRestartPolicyOptions', () => {
  it('env байхгүй → default', () => {
    expect(resolveRestartPolicyOptions({})).toEqual(DEFAULT_RESTART_POLICY);
  });

  it('env-ээс уншина; буруу утга (0, сөрөг, бутархай, текст) → default; max < base → base', () => {
    expect(
      resolveRestartPolicyOptions({ CLUSTER_RESTART_BASE_MS: '500', CLUSTER_RESTART_MAX_MS: '5000', CLUSTER_RESTART_WINDOW_MS: '10000' }),
    ).toEqual({ baseDelayMs: 500, maxDelayMs: 5_000, windowMs: 10_000 });
    expect(
      resolveRestartPolicyOptions({ CLUSTER_RESTART_BASE_MS: '0', CLUSTER_RESTART_MAX_MS: '-1', CLUSTER_RESTART_WINDOW_MS: '1.5' }),
    ).toEqual(DEFAULT_RESTART_POLICY);
    expect(resolveRestartPolicyOptions({ CLUSTER_RESTART_BASE_MS: 'abc' }).baseDelayMs).toBe(1_000);
    expect(resolveRestartPolicyOptions({ CLUSTER_RESTART_BASE_MS: '60000' }).maxDelayMs).toBe(60_000);
  });
});

describe('startClusterPrimary', () => {
  const setup = () => {
    const handlers: Record<string, (...a: unknown[]) => void> = {};
    const c = {
      fork: vi.fn(),
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        handlers[event] = cb;
      }),
    };
    const deps = { schedule: vi.fn(), log: vi.fn(), warn: vi.fn() };
    let t = 0;
    const policy = new RestartPolicy(OPTS, () => t);
    startClusterPrimary(c as never, 3, policy, deps);
    const exit = (w: ClusterWorkerLike, code: number | null = 1, signal: string | null = null) => handlers.exit(w, code, signal);
    return { c, deps, handlers, exit, tick: (ms: number) => (t += ms) };
  };

  it('N worker fork; online лог cluster-check.ts-ийн regex-д таарна', () => {
    const { c, deps, handlers } = setup();
    expect(c.fork).toHaveBeenCalledTimes(3);
    handlers.online({ process: { pid: 42 } });
    expect(deps.log).toHaveBeenCalledWith('Worker 42 online');
    expect(/Worker (\d+) online/.exec(deps.log.mock.calls[0][0])?.[1]).toBe('42');
  });

  it('ганц унасан → шууд fork ("died" лог); давтагдвал schedule-ээр хойшлуулна', () => {
    const { c, deps, exit, tick } = setup();
    c.fork.mockClear();
    exit({ process: { pid: 7 } }, null, 'SIGKILL');
    expect(c.fork).toHaveBeenCalledTimes(1);
    expect(deps.schedule).not.toHaveBeenCalled();
    expect(deps.warn.mock.calls[0][0]).toMatch(/^Worker 7 died \(signal SIGKILL\) — restarting$/);

    tick(100);
    exit({ process: { pid: 8 } }, 1);
    expect(c.fork).toHaveBeenCalledTimes(1); // шууд биш
    expect(deps.schedule).toHaveBeenCalledTimes(1);
    expect(deps.schedule.mock.calls[0][1]).toBe(1_000);
    expect(deps.warn.mock.calls[1][0]).toMatch(/^Worker 8 died \(code 1\) — restarting in 1000ms/);
    deps.schedule.mock.calls[0][0]();
    expect(c.fork).toHaveBeenCalledTimes(2);
  });

  it('disconnect-ээр санаатай зогсоосон worker → дахин асаахгүй, policy-д тоологдохгүй', () => {
    const { c, deps, exit } = setup();
    c.fork.mockClear();
    exit({ process: { pid: 9 }, exitedAfterDisconnect: true }, 0);
    expect(c.fork).not.toHaveBeenCalled();
    expect(deps.schedule).not.toHaveBeenCalled();
    exit({ process: { pid: 10 } }, 1); // дараагийн бодит унасан нь "эхний" хэвээр → шууд
    expect(c.fork).toHaveBeenCalledTimes(1);
  });
});
