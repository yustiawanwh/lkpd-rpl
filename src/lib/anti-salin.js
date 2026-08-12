/**
 * Anti salin-tempel untuk halaman MURID saja.
 *
 * Bila diaktifkan (pengaturan 'anti_salin'), memblokir copy, cut, paste,
 * klik-kanan (contextmenu), dan seleksi teks di seluruh halaman murid.
 * Kolom isian (input/textarea/[contenteditable]) TETAP bisa diketik — hanya
 * aksi salin/tempel yang dicegah, dengan pesan singkat.
 *
 * Guru & admin tidak pernah memanggil ini, jadi halaman mereka tak terpengaruh.
 */
import { sb } from './supabase.js'
import { roti } from './dom.js'

let terpasang = false
let pesanTerakhir = 0

function pesan(teks) {
  const now = Date.now()
  if (now - pesanTerakhir < 1500) return   // jangan spam toast
  pesanTerakhir = now
  roti(teks, '🔒')
}

function blokir(e) {
  e.preventDefault()
  const jenis = e.type
  if (jenis === 'paste') pesan('Menempel dinonaktifkan')
  else if (jenis === 'copy' || jenis === 'cut') pesan('Menyalin dinonaktifkan')
  else if (jenis === 'contextmenu') pesan('Klik-kanan dinonaktifkan')
  return false
}

// Seleksi teks: cegah, KECUALI di dalam kolom isian (agar murid tetap bisa
// memilih teks yang sedang diketiknya sendiri).
function blokirSeleksi(e) {
  const t = e.target
  const bolehKetik = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
    t.isContentEditable)
  if (!bolehKetik) { e.preventDefault(); return false }
}

const PERISTIWA = ['copy', 'cut', 'paste', 'contextmenu']

export function pasangAntiSalin() {
  if (terpasang) return
  terpasang = true
  for (const ev of PERISTIWA) document.addEventListener(ev, blokir, true)
  document.addEventListener('selectstart', blokirSeleksi, true)
  document.body.classList.add('anti-salin-aktif')
}

export function lepasAntiSalin() {
  if (!terpasang) return
  terpasang = false
  for (const ev of PERISTIWA) document.removeEventListener(ev, blokir, true)
  document.removeEventListener('selectstart', blokirSeleksi, true)
  document.body.classList.remove('anti-salin-aktif')
}

// Ambil status pengaturan (bawaan: nonaktif). Aman bila baris belum ada.
export async function antiSalinAktif() {
  try {
    const { data } = await sb.from('pengaturan').select('nilai')
      .eq('kunci', 'anti_salin').maybeSingle()
    return data?.nilai?.aktif === true
  } catch (_) { return false }
}
