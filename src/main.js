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
async function muatProfil(user) {
  try {
    keadaan.profil = await profilSaya(user)
  } catch (err) {
    console.error('Gagal memuat profil:', err)
    keadaan.profil = null
  }
}

/**
 * Perubahan sesi bisa datang dari mana saja: masuk, keluar, penyegaran
 * token, atau kembali dari Google. Satu penangan untuk semuanya.
 *
 * PENTING: callback ini TIDAK memanggil getUser()/getSession() dan tidak
 * menahan pekerjaan berat di dalam callback. Memanggil fungsi auth lain di
 * dalam sini menyebabkan DEADLOCK. Kita pakai `sesi.user` yang sudah tersedia,
 * dan menjalankan pemuatan profil DI LUAR callback (via setTimeout 0).
 */
sb.auth.onAuthStateChange((peristiwa, sesi) => {
  if (peristiwa === 'SIGNED_OUT' || !sesi) {
    keadaan.profil = null
    gambar()
    return
  }

  if (peristiwa === 'SIGNED_IN') {
    const user = sesi.user
    // Tunda ke luar callback agar tidak memicu kebuntuan auth.
    setTimeout(async () => {
      await muatProfil(user)
      gambar()
    }, 0)
    return
  }

  // INITIAL_SESSION ditangani oleh mulai() di bawah, tidak perlu di sini.
  // TOKEN_REFRESHED & USER_UPDATED tidak perlu menggambar ulang.
})

window.addEventListener('hashchange', gambar)

/* ==========================================================
   Mulai
   ========================================================== */
;(async function mulai() {
  const tandai = (t) => {
    const p = document.querySelector('.muat-awal p')
    if (p) p.textContent = t
  }
  try {
    tandai('Memeriksa sesi…')
    let session = null
    try {
      const { data } = await Promise.race([
        sb.auth.getSession(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('sesi-lambat')), 6000)),
      ])
      session = data?.session ?? null
    } catch (e) {
      // getSession menggantung (mis. token rusak & penyegaran gagal).
      // Bersihkan sesi yang bermasalah lalu tampilkan halaman masuk,
      // daripada layar tersangkut selamanya.
      console.error('Sesi bermasalah, membersihkan:', e?.message ?? e)
      try {
        // Hapus token tersimpan agar tidak memicu penyegaran yang menggantung.
        await Promise.race([
          sb.auth.signOut({ scope: 'local' }),
          new Promise((r) => setTimeout(r, 2000)),
        ])
      } catch (_) { /* abaikan */ }
      // Bersihkan juga penyimpanan lokal Supabase secara langsung.
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-') || k.includes('supabase'))
          .forEach((k) => localStorage.removeItem(k))
      } catch (_) { /* abaikan */ }
      keadaan.profil = null
      gambar()      // tampilkan halaman masuk
      return
    }

    if (session) {
      tandai('Memuat profil…')
      await Promise.race([
        muatProfil(session.user),
        new Promise((r) => setTimeout(r, 8000)),
      ])
    }

    await gambar()
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
