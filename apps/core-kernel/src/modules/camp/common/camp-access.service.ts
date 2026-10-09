import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CacheService } from '../../../cache/cache.service';
import { CampPermission } from './camp-permissions';
import { Tx } from './camp-tx';

/** Tenant-ийн эдгээр role бүх кемпийн бүх эрхтэй (анхны тохиргоо хийх боломж, ERD v4 §2.1) */
const TENANT_ADMIN_ROLES: readonly UserRole[] = [UserRole.OWNER, UserRole.ADMIN];
const PERMS_TTL_SECONDS = 300;

/** Хэрэглэгчийн кемпийн эрхийн зураглал (cache-д JSON-оор хадгалагдана) */
export interface CampPermissionSet {
  isTenantAdmin: boolean;
  /** camp_id NULL ролиос — бүх кемпэд */
  global: string[];
  /** campId → эрхүүд (тухайн кемпийн ролиос) */
  byCamp: Record<string, string[]>;
}

export interface CampActor {
  /** core_users.id (RULE-13) */
  userId: string;
  perms: CampPermissionSet;
}

/**
 * Кемпийн эрх шалгагч (Шат 2.1).
 *   - Хэрэглэгчийг (authId → core_users, идэвхтэй) хүсэлт бүрт DB-ээс шалгана → идэвхгүй болгомогц хаагдана.
 *   - Эрхийн зураглалыг Redis-д 5 мин хадгална; роль/эрх/хэрэглэгчийн роль өөрчлөгдөхөд `invalidate(tenantId)`.
 *   - campId = null → tenant түвшний үйлдэл (байгууллага, роль): зөвхөн бүх кемпийн (global) эрх эсвэл tenant admin.
 */
@Injectable()
export class CampAccessService {
  constructor(private readonly cache: CacheService) {}

  async resolve(tx: Tx, tenantId: string, authId: string): Promise<CampActor> {
    const user = await tx.coreUser.findFirst({
      where: { authId, tenantId, isActive: true },
      select: { id: true, role: true },
    });
    if (!user) throw new ForbiddenException('Хэрэглэгч энэ байгууллагад бүртгэлгүй эсвэл идэвхгүй байна');

    const key = this.cache.buildKey('camp', tenantId, 'perms', user.id);
    const cached = await this.cache.get<CampPermissionSet>(key);
    if (cached) return { userId: user.id, perms: cached };

    const rows = await tx.campUserRole.findMany({
      where: { tenantId, userId: user.id },
      select: { campId: true, role: { select: { permissions: { select: { permissionCode: true } } } } },
    });
    const global = new Set<string>();
    const byCamp: Record<string, Set<string>> = {};
    for (const row of rows) {
      const target = row.campId === null ? global : (byCamp[row.campId] ??= new Set<string>());
      for (const p of row.role.permissions) target.add(p.permissionCode);
    }
    const perms: CampPermissionSet = {
      isTenantAdmin: TENANT_ADMIN_ROLES.includes(user.role),
      global: [...global].sort(),
      byCamp: Object.fromEntries(Object.entries(byCamp).map(([k, v]) => [k, [...v].sort()])),
    };
    await this.cache.set(key, perms, PERMS_TTL_SECONDS);
    return { userId: user.id, perms };
  }

  /** Тухайн кемпэд (null = tenant түвшин) эрх байгаа эсэх */
  static has(perms: CampPermissionSet, campId: string | null, code: CampPermission): boolean {
    if (perms.isTenantAdmin || perms.global.includes(code)) return true;
    return campId !== null && (perms.byCamp[campId]?.includes(code) ?? false);
  }

  /** Тухайн кемпэд ямар нэг эрх байгаа эсэх (унших эрх). campId = null → аль нэг кемпэд эрхтэй */
  static hasAccess(perms: CampPermissionSet, campId: string | null): boolean {
    if (perms.isTenantAdmin || perms.global.length > 0) return true;
    if (campId === null) return Object.values(perms.byCamp).some((p) => p.length > 0);
    return (perms.byCamp[campId]?.length ?? 0) > 0;
  }

  /** Эрхүүдийн аль НЭГ нь байвал зөвшөөрнө; core_users.id буцаана */
  async require(tx: Tx, tenantId: string, authId: string, campId: string | null, codes: CampPermission | CampPermission[]): Promise<string> {
    const list = Array.isArray(codes) ? codes : [codes];
    const actor = await this.resolve(tx, tenantId, authId);
    if (!list.some((c) => CampAccessService.has(actor.perms, campId, c))) {
      throw new ForbiddenException(`Энэ үйлдэлд ${list.join(' эсвэл ')} эрх шаардлагатай`);
    }
    return actor.userId;
  }

  /** Тухайн эрх аль НЭГ кемпэд (эсвэл бүх кемпэд) байвал — tenant түвшний лавлах (жнь хөрөнгийн ангилал) */
  static hasInAnyCamp(perms: CampPermissionSet, code: CampPermission): boolean {
    return CampAccessService.has(perms, null, code) || Object.values(perms.byCamp).some((p) => p.includes(code));
  }

  async requireInAnyCamp(tx: Tx, tenantId: string, authId: string, code: CampPermission): Promise<string> {
    const actor = await this.resolve(tx, tenantId, authId);
    if (!CampAccessService.hasInAnyCamp(actor.perms, code)) throw new ForbiddenException(`Энэ үйлдэлд ${code} эрх шаардлагатай`);
    return actor.userId;
  }

  /** Унших: тухайн кемпэд (null = аль нэг кемпэд) ямар нэг эрхтэй байх */
  async requireAccess(tx: Tx, tenantId: string, authId: string, campId: string | null): Promise<CampActor> {
    const actor = await this.resolve(tx, tenantId, authId);
    if (!CampAccessService.hasAccess(actor.perms, campId)) {
      throw new ForbiddenException('Энэ кемпэд хандах эрх алга');
    }
    return actor;
  }

  /** Роль/эрх өөрчлөгдсөний дараа (transaction commit-ийн ДАРАА) дуудна */
  async invalidate(tenantId: string): Promise<void> {
    await this.cache.invalidateTenant(tenantId);
  }
}
