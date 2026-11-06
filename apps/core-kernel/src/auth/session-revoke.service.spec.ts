import { describe, expect, it, vi } from 'vitest';
import { SessionRevokeService } from './session-revoke.service';

const UID = '123e4567-e89b-42d3-a456-426614174000';
const SID = '223e4567-e89b-42d3-a456-426614174001';
const OTHER = '423e4567-e89b-42d3-a456-426614174003';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

function setup(deleted: { id: string }[] = [{ id: OTHER }]) {
  const system = {
    $queryRaw: vi.fn().mockResolvedValue(deleted),
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const svc = new SessionRevokeService(system as never);
  return { svc, system };
}
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

describe('SessionRevokeService (v0.2.3 Блок 4б, PIL-15)', () => {
  it('bearerToken / sessionIdFromAuthHeader: Bearer JWT → session_id; буруу → null', () => {
    expect(SessionRevokeService.bearerToken('Bearer abc')).toBe('abc');
    expect(SessionRevokeService.bearerToken('Token abc')).toBeNull();
    expect(SessionRevokeService.bearerToken(undefined)).toBeNull();
    expect(SessionRevokeService.sessionIdFromAuthHeader(`Bearer ${jwt({ session_id: SID, sub: UID })}`)).toBe(SID);
    expect(SessionRevokeService.sessionIdFromAuthHeader(`Bearer ${jwt({ sub: UID })}`)).toBeNull();
    expect(SessionRevokeService.sessionIdFromAuthHeader(`Bearer ${jwt({ session_id: 'not-uuid' })}`)).toBeNull();
    expect(SessionRevokeService.sessionIdFromAuthHeader('Bearer not-a-jwt')).toBeNull();
  });

  describe('list', () => {
    it('to_jsonb мөрөөс талбар авна; одоогийн төхөөрөмж тэмдэглэгдэнэ; сүүлд ашигласан нь эхэнд; багана байхгүй хувилбарт null', async () => {
      const { svc, system } = setup();
      system.$queryRaw.mockResolvedValueOnce([
        { r: { id: OTHER, created_at: '2026-11-01T01:00:00Z', updated_at: '2026-11-02T01:00:00Z' } },
        { r: { id: SID, created_at: '2026-11-01T01:00:00Z', refreshed_at: '2026-11-07T01:00:00Z', user_agent: 'Mozilla/5.0 Chrome/130', ip: '10.0.0.5' } },
      ]);
      const out = await svc.list(UID, SID);
      expect(sqlOf(system.$queryRaw.mock.calls[0])).toContain('to_jsonb');
      expect(out.map((d) => d.id)).toEqual([SID, OTHER]);
      expect(out[0]).toMatchObject({ current: true, userAgent: 'Mozilla/5.0 Chrome/130', ip: '10.0.0.5', lastActiveAt: '2026-11-07T01:00:00Z' });
      expect(out[1]).toMatchObject({ current: false, userAgent: null, ip: null, lastActiveAt: '2026-11-02T01:00:00Z' });
    });
    it('буруу authId → хоосон (DB-д хүрэхгүй)', async () => {
      const { svc, system } = setup();
      expect(await svc.list('x', SID)).toEqual([]);
      expect(system.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('revokeOne', () => {
    it('нэг session-ыг өөрийн user_id-аар устгана', async () => {
      const { svc, system } = setup();
      await svc.revokeOne(UID, OTHER, SID);
      const call = system.$queryRaw.mock.calls[0];
      expect(sqlOf(call)).toContain('DELETE FROM auth.sessions');
      expect(sqlOf(call)).toContain('user_id =');
      expect(call).toContain(UID);
      expect(call).toContain(OTHER);
    });
    it('одоогийн төхөөрөмж → 400 auth.session_current (DB-д хүрэхгүй)', async () => {
      const { svc, system } = setup();
      await expect(svc.revokeOne(UID, SID, SID)).rejects.toMatchObject({ status: 400, code: 'auth.session_current' });
      expect(system.$queryRaw).not.toHaveBeenCalled();
    });
    it('олдсонгүй / өөр хүний / буруу id → 404', async () => {
      const { svc } = setup([]);
      await expect(svc.revokeOne(UID, OTHER, SID)).rejects.toMatchObject({ status: 404, code: 'auth.session_not_found' });
      await expect(svc.revokeOne(UID, 'bad-id', SID)).rejects.toMatchObject({ status: 404 });
    });
    it('DB алдаа → 503 (хэрэглэгчийн шууд үйлдэл тул нууж болохгүй)', async () => {
      const { svc, system } = setup();
      system.$queryRaw.mockRejectedValueOnce(new Error('boom'));
      await expect(svc.revokeOne(UID, OTHER, SID)).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('revokeOthers / revokeAll / dropQuietly', () => {
    it('revokeOthers: одоогийнхоос бусдыг устгаж тоог буцаана', async () => {
      const { svc, system } = setup([{ id: OTHER }, { id: '523e4567-e89b-42d3-a456-426614174004' }]);
      expect(await svc.revokeOthers(UID, SID)).toBe(2);
      expect(sqlOf(system.$queryRaw.mock.calls[0])).toContain('id <>');
      expect(system.$queryRaw.mock.calls[0]).toContain(SID);
    });
    it('revokeAll: хязгаарлалтгүй; DB алдаа → зогсоохгүй (log)', async () => {
      const { svc, system } = setup();
      await svc.revokeAll(UID);
      expect(system.$queryRaw.mock.calls[0].slice(1)).toEqual([UID, null, null, null, null]);
      system.$queryRaw.mockRejectedValueOnce(new Error('auth schema алга'));
      await expect(svc.revokeAll(UID)).resolves.toBeUndefined();
    });
    it('dropQuietly: sessionId null → юу ч хийхгүй; алдаа → зогсоохгүй', async () => {
      const { svc, system } = setup();
      await svc.dropQuietly(UID, null);
      expect(system.$queryRaw).not.toHaveBeenCalled();
      system.$queryRaw.mockRejectedValueOnce(new Error('x'));
      await expect(svc.dropQuietly(UID, OTHER)).resolves.toBeUndefined();
    });
    it('refresh token цэвэрлэгээний алдаа устгалтыг зогсоохгүй', async () => {
      const { svc, system } = setup();
      system.$executeRaw.mockRejectedValueOnce(new Error('no table'));
      await expect(svc.revokeOthers(UID, SID)).resolves.toBe(1);
    });
  });
});
