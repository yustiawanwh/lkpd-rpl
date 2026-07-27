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

export function jumlahBaris(lembar) {
  const s = strukturDari(lembar)
  switch (lembar?.tipe) {
    case 'matriks':
    case 'formulir':  return (s.baris ?? []).length
    case 'referensi': return (s.data ?? []).length
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
    if (data.length === 0) galat.push('Tabel referensi harus punya minimal satu baris data.')
    const lebar = (struktur?.kolom_baca ?? []).length
    data.forEach((baris, i) => {
      if (lebar > 0 && baris.length !== lebar) {
        galat.push(`Baris data ke-${i + 1} tidak sesuai jumlah kolom (${lebar}).`)
      }
    })
  }

  return galat
}
