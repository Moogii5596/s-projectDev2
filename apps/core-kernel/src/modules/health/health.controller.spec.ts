import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../config/app-version';
import { HealthController, resolveGitCommit } from './health.controller';

describe('resolveGitCommit', () => {
  it('Render-ийн RENDER_GIT_COMMIT-ийг давуу авна', () => {
    expect(resolveGitCommit({ RENDER_GIT_COMMIT: 'ABCDEF1234567', GIT_COMMIT: '1111111' })).toBe('abcdef1234567');
  });

  it('RENDER_GIT_COMMIT алга бол GIT_COMMIT', () => {
    expect(resolveGitCommit({ GIT_COMMIT: 'b2ebf1c8b990292599d08ae50808f5a1749eba1d' })).toBe(
      'b2ebf1c8b990292599d08ae50808f5a1749eba1d',
    );
  });

  it('алга эсвэл SHA биш утга → null', () => {
    expect(resolveGitCommit({})).toBeNull();
    expect(resolveGitCommit({ GIT_COMMIT: 'main' })).toBeNull();
    expect(resolveGitCommit({ GIT_COMMIT: '<script>' })).toBeNull();
  });
});

describe('HealthController', () => {
  it('status, version, commit, timestamp буцаана', () => {
    const res = new HealthController().check();
    expect(res.status).toBe('ok');
    expect(res.version).toBe(APP_VERSION);
    expect(res).toHaveProperty('commit');
    expect(Number.isNaN(Date.parse(res.timestamp))).toBe(false);
  });
});
