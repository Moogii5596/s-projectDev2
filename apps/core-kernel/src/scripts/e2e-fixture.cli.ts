/**
 * `pnpm --filter @s-project/core-kernel e2e:fixture setup --out=<файл>` / `teardown --in=<файл>` — Phase 6.1.1
 *
 * Playwright globalSetup/globalTeardown (apps/e2e) дуудна. Root .env-ээс SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, SYSTEM_DATABASE_URL (→ DATABASE_URL), DEV_TENANT_SLUG уншина.
 * Зөвхөн local (localhost/127.0.0.1) — production DB/Auth-д хэрэглэгч үүсгэхээс сэргийлнэ.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, TierType, UserRole } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { assertLocalUrl, parseDotenv } from './test-user';
import { FixtureAuth, FixtureDb, FixtureFile, setupFixture, teardownFixture } from './e2e-fixture';

function loadEnv(): void {
  // src/scripts → apps/core-kernel → apps → repo root
  for (const p of [resolve(__dirname, '../../../../.env'), resolve(__dirname, '../../.env')]) {
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(p, 'utf8')))) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  loadEnv();
  const cmd = process.argv[2];
  if (cmd !== 'setup' && cmd !== 'teardown') throw new Error('Хэрэглээ: e2e:fixture setup --out=<файл> | teardown --in=<файл>');

  const supabaseUrl = assertLocalUrl('SUPABASE_URL', process.env.SUPABASE_URL);
  const databaseUrl = process.env.SYSTEM_DATABASE_URL?.trim()
    ? assertLocalUrl('SYSTEM_DATABASE_URL', process.env.SYSTEM_DATABASE_URL)
    : assertLocalUrl('DATABASE_URL', process.env.DATABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!serviceKey || !anonKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY тохируулаагүй (.env)');

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(supabaseUrl, serviceKey, opts).auth.admin;
  const anon = createClient(supabaseUrl, anonKey, opts).auth;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const auth: FixtureAuth = {
    async createUser(email, password) {
      const { data, error } = await admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`auth.admin.createUser(${email}): ${error?.message ?? 'user алга'}`);
      return data.user.id;
    },
    async signIn(email, password) {
      const { data, error } = await anon.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error(`signIn(${email}): ${error?.message ?? 'session алга'}`);
      return data.session.access_token;
    },
    async deleteUser(authId) {
      const { error } = await admin.deleteUser(authId);
      if (error && !/not.?found/i.test(error.message)) throw new Error(error.message);
    },
  };

  // Системийн холболт (RLS-ийг тойрно) — tenant үүсгэх, бусад tenant-ийн мөр цэвэрлэх
  const db: FixtureDb = {
    async findTenantId(slug) {
      return (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
    },
    async createTenant(name, slug) {
      return (await prisma.tenant.create({ data: { name, slug, tier: TierType.TIER1 } })).id;
    },
    async createDefinition(tenantId, name, steps) {
      await prisma.workflowDefinition.create({ data: { tenantId, name, stepsConfig: steps as object, isActive: true } });
    },
    async createCoreUser(u) {
      return (await prisma.coreUser.create({ data: { ...u, role: UserRole[u.role] } })).id;
    },
    async deleteTenant(tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    },
    async cleanupDevTenant(tenantId, coreIds, prefix) {
      const like = `${prefix}%`;
      await prisma.$transaction(async (tx) => {
        if (coreIds.length > 0) {
          const mrs = await tx.$queryRaw<{ id: string; wf: string | null }[]>`
            SELECT id::text AS id, workflow_instance_id::text AS wf FROM mr_headers
            WHERE tenant_id = ${tenantId}::uuid AND requester_id = ANY(${coreIds}::uuid[])`;
          const wfIds = mrs.map((m) => m.wf).filter((x): x is string => !!x);
          await tx.$executeRaw`DELETE FROM approval_logs WHERE approver_id = ANY(${coreIds}::uuid[])`;
          await tx.$executeRaw`UPDATE mr_headers SET approved_by = NULL WHERE approved_by = ANY(${coreIds}::uuid[])`;
          await tx.$executeRaw`DELETE FROM mr_headers WHERE tenant_id = ${tenantId}::uuid AND requester_id = ANY(${coreIds}::uuid[])`;
          if (wfIds.length > 0) await tx.$executeRaw`DELETE FROM workflow_instances WHERE id = ANY(${wfIds}::uuid[])`;
        }
        await tx.$executeRaw`DELETE FROM inventory_items WHERE tenant_id = ${tenantId}::uuid AND sku LIKE ${like}`;
        await tx.$executeRaw`DELETE FROM vendors WHERE tenant_id = ${tenantId}::uuid AND name LIKE ${like}`;
        if (coreIds.length > 0) {
          // v0.2.0: DEV tenant-ийн fixture хэрэглэгчийн орчуулгын засвар/түүх (append-only — зөвхөн системийн холболтоор)
          await tx.$executeRaw`DELETE FROM i18n_override_history WHERE tenant_id = ${tenantId}::uuid AND changed_by = ANY(${coreIds}::uuid[])`;
          await tx.$executeRaw`DELETE FROM i18n_overrides WHERE tenant_id = ${tenantId}::uuid AND updated_by = ANY(${coreIds}::uuid[])`;
          // v0.2.2 Блок 6б: devUserAdmin-ийн (хэрэглэгч / роль удирдах e2e) аудит мөр — actor FK (append-only, системийн холболт)
          await tx.$executeRaw`DELETE FROM camp_audit_log WHERE tenant_id = ${tenantId}::uuid AND actor_user_id = ANY(${coreIds}::uuid[])`;
          await tx.$executeRaw`DELETE FROM feed_links WHERE tenant_id = ${tenantId}::uuid AND created_by = ANY(${coreIds}::uuid[])`;
          await tx.$executeRaw`DELETE FROM core_users WHERE tenant_id = ${tenantId}::uuid AND id = ANY(${coreIds}::uuid[])`;
        }
      });
    },
  };

  try {
    if (cmd === 'setup') {
      const out = arg('out');
      if (!out) throw new Error('--out=<файл> шаардлагатай');
      const file = await setupFixture({ auth, db }, { devSlug: process.env.DEV_TENANT_SLUG?.trim() || 'test-tenant' });
      writeFileSync(out, JSON.stringify(file, null, 2), 'utf8');
      console.log(`✅ e2e fixture: tenant ${Object.values(file.tenants).map((t) => t.slug).join(', ')} + ${Object.keys(file.users).length} хэрэглэгч → ${out}`);
    } else {
      const input = arg('in');
      if (!input) throw new Error('--in=<файл> шаардлагатай');
      if (!existsSync(input)) {
        console.log(`e2e fixture: ${input} алга — цэвэрлэх юм алга`);
        return;
      }
      const file = JSON.parse(readFileSync(input, 'utf8')) as FixtureFile;
      const errors = await teardownFixture({ auth, db }, file);
      if (errors.length) throw new Error(`teardown алдаа: ${errors.join('; ')}`);
      console.log(`✅ e2e fixture цэвэрлэв (${file.prefix})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ e2e:fixture: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
