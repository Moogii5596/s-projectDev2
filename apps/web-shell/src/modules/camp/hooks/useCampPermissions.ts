import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import { makeCan } from '../lib/permissions'

/** Query key-ийн ганц эх сурвалж — HR (v0.2.2 H2) мөн эдгээрийг ашиглана (ирц ↔ өрөө/хоолны харагдац хамт invalidate) */
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
  employees: (campId: string) => ['camp', campId, 'employees'] as const,
  imports: (campId: string) => ['camp', campId, 'imports'] as const,
  /** v0.2.2 H2: мастер өгөгдлийн импортын түүх (HR «Импорт») */
  dataImports: (campId: string) => ['camp', campId, 'data-imports'] as const,
  movements: (campId: string) => ['camp', campId, 'movements'] as const,
  calendar: (campId: string) => ['camp', campId, 'calendar'] as const,
  adjustments: (campId: string) => ['camp', campId, 'adjustments'] as const,
  roomBoard: (campId: string) => ['camp', campId, 'room-board'] as const,
  allocations: (campId: string) => ['camp', campId, 'allocations'] as const,
  presence: (campId: string) => ['camp', campId, 'presence'] as const,
  assetCategories: ['camp', 'asset-categories'] as const,
  /** v0.2.1 */
  catalog: (kind: string) => ['camp', 'catalog', kind] as const,
  positionSettings: (campId: string) => ['camp', campId, 'position-settings'] as const,
  stays: (campId: string) => ['camp', campId, 'stays'] as const,
  assets: (campId: string) => ['camp', campId, 'assets'] as const,
  maintenance: (campId: string) => ['camp', campId, 'maintenance'] as const,
  /** Ирц/ээлж/өрөө өөрчлөгдөхөд хамааралтай бүх харагдац */
  operational: (campId: string) =>
    [
      ['camp', campId, 'movements'],
      ['camp', campId, 'calendar'],
      ['camp', campId, 'adjustments'],
      ['camp', campId, 'room-board'],
      ['camp', campId, 'allocations'],
      ['camp', campId, 'presence'],
      ['camp', campId, 'stays'],
      ['camp', campId, 'imports'],
    ] as const,
}

/**
 * Нэвтэрсэн хэрэглэгчийн кемпийн эрх. campId өгөөгүй бол tenant түвшин (бүх кемпийн / admin эрх).
 * `can(...)` — UI нуух зориулалттай; backend үйлдэл бүрийг дахин шалгана.
 */
export function useCampPermissions(campId?: string) {
  const q = useQuery({ queryKey: campKeys.myPerms(campId), queryFn: () => campApi.myPermissions(campId), staleTime: 60_000 })
  return { ...q, can: makeCan(q.data) }
}
