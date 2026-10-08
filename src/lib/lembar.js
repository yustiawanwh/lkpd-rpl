/**
 * Membaca & memvalidasi struktur lembar kerja (Tabel A–G).
 *
 * Struktur disimpan sebagai jsonb di basis data, sehingga tabel baru
 * bisa dibuat guru lewat panel tanpa mengubah kode ini.
 */

export const TIPE = {
  matriks:   'Matriks — baris tetap, kolom tetap',
  daftar:    'Daftar — baris bernomor',
  formulir:  'Formulir — label & isian',
  referensi: 'Referensi — tabel bacaan + kolom isian',
  soal:      'Soal — butir bernomor (isian, pilihan ganda, centang)',
}

/* ==========================================================
   LEMBAR JENIS "SOAL"
   struktur = { soal: [ { id, no, jenis, teks, opsi?, kunci?, label? } ] }
   Jawaban murid (isian_lembar.data) per butir, kunci = id butir:
     singkat/panjang → { jawab: "teks" }
     pg              → { pilih: "1" }        (indeks opsi, teks)
     centang         → { pilih: [0, 2] }     (indeks opsi terpilih)
     kolom           → { k0: "…", k1: "…" }  (kotak berdampingan)
     info            → (tanpa jawaban)
   ========================================================== */
export const JENIS_SOAL = {
  singkat: 'Isian singkat',
  panjang: 'Isian panjang',
  pg:      'Pilihan ganda (pilih satu)',
  centang: 'Centang (boleh lebih dari satu)',
  kolom:   'Kotak berdampingan (mis. Tebakan & Hasil)',
  info:    'Petunjuk saja (tanpa jawaban)',
}
export const LABEL_TEBAK = ['Tebakan', 'Hasil sebenarnya']

export function daftarSoal(lembar) { return strukturDari(lembar).soal ?? [] }

export function idSoalBaru() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** Butir pilihan (pg/centang) yang punya kunci → benar/salah; selain itu null. */
export function cekKunci(soal, jawaban) {
  if (soal.jenis === 'pg') {
    if (soal.kunci === null || soal.kunci === undefined || soal.kunci === '') return null
    const p = jawaban?.pilih
    if (p === undefined || p === null || p === '') return false
    return Number(p) === Number(soal.kunci)
  }
  if (soal.jenis === 'centang') {
    if (!Array.isArray(soal.kunci)) return null
    const p = Array.isArray(jawaban?.pilih) ? jawaban.pilih.map(Number) : []
    const a = [...new Set(p)].sort((x, y) => x - y), b = [...new Set(soal.kunci.map(Number))].sort((x, y) => x - y)
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return null
}

/** Ringkasan kunci: { benar, total } untuk butir yang punya kunci. */
export function skorKunci(lembar, data) {
  let benar = 0, total = 0
  for (const s of daftarSoal(lembar)) {
    const h = cekKunci(s, data?.[s.id])
    if (h === null) continue
    total++; if (h) benar++
  }
  return { benar, total }
}

const ALIAS_JENIS = {
  singkat: 'singkat', pendek: 'singkat',
  panjang: 'panjang', isian: 'panjang', uraian: 'panjang',
  pg: 'pg', pilihan: 'pg', radio: 'pg', ganda: 'pg',
  centang: 'centang', checkbox: 'centang', cek: 'centang',
  tebak: 'kolom', kolom: 'kolom', kotak: 'kolom',
  info: 'info', petunjuk: 'info', bacaan: 'info',
}

/**
 * Mengurai teks impor menjadi larik butir soal. Format:
 *
 *   ### 2b | pg
 *   Sebelum menjalankan, lingkari tebakan kalian:
 *   - [ ] Error, karena ekskul adalah const
 *   - [x] Berhasil, dan kuota menjadi 25      ← [x] = kunci (opsional)
 *
 *   ### 3g-1 | tebak                          ← dua kotak: Tebakan & Hasil
 *   ### 2f | kolom: Method / Hasil            ← kotak dengan judul sendiri
 *
 * Jenis: singkat, panjang (bawaan), pg, centang, tebak, kolom, info.
 * Baris "- [ ]" di dalam blok kode ``` tidak dianggap pilihan.
 */
export function uraiSoalTeks(teks) {
  const baris = String(teks ?? '').replace(/\r/g, '').split('\n')
  const hasil = []
  let cur = null, dalamKode = false
  const tutup = () => {
    if (!cur) return
    cur.teks = cur._teks.join('\n').replace(/^\n+|\s+$/g, '')
    delete cur._teks
    if (cur.jenis === 'pg') {
      const k = cur._kunci; cur.kunci = k.length ? k[0] : null
    } else if (cur.jenis === 'centang') {
      cur.kunci = cur._kunci.length ? cur._kunci : null
    }
    delete cur._kunci
    if (!['pg', 'centang'].includes(cur.jenis)) delete cur.opsi
    if (cur.jenis !== 'kolom') delete cur.label
    hasil.push(cur); cur = null
  }
  for (const b of baris) {
    if (/^\s*```/.test(b)) dalamKode = !dalamKode
    const h = !dalamKode && b.match(/^###\s*([^|]*?)\s*(?:\|\s*([A-Za-z]+)\s*(?::\s*(.*))?)?\s*$/)
    if (h && !/^\s*```/.test(b)) {
      tutup()
      const jenis = ALIAS_JENIS[(h[2] ?? 'panjang').toLowerCase()] ?? 'panjang'
      let label = h[3] ? h[3].split('/').map(x => x.trim()).filter(Boolean) : null
      if (jenis === 'kolom' && (!label || label.length < 2)) {
        label = (h[2] ?? '').toLowerCase() === 'tebak' || !label ? [...LABEL_TEBAK] : [...label, 'Jawaban']
      }
      cur = { id: idSoalBaru() + hasil.length, no: h[1].trim(), jenis, _teks: [], opsi: [], _kunci: [], label }
      continue
    }
    const o = !dalamKode && cur && b.match(/^\s*-\s*\[( |x|X)\]\s?(.*)$/)
    if (o) {
      if (o[1].toLowerCase() === 'x') cur._kunci.push(cur.opsi.length)
      cur.opsi.push(o[2].trim())
      continue
    }
    if (!cur) {
      if (b.trim() === '') continue
      cur = { id: idSoalBaru() + hasil.length, no: '', jenis: 'info', _teks: [], opsi: [], _kunci: [], label: null }
    }
    cur._teks.push(b)
  }
  tutup()
  return hasil
}

/** Kebalikan uraiSoalTeks — untuk menyunting ulang sebagai teks. */
export function soalKeTeks(daftar) {
  const nama = { singkat: 'singkat', panjang: 'panjang', pg: 'pg', centang: 'centang', kolom: 'kolom', info: 'info' }
  return (daftar ?? []).map(s => {
    let kepala = `### ${s.no ?? ''} | ${nama[s.jenis] ?? 'panjang'}`
    if (s.jenis === 'kolom') kepala += ': ' + (s.label ?? LABEL_TEBAK).join(' / ')
    const bagian = [kepala]
    if (s.teks) bagian.push(s.teks)
    if (s.jenis === 'pg' || s.jenis === 'centang') {
      const kunci = (s.jenis === 'pg' ? [s.kunci] : (Array.isArray(s.kunci) ? s.kunci : []))
        .filter(k => k !== null && k !== undefined && k !== '').map(Number)
      ;(s.opsi ?? []).forEach((o, i) => bagian.push(`- [${kunci.includes(i) ? 'x' : ' '}] ${o}`))
    }
    return bagian.join('\n')
  }).join('\n\n')
}

export const INPUT = {
  text:     'Isian singkat',
  textarea: 'Isian panjang',
  tri:      'Centang ✓ / ✗',
  angka:    'Angka',
  pilihan:  'Pilihan',
}

/**
 * Ambil struktur sebagai objek. Umumnya Supabase mengembalikan jsonb
 * sebagai objek yang sudah diurai, tetapi pada beberapa konfigurasi bisa
 * berupa teks JSON. Fungsi ini menangani keduanya agar tabel selalu muncul.
 */
export function strukturDari(lembar) {
  let s = lembar?.struktur
  if (typeof s === 'string') {
    try { s = JSON.parse(s) } catch { s = null }
  }
  return s ?? {}
}

export function kolom(lembar)      { return strukturDari(lembar).kolom ?? [] }
export function labelBaris(lembar) { return strukturDari(lembar).baris ?? [] }
export function dataReferensi(l)   { return strukturDari(l).data ?? [] }
export function kolomBaca(l)       { return strukturDari(l).kolom_baca ?? [] }

/**
 * Apakah struktur lembar cukup lengkap untuk ditampilkan ke murid?
 * Referensi: cukup punya kolom bacaan + data (kolom isian murid opsional).
 * Jenis lain: wajib punya kolom isian dan baris.
 */
export function strukturSiap(lembar) {
  if (lembar?.tipe === 'soal') return daftarSoal(lembar).length > 0
  if (lembar?.tipe === 'referensi') {
    return kolomBaca(lembar).length > 0 && dataReferensi(lembar).length > 0
  }
  return kolom(lembar).length > 0 && jumlahBaris(lembar) > 0
}

/**
 * Mengurai teks tempelan dari Excel / Google Sheets / Word / Markdown
 * menjadi larik baris → larik sel. Pemisah: tab (Excel/Sheets/Word) atau
 * garis tegak | (tabel Markdown). Baris pemisah Markdown (---) dilewati.
 */
export function uraiTempelan(teks) {
  const baris = String(teks ?? '').replace(/\r/g, '').split('\n').filter(b => b.trim() !== '')
  if (!baris.length) return []
  const pakaiTab = baris.some(b => b.includes('\t'))
  return baris
    .map(b => pakaiTab
      ? b.split('\t')
      : b.trim().replace(/^\|/, '').replace(/\|$/, '').split('|'))
    .map(sel => sel.map(c => c.trim()))
    .filter(sel => !sel.every(c => /^:?-{2,}:?$/.test(c) || c === ''))
}

export function jumlahBaris(lembar) {
  const s = strukturDari(lembar)
  switch (lembar?.tipe) {
    case 'matriks':
    case 'formulir':  return (s.baris ?? []).length
    case 'referensi': return (s.data ?? []).length
    case 'soal':      return (s.soal ?? []).length
    default:          return Number(s.jumlah_baris ?? 5)
  }
}

export function kunciKolom(lembar) {
  return kolom(lembar).map(k => k.key).filter(Boolean)
}

/** Membaca satu sel dari isian murid. */
export function sel(isian, baris, kunci) {
  return isian?.data?.[String(baris)]?.[kunci] ?? ''
}

/** Menulis satu sel, mengembalikan objek data yang baru. */
export function tulisSel(data, baris, kunci, nilai) {
  const b = String(baris)
  return { ...data, [b]: { ...(data?.[b] ?? {}), [kunci]: nilai } }
}

/** Menghitung sel terisi — untuk indikator kelengkapan. */
export function jumlahTerisi(isian) {
  let n = 0
  for (const baris of Object.values(isian?.data ?? {})) {
    if (typeof baris !== 'object' || baris === null) continue
    for (const nilai of Object.values(baris)) {
      if (typeof nilai === 'string' ? nilai.trim() !== '' : nilai != null) n++
    }
  }
  return n
}

/** Membuat key otomatis dari label: "Akibat bila tidak ada" → "akibat_bila_tidak_ada" */
export function jadikanKey(label) {
  let s = String(label ?? '').toLowerCase().trim()
  s = s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_')
  return (s || 'kolom').slice(0, 40)
}

/**
 * Memeriksa struktur sebelum disimpan.
 * Mengembalikan larik pesan berbahasa Indonesia; kosong berarti sah.
 */
export function periksaStruktur(tipe, struktur) {
  const galat = []
  const kol = struktur?.kolom ?? []

  if (tipe === 'soal') return periksaSoal(struktur?.soal ?? [])

  if (tipe !== 'referensi' && kol.length === 0) {
    galat.push('Tabel harus punya minimal satu kolom.')
  }

  kol.forEach((k, i) => {
    const no = i + 1
    if (!k.label) galat.push(`Kolom ke-${no} belum diberi nama.`)
    if (!k.key)   galat.push(`Kolom ke-${no} tidak punya penanda (key).`)
    if (k.input && !(k.input in INPUT)) {
      galat.push(`Kolom ke-${no} memakai jenis isian yang tidak dikenal.`)
    }
    if (k.input === 'pilihan' && !(k.opsi?.length)) {
      galat.push(`Kolom ke-${no} bertipe pilihan tetapi belum punya daftar pilihan.`)
    }
  })

  const keys = kol.map(k => k.key)
  if (new Set(keys).size !== keys.length) {
    galat.push('Ada dua kolom dengan penanda yang sama.')
  }

  if ((tipe === 'matriks' || tipe === 'formulir') && !(struktur?.baris?.length)) {
    galat.push('Tabel jenis ini harus punya minimal satu baris.')
  }

  if (tipe === 'daftar') {
    const n = Number(struktur?.jumlah_baris ?? 0)
    if (n < 1)  galat.push('Jumlah baris minimal 1.')
    if (n > 50) galat.push('Jumlah baris maksimal 50.')
  }

  if (tipe === 'referensi') {
    const data = struktur?.data ?? []
    const lebar = (struktur?.kolom_baca ?? []).length
    if (lebar === 0) galat.push('Tabel referensi harus punya minimal satu kolom bacaan.')
    if (data.length === 0) galat.push('Tabel referensi harus punya minimal satu baris data.')
    data.forEach((baris, i) => {
      if (lebar > 0 && baris.length !== lebar) {
        galat.push(`Baris data ke-${i + 1} tidak sesuai jumlah kolom (${lebar}).`)
      }
    })
  }

  return galat
}

function periksaSoal(daftar) {
  const galat = []
  if (!daftar.length) galat.push('Lembar soal harus punya minimal satu butir.')
  daftar.forEach((q, i) => {
    const nama = `Butir ${q.no || i + 1}`
    if (!(q.jenis in JENIS_SOAL)) galat.push(`${nama}: jenis jawaban tidak dikenal.`)
    if (!String(q.teks ?? '').trim() && !(q.opsi ?? []).length) galat.push(`${nama}: pertanyaan masih kosong.`)
    if (q.jenis === 'pg' || q.jenis === 'centang') {
      const n = (q.opsi ?? []).filter(o => String(o).trim()).length
      if (n < 2) galat.push(`${nama}: pilihan jawaban minimal 2.`)
      if (q.jenis === 'pg' && q.kunci !== null && q.kunci !== undefined && !(q.kunci >= 0 && q.kunci < n)) {
        galat.push(`${nama}: kunci jawaban tidak cocok dengan pilihan.`)
      }
    }
    if (q.jenis === 'kolom' && !((q.label ?? []).length >= 1)) galat.push(`${nama}: kotak jawaban belum diberi judul.`)
  })
  const id = daftar.map(q => q.id)
  if (new Set(id).size !== id.length) galat.push('Ada dua butir dengan penanda yang sama.')
  return galat
}
