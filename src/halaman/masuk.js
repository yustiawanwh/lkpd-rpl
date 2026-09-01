/**
 * Halaman masuk.
 *
 * Dua cara: email + kata sandi, atau akun Google sekolah.
 * Murid yang mendaftar sendiri otomatis berperan 'murid'; guru diangkat
 * admin lewat SQL. Ini disengaja — tanpa pembatasan itu siapa pun bisa
 * mengangkat dirinya jadi guru.
 */
import { sb } from '../lib/supabase.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { el, isi, $ } from '../lib/dom.js'

export function halamanMasuk(wadah) {
  let mode = 'masuk'          // masuk | daftar
  let sibuk = false
  let galat = ''
  let sukses = ''

  function gambar() {
    const kartu = el('div', { class: 'masuk-kartu' },

      el('div', { class: 'masuk-kepala' },
        el('div', { class: 'masuk-tanda' }, 'B'),
        el('h1', {}, 'Brantas Dev Studio'),
        el('p', {}, 'Ruang kerja LKM — Konsentrasi RPL'),
      ),

      el('div', { class: 'masuk-badan' },

        el('div', { class: 'tab-masuk', role: 'tablist' },
          el('button', {
            role: 'tab', 'aria-selected': String(mode === 'masuk'),
            onClick: () => { mode = 'masuk'; galat = ''; sukses = ''; gambar() },
          }, 'Masuk'),
          el('button', {
            role: 'tab', 'aria-selected': String(mode === 'daftar'),
            onClick: () => { mode = 'daftar'; galat = ''; sukses = ''; gambar() },
          }, 'Daftar baru'),
        ),

        galat && el('div', { class: 'pesan pesan-galat', role: 'alert' }, galat),
        sukses && el('div', { class: 'pesan pesan-sukses', role: 'status' }, sukses),

        el('form', { onSubmit: kirim },

          mode === 'daftar' && el('div', { class: 'ruas' },
            el('label', { for: 'f-nama' }, 'Nama lengkap'),
            el('input', { id: 'f-nama', name: 'nama', type: 'text', required: true,
                          autocomplete: 'name', placeholder: 'Sesuai daftar absen' }),
          ),

          el('div', { class: 'ruas' },
            el('label', { for: 'f-email' }, 'Email'),
            el('input', { id: 'f-email', name: 'email', type: 'email', required: true,
                          autocomplete: 'email', placeholder: 'nama@sekolah.sch.id' }),
          ),

          el('div', { class: 'ruas' },
            el('label', { for: 'f-sandi' }, 'Kata sandi'),
            el('input', { id: 'f-sandi', name: 'sandi', type: 'password', required: true,
                          minlength: '6',
                          autocomplete: mode === 'daftar' ? 'new-password' : 'current-password' }),
            mode === 'daftar' && el('span', { class: 'ruas-petunjuk' }, 'Minimal 6 karakter.'),
          ),

          el('button', { type: 'submit', class: 'tbl tbl-utama tbl-penuh', disabled: sibuk },
            sibuk ? 'Memproses…' : (mode === 'masuk' ? 'Masuk' : 'Buat akun')),
        ),

        el('div', { class: 'pemisah-atau' }, 'atau'),

        el('button', { class: 'tbl tbl-penuh', disabled: sibuk, onClick: masukGoogle },
          el('span', { html: IKON_GOOGLE }),
          'Lanjutkan dengan Google'),

        mode === 'masuk' && el('p', {
          gaya: { marginTop: '16px', marginBottom: 0, fontSize: '12.5px',
                  color: 'var(--tinta-lembut)', textAlign: 'center', lineHeight: '1.5' },
        }, 'Akun baru berperan sebagai murid. Guru diangkat oleh admin sekolah.'),
      ),
    )

    isi(wadah, el('div', { class: 'masuk-latar' }, kartu))
  }

  async function kirim(e) {
    e.preventDefault()
    if (sibuk) return

    const form = e.target
    const email = form.email.value.trim()
    const sandi = form.sandi.value
    const nama = form.nama?.value.trim()

    sibuk = true; galat = ''; sukses = ''; gambar()

    try {
      if (mode === 'daftar') {
        const { data, error } = await sb.auth.signUp({
          email, password: sandi,
          options: { data: { nama: nama || email.split('@')[0] } },
        })
        if (error) throw error

        // Bila konfirmasi email diaktifkan, sesi masih kosong.
        if (!data.session) {
          sibuk = false
          mode = 'masuk'
          sukses = 'Akun dibuat. Periksa emailmu untuk konfirmasi, lalu masuk.'
          gambar()
          return
        }
        // Bila tidak, onAuthStateChange di main.js yang mengambil alih.
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: sandi })
        if (error) throw error
      }
    } catch (err) {
      sibuk = false
      galat = pesanGalat(err)
      gambar()
    }
  }

  async function masukGoogle() {
    sibuk = true; galat = ''; gambar()
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      })
      if (error) throw error
    } catch (err) {
      sibuk = false
      galat = pesanGalat(err)
      gambar()
    }
  }

  gambar()
}

const IKON_GOOGLE = `<svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
<path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z"/>
<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
</svg>`
