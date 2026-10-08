import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { mrKeys } from './useMR'

// Нэг MR-н realtime subscription (Detail хуудсанд)
export function useMRRealtime(id: string) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!id) return

    let channel: ReturnType<typeof supabase.channel> | null = null

    // Realtime холболт оролдоно — амжилтгүй бол чимээгүй алгасна
    try {
      channel = supabase
        .channel(`mr-detail-${id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'mr_headers',
            filter: `id=eq.${id}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: mrKeys.detail(id) })
            qc.invalidateQueries({ queryKey: mrKeys.list() })
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Realtime ажиллахгүй байна — critical биш, алгасна
            console.warn('[Realtime] холболт амжилтгүй — manual refresh ашиглана')
          }
        })
    } catch {
      // Realtime unavailable — ignore
    }

    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [id, qc])
}

// Бүх MR жагсаалтын realtime subscription (List хуудсанд)
export function useMRListRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    try {
      channel = supabase
        .channel('mr-list-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mr_headers',
          },
          () => {
            qc.invalidateQueries({ queryKey: mrKeys.list() })
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime] жагсаалт subscription амжилтгүй')
          }
        })
    } catch {
      // Realtime unavailable — ignore
    }

    return () => {
      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
  }, [qc])
}
