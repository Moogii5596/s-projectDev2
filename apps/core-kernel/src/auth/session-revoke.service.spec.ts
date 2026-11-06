import { describe, expect, it, vi } from 'vitest';
import { SessionRevokeService } from './session-revoke.service';

const UID = '123e4567-e89b-42d3-a456-426614174000';
const SID = '223e4567-e89b-42d3-a456-426614174001';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

function setup() {
  const system = { $executeRaw: vi.fn().mockResolvedValue(1) };
  const svc = new SessionRevokeService(system as never);
  return { svc, system };
}

describe('SessionRevokeService (v0.2.3 Блок 4, PIL-15)', () => {
  it('sessionIdFromAuthHeader: Bearer JWT → payload session_id; буруу → null', () => {
    expect(SessionRevokeService.sessionIdFromAuthHeader(`Bearer ${jwt({ session_id: SID, sub: UID })}`)).toBe(SID);
    expect(SessionRevokeService.sessionIdFromAuthHeader(`Bearer ${jwt({ sub: UID })}`)).toBeNull();
    expect(SessionRevokeService.sessionIdFromAuthHeader('Bearer not-a-jwt')).toBeNull();
    expect(SessionRevokeService.sessionIdFromAuthHeader(undefined)).toBeNull();
    expect(SessionRevokeService.sessionIdFromAuthHeader('Token abc')).toBeNull();
  });

  it('revokeOthers: auth.sessions-ээс keep-ээс бусдыг устгана; буруу authId → 아무 cũng хийхгүй', async () => {
    const { svc, system } = setup();
    await svc.revokeOthers(UID, SID);
    const sql = (system.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('DELETE FROM auth.sessions');
    expect(sql).toContain('id <>');
    expect(system.$executeRaw.mock.calls[0][2]).toBe(SID); // keep SessionId параметр
    await svc.revokeOthers('not-a-uuid', SID);
    expect(system.$executeRaw).toHaveBeenCalledTimes(2); // зөвхөн эхнийх + refresh cleanup
  });

  it('revokeAll: keep=null → бүх session; DB alдаa → зогсоохгүй (log)', async () => {
    const { svc, system } = setup();
    await svc.revokeAll(UID);
    const sql = (system.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('DELETE FROM auth.sessions');
    expect(system.$executeRaw.mock.calls[0][2]).toBeNull(); // keep=null → бүгд
    system.$executeRaw.mockRejectedValueOnce(new Error('auth schema алга'));
    await expect(svc.revokeAll(UID)).resolves.toBeUndefined();
  });
});
