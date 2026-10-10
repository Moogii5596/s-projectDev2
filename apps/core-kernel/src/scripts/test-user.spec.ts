/**
 * Phase 3.6.5 — `pnpm dev:test-user` логик [SEED-002]
 */
import { describe, expect, it, vi } from 'vitest';
import { assertLocalUrl, DEFAULT_TEST_USER, ensureTestUser, parseArgs, parseDotenv } from './test-user';

const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const fail = (message: string) => Promise.resolve({ data: { users: [], user: null }, error: { message } });

const mkAdmin = (users: { id: string; email?: string }[][] = [[]]) => ({
  listUsers: vi.fn(({ page }: { page: number }) => ok({ users: users[page - 1] ?? [] })),
  createUser: vi.fn(() => ok({ user: { id: 'new-auth' } })),
  updateUserById: vi.fn(() => ok({})),
});
const mkDb = (rows = [{ id: 'cu1', tenantId: 't3' }]) => ({
  findByEmail: vi.fn().mockResolvedValue(rows),
  setAuthId: vi.fn().mockResolvedValue(undefined),
});
const INPUT = { email: 'admin@test.mn', password: 'test1234' };

describe('ensureTestUser', () => {
  it('Auth-д байхгүй → үүсгэнэ (email_confirm) → core_users-ийн ЯГ тэр мөрийг холбоно', async () => {
    const admin = mkAdmin();
    const db = mkDb();
    await expect(ensureTestUser(admin, db, INPUT)).resolves.toEqual({ authId: 'new-auth', created: true, coreUserId: 'cu1', tenantId: 't3' });
    expect(admin.createUser).toHaveBeenCalledWith({ email: 'admin@test.mn', password: 'test1234', email_confirm: true });
    expect(admin.updateUserById).not.toHaveBeenCalled();
    expect(db.setAuthId).toHaveBeenCalledWith('cu1', 'new-auth');
  });

  it('Auth-д байгаа (том/жижиг үсэг өөр, 2-р хуудсанд) → нууц үгийг шинэчилнэ, үүсгэхгүй (дахин ажиллуулахад аюулгүй)', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, email: `x${i}@e.mn` }));
    const admin = mkAdmin([page1, [{ id: 'old-auth', email: 'Admin@Test.MN' }]]);
    const db = mkDb();
    const res = await ensureTestUser(admin, db, INPUT);
    expect(res).toMatchObject({ authId: 'old-auth', created: false });
    expect(admin.listUsers).toHaveBeenCalledTimes(2);
    expect(admin.updateUserById).toHaveBeenCalledWith('old-auth', { password: 'test1234', email_confirm: true });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(db.setAuthId).toHaveBeenCalledWith('cu1', 'old-auth');
  });

  it('core_users-д алга → алдаа, Auth-д юу ч өөрчлөхгүй (өнчин хэрэглэгч үүсгэхгүй)', async () => {
    const admin = mkAdmin();
    await expect(ensureTestUser(admin, mkDb([]), INPUT)).rejects.toThrow(/core_users-д "admin@test.mn" алга/);
    expect(admin.listUsers).not.toHaveBeenCalled();
    expect(admin.createUser).not.toHaveBeenCalled();
  });

  it('олон tenant-д ижил email → алдаа (auth_id unique), Auth-д юу ч өөрчлөхгүй', async () => {
    const admin = mkAdmin();
    const db = mkDb([{ id: 'a', tenantId: 't1' }, { id: 'b', tenantId: 't2' }]);
    await expect(ensureTestUser(admin, db, INPUT)).rejects.toThrow(/2 tenant-д \(t1, t2\)/);
    expect(admin.listUsers).not.toHaveBeenCalled();
    expect(db.setAuthId).not.toHaveBeenCalled();
  });

  it('Supabase алдаа → мессежтэй алдаа, холбохгүй', async () => {
    const admin = mkAdmin();
    admin.createUser.mockReturnValueOnce(fail('weak password') as never);
    const db = mkDb();
    await expect(ensureTestUser(admin, db, INPUT)).rejects.toThrow('auth.admin.createUser: weak password');
    expect(db.setAuthId).not.toHaveBeenCalled();

    admin.listUsers.mockReturnValueOnce(fail('unauthorized') as never);
    await expect(ensureTestUser(admin, db, INPUT)).rejects.toThrow('auth.admin.listUsers: unauthorized');
  });
});

describe('assertLocalUrl', () => {
  it.each(['http://127.0.0.1:54321', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', 'http://localhost:54321', 'http://host.docker.internal:54321'])(
    'local: %s',
    (url) => expect(assertLocalUrl('X', url)).toBe(url),
  );

  it('local биш / хоосон / буруу → алдаа (production-д нууц үг дарж бичихгүй)', () => {
    expect(() => assertLocalUrl('SUPABASE_URL', 'https://abc.supabase.co')).toThrow(/local биш \(abc\.supabase\.co\)/);
    expect(() => assertLocalUrl('DATABASE_URL', 'postgresql://u:p@db.prod.internal:5432/x')).toThrow(/local биш/);
    expect(() => assertLocalUrl('SUPABASE_URL', undefined)).toThrow(/тохируулаагүй/);
    expect(() => assertLocalUrl('SUPABASE_URL', 'not a url')).toThrow(/URL буруу/);
  });
});

describe('parseDotenv / parseArgs', () => {
  it('.env: тайлбар, хашилт, CRLF, export, " #" тайлбар', () => {
    const env = parseDotenv('# c\r\nA=1\r\nexport B="x y"\nC=\'q\'\nD=v # note\nbad line\nE=\n');
    expect(env).toEqual({ A: '1', B: 'x y', C: 'q', D: 'v', E: '' });
  });

  it('args > env > default; буруу email / богино нууц үг → алдаа', () => {
    expect(parseArgs([], {})).toEqual(DEFAULT_TEST_USER);
    expect(parseArgs([], { TEST_EMAIL: 'a@b.mn', TEST_PASSWORD: 'secret1' })).toEqual({ email: 'a@b.mn', password: 'secret1' });
    expect(parseArgs(['--email=c@d.mn', '--password=p@ss=word'], { TEST_EMAIL: 'a@b.mn' })).toEqual({ email: 'c@d.mn', password: 'p@ss=word' });
    expect(() => parseArgs(['--email=nope'], {})).toThrow(/email буруу/);
    expect(() => parseArgs(['--password=123'], {})).toThrow(/6 тэмдэгт/);
  });
});
