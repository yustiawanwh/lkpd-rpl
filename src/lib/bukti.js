/**
 * Akses penyimpanan bukti — mengutamakan server file sekolah (Nextcloud lewat
 * Cloudflare Worker), dengan cadangan ke Supabase Storage untuk bukti LAMA.
 *
 * API server file (dari dokumentasi sekolah):
 *   PUT    {BASE}/{path}      → unggah / timpa berkas (body = biner)
 *   GET    {BASE}/{path}      → baca berkas (bisa langsung jadi src <img>)
 *   DELETE {BASE}/{path}      → hapus berkas
 *
 * Path bukti menandai lokasinya:
 *   - diawali "nc:"  → tersimpan di server file sekolah (Nextcloud).
 *   - tanpa awalan   → bukti lama di Supabase Storage (createSignedUrl).
 *
 * URL server dibaca dari VITE_FILES_URL saat build. Bila tidak diset, seluruh
 * bukti diperlakukan sebagai Supabase (perilaku lama) — aman bila server file
 * belum disiapkan.
 *
 * KEAMANAN: berkas disimpan di folder tersembunyi .app_data/ (diatur Worker) dengan
 * NAMA ACAK yang sulit ditebak, sehingga orang lain tidak mudah menebak URL
 * bukti murid.
 */
import { sb } from './supabase.js'

// Base URL server file (tanpa garis miring akhir). Pastikan diawali https://
const BASE = (import.meta.env.VITE_FILES_URL || '').replace(/\/$/, '')
const PENGAWALAN = 'nc:'
// Worker sudah otomatis menaruh berkas di folder tersembunyi .app_data/ di
// Nextcloud, jadi kita cukup mengirim NAMA berkas (tanpa subfolder tambahan).

export function pakaiServerFile() {
  return BASE.length > 0
}

// Nama acak sulit ditebak (mencegah orang menebak URL bukti murid).
function namaAcak(ext = 'jpg') {
  const a = crypto.getRandomValues(new Uint8Array(16))
  const hex = [...a].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${Date.now().toString(36)}-${hex}.${ext}`
}

function urlPenuh(pathRelatif) {
  // Pastikan ada skema https:// (dokumentasi kadang menulis URL tanpa skema).
  const dasar = /^https?:\/\//i.test(BASE) ? BASE : `https://${BASE}`
  return `${dasar}/${pathRelatif}`
}

/**
 * Unggah gambar bukti. Server file aktif → PUT ke Nextcloud (path "nc:..."),
 * selain itu → Supabase Storage. Mengembalikan { path }.
 * namaSaran hanya dipakai untuk cadangan Supabase; di server file dipakai nama acak.
 */
export async function unggahBukti(namaSaran, blob) {
  if (pakaiServerFile()) {
    const rel = namaAcak('jpg')   // Worker menaruhnya di .app_data/ otomatis
    const resp = await fetch(urlPenuh(rel), {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    })
    if (!resp.ok) throw new Error('Gagal mengunggah ke server file (' + resp.status + ').')
    return { path: PENGAWALAN + rel }
  }
  const { error } = await sb.storage.from('bukti')
    .upload(namaSaran, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
  if (error) throw error
  return { path: namaSaran }
}

/**
 * URL untuk menampilkan bukti.
 * - Nextcloud: URL GET bisa langsung jadi src <img> (server melayani + CORS *).
 * - Supabase: createSignedUrl.
 */
export async function urlBukti(path) {
  if (path && path.startsWith(PENGAWALAN)) {
    return urlPenuh(path.slice(PENGAWALAN.length))
  }
  const { data } = await sb.storage.from('bukti').createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

/** Hapus bukti sesuai lokasinya. */
export async function hapusBukti(path) {
  if (path && path.startsWith(PENGAWALAN)) {
    await fetch(urlPenuh(path.slice(PENGAWALAN.length)), { method: 'DELETE' }).catch(() => {})
    return
  }
  await sb.storage.from('bukti').remove([path]).catch(() => {})
}
