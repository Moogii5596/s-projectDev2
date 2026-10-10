import { useState, useEffect } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  })

  useEffect(() => {
    // Одоогийн session авах
    supabase.auth.getSession().then(({ data }) => {
      setState({
        user: data.session?.user ?? null,
        session: data.session,
        loading: false,
      })
    })

    // Auth state өөрчлөгдөхөд subscription
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // FE-007: зөвхөн энэ төхөөрөмж ('global' анхдагч нь бусад төхөөрөмжийн session-ийг ч цуцалдаг)
  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' })
  }

  return { ...state, signIn, signOut }
}
