/**
 * Sambungan ke Supabase.
 *
 * Kunci "anon" di bawah ini MEMANG terlihat di peramban, dan itu tidak
 * masalah. Keamanan tidak bergantung pada menyembunyikan kunci ini,
 * melainkan pada aturan Row Level Security di dalam basis data.
 * Seseorang yang memegang kunci ini tetap hanya bisa membaca data yang
 * menjadi haknya.
 *
 * Yang TIDAK boleh masuk ke berkas ini: service_role key. Kunci itu
 * melewati seluruh RLS dan hanya boleh dipakai di sisi server.
 */
import { createClient } from '@supabase/supabase-js'

const URL  = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!URL || !ANON) {
  throw new Error(
    'VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi. ' +
    'Salin .env.example menjadi .env lalu isi dari Supabase → Project Settings → API.'
  )
}

export const sb = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Profil pengguna yang sedang masuk, atau null. */
export async function profilSaya() {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data, error } = await sb
    .from('profil')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Gagal memuat profil:', error.message)
    return null
  }
  return data
}

export async function keluar() {
  await sb.auth.signOut()
}
