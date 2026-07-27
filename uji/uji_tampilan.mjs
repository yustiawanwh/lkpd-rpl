/**
 * Menguji modul tampilan secara langsung (bukan lewat bundel).
 *
 * Supabase diganti tiruan pada tingkat modul, sehingga yang diuji adalah
 * logika penyusunan DOM dan alur antar halaman — bagian yang benar-benar
 * bisa salah. Autentikasi sudah diuji terpisah oleh pustaka Supabase sendiri.
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'fs'

const dom = new JSDOM('<!DOCTYPE html><div id="akar"></div>', {
  pretendToBeVisual: true, url: 'http://localhost/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.Event = dom.window.Event
// navigator hanya-baca di Node modern; tidak diperlukan pengujian ini
globalThis.localStorage = dom.window.localStorage
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} })

let lulus = 0, gagal = 0
const ok = (n, f) => {
  try {
    const r = f()
    if (r === false) { console.log(`  ✗ ${n}`); gagal++ }
    else { console.log(`  ✓ ${n}${typeof r === 'string' ? ' → ' + r : ''}`); lulus++ }
  } catch (e) { console.log(`  ✗ ${n} → ${e.message}`); gagal++ }
}
const bab = (s) => console.log(`\n=== ${s} ===`)

/* ---------- Modul yang diuji ---------- */
const dommod = await import('../src/lib/dom.js')
const { el, isi, inisial, tunda, tanggalId } = dommod
const LK = await import('../src/lib/lembar.js')
const P = await import('../src/lib/pangkat.js')
const K = await import('../src/lib/kesalahan.js')

bab('Pembangun DOM')
ok('el membuat elemen', () => el('div').tagName === 'DIV')
ok('atribut class dipasang', () => el('div', { class: 'x' }).className === 'x')
ok('anak teks masuk', () => el('p', {}, 'halo').textContent === 'halo')
ok('anak elemen bersarang', () => el('div', {}, el('span', {}, 'a')).children.length === 1)
ok('nilai false dilewati', () => el('div', {}, false, null, undefined, 'x').textContent === 'x')
ok('gaya diterapkan', () => el('div', { gaya: { color: 'red' } }).style.color === 'red')
ok('data-* dipasang', () => el('div', { data: { id: '7' } }).dataset.id === '7')

// Perlindungan dari HTML jahat
ok('teks TIDAK ditafsirkan sebagai HTML', () => {
  const e = el('div', {}, '<img src=x onerror=alert(1)>')
  return e.querySelector('img') === null && e.textContent.includes('<img')
})
ok('atribut nama pengguna aman', () => {
  const e = el('div', {}, '"><script>alert(1)</script>')
  return e.querySelector('script') === null
})

ok('isi() mengganti anak', () => {
  const w = el('div', {}, 'lama')
  isi(w, el('span', {}, 'baru'))
  return w.textContent === 'baru' && w.children.length === 1
})

bab('Inisial nama')
ok('dua kata', () => inisial('Dewi Lestari') === 'DL')
ok('satu kata', () => inisial('Budi') === 'B')
ok('tiga kata ambil dua', () => inisial('Ahmad Rizky Pratama') === 'AR')
ok('kosong', () => inisial('') === '?')
ok('null aman', () => inisial(null) === '?')
ok('spasi berlebih', () => inisial('  Sari   Wulandari  ') === 'SW')

bab('Penundaan (penyimpanan otomatis)')
ok('menunda pemanggilan', async () => {
  let n = 0
  const f = tunda(() => n++, 40)
  f(); f(); f()
  await new Promise(r => setTimeout(r, 90))
  return n === 1
})
ok('segera() menjalankan langsung', async () => {
  let n = 0
  const f = tunda(() => n++, 400)
  f()
  await f.segera()
  return n === 1
})
ok('batal() membatalkan', async () => {
  let n = 0
  const f = tunda(() => n++, 40)
  f(); f.batal()
  await new Promise(r => setTimeout(r, 80))
  return n === 0
})

bab('Struktur lembar kerja')
const tabelA = { tipe: 'matriks', struktur: {
  baris: ['IDE', 'SDK', 'Emulator', 'Kendali Versi'],
  kolom: [{ key: 'fungsi', label: 'Fungsi', input: 'textarea' },
          { key: 'akibat', label: 'Akibat', input: 'textarea' }] } }
ok('matriks 4 baris', () => LK.jumlahBaris(tabelA) === 4)
ok('2 kolom', () => LK.kolom(tabelA).length === 2)
ok('daftar pakai jumlah_baris', () =>
  LK.jumlahBaris({ tipe: 'daftar', struktur: { jumlah_baris: 7 } }) === 7)
ok('referensi pakai panjang data', () =>
  LK.jumlahBaris({ tipe: 'referensi', struktur: { data: [1,2,3] } }) === 3)

let data = {}
data = LK.tulisSel(data, 0, 'fungsi', 'Menulis kode')
ok('tulis & baca sel', () => LK.sel({ data }, 0, 'fungsi') === 'Menulis kode')
ok('sel tak ada = kosong', () => LK.sel({ data }, 5, 'fungsi') === '')
ok('tidak mengubah objek asal', () => {
  const d2 = LK.tulisSel(data, 0, 'fungsi', 'diubah')
  return data['0'].fungsi === 'Menulis kode' && d2['0'].fungsi === 'diubah'
})

bab('Pangkat & waktu')
ok('0 XP = Intern', () => P.pangkatUntuk(0) === 'Intern')
ok('175 XP = 50% menuju berikutnya', () => P.persenKeBerikutnya(175) === 50)
ok('format 3661 detik', () => P.formatWaktu(3661) === '1:01:01')
ok('format 125 detik', () => P.formatWaktu(125) === '02:05')
ok('waktu negatif jadi 00:00', () => P.formatWaktu(-5) === '00:00')

bab('Pesan galat berbahasa Indonesia')
ok('RLS ditolak', () => K.pesanGalat({ message: 'new row violates row-level security policy' })
  .includes('tidak punya hak'))
ok('sesi berakhir', () => K.pesanGalat({ message: 'JWT expired' }).includes('berakhir'))
ok('sandi salah', () => K.pesanGalat({ message: 'Invalid login credentials' }).includes('tidak cocok'))
ok('data ganda', () => K.pesanGalat({ code: '23505' }).includes('sudah ada'))
ok('koneksi putus', () => K.pesanGalat({ message: 'Failed to fetch' }).includes('koneksi'))
ok('tanpa istilah teknis Inggris', () => {
  const contoh = [{ code: '23505' }, { code: '42501' }, { message: 'JWT expired' }]
  return contoh.every(e => !/\b(row|policy|violat|constraint)\b/i.test(K.pesanGalat(e)))
})

bab('Tanggal Indonesia')
ok('format tanggal', () => tanggalId('2026-08-07').includes('2026'))
ok('null aman', () => tanggalId(null) === '—')

console.log(`\n${'='.repeat(50)}\nLULUS: ${lulus}    GAGAL: ${gagal}`)
process.exit(gagal > 0 ? 1 : 0)
