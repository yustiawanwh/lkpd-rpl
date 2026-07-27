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

  // maybeSingle: mengembalikan null (bukan error) bila baris belum ada,
  // sehingga tidak melempar "Cannot coerce the result to a single JSON object"
  // saat profil baru belum sempat dibuat oleh trigger basis data.
  const ambil = async () => {
    const { data, error } = await sb
      .from('profil').select('*').eq('id', user.id).maybeSingle()
    if (error) { console.error('Gagal memuat profil:', error.message); return undefined }
    return data
  }

  let data = await ambil()

  // Bila profil belum ada (mis. baru mendaftar & trigger sedikit terlambat,
  // atau trigger belum terpasang), coba buatkan lalu ambil ulang.
  if (data === null) {
    const nama = user.user_metadata?.nama
      || user.user_metadata?.full_name
      || (user.email ? user.email.split('@')[0] : 'Pengguna')
    // Upsert aman: bila trigger sudah membuatnya, ini tidak menimpa.
    await sb.from('profil')
      .upsert({ id: user.id, nama, email: user.email, peran: 'murid' },
              { onConflict: 'id', ignoreDuplicates: true })
      .select().maybeSingle()
      .catch(() => {})
    // Ambil ulang (beri satu percobaan tambahan bila masih kosong).
    data = await ambil()
    if (data === null) {
      await new Promise(r => setTimeout(r, 400))
      data = await ambil()
    }
  }

  return data ?? null
}

export async function keluar() {
  await sb.auth.signOut()
}
