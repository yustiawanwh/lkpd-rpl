/**
 * Menerjemahkan galat Supabase menjadi kalimat yang dimengerti pengguna.
 *
 * Pesan asli dari PostgreSQL berbahasa Inggris dan penuh istilah teknis.
 * Yang membaca layar ini guru dan murid, bukan pengembang.
 */

const PETA = {
  '23505': 'Data ini sudah ada sebelumnya.',
  '23503': 'Data yang dirujuk tidak ditemukan.',
  '23514': 'Isian tidak memenuhi ketentuan.',
  '42501': 'Kamu tidak punya hak untuk melakukan ini.',
  'PGRST301': 'Sesimu sudah berakhir. Silakan masuk lagi.',
}

export function pesanGalat(error) {
  if (!error) return null

  // Galat khusus yang perlu penjelasan lebih spesifik
  if (error.message?.includes('row-level security')) {
    return 'Kamu tidak punya hak untuk mengubah data ini.'
  }
  if (error.message?.includes('JWT expired')) {
    return 'Sesimu sudah berakhir. Silakan masuk lagi.'
  }
  if (error.message?.includes('Invalid login credentials')) {
    return 'Email atau kata sandi tidak cocok.'
  }
  if (error.message?.includes('Failed to fetch')) {
    return 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.'
  }

  return PETA[error.code] || error.message || 'Terjadi kesalahan yang tidak dikenali.'
}
