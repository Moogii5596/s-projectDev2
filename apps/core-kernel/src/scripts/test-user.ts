/**
 * Phase 3.6.5 — `pnpm dev:test-user` логик [SEED-002] (2026-10-10)
 *
 * `supabase db reset` → auth.users хоосорно, seed-ийн core_users.auth_id хуучин UUID хэвээр →
 * load test / гараар нэвтрэх: "Invalid login credentials" эсвэл 403.
 * Энэ скрипт (дахин ажиллуулахад аюулгүй):
 *   1) Supabase Auth-д хэрэглэгч байвал нууц үгийг тохируулж баталгаажуулна, байхгүй бол үүсгэнэ
 *   2) core_users (ижил email, яг 1 мөр) auth_id-г шинэчилнэ
 * ЗӨВХӨН local орчинд (localhost/127.0.0.1) — production-д нууц үг дарж бичихээс сэргийлнэ.
 */

export const DEFAULT_TEST_USER = { email: 'admin@test.mn', password: 'test1234' } as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

/** URL-ийн host local биш бол алдаа (DATABASE_URL, SUPABASE_URL хоёуланд) */
export function assertLocalUrl(name: string, raw: string | undefined): string {
  if (!raw) throw new Error(`${name} тохируулаагүй (.env)`);
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`${name} URL буруу`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`${name} local биш (${host}) — dev:test-user зөвхөн local Supabase-д ажиллана`);
  }
  return raw;
}

/** Энгийн .env parser (KEY=VALUE, # тайлбар, "..."/'...' хашилт). Байгаа env-г дарж бичихгүй. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[m[1]] = value;
  }
  return out;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv): { email: string; password: string } {
  const get = (flag: string) => argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  const email = (get('email') ?? env.TEST_EMAIL ?? DEFAULT_TEST_USER.email).trim();
  const password = get('password') ?? env.TEST_PASSWORD ?? DEFAULT_TEST_USER.password;
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`email буруу: "${email}"`);
  if (password.length < 6) throw new Error('password хамгийн багадаа 6 тэмдэгт (Supabase шаардлага)');
  return { email, password };
}

type AdminResult<T> = Promise<{ data: T; error: { message: string } | null }>;
export interface AuthAdminLike {
  listUsers(params: { page: number; perPage: number }): AdminResult<{ users: { id: string; email?: string }[] }>;
  createUser(attrs: { email: string; password: string; email_confirm: boolean }): AdminResult<{ user: { id: string } | null }>;
  updateUserById(id: string, attrs: { password: string; email_confirm: boolean }): AdminResult<unknown>;
}
export interface CoreUserStore {
  /** core_users-ийн ижил email-тэй (case-insensitive) мөрүүд */
  findByEmail(email: string): Promise<{ id: string; tenantId: string }[]>;
  /** core_users.auth_id нь @unique (RULE-13) — яг нэг мөрийг шинэчилнэ */
  setAuthId(coreUserId: string, authId: string): Promise<void>;
}

const PER_PAGE = 200;

async function findAuthUserId(admin: AuthAdminLike, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < PER_PAGE) return null;
  }
  return null;
}

export async function ensureTestUser(
  admin: AuthAdminLike,
  db: CoreUserStore,
  input: { email: string; password: string },
): Promise<{ authId: string; created: boolean; coreUserId: string; tenantId: string }> {
  // 1) Эхлээд core_users-ийг шалгана — холбох мөргүй бол Auth-д юу ч өөрчлөхгүй (өнчин хэрэглэгч үүсгэхгүй)
  const rows = await db.findByEmail(input.email);
  if (rows.length === 0) {
    throw new Error(
      `core_users-д "${input.email}" алга — supabase/seed.sql ажилласан эсэхийг шалгана уу ` +
        '(supabase db reset эсвэл seed-ийг psql -f-ээр). Auth-д юу ч өөрчлөөгүй.',
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `"${input.email}" ${rows.length} tenant-д (${rows.map((r) => r.tenantId).join(', ')}) байна — ` +
        'auth_id нь unique тул аль нэгийг сонгох боломжгүй. Өөр --email ашиглана уу. Auth-д юу ч өөрчлөөгүй.',
    );
  }
  const [row] = rows;

  // 2) Auth хэрэглэгч: байвал нууц үг + баталгаажуулалт, үгүй бол үүсгэнэ
  let authId = await findAuthUserId(admin, input.email);
  let created = false;
  if (authId) {
    const { error } = await admin.updateUserById(authId, { password: input.password, email_confirm: true });
    if (error) throw new Error(`auth.admin.updateUserById: ${error.message}`);
  } else {
    const { data, error } = await admin.createUser({ email: input.email, password: input.password, email_confirm: true });
    if (error || !data.user) throw new Error(`auth.admin.createUser: ${error?.message ?? 'user буцаагүй'}`);
    authId = data.user.id;
    created = true;
  }

  // 3) Холбох
  await db.setAuthId(row.id, authId);
  return { authId, created, coreUserId: row.id, tenantId: row.tenantId };
}
