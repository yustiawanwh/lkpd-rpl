/**
 * Menguji logika penyunting LKPD: memastikan "resep" tabel yang dibangun
 * guru cocok persis dengan yang dibaca sisi murid.
 *
 * Ini bagian paling rawan: kalau struktur yang dibuat guru tidak dikenali
 * pustaka murid, tabelnya tampil kosong atau rusak di layar murid.
 */
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!DOCTYPE html><div></div>', { url: 'http://localhost/' })
globalThis.window = dom.window; globalThis.document = dom.window.document

let lulus = 0, gagal = 0
const ok = (n, f) => { try { const r = f(); if (r === false) { console.log('  ✗ ' + n); gagal++ }
  else { console.log('  ✓ ' + n + (typeof r === 'string' ? ' → ' + r : '')); lulus++ } }
  catch (e) { console.log('  ✗ ' + n + ' → ' + e.message); gagal++ } }
const bab = s => console.log('\n=== ' + s + ' ===')

const LK = await import('../src/lib/lembar.js')

// Meniru cara dialogLembar menyusun struktur dari isian form guru
function bangunStruktur(tipe, kolomForm, barisForm, jumlahBaris) {
  const kolom = kolomForm.filter(k => k.label.trim())
    .map(k => ({ key: k.key || LK.jadikanKey(k.label), label: k.label.trim(), input: k.input || 'textarea' }))
  const struktur = { kolom }
  if (tipe === 'matriks' || tipe === 'formulir') struktur.baris = barisForm.filter(b => b.trim())
  else if (tipe === 'daftar') struktur.jumlah_baris = jumlahBaris
  return struktur
}

bab('Guru menyusun Tabel A (matriks) seperti aslinya')
const strukturA = bangunStruktur('matriks',
  [{ label: 'Fungsi', input: 'textarea' }, { label: 'Akibat bila tidak ada', input: 'textarea' }],
  ['IDE', 'SDK', 'Emulator', 'Kendali Versi'], 5)

ok('lolos validasi pustaka murid', () => LK.periksaStruktur('matriks', strukturA).length === 0)
ok('key dibuat otomatis dari label', () =>
  strukturA.kolom[0].key === 'fungsi' && strukturA.kolom[1].key === 'akibat_bila_tidak_ada')
ok('4 baris tersimpan', () => strukturA.baris.length === 4)

// Sekarang uji sisi murid membacanya
const lembarMurid = { tipe: 'matriks', struktur: strukturA }
ok('murid membaca 4 baris', () => LK.jumlahBaris(lembarMurid) === 4)
ok('murid membaca 2 kolom', () => LK.kolom(lembarMurid).length === 2)
ok('murid membaca label baris benar', () => LK.labelBaris(lembarMurid)[0] === 'IDE')
ok('murid bisa tulis & baca sel pakai key hasil guru', () => {
  let data = {}
  data = LK.tulisSel(data, 0, strukturA.kolom[0].key, 'Menulis kode')
  return LK.sel({ data }, 0, 'fungsi') === 'Menulis kode'
})

bab('Guru menyusun Tabel B (daftar)')
const strukturB = bangunStruktur('daftar',
  [{ label: 'Langkah', input: 'textarea' }, { label: 'Status', input: 'tri' }], [], 7)
ok('lolos validasi', () => LK.periksaStruktur('daftar', strukturB).length === 0)
ok('murid baca 7 baris', () => LK.jumlahBaris({ tipe: 'daftar', struktur: strukturB }) === 7)
ok('kolom tri terbaca', () => LK.kolom({ tipe:'daftar', struktur: strukturB })[1].input === 'tri')

bab('Guru menyusun formulir')
const strukturF = bangunStruktur('formulir',
  [{ label: 'Jawaban', input: 'textarea' }],
  ['Komponen yang disiapkan', 'Urutan pengerjaan'], 5)
ok('lolos validasi', () => LK.periksaStruktur('formulir', strukturF).length === 0)
ok('murid baca 2 baris label', () => LK.jumlahBaris({ tipe:'formulir', struktur: strukturF }) === 2)

bab('Penolakan struktur cacat (guru salah isi)')
ok('kolom tanpa nama ditolak sebelum simpan', () => {
  const s = bangunStruktur('matriks', [{ label: '  ', input: 'textarea' }], ['baris1'], 5)
  return s.kolom.length === 0   // kolom kosong tersaring
})
ok('matriks tanpa baris ditolak', () => {
  const s = bangunStruktur('matriks', [{ label: 'X', input: 'text' }], [], 5)
  return LK.periksaStruktur('matriks', s).length > 0
})

bab('Label rumit tetap jadi key aman')
ok('spasi & tanda baca → key bersih', () => LK.jadikanKey('Status (✓/✗)?') === 'status')
ok('label duplikat sekalipun, key sama terdeteksi', () => {
  const s = bangunStruktur('daftar',
    [{ label: 'Nilai' }, { label: 'Nilai' }], [], 3)
  // dua-duanya jadi key "nilai" → validasi harus menangkap
  return LK.periksaStruktur('daftar', s).some(g => g.includes('sama'))
})

bab('Syarat badge (dibangun penyunting badge)')
// Meniru penyusunan syarat di dialogBadge
function bangunSyarat(tipe, nilai) {
  const s = { tipe }
  if (tipe === 'task_selesai') s.task_kode = nilai
  else if (tipe === 'sprint_tuntas') s.sprint_nomor = nilai
  else if (tipe === 'level_tantangan') s.level = nilai
  else if (tipe === 'jumlah_tugas') s.jumlah = nilai
  return s
}
ok('syarat task_selesai benar', () => {
  const s = bangunSyarat('task_selesai', 'RPL-12.1-101')
  return s.tipe === 'task_selesai' && s.task_kode === 'RPL-12.1-101'
})
ok('syarat sprint_tuntas benar', () => {
  const s = bangunSyarat('sprint_tuntas', 1)
  return s.tipe === 'sprint_tuntas' && s.sprint_nomor === 1
})
ok('syarat level benar', () => bangunSyarat('level_tantangan', 3).level === 3)

bab('Struktur tahan banting (jsonb sebagai teks)')
ok('struktur berupa string JSON tetap terbaca', () => {
  const lembarStr = { tipe: 'matriks', struktur: JSON.stringify(strukturA) }
  return LK.jumlahBaris(lembarStr) === 4 && LK.kolom(lembarStr).length === 2
})
ok('struktur null tidak error', () =>
  LK.kolom({ tipe: 'daftar', struktur: null }).length === 0 && LK.jumlahBaris({ tipe: 'daftar', struktur: null }) === 5)
ok('struktur teks rusak tidak error', () =>
  LK.kolom({ tipe: 'matriks', struktur: '{rusak' }).length === 0)

console.log('\n' + '='.repeat(50) + '\nLULUS: ' + lulus + '    GAGAL: ' + gagal)
process.exit(gagal > 0 ? 1 : 0)
