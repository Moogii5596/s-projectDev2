/**
 * v0.1.6 (B1) — Пилотын хэрэглэгч удирдах логик (`pnpm pilot:onboard`, `pnpm pilot:user`)
 *
 * Пилотод хэрэглэгч/эрх удирдах UI алга (Кемпийн эрхийн хуудас нь зөвхөн байгаа хэрэглэгчид роль олгоно),
 * Supabase-д нээлттэй бүртгэл хаалттай (`enable_signup = false`) → хэрэглэгчийг ЗӨВХӨН энэ script-ээр:
 *   onboard → байгууллага (tenant) + эзэмшигч (OWNER) + "Кемп админ" (бүх кемп)
 *   user    → хэрэглэгч нэмэх / role солих / нууц үг шинэчлэх / идэвхгүй болгох (+ кемпийн роль)
 * Логик нь портоор (Auth, Db) — unit тестлэгдэнэ; бодит холболт `pilot-admin.cli.ts`-д. Давтан ажиллуулахад аюулгүй.
 */
import { randomBytes } from 'node:crypto';
import { TENANT_SLUG_PATTERN } from '../config/deployment-mode';

export const PILOT_ROLES = ['OWNER', 'ADMIN', 'APPROVER', 'REQUESTER', 'VIEWER'] as const;
export type PilotRole = (typeof PILOT_ROLES)[number];
export const CAMP_ROLE_CODES = ['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN'] as const;
export type CampRoleCode = (typeof CAMP_ROLE_CODES)[number];

export interface PilotAuth {
  findUserIdByEmail(email: string): Promise<string | null>;
  createUser(email: string, password: string): Promise<string>;
  setPassword(authId: string, password: string): Promise<void>;
}

export interface PilotCoreUser {
  id: string;
  tenantId: string;
  authId: string;
  role: PilotRole;
  isActive: boolean;
}

export interface PilotDb {
  findTenant(slug: string): Promise<{ id: string; name: string } | null>;
  createTenant(name: string, slug: string): Promise<string>;
  findCoreUserByEmail(tenantId: string, email: string): Promise<PilotCoreUser | null>;
  findCoreUserByAuthId(authId: string): Promise<PilotCoreUser | null>;
  createCoreUser(u: { tenantId: string; authId: string; email: string; fullName: string; role: PilotRole }): Promise<string>;
  updateCoreUser(id: string, data: { role?: PilotRole; isActive?: boolean; fullName?: string }): Promise<void>;
  /** tenant-ийн анхдагч кемпийн роль (system_code) → camp_user_roles (бүх кемп, idempotent) */
  grantCampRole(tenantId: string, userId: string, code: CampRoleCode): Promise<void>;
}

/** Апп-ын Redis membership cache (`tenant:member:<tenant>:<authId>`, 5 мин) — идэвхгүй болгосныг шууд хүчинтэй болгоно */
export interface PilotCache {
  invalidateMember(tenantId: string, authId: string): Promise<void>;
}

export type PilotDeps = { auth: PilotAuth; db: PilotDb; cache?: PilotCache };

/** Supabase (min 8) + хэрэглэгчид гараар өгөхөд ойлгомжтой: 16 тэмдэгт, андуурагдах тэмдэгтгүй */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!TENANT_SLUG_PATTERN.test(s)) throw new Error(`slug "${slug}" буруу — жижиг латин үсэг, тоо, зураас (жнь sinohydro)`);
  return s;
}

export function validateEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new Error(`email буруу: "${email}"`);
  return e;
}

export function validateRole(role: string): PilotRole {
  const r = role.trim().toUpperCase();
  if (!(PILOT_ROLES as readonly string[]).includes(r)) throw new Error(`role буруу: "${role}" (${PILOT_ROLES.join(', ')})`);
  return r as PilotRole;
}

export function validateCampRole(code: string): CampRoleCode {
  const c = code.trim().toUpperCase();
  if (!(CAMP_ROLE_CODES as readonly string[]).includes(c)) {
    throw new Error(`camp-role буруу: "${code}" (${CAMP_ROLE_CODES.join(', ')})`);
  }
  return c as CampRoleCode;
}

export function validatePassword(pw: string): string {
  if (pw.length < 12) throw new Error('password хамгийн багадаа 12 тэмдэгт (пилот — интернэтэд нээлттэй)');
  return pw;
}

export interface EnsureUserInput {
  tenantId: string;
  email: string;
  fullName?: string;
  role: PilotRole;
  campRole?: CampRoleCode;
  /** өгөөгүй бол шинэ хэрэглэгчид санамсаргүй үүсгэнэ */
  password?: string;
  /** байгаа хэрэглэгчийн нууц үгийг шинэчлэх */
  resetPassword?: boolean;
  deactivate?: boolean;
}

export interface EnsureUserResult {
  email: string;
  coreUserId: string;
  createdAuth: boolean;
  createdCore: boolean;
  /** зөвхөн шинээр тохируулсан үед (хэрэглэгчид дамжуулна) */
  password: string | null;
  role: PilotRole;
  campRole: CampRoleCode | null;
  isActive: boolean;
}

export async function ensureUser(deps: PilotDeps, input: EnsureUserInput): Promise<EnsureUserResult> {
  const email = validateEmail(input.email);
  if (input.password !== undefined) validatePassword(input.password);
  const fullName = input.fullName?.trim() || email;

  const core = await deps.db.findCoreUserByEmail(input.tenantId, email);
  let authId = await deps.auth.findUserIdByEmail(email);

  // core_users.auth_id нь unique — өөр tenant-ийн хэрэглэгчтэй холбогдсон Auth-ийг авахгүй
  if (authId && !core) {
    const other = await deps.db.findCoreUserByAuthId(authId);
    if (other && other.tenantId !== input.tenantId) {
      throw new Error(`${email} өөр байгууллагад бүртгэлтэй (tenant ${other.tenantId}) — өөр email ашиглана уу`);
    }
  }

  let password: string | null = null;
  let createdAuth = false;
  if (!authId) {
    password = input.password ?? generatePassword();
    authId = await deps.auth.createUser(email, password);
    createdAuth = true;
  } else if (input.resetPassword || input.password !== undefined) {
    password = input.password ?? generatePassword();
    await deps.auth.setPassword(authId, password);
  }

  let coreUserId: string;
  let createdCore = false;
  if (!core) {
    coreUserId = await deps.db.createCoreUser({ tenantId: input.tenantId, authId, email, fullName, role: input.role });
    createdCore = true;
    if (input.deactivate) await deps.db.updateCoreUser(coreUserId, { isActive: false });
  } else {
    if (core.authId !== authId) throw new Error(`${email}: core_users.auth_id зөрсөн — гараар шалгана уу`);
    coreUserId = core.id;
    await deps.db.updateCoreUser(core.id, {
      role: input.role,
      isActive: !input.deactivate,
      ...(input.fullName ? { fullName } : {}),
    });
  }

  if (input.deactivate) await deps.cache?.invalidateMember(input.tenantId, authId);

  if (input.campRole && !input.deactivate) {
    await deps.db.grantCampRole(input.tenantId, coreUserId, input.campRole);
  }

  return {
    email,
    coreUserId,
    createdAuth,
    createdCore,
    password,
    role: input.role,
    campRole: input.campRole ?? null,
    isActive: !input.deactivate,
  };
}

/** Байгууллага (байвал дахин ашиглана) + эзэмшигч (OWNER) + Кемп админ */
export async function onboard(
  deps: PilotDeps,
  input: { slug: string; name: string; ownerEmail: string; ownerName?: string; password?: string },
): Promise<{ tenantId: string; createdTenant: boolean; owner: EnsureUserResult }> {
  const slug = validateSlug(input.slug);
  const name = input.name.trim();
  if (!name) throw new Error('--name шаардлагатай (жнь "Sino Hydro")');

  const existing = await deps.db.findTenant(slug);
  const tenantId = existing?.id ?? (await deps.db.createTenant(name, slug));
  const owner = await ensureUser(deps, {
    tenantId,
    email: input.ownerEmail,
    fullName: input.ownerName,
    role: 'OWNER',
    campRole: 'CAMP_ADMIN',
    password: input.password,
  });
  return { tenantId, createdTenant: !existing, owner };
}
