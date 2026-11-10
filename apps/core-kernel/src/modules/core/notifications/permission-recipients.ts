import { Prisma, UserRole } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * ADR-007: тухайн эрхтэй идэвхтэй хэрэглэгчид (core_users.id), эрэмбэлсэн.
 *   - эрх tenant даяар (site NULL) эсвэл тухайн ажлын байранд (siteId)
 *   - tenant admin (OWNER/ADMIN) — `includeTenantAdmins` (анхдагч true; CampAccessService.has-тай ижил)
 * Tenant transaction дотор (RLS) дуудна.
 */
export async function usersWithPermission(
  tx: Tx,
  tenantId: string,
  codes: string | readonly string[],
  siteId: string | null,
  opts: { includeTenantAdmins?: boolean } = {},
): Promise<string[]> {
  const list = typeof codes === 'string' ? [codes] : [...codes];
  if (list.length === 0) return [];
  const includeAdmins = opts.includeTenantAdmins ?? true;
  const scope: Prisma.CoreUserPermissionWhereInput[] = [{ campId: null }];
  if (siteId) scope.push({ campId: siteId });
  const users = await tx.coreUser.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        ...(includeAdmins ? [{ role: { in: [UserRole.OWNER, UserRole.ADMIN] } }] : []),
        { coreUserPermissions: { some: { tenantId, permissionCode: { in: list }, OR: scope } } },
      ],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return users.map((u) => u.id);
}

export interface UserPermissionSet {
  isTenantAdmin: boolean;
  global: string[];
  bySite: Record<string, string[]>;
}

/** core_users.id → эрхийн зураглал (ADR-007). Идэвхгүй/байхгүй хэрэглэгч → null. Tenant transaction дотор. */
export async function loadUserPermissions(tx: Tx, tenantId: string, userId: string): Promise<UserPermissionSet | null> {
  const user = await tx.coreUser.findFirst({ where: { tenantId, id: userId, isActive: true }, select: { role: true } });
  if (!user) return null;
  const rows = await tx.coreUserPermission.findMany({ where: { tenantId, userId }, select: { campId: true, permissionCode: true } });
  const global: string[] = [];
  const bySite: Record<string, string[]> = {};
  for (const r of rows) (r.campId === null ? global : (bySite[r.campId] ??= [])).push(r.permissionCode);
  return { isTenantAdmin: user.role === UserRole.OWNER || user.role === UserRole.ADMIN, global, bySite };
}

/** Эрх tenant даяар эсвэл тухайн ажлын байранд (tenant admin — бүгд) */
export function hasSitePermission(p: UserPermissionSet, siteId: string | null, codes: readonly string[]): boolean {
  if (p.isTenantAdmin) return true;
  return codes.some((c) => p.global.includes(c) || (siteId !== null && (p.bySite[siteId]?.includes(c) ?? false)));
}

/** Ажлын байранд ямар нэг эрхтэй (харах) */
export function hasSiteAccess(p: UserPermissionSet, siteId: string): boolean {
  return p.isTenantAdmin || p.global.length > 0 || (p.bySite[siteId]?.length ?? 0) > 0;
}
