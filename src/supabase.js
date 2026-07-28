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
export async function profilSaya(userDiberi) {
  // PENTING: jangan panggil getUser()/getSession() bila fungsi ini dipanggil
  // dari dalam callback onAuthStateChange — itu menyebabkan DEADLOCK (auth
  // saling menunggu kunci). Karena itu pemanggil WAJIB memberi objek user
  // (dari sesi yang sudah ada). getUser() hanya dipakai sebagai cadangan
  // di luar callback.
  let user = userDiberi
  if (!user) {
    const { data } = await sb.auth.getUser()
    user = data?.user ?? null
  }
  if (!user) return null

  // maybeSingle: mengembalikan null (bukan error) bila baris belum ada.
  const { data, error } = await sb
    .from('profil').select('*').eq('id', user.id).maybeSingle()

  if (error) {
    console.error('Gagal memuat profil:', error.message)
    return null
  }

  // Profil sudah ada → selesai.
  if (data) return data

  // Profil belum ada (mis. baru mendaftar, trigger terlambat/belum terpasang).
  // Coba buatkan sekali; abaikan bila gagal (mis. kebijakan insert belum ada).
  try {
    const nama = user.user_metadata?.nama
      || user.user_metadata?.full_name
      || (user.email ? user.email.split('@')[0] : 'Pengguna')
    const { data: baru } = await sb.from('profil')
      .insert({ id: user.id, nama, email: user.email, peran: 'murid' })
      .select().maybeSingle()
    if (baru) return baru
  } catch (e) {
    console.error('Tidak bisa membuat profil cadangan:', e?.message ?? e)
  }

  // Ambil ulang sekali lagi (mungkin trigger baru saja menyelesaikannya).
  const { data: ulang } = await sb
    .from('profil').select('*').eq('id', user.id).maybeSingle()
  return ulang ?? null
}

export async function keluar() {
  await sb.auth.signOut()
}
