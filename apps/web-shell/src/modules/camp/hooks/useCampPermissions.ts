import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import { makeCan } from '../lib/permissions'

export const campKeys = {
  all: ['camp'] as const,
  myPerms: (campId?: string) => ['camp', 'me', 'perms', campId ?? 'tenant'] as const,
  permissions: ['camp', 'permissions'] as const,
  users: ['camp', 'users'] as const,
  roles: ['camp', 'roles'] as const,
  userRoles: ['camp', 'user-roles'] as const,
  camps: ['camp', 'camps'] as const,
  camp: (campId: string) => ['camp', 'camps', campId] as const,
  organizations: ['camp', 'organizations'] as const,
  settings: (campId: string) => ['camp', campId, 'settings'] as const,
  mealLocations: (campId: string) => ['camp', campId, 'meal-locations'] as const,
  buildings: (campId: string) => ['camp', campId, 'buildings'] as const,
  rooms: (campId: string) => ['camp', campId, 'rooms'] as const,
  departments: (campId: string) => ['camp', campId, 'departments'] as const,
  crews: (campId: string) => ['camp', campId, 'crews'] as const,
}

/**
 * Нэвтэрсэн хэрэглэгчийн кемпийн эрх. campId өгөөгүй бол tenant түвшин (бүх кемпийн / admin эрх).
 * `can(...)` — UI нуух зориулалттай; backend үйлдэл бүрийг дахин шалгана.
 */
export function useCampPermissions(campId?: string) {
  const q = useQuery({ queryKey: campKeys.myPerms(campId), queryFn: () => campApi.myPermissions(campId), staleTime: 60_000 })
  return { ...q, can: makeCan(q.data) }
}
