import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMRList,
  getMRDetail,
  createMR,
  submitMR,
  approveMR,
  rejectMR,
} from '../api/requisitions'
import type { CreateMrDto, ApproveMrDto, RejectMrDto, SubmitMrDto } from '../types/mr.types'

// Query keys
export const mrKeys = {
  all: ['mr'] as const,
  list: () => [...mrKeys.all, 'list'] as const,
  detail: (id: string) => [...mrKeys.all, 'detail', id] as const,
}

// List
export function useMRList() {
  const query = useInfiniteQuery({
    queryKey: mrKeys.list(),
    queryFn: ({ pageParam }) => getMRList({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.data) ?? [],
  }
}

// Detail
export function useMRDetail(id: string) {
  return useQuery({
    queryKey: mrKeys.detail(id),
    queryFn: () => getMRDetail(id),
    enabled: Boolean(id),
  })
}

// Create
export function useCreateMR() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateMrDto) => createMR(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: mrKeys.list() }),
  })
}

// Submit
export function useSubmitMR(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: SubmitMrDto) => submitMR(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(id) })
      qc.invalidateQueries({ queryKey: mrKeys.list() })
    },
  })
}

// Approve
export function useApproveMR(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: ApproveMrDto) => approveMR(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(id) })
      qc.invalidateQueries({ queryKey: mrKeys.list() })
    },
  })
}

// Reject
export function useRejectMR(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: RejectMrDto) => rejectMR(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mrKeys.detail(id) })
      qc.invalidateQueries({ queryKey: mrKeys.list() })
    },
  })
}
