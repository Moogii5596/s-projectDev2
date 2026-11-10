/**
 * v0.2.2 Блок 4 — хэрэглэгч, нэвтрэх эрх, эрхийн харагдацын цэвэр функцүүд (unit тестлэгдэнэ).
 */
import type { CampUser, InviteResult, UserPermissions } from '../api/camp-bridge'

/** Урилгын линк: backend `url` (PUBLIC_APP_URL) → эс бөгөөс одоогийн origin + `path` */
export function inviteLink(res: Pick<InviteResult, 'url' | 'path'>, origin: string): string | null {
  if (res.url) return res.url
  if (res.path) return `${origin.replace(/\/+$/, '')}${res.path}`
  return null
}

/** Нэвтрэх нэр: утас → username → имэйл (дотоод `.login.invalid` хаягийг харуулахгүй) */
export function loginName(u: Pick<CampUser, 'phone' | 'username' | 'email' | 'internalEmail'>): string | null {
  return u.phone || u.username || (u.internalEmail ? null : u.email) || null
}

export type UserState = 'INACTIVE' | 'INVITED' | 'NO_INVITE' | 'ACTIVE'

/**
 * Жагсаалтын төлөв: идэвхгүй → INACTIVE; урилга хүлээгдэж байна → INVITED;
 * урилга ашиглаагүй (байхгүй / хугацаа дууссан / хүчингүй) → NO_INVITE; ашигласан → ACTIVE.
 * Урилгагүй боловч бодит имэйлтэй (хуучин, имэйлээр бүртгэгдсэн) хэрэглэгч → ACTIVE.
 */
export function userState(u: Pick<CampUser, 'isActive' | 'invite' | 'internalEmail'>): UserState {
  if (!u.isActive) return 'INACTIVE'
  if (u.invite?.status === 'PENDING') return 'INVITED'
  if (u.invite?.status === 'USED') return 'ACTIVE'
  if (!u.invite && !u.internalEmail) return 'ACTIVE'
  return 'NO_INVITE'
}

export function filterUsers(list: CampUser[], q: string, state: UserState | ''): CampUser[] {
  const s = q.trim().toLowerCase()
  return list.filter((u) => {
    if (state && userState(u) !== state) return false
    if (!s) return true
    return [u.fullName, u.phone, u.username, u.internalEmail ? null : u.email, u.employee?.employeeCode, u.employee?.fullName]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s))
  })
}

export interface PermissionView {
  code: string
  /** Загвараас (роль) — роль бүрээр, кемпийн хүрээтэй */
  template: { roleName: string; campId: string | null }[]
  /** Шууд олгосон — устгах боломжтой */
  direct: { id: string; campId: string | null }[]
}

/** Эрх бүрээр бүлэглэнэ (каталогийн дарааллаар), зөвхөн эзэмшсэн эрх */
export function permissionView(data: UserPermissions, catalogOrder: string[]): PermissionView[] {
  const by = new Map<string, PermissionView>()
  for (const p of data.permissions) {
    const v = by.get(p.permissionCode) ?? { code: p.permissionCode, template: [], direct: [] }
    if (p.source === 'DIRECT') v.direct.push({ id: p.id, campId: p.campId })
    else v.template.push({ roleName: p.role?.name ?? '—', campId: p.campId })
    by.set(p.permissionCode, v)
  }
  const rank = (c: string) => {
    const i = catalogOrder.indexOf(c)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...by.values()].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code))
}

/** Загвараас зөрүүтэй (роль өөрчлөгдөөд хэрэгжүүлээгүй) олголтууд */
export function outdatedAssignments(data: UserPermissions) {
  return data.assignments.filter((a) => a.outdated)
}
