/**
 * v0.1.6 (B1) — пилотын хэрэглэгч удирдах CLI. Пилотын хавтсанд (root .env) ажиллуулна:
 *
 *   pnpm pilot:onboard --slug=sinohydro --name="Sino Hydro" --email=admin@sinohydro.mn [--owner-name="..."] [--password=...]
 *   pnpm pilot:user --email=user@sinohydro.mn --role=VIEWER [--name="..."] [--camp-role=CAMP_MANAGER]
 *                   [--password=... | --reset-password] [--deactivate] [--slug=sinohydro]
 *
 * --slug өгөөгүй бол DEDICATED_TENANT_SLUG. role: OWNER | ADMIN | APPROVER | REQUESTER | VIEWER.
 * camp-role: CAMP_ADMIN | CAMP_MANAGER | CATERING_ADMIN (бүх кемп; тодорхой кемпэд → UI /camp/admin/user-roles).
 * Нууц үгийг НЭГ удаа хэвлэнэ — хэрэглэгчид аюулгүй сувгаар дамжуулна. Зөвхөн local Supabase/DB.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, TierType, UserRole } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { assertLocalUrl, findAuthUserId, parseDotenv } from './test-user';
import {
  EnsureUserResult,
  PilotAuth,
  PilotCache,
  PilotCoreUser,
  PilotDb,
  ensureUser,
  onboard,
  validateCampRole,
  validateRole,
  validateSlug,
} from './pilot-admin';

function loadEnv(): void {
  for (const p of [resolve(__dirname, '../../../../.env'), resolve(__dirname, '../../.env')]) {
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(p, 'utf8')))) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

const argv = process.argv.slice(3);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => argv.includes(`--${name}`);

function printUser(u: EnsureUserResult): void {
  console.log(`   ${u.email} · role ${u.role}${u.campRole ? ` · кемп ${u.campRole}` : ''} · ${u.isActive ? 'идэвхтэй' : 'ИДЭВХГҮЙ'}` +
    ` · Auth ${u.createdAuth ? 'шинэ' : 'байсан'} · core ${u.createdCore ? 'шинэ' : 'байсан'}`);
  if (u.password) {
    console.log(`   🔑 Нууц үг (НЭГ удаа харагдана — хэрэглэгчид аюулгүйгээр дамжуулна): ${u.password}`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const cmd = process.argv[2];
  if (cmd !== 'onboard' && cmd !== 'user') {
    throw new Error('Хэрэглээ: pilot onboard --slug= --name= --email= | pilot user --email= --role= [...]');
  }
  const supabaseUrl = assertLocalUrl('SUPABASE_URL', process.env.SUPABASE_URL);
  const databaseUrl = process.env.SYSTEM_DATABASE_URL?.trim()
    ? assertLocalUrl('SYSTEM_DATABASE_URL', process.env.SYSTEM_DATABASE_URL)
    : assertLocalUrl('DATABASE_URL', process.env.DATABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY тохируулаагүй (.env)');

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const auth: PilotAuth = {
    findUserIdByEmail: (email) => findAuthUserId(admin, email),
    async createUser(email, password) {
      const { data, error } = await admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`auth.admin.createUser(${email}): ${error?.message ?? 'user алга'}`);
      return data.user.id;
    },
    async setPassword(authId, password) {
      const { error } = await admin.updateUserById(authId, { password, email_confirm: true });
      if (error) throw new Error(`auth.admin.updateUserById: ${error.message}`);
    },
  };

  const toCore = (u: { id: string; tenantId: string; authId: string; role: UserRole; isActive: boolean }): PilotCoreUser => ({
    id: u.id,
    tenantId: u.tenantId,
    authId: u.authId,
    role: u.role as PilotCoreUser['role'],
    isActive: u.isActive,
  });
  const coreSelect = { id: true, tenantId: true, authId: true, role: true, isActive: true } as const;

  // Системийн холболт (RLS-ийг тойрно) — tenant-ээс өмнөх ажил
  const db: PilotDb = {
    findTenant: (slug) => prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } }),
    async createTenant(name, slug) {
      return (await prisma.tenant.create({ data: { name, slug, tier: TierType.TIER2 } })).id;
    },
    async findCoreUserByEmail(tenantId, email) {
      const u = await prisma.coreUser.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } }, select: coreSelect });
      return u ? toCore(u) : null;
    },
    async findCoreUserByAuthId(authId) {
      const u = await prisma.coreUser.findUnique({ where: { authId }, select: coreSelect });
      return u ? toCore(u) : null;
    },
    async createCoreUser(u) {
      return (await prisma.coreUser.create({ data: { ...u, role: UserRole[u.role] } })).id;
    },
    async updateCoreUser(id, data) {
      await prisma.coreUser.update({
        where: { id },
        data: {
          ...(data.role ? { role: UserRole[data.role] } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.fullName ? { fullName: data.fullName } : {}),
        },
      });
    },
    async grantCampRole(tenantId, userId, code) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT core_seed_default_roles(${tenantId}::uuid)`; // tenant trigger үүсгэсэн байх ёстой — idempotent (ADR-007)
        const n = await tx.$executeRaw`
          INSERT INTO core_user_roles (tenant_id, user_id, role_id, site_id)
          SELECT ${tenantId}::uuid, ${userId}::uuid, r.id, NULL
          FROM core_roles r WHERE r.tenant_id = ${tenantId}::uuid AND r.system_code = ${code}
          ON CONFLICT DO NOTHING`;
        const exists = await tx.$queryRaw<{ c: bigint }[]>`
          SELECT count(*) AS c FROM core_user_roles ur JOIN core_roles r ON r.id = ur.role_id
          WHERE ur.tenant_id = ${tenantId}::uuid AND ur.user_id = ${userId}::uuid AND ur.site_id IS NULL AND r.system_code = ${code}`;
        if (Number(exists[0]?.c ?? 0) === 0) throw new Error(`кемпийн роль ${code} олгож чадсангүй (core_roles алга?) — inserted ${n}`);
      });
    },
  };

  // tenant-cache.service.ts MEMBER_PREFIX-тэй ижил
  const cache: PilotCache = {
    async invalidateMember(tenantId, authId) {
      const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
      try {
        await redis.connect();
        await redis.del(`tenant:member:${tenantId}:${authId}`);
      } catch (err) {
        console.warn(`⚠️ Redis cache цэвэрлэж чадсангүй (${(err as Error).message}) — идэвхгүй болголт ≤5 минутын дараа хүчинтэй`);
      } finally {
        redis.disconnect();
      }
    },
  };

  try {
    if (cmd === 'onboard') {
      const r = await onboard({ auth, db, cache }, {
        slug: arg('slug') ?? '',
        name: arg('name') ?? '',
        ownerEmail: arg('email') ?? '',
        ownerName: arg('owner-name'),
        password: arg('password'),
      });
      console.log(`✅ Байгууллага ${r.createdTenant ? 'үүсгэв' : 'байсан'}: ${arg('name')} (${validateSlug(arg('slug') ?? '')}, ${r.tenantId})`);
      printUser(r.owner);
      console.log(`   → .env: DEPLOYMENT_MODE=dedicated, DEDICATED_TENANT_SLUG=${validateSlug(arg('slug') ?? '')}`);
    } else {
      const slug = validateSlug(arg('slug') ?? process.env.DEDICATED_TENANT_SLUG ?? '');
      const tenant = await db.findTenant(slug);
      if (!tenant) throw new Error(`Байгууллага "${slug}" алга — эхлээд pnpm pilot:onboard`);
      const u = await ensureUser({ auth, db, cache }, {
        tenantId: tenant.id,
        email: arg('email') ?? '',
        fullName: arg('name'),
        role: validateRole(arg('role') ?? ''),
        campRole: arg('camp-role') ? validateCampRole(arg('camp-role')!) : undefined,
        password: arg('password'),
        resetPassword: flag('reset-password'),
        deactivate: flag('deactivate'),
      });
      console.log(`✅ ${tenant.name} (${slug})`);
      printUser(u);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`❌ pilot: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
