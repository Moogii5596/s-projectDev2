import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGN_IN_LIMITS, SignInService, clientIpOf } from './sign-in.service';
import { DEFAULT_TENANT_SECURITY_POLICY } from './tenant-security-policy.service';

const session = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, expires_at: 99, token_type: 'bearer' };

/** LoginLockService-ийн санах ойн хувилбар (SQL-ийн бодит дүрэм → test/auth-login-lock.integration.spec.ts) */
function fakeLoginLock(maxFailures: number, gotrueHook = false) {
  const fails = new Map<string, number>();
  const locked = new Map<string, Date>();
  return {
    rules: { maxFailures, windowMinutes: 15, lockMinutes: 15, gotrueHook },
    lockedUntil: vi.fn(async (id: string) => { const u = locked.get(id); return u && u.getTime() > Date.now() ? u : null; }),
    recordFailure: vi.fn(async (id: string) => {
      const n = (fails.get(id) ?? 0) + 1;
      fails.set(id, n);
      if (n < maxFailures) return null;
      const u = new Date(Date.now() + 15 * 60_000);
      locked.set(id, u);
      return u;
    }),
    reset: vi.fn(async (id: string) => { fails.delete(id); locked.delete(id); }),
  };
}

function setup(opts: { tenantId?: string | null; rows?: Record<string, unknown[]>; lockMax?: number; gotrueHook?: boolean } = {}) {
  const signInWithPassword = vi.fn();
  const updateUserById = vi.fn().mockResolvedValue({ error: null });
  const gotrue = { auth: { signInWithPassword, admin: { updateUserById } } };
  const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    const rows = opts.rows ?? {};
    if (sql.includes('lower(email)')) return rows.email ?? [];
    if (sql.includes('phone =')) return rows.phone ?? [];
    if (sql.includes('username =')) return rows.username ?? [];
    if (sql.includes('SELECT id, email FROM core_users')) return rows.self ?? [];
    return [];
  });
  const system = { $queryRaw: queryRaw, $executeRaw: vi.fn().mockResolvedValue(1) };
  const tenantCache = { getTenantId: vi.fn().mockResolvedValue(opts.tenantId === undefined ? 't1' : opts.tenantId), invalidateMember: vi.fn() };
  const securityPolicy = { get: vi.fn().mockResolvedValue(DEFAULT_TENANT_SECURITY_POLICY) };
  const counters = new Map<string, number>();
  const redis = {
    get: vi.fn(async (k: string) => (counters.has(k) ? String(counters.get(k)) : null)),
    incr: vi.fn(async (k: string) => { const n = (counters.get(k) ?? 0) + 1; counters.set(k, n); return n; }),
    pexpire: vi.fn(),
    del: vi.fn(async (k: string) => { counters.delete(k); return 1; }),
  };
  const config = { get: (k: string) => ({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: 'sino' } as Record<string, string>)[k] };
  const sessions = { dropQuietly: vi.fn().mockResolvedValue(undefined), revokeAll: vi.fn().mockResolvedValue(undefined) };
  const loginLock = fakeLoginLock(opts.lockMax ?? 5, opts.gotrueHook);
  const svc = new SignInService(config as never, system as never, tenantCache as never, securityPolicy as never, loginLock as never, redis as never, () => gotrue as never, sessions as never);
  return { svc, signInWithPassword, updateUserById, queryRaw, system, tenantCache, securityPolicy, redis, sessions, loginLock };
}

const userRow = (over: Record<string, unknown> = {}) => ({ auth_id: 'auth-1', email: 'bat@sino.mn', must_change_password: false, ...over });
const baseRows = () => ({ phone: [userRow()], email: [userRow()], username: [userRow({ auth_id: 'auth-2', email: 'p99@x.login.invalid' })] });
/** Redis-ийн нэр/IP хязгаарын тест: бүртгэлийн түгжээ (5) эрт үйлчлэхгүй */
const noAccountLock = () => setup({ rows: baseRows(), lockMax: 1000 });

describe('SignInService (v0.2.2 D-10)', () => {
  let s: ReturnType<typeof setup>;

  describe('signIn', () => {
    beforeEach(() => {
      s = setup({ rows: baseRows() });
    });

    it('утас → тухайн хэрэглэгчийн auth имэйлээр GoTrue → session + mustChangePassword', async () => {
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-1' } }, error: null });
      const r = await s.svc.signIn('any.host', '1.2.3.4', '+976 9911-2233', 'pw');
      expect(s.signInWithPassword).toHaveBeenCalledWith({ email: 'bat@sino.mn', password: 'pw' });
      expect(r).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, expiresAt: 99, tokenType: 'bearer', mustChangePassword: false });
      expect(s.tenantCache.getTenantId).toHaveBeenCalledWith('sino'); // dedicated → Host үл хамаарна
      // PIL-16: амжилттай нэвтрэлт → last_sign_in_at
      expect((s.system.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('last_sign_in_at = now()');
    });

    it('username (жижиг үсэг) ба имэйл (жижиг үсэг) замаар', async () => {
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-2' } }, error: null });
      await s.svc.signIn(undefined, undefined, 'SH1023', 'pw');
      expect(s.signInWithPassword).toHaveBeenLastCalledWith({ email: 'p99@x.login.invalid', password: 'pw' });
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-1' } }, error: null });
      await s.svc.signIn(undefined, undefined, 'Bat@Sino.MN', 'pw');
      expect(s.signInWithPassword).toHaveBeenLastCalledWith({ email: 'bat@sino.mn', password: 'pw' });
    });

    it('тоон username: утсаар олдохгүй бол username-аар', async () => {
      s = setup({ rows: { phone: [], username: [userRow({ auth_id: 'auth-3', email: 'e@x' })] } });
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-3' } }, error: null });
      await s.svc.signIn(undefined, undefined, '10234567', 'pw');
      expect(s.signInWithPassword).toHaveBeenCalledWith({ email: 'e@x', password: 'pw' });
    });

    it('байхгүй хэрэглэгч → GoTrue-г хуурамч .invalid хаягаар дуудаад ИЖИЛ 401 (задруулахгүй)', async () => {
      s = setup({ rows: {} });
      s.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { status: 400, message: 'Invalid login credentials' } });
      await expect(s.svc.signIn(undefined, undefined, '88112233', 'pw')).rejects.toMatchObject({ status: 401, code: 'auth.invalid_credentials' });
      expect(s.signInWithPassword.mock.calls[0][0].email).toMatch(/^nouser-[0-9a-f]{32}@login\.invalid$/);
      // буруу нууц үг (хэрэглэгч байгаа) → яг ижил алдаа
      s = setup({ rows: { phone: [userRow()] } });
      s.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { status: 400, message: 'Invalid login credentials' } });
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401, code: 'auth.invalid_credentials' });
    });

    it('tenant олдохгүй → 401 (GoTrue хуурамч дуудлагатай)', async () => {
      s = setup({ tenantId: null });
      s.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { status: 400, message: 'x' } });
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 401 });
      expect(s.queryRaw).not.toHaveBeenCalled();
    });

    it('GoTrue түгжээ (429) → 429; 5xx / сүлжээ → 503', async () => {
      s.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 429, message: 'locked' } });
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 429, code: 'auth.too_many_attempts' });
      s.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 500, message: 'x' } });
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 503 });
      s.signInWithPassword.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 503 });
      // supabase-js: GoTrue унтарсан → throw биш, AuthRetryableFetchError (status 0) — "нууц үг буруу" гэж харуулахгүй
      s.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } });
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 503 });
    });

    it('#27: captchaToken-ийг GoTrue-д дамжуулна; captcha_failed → 400 auth.captcha_failed, тоолохгүй', async () => {
      s = setup({ rows: baseRows() });
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-1' } }, error: null });
      await s.svc.signIn(undefined, undefined, '99112233', 'pw', 'tok-1');
      expect(s.signInWithPassword).toHaveBeenCalledWith({ email: 'bat@sino.mn', password: 'pw', options: { captchaToken: 'tok-1' } });
      s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed' } });
      for (let i = 0; i < 6; i++) {
        await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 400, code: 'auth.captcha_failed' });
      }
      expect(s.loginLock.recordFailure).not.toHaveBeenCalled();
      expect(s.redis.incr).not.toHaveBeenCalled();
    });

    it('session өөр хэрэглэгчийнх (байх ёсгүй) → токен өгөхгүй 401', async () => {
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'someone-else' } }, error: null });
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 401 });
    });

    it('хязгаар: нэг нэвтрэх нэрээр 10 АМЖИЛТГҮЙ → 429 (GoTrue дуудахгүй); формат өөр ч ижил тоолуур', async () => {
      s = noAccountLock();
      s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: 'x' } });
      for (let i = 0; i < SIGN_IN_LIMITS.identifier.limit; i++) {
        await expect(s.svc.signIn(undefined, `10.0.0.${i}`, i % 2 ? '99112233' : '+976 9911 2233', 'bad')).rejects.toMatchObject({ status: 401 });
      }
      const calls = s.signInWithPassword.mock.calls.length;
      await expect(s.svc.signIn(undefined, '10.0.0.99', '99-11-22-33', 'pw')).rejects.toMatchObject({ status: 429 });
      expect(s.signInWithPassword.mock.calls.length).toBe(calls);
    });

    it('хязгаар: нэг IP-ээс 50 АМЖИЛТГҮЙ (өөр өөр нэрээр) → 429', async () => {
      s = noAccountLock();
      s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: 'x' } });
      for (let i = 0; i < SIGN_IN_LIMITS.ip.limit; i++) await s.svc.signIn(undefined, '5.5.5.5', `user${i}`, 'x').catch(() => undefined);
      await expect(s.svc.signIn(undefined, '5.5.5.5', 'other', 'x')).rejects.toMatchObject({ status: 429 });
    });

    it('tenant-ийн оролдлогын босго ба түгжээний хугацааг хэрэглэнэ', async () => {
      s.securityPolicy.get.mockResolvedValue({
        ...DEFAULT_TENANT_SECURITY_POLICY,
        loginFailureLimit: 3,
        loginLockoutMinutes: 2,
      });
      s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: 'x' } });
      for (let i = 0; i < 3; i++) await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401 });
      expect(s.redis.pexpire).toHaveBeenCalledWith(expect.stringContaining('signin:fail:id:'), 120_000);
      await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 429 });
    });

    it('амжилттай нэвтрэлт тоологдохгүй: нэг WiFi-аас 100 хүн, нэг хүн 30 удаа → 429 гарахгүй; амжилт тоолуурыг тэглэнэ', async () => {
      s = noAccountLock();
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-1' } }, error: null });
      for (let i = 0; i < 100; i++) await expect(s.svc.signIn(undefined, '5.5.5.5', '99112233', 'pw')).resolves.toBeTruthy();
      s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: 'x' } });
      for (let i = 0; i < 9; i++) await s.svc.signIn(undefined, undefined, '99112233', 'bad').catch(() => undefined);
      s.signInWithPassword.mockResolvedValueOnce({ data: { session, user: { id: 'auth-1' } }, error: null });
      await s.svc.signIn(undefined, undefined, '99112233', 'pw'); // тэглэнэ
      for (let i = 0; i < 9; i++) await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401 });
    });

    describe('бүртгэлийн түгжээ (v0.2.5 H1 #16)', () => {
      const bad = () => s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: 'x' } });
      const ok = () => s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-1' } }, error: null });

      it('5 буруу → 5 дахь нь 429 auth.account_locked (minutes, until); дараа нь зөв нууц үгтэй ч 429, GoTrue дуудахгүй', async () => {
        bad();
        for (let i = 0; i < 4; i++) await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401 });
        const err: unknown = await s.svc.signIn(undefined, undefined, '99112233', 'bad').catch((e: unknown) => e);
        expect(err).toMatchObject({ status: 429, code: 'auth.account_locked', params: { minutes: 15 } });
        expect(Date.parse(String((err as { params: Record<string, unknown> }).params.until))).toBeGreaterThan(Date.now());
        expect(s.loginLock.recordFailure).toHaveBeenCalledWith('auth-1');
        ok();
        const calls = s.signInWithPassword.mock.calls.length;
        await expect(s.svc.signIn(undefined, undefined, '99112233', 'right')).rejects.toMatchObject({ status: 429, code: 'auth.account_locked' });
        expect(s.signInWithPassword.mock.calls.length).toBe(calls);
      });

      it('зөв нэвтрэлт тоолуурыг тэглэнэ (4 буруу → зөв → дахин 4 буруу = түгжихгүй)', async () => {
        bad();
        for (let i = 0; i < 4; i++) await s.svc.signIn(undefined, undefined, '99112233', 'bad').catch(() => undefined);
        ok();
        await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).resolves.toMatchObject({ accessToken: 'at' });
        expect(s.loginLock.reset).toHaveBeenCalledWith('auth-1');
        bad();
        for (let i = 0; i < 4; i++) await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401 });
      });

      it('байхгүй хэрэглэгч → бүртгэлийн тоолуурт хүрэхгүй (ИЖИЛ 401)', async () => {
        s = setup({ rows: {} });
        bad();
        await expect(s.svc.signIn(undefined, undefined, '88112233', 'bad')).rejects.toMatchObject({ status: 401 });
        expect(s.loginLock.lockedUntil).not.toHaveBeenCalled();
        expect(s.loginLock.recordFailure).not.toHaveBeenCalled();
      });

      it('AUTH_LOCK_GOTRUE_HOOK=true → NestJS тоолохгүй (hook тоолно), шалгалт хэвээр', async () => {
        s = setup({ rows: baseRows(), gotrueHook: true });
        bad();
        await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401 });
        expect(s.loginLock.lockedUntil).toHaveBeenCalledWith('auth-1');
        expect(s.loginLock.recordFailure).not.toHaveBeenCalled();
      });

      it('түгжээ шалгах DB алдаа → 503 (fail-closed); тоолох алдаа → 401 хэвээр', async () => {
        s.loginLock.lockedUntil.mockRejectedValueOnce(new Error('db down'));
        ok();
        await expect(s.svc.signIn(undefined, undefined, '99112233', 'pw')).rejects.toMatchObject({ status: 503 });
        s.loginLock.recordFailure.mockRejectedValueOnce(new Error('db down'));
        bad();
        await expect(s.svc.signIn(undefined, undefined, '99112233', 'bad')).rejects.toMatchObject({ status: 401 });
      });
    });

    it('Redis алдаа → fail-open (нэвтрэлт ажиллана)', async () => {
      s.redis.incr.mockRejectedValue(new Error('redis down'));
      s.redis.get.mockRejectedValue(new Error('redis down'));
      s.redis.del.mockRejectedValue(new Error('redis down'));
      s.signInWithPassword.mockResolvedValue({ data: { session, user: { id: 'auth-1' } }, error: null });
      await expect(s.svc.signIn(undefined, '1.1.1.1', '99112233', 'pw')).resolves.toMatchObject({ accessToken: 'at' });
    });
  });

  describe('changePassword (D-06, PIL-15 D-1)', () => {
    const VERIFY_SID = '323e4567-e89b-42d3-a456-426614174002';
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const verifySession = { ...session, access_token: `${b64({ alg: 'HS256' })}.${b64({ session_id: VERIFY_SID })}.sig` };
    const fetchMock = vi.fn();

    beforeEach(() => {
      s = setup({ rows: { self: [{ id: 'cu1', email: 'bat@sino.mn' }] } });
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('хэрэглэгчийн өөрийн токеноор PUT /auth/v1/user → must_change_password = false → cache цэвэрлэнэ; бусад session-д хүрэхгүй', async () => {
      s.signInWithPassword.mockResolvedValue({ data: { session: verifySession, user: { id: 'auth-1' } }, error: null });
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      await expect(s.svc.changePassword('t1', 'auth-1', 'old-password', 'new-password-123', 'my-access-token')).resolves.toEqual({ changed: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
      expect(url).toMatch(/\/auth\/v1\/user$/);
      expect(init.method).toBe('PUT');
      expect(init.headers['Authorization']).toBe('Bearer my-access-token');
      expect(JSON.parse(init.body)).toEqual({ password: 'new-password-123' });
      expect(s.updateUserById).not.toHaveBeenCalled(); // admin API бүх session устгадаг (OPS-013)
      expect((s.system.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('must_change_password = false');
      expect(s.tenantCache.invalidateMember).toHaveBeenCalledWith('t1', 'auth-1');
      expect(s.sessions.dropQuietly).not.toHaveBeenCalled(); // GoTrue шалгалтын session-ыг өөрөө устгасан
    });

    it('токен алга → admin API (нөөц зам)', async () => {
      s.signInWithPassword.mockResolvedValue({ data: { session: verifySession, user: { id: 'auth-1' } }, error: null });
      await expect(s.svc.changePassword('t1', 'auth-1', 'old-password', 'new-password-123')).resolves.toEqual({ changed: true });
      expect(s.updateUserById).toHaveBeenCalledWith('auth-1', { password: 'new-password-123' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ижил нууц үг → 400; одоогийнх буруу → 400 (update хийхгүй); түгжээ → 429', async () => {
      await expect(s.svc.changePassword('t1', 'auth-1', 'same-password-1', 'same-password-1', 'tok')).rejects.toMatchObject({ status: 400, code: 'auth.password_same' });
      s.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 400, message: 'x' } });
      await expect(s.svc.changePassword('t1', 'auth-1', 'bad', 'new-password-123', 'tok')).rejects.toMatchObject({ code: 'auth.password_current_wrong' });
      s.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 429, message: 'x' } });
      await expect(s.svc.changePassword('t1', 'auth-1', 'bad', 'new-password-123', 'tok')).rejects.toMatchObject({ status: 429 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(s.updateUserById).not.toHaveBeenCalled();
    });

    it('H1: түгжээтэй бүртгэл → 429 (GoTrue дуудахгүй); одоогийнх буруу → тоолно; зөв → тэглэнэ', async () => {
      s = setup({ rows: { self: [{ id: 'cu1', email: 'bat@sino.mn' }] }, lockMax: 2 });
      s.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, message: 'x' } });
      await expect(s.svc.changePassword('t1', 'auth-1', 'bad', 'new-password-123', 'tok')).rejects.toMatchObject({ code: 'auth.password_current_wrong' });
      await expect(s.svc.changePassword('t1', 'auth-1', 'bad', 'new-password-123', 'tok')).rejects.toMatchObject({ status: 429, code: 'auth.account_locked' });
      const calls = s.signInWithPassword.mock.calls.length;
      await expect(s.svc.changePassword('t1', 'auth-1', 'old-password', 'new-password-123', 'tok')).rejects.toMatchObject({ status: 429 });
      expect(s.signInWithPassword.mock.calls.length).toBe(calls);
      s = setup({ rows: { self: [{ id: 'cu1', email: 'bat@sino.mn' }] } });
      s.signInWithPassword.mockResolvedValue({ data: { session: verifySession, user: { id: 'auth-1' } }, error: null });
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      await s.svc.changePassword('t1', 'auth-1', 'old-password', 'new-password-123', 'tok');
      expect(s.loginLock.reset).toHaveBeenCalledWith('auth-1');
    });

    it('tenant-ийн нууц үгийн доод уртыг GoTrue-оос өмнө шалгана', async () => {
      s.securityPolicy.get.mockResolvedValue({ ...DEFAULT_TENANT_SECURITY_POLICY, passwordMinLength: 16 });
      await expect(s.svc.changePassword('t1', 'auth-1', 'old-password', 'new-password-12', 'tok'))
        .rejects.toMatchObject({ status: 400, code: 'auth.password_min_length' });
      expect(s.signInWithPassword).not.toHaveBeenCalled();
    });

    it('бодлого (422) → 400 weak; шалгалтын session устгагдана; DB бичихгүй. GoTrue унасан → 503', async () => {
      s.signInWithPassword.mockResolvedValue({ data: { session: verifySession, user: { id: 'auth-1' } }, error: null });
      fetchMock.mockResolvedValueOnce({ ok: false, status: 422, statusText: 'x', json: async () => ({ msg: 'weak' }) });
      await expect(s.svc.changePassword('t1', 'auth-1', 'old', 'new-password-123', 'tok')).rejects.toMatchObject({ code: 'auth.password_weak' });
      expect(s.sessions.dropQuietly).toHaveBeenCalledWith('auth-1', VERIFY_SID);
      expect(s.system.$executeRaw).not.toHaveBeenCalled();
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(s.svc.changePassword('t1', 'auth-1', 'old', 'new-password-123', 'tok')).rejects.toMatchObject({ code: 'auth.service_unavailable' });
    });
  });

  it('clientIpOf: X-Real-IP-д зөвхөн loopback (Caddy)-аас ирсэн бол итгэнэ', () => {
    expect(clientIpOf({ ip: '127.0.0.1', headers: { 'x-real-ip': '203.0.113.5' } })).toBe('203.0.113.5');
    expect(clientIpOf({ ip: '198.51.100.7', headers: { 'x-real-ip': '203.0.113.5' } })).toBe('198.51.100.7');
    expect(clientIpOf({ ip: '127.0.0.1', headers: {} })).toBeUndefined(); // dev / e2e: IP хязгааргүй
  });
});
