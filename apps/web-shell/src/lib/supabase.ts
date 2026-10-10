import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseUrl } from './modules'

// v0.1.6: "same-origin" → апп-ын origin (пилот: Caddy /auth/v1 → Supabase Auth)
const supabaseUrl = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined, window.location.origin)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL болон VITE_SUPABASE_ANON_KEY тохируулагдаагүй байна')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
