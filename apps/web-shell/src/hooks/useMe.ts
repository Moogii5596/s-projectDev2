import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/me'
import { canWrite } from '../lib/roles'

/**
 * Phase 6.0.1 — Нэвтэрсэн хэрэглэгчийн role (5 мин cache).
 * Layout гарахдаа `queryClient.clear()` хийдэг тул өөр хэрэглэгч орвол дахин татна.
 */
export function useMe(opts: { enabled?: boolean } = {}) {
  const query = useQuery({ queryKey: ['auth', 'me'], queryFn: getMe, staleTime: 5 * 60_000, enabled: opts.enabled ?? true })
  return { ...query, me: query.data ?? null, canWrite: canWrite(query.data?.role) }
}
