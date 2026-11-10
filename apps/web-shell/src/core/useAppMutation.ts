import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'

/** Mutation амжилттай болсны дараа холбогдох query-үүдийг invalidate хийнэ. */
export function useAppMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  invalidate: QueryKey[],
  onSuccess?: (result: TResult, vars: TVars) => void,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })))
      onSuccess?.(result, vars)
    },
  })
}
