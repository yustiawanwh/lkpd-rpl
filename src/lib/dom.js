/**
 * Bantuan kecil untuk membangun DOM tanpa kerangka kerja.
 *
 * Alasan tidak memakai React/Svelte: aplikasi ini harus tetap bisa
 * dibangun ulang lima tahun lagi oleh siapa pun yang memegangnya.
 * Semakin sedikit dependensi, semakin kecil risikonya rusak karena
 * pustaka yang sudah tak dirawat.
 */

/** Membuat elemen. Isi berupa string diperlakukan sebagai TEKS, bukan HTML. */
export function el(tag, atribut = {}, ...anak) {
  const e = document.createElement(tag)

  for (const [k, v] of Object.entries(atribut)) {
    if (v === null || v === undefined || v === false) continue

    if (k === 'class') e.className = v
    else if (k === 'html') e.innerHTML = v          // hanya untuk isi tepercaya
    else if (k === 'gaya') Object.assign(e.style, v)
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv
    else if (v === true) e.setAttribute(k, '')
    else e.setAttribute(k, v)
  }

  for (const a of anak.flat(Infinity)) {
    if (a === null || a === undefined || a === false) continue
    e.append(a instanceof Node ? a : document.createTextNode(String(a)))
  }
  return e
}

export const $  = (sel, akar = document) => akar.querySelector(sel)
export const $$ = (sel, akar = document) => [...akar.querySelectorAll(sel)]

/** Mengosongkan lalu mengisi sebuah wadah. */
export function isi(wadah, ...anak) {
  wadah.replaceChildren(...anak.flat(Infinity).filter(a => a !== null && a !== undefined && a !== false))
  return wadah
}

/** Inisial nama untuk avatar: "Dewi Lestari" → "DL" */
export function inisial(nama) {
  const kata = String(nama ?? '').trim().split(/\s+/).filter(Boolean)
  if (!kata.length) return '?'
  return kata.slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/* ---------- Notifikasi ---------- */
let rotiEl = null
let rotiTimer = null

export function roti(pesan, ikon = '✓') {
  if (!rotiEl) {
    rotiEl = el('div', { class: 'roti', role: 'status', 'aria-live': 'polite' })
    document.body.append(rotiEl)
  }
  isi(rotiEl, el('span', { class: 'roti-ikon' }, ikon), el('span', {}, pesan))
  rotiEl.classList.add('tampil')

  clearTimeout(rotiTimer)
  rotiTimer = setTimeout(() => rotiEl.classList.remove('tampil'), 2800)
}

/* ---------- Dialog ---------- */

/**
 * Menampilkan dialog. Mengembalikan fungsi penutup.
 * Fokus dikembalikan ke elemen semula agar nyaman bagi pengguna papan tik.
 */
export function dialog({ judul, badan, kaki, lebar }) {
  const fokusSemula = document.activeElement

  const kotak = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true',
                            'aria-label': judul, gaya: lebar ? { maxWidth: lebar } : {} },
    el('div', { class: 'dialog-kepala' },
      el('h2', {}, judul),
      el('button', { class: 'tutup-x', 'aria-label': 'Tutup', onClick: () => tutup() }, '✕'),
    ),
    el('div', { class: 'dialog-badan' }, badan),
    kaki && el('div', { class: 'dialog-kaki' }, kaki),
  )

  const tirai = el('div', { class: 'tirai', onClick: (e) => { if (e.target === tirai) tutup() } }, kotak)

  function padaTombol(e) {
    if (e.key === 'Escape') { e.preventDefault(); tutup(); return }

    // Menahan fokus di dalam dialog selama terbuka
    if (e.key === 'Tab') {
      const bisa = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', kotak)
      if (!bisa.length) return
      const awal = bisa[0], akhir = bisa[bisa.length - 1]
      if (e.shiftKey && document.activeElement === awal) { e.preventDefault(); akhir.focus() }
      else if (!e.shiftKey && document.activeElement === akhir) { e.preventDefault(); awal.focus() }
    }
  }

  function tutup() {
    document.removeEventListener('keydown', padaTombol)
    tirai.remove()
    document.body.style.overflow = ''
    fokusSemula?.focus?.()
  }

  document.addEventListener('keydown', padaTombol)
  document.body.style.overflow = 'hidden'
  document.body.append(tirai)

  // Fokus ke isian pertama, atau ke dialognya sendiri
  const pertama = $('input,textarea,select,button:not(.tutup-x)', kotak)
  ;(pertama ?? kotak).focus?.()

  return tutup
}

/** Konfirmasi sederhana dengan janji. */
export function konfirmasi({ judul, pesan, tombol = 'Lanjutkan', bahaya = false }) {
  return new Promise((selesai) => {
    let tutup
    const batal = el('button', { class: 'tbl', onClick: () => { tutup(); selesai(false) } }, 'Batal')
    const ya = el('button', {
      class: 'tbl ' + (bahaya ? 'tbl-bahaya' : 'tbl-utama'),
      onClick: () => { tutup(); selesai(true) },
    }, tombol)

    tutup = dialog({
      judul,
      badan: el('p', { gaya: { margin: 0, fontSize: '14px', lineHeight: '1.55' } }, pesan),
      kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } }, batal, ya)],
      lebar: '440px',
    })
  })
}

/** Rangka abu-abu selagi data dimuat. */
export function rangkaMuat(tinggi = '18px', lebar = '100%') {
  return el('div', { class: 'rangka-muat', gaya: { height: tinggi, width: lebar } })
}

/** Menunda pemanggilan — dipakai penyimpanan otomatis. */
export function tunda(fn, jeda = 600) {
  let timer = null
  let tertunda = null

  const bungkus = (...args) => {
    tertunda = () => fn(...args)
    clearTimeout(timer)
    timer = setTimeout(() => { tertunda?.(); tertunda = null }, jeda)
  }

  /** Menjalankan segera bila masih ada yang tertunda. */
  bungkus.segera = async () => {
    clearTimeout(timer)
    if (tertunda) { const f = tertunda; tertunda = null; await f() }
  }
  bungkus.batal = () => { clearTimeout(timer); tertunda = null }

  return bungkus
}

/** Format tanggal Indonesia. */
export function tanggalId(iso, denganJam = false) {
  if (!iso) return '—'
  const d = new Date(iso)
  const opsi = { day: 'numeric', month: 'short', year: 'numeric' }
  if (denganJam) { opsi.hour = '2-digit'; opsi.minute = '2-digit' }
  return d.toLocaleDateString('id-ID', opsi)
}
