/**
 * `pnpm dev:test-user [--email=admin@test.mn] [--password=test1234]` — Phase 3.6.5 [SEED-002]
 *
 * `supabase db reset`-ийн дараа ажиллуулна: Auth хэрэглэгчийг үүсгэж/нууц үгийг тохируулж,
 * core_users.auth_id-г холбоно. Root .env-ээс SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYSTEM_DATABASE_URL (→ DATABASE_URL) уншина.
 * Зөвхөн local (localhost/127.0.0.1) орчинд.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { assertLocalUrl, ensureTestUser, parseArgs, parseDotenv } from './test-user';

function loadEnv(): void {
  // src/scripts → apps/core-kernel → apps → repo root
  for (const p of [resolve(__dirname, '../../../../.env'), resolve(__dirname, '../../.env')]) {
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(p, 'utf8')))) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const { email, password } = parseArgs(process.argv.slice(2), process.env);
  const supabaseUrl = assertLocalUrl('SUPABASE_URL', process.env.SUPABASE_URL);
  // Phase 4.8.4: tenant-ээс өмнөх засвар (core_users.auth_id) — системийн холболт (app_user-д RLS context-гүй 0 мөр)
  const databaseUrl = process.env.SYSTEM_DATABASE_URL?.trim()
    ? assertLocalUrl('SYSTEM_DATABASE_URL', process.env.SYSTEM_DATABASE_URL)
    : assertLocalUrl('DATABASE_URL', process.env.DATABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY тохируулаагүй (.env)');

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const result = await ensureTestUser(
      supabase.auth.admin,
      {
        findByEmail: (e) =>
          prisma.$queryRaw<{ id: string; tenantId: string }[]>`
            SELECT id::text AS id, tenant_id::text AS "tenantId" FROM core_users WHERE lower(email) = lower(${e})`,
        setAuthId: async (coreUserId, authId) => {
          await prisma.$executeRaw`
            UPDATE core_users SET auth_id = ${authId}::uuid, updated_at = now() WHERE id = ${coreUserId}::uuid`;
        },
      },
      { email, password },
    );
    console.log(
      `✅ ${email}: Auth хэрэглэгч ${result.created ? 'үүсгэв' : 'байсан (нууц үг шинэчлэв)'} · auth_id=${result.authId} · ` +
        `core_users ${result.coreUserId} (tenant ${result.tenantId}) холбов`,
    );
    console.log(`   Нэвтрэх: ${email} / ${'*'.repeat(password.length)}  (load test: TEST_EMAIL/TEST_PASSWORD)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ dev:test-user: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
