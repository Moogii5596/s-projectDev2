/**
 * v0.2.3 Блок 3 (PIL-18) — аль хэдийн олгосон роль / шууд эрхийг сонголтын жагсаалтад «олгогдсон» гэж идэвхгүй харуулах.
 * Backend-ийн давхардлын дүрэмтэй ижил: ижил (хэрэглэгч, роль, хүрээ) гарын олголт → 409; албан тушаалын автомат олголтыг
 * гараар давхар олгож болно (№7, Блок 6б). Шууд эрх: ижил (код, хүрээ) DIRECT → 409.
 */
export interface AssignedRoleLike {
  user: { id: string }
  role: { id: string }
  camp: { id: string } | null
  sourcePositionId?: string | null
}

/** Тухайн хэрэглэгч, хүрээнд (campId '' / null = бүх ажлын байр) гараар олгосон роль */
export function assignedRoleIds(rows: readonly AssignedRoleLike[], userId: string, campId: string | null): Set<string> {
  const scope = campId || null
  return new Set(
    rows.filter((r) => r.user.id === userId && (r.camp?.id ?? null) === scope && !r.sourcePositionId).map((r) => r.role.id),
  )
}

export interface PermissionRowLike {
  permissionCode: string
  campId: string | null
  source: string
}

/** Тухайн хүрээнд шууд (DIRECT) олгосон эрхийн код */
export function directPermissionCodes(rows: readonly PermissionRowLike[], campId: string | null): Set<string> {
  const scope = campId || null
  return new Set(rows.filter((r) => r.source === 'DIRECT' && r.campId === scope).map((r) => r.permissionCode))
}
