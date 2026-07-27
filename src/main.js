/**
 * Titik masuk aplikasi.
 *
 * Alurnya:
 *   1. Periksa sesi yang tersimpan
 *   2. Belum masuk  → halaman masuk
 *   3. Sudah masuk  → muat profil, lalu arahkan sesuai peran
 *
 * Pengarahan halaman memakai tanda pagar (#) supaya tetap berjalan di
 * hosting statis seperti GitHub Pages, yang tidak bisa mengarahkan
 * seluruh jalur ke satu berkas.
 */
import { sb, profilSaya } from './lib/supabase.js'
import { el, isi, $, roti } from './lib/dom.js'
import { pesanGalat } from './lib/kesalahan.js'
import { halamanMasuk } from './halaman/masuk.js'
import { halamanMurid } from './halaman/murid.js'
import { halamanGuru } from './halaman/guru.js'

const akar = $('#akar')

/** Keadaan aplikasi yang dibagi ke seluruh halaman. */
export const keadaan = {
  profil: null,
  penugasan: null,     // penugasan yang sedang dibuka murid
}

/* ==========================================================
   Pengarahan
   ========================================================== */
function rute() {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [nama, ...sisa] = h.split('/')
  return { nama: nama || '', bagian: sisa }
}

export function pergiKe(jalur) {
  window.location.hash = '#/' + String(jalur).replace(/^\/+/, '')
}

/* ==========================================================
   Menggambar halaman
   ========================================================== */
async function gambar() {
  if (!keadaan.profil) {
    halamanMasuk(akar)
    return
  }

  if (!keadaan.profil.aktif) {
    isi(akar, el('div', { class: 'masuk-latar' },
      el('div', { class: 'masuk-kartu' },
        el('div', { class: 'masuk-kepala' },
          el('div', { class: 'masuk-tanda' }, 'B'),
          el('h1', {}, 'Akun dinonaktifkan'),
          el('p', {}, 'Hubungi admin sekolah untuk mengaktifkannya kembali.'),
        ),
        el('div', { class: 'masuk-badan' },
          el('button', { class: 'tbl tbl-penuh', onClick: keluar }, 'Keluar'),
        ),
      ),
    ))
    return
  }

  const r = rute()
  const guru = keadaan.profil.peran === 'guru' || keadaan.profil.peran === 'admin'

  try {
    if (guru && r.nama !== 'murid') {
      await halamanGuru(akar, r)
    } else {
      await halamanMurid(akar, r)
    }
  } catch (err) {
    console.error(err)
    isi(akar, el('div', { class: 'isi' },
      el('div', { class: 'panel' },
        el('div', { class: 'kosong' },
          el('h3', {}, 'Gagal memuat halaman'),
          el('p', {}, pesanGalat(err)),
          el('button', { class: 'tbl', onClick: () => location.reload() }, 'Muat ulang'),
        ),
      ),
    ))
  }
}

export async function keluar() {
  await sb.auth.signOut()
  keadaan.profil = null
  keadaan.penugasan = null
  window.location.hash = ''
  gambar()
}

/* ==========================================================
   Sesi
   ========================================================== */
async function muatProfil() {
  try {
    keadaan.profil = await profilSaya()
  } catch (err) {
    console.error('Gagal memuat profil:', err)
    keadaan.profil = null
  }
}

/**
 * Perubahan sesi bisa datang dari mana saja: masuk, keluar, penyegaran
 * token, atau kembali dari Google. Satu penangan untuk semuanya.
 */
sb.auth.onAuthStateChange(async (peristiwa, sesi) => {
  if (peristiwa === 'SIGNED_OUT' || !sesi) {
    keadaan.profil = null
    gambar()
    return
  }

  if (peristiwa === 'SIGNED_IN' || peristiwa === 'INITIAL_SESSION') {
    await muatProfil()
    gambar()
    return
  }

  // TOKEN_REFRESHED & USER_UPDATED tidak perlu menggambar ulang.
})

window.addEventListener('hashchange', gambar)

/* ==========================================================
   Mulai
   ========================================================== */
;(async function mulai() {
  // Diagnostik sementara: tampilkan langkah di layar agar terlihat di mana macet.
  const tandai = (t) => {
    const p = document.querySelector('.muat-awal p')
    if (p) p.textContent = t
  }
  try {
    tandai('1/4 memeriksa sesi…')
    const sesiP = sb.auth.getSession()
    const { data: { session } } = await Promise.race([
      sesiP,
      new Promise((_, rej) => setTimeout(() => rej(new Error('getSession lambat')), 8000)),
    ])

    if (session) {
      tandai('2/4 memuat profil…')
      await Promise.race([
        muatProfil(),
        new Promise((r) => setTimeout(r, 8000)),
      ])
    }

    tandai('3/4 menampilkan halaman…')
    await gambar()
    tandai('4/4 selesai')
  } catch (err) {
    tandai('Gagal: ' + (err?.message ?? err))
    throw err
  }
})().catch((err) => {
  console.error(err)
  isi(akar, el('div', { class: 'masuk-latar' },
    el('div', { class: 'masuk-kartu' },
      el('div', { class: 'masuk-kepala' },
        el('div', { class: 'masuk-tanda' }, '!'),
        el('h1', {}, 'Tidak bisa terhubung'),
        el('p', {}, pesanGalat(err)),
      ),
      el('div', { class: 'masuk-badan' },
        el('p', { gaya: { fontSize: '13px', color: 'var(--tinta-lembut)', marginTop: 0 } },
          'Periksa koneksi internet. Bila baru memasang, pastikan berkas .env ' +
          'sudah diisi dengan URL dan kunci dari Supabase.'),
        el('button', { class: 'tbl tbl-penuh', onClick: () => location.reload() }, 'Coba lagi'),
      ),
    ),
  ))
})
