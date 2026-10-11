import { useState, useEffect } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { signInRequest } from '../api/auth'

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

  /**
   * v0.2.2 D-10: утас / нэвтрэх нэр / имэйл → backend `/auth/sign-in` → `setSession`.
   * Буцаах утга: нууц үг солих шаардлагатай эсэх (LoginPage → /change-password).
   */
  const signIn = async (identifier: string, password: string, fallbackError: string): Promise<{ mustChangePassword: boolean }> => {
    const s = await signInRequest(identifier, password, fallbackError)
    const { error } = await supabase.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken })
    if (error) throw error
    return { mustChangePassword: s.mustChangePassword }
  }

  // FE-007: зөвхөн энэ төхөөрөмж ('global' анхдагч нь бусад төхөөрөмжийн session-ийг ч цуцалдаг)
  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' })
  }

  return { ...state, signIn, signOut }
}
