/**
 * Konversi capaian LKPD menjadi nilai 0–100.
 *
 * MODEL BARU (disepakati): nilai akhir per sprint adalah gabungan
 * berbobot dari tiga komponen, total maksimal 100:
 *   1. REVIEW guru   — nilai huruf A–E per tugas inti, dirata-rata.
 *   2. BADGE          — jumlah badge diraih pada sprint itu.
 *   3. KECEPATAN      — peringkat kecepatan kumpul + penalti telat.
 *
 * Bobot default: 65% review, 20% badge, 15% kecepatan. Bisa diubah admin
 * lewat Pengaturan (disimpan di tabel `pengaturan`, kunci `bobot_nilai`).
 *
 * Model lama (ketuntasan inti + bonus) masih tersedia lewat hitungNilai()
 * agar layar/uji lama tetap jalan, tetapi layar nilai kini memakai
 * hitungNilaiSprint().
 */

/** Bobot & parameter bawaan. */
export const BOBOT_BAWAAN = {
  dasarInti: 1.0, poinPerTantangan: 4, poinPerBadge: 2, maksimum: 100,
  review: 65, badge: 20, kecepatan: 15,
  poin_per_badge: 10,
  penalti_telat_per_jam: 2,
  penalti_telat_maks: 40,
}

/** Nilai angka (0..100) untuk tiap huruf review. */
export const NILAI_HURUF = { A: 100, B: 85, C: 75, D: 60, E: 40 }
export const LABEL_HURUF = {
  A: 'Sempurna', B: 'Bagus', C: 'Cukup', D: 'Kurang', E: 'Tidak lulus',
}

export function nilaiReview(hurufList, intiTotal) {
  const total = Math.max(intiTotal ?? hurufList.length, hurufList.length)
  if (total === 0) return 0
  const jumlah = hurufList.reduce((n, h) => n + (NILAI_HURUF[h] ?? 0), 0)
  return jumlah / total
}

export function nilaiKecepatan(p, b = BOBOT_BAWAAN) {
  if (!p || p.peringkat == null) return 0
  const n = Math.max(1, p.jumlahKumpul ?? 1)
  const posisi = Math.min(p.peringkat, n)
  const skorPeringkat = n === 1 ? 100 : 100 - ((posisi - 1) / (n - 1)) * 40
  const jamTelat = Math.max(0, p.jamTelat ?? 0)
  const penalti = Math.min(jamTelat * (b.penalti_telat_per_jam ?? 2),
                           b.penalti_telat_maks ?? 40)
  return Math.max(0, skorPeringkat - penalti)
}

export function hitungNilaiSprint(komp, bobot = {}) {
  const b = { ...BOBOT_BAWAAN, ...bobot }
  const review = nilaiReview(komp.hurufList ?? [], komp.intiTotal ?? 0)
  const badge = Math.min(100, (komp.jumlahBadge ?? 0) * (b.poin_per_badge ?? 10))
  const kecepatan = nilaiKecepatan(komp.kecepatan, b)
  const totalBobot = (b.review ?? 0) + (b.badge ?? 0) + (b.kecepatan ?? 0) || 1
  const wR = (b.review ?? 0) / totalBobot
  const wB = (b.badge ?? 0) / totalBobot
  const wK = (b.kecepatan ?? 0) / totalBobot
  const nilai = Math.round(Math.min(100, review * wR + badge * wB + kecepatan * wK))
  return {
    nilai,
    predikat: predikatUntuk(nilai),
    rincian: {
      review: Math.round(review), badge: Math.round(badge),
      kecepatan: Math.round(kecepatan),
      bobot: { review: Math.round(wR * 100), badge: Math.round(wB * 100), kecepatan: Math.round(wK * 100) },
    },
  }
}

/* Model lama — dipertahankan agar layar & uji lama tetap jalan. */
export function hitungNilai(capaian, bobot = {}) {
  const b = { ...BOBOT_BAWAAN, ...bobot }
  const intiTotal = Math.max(0, capaian.inti_total ?? 0)
  const intiSelesai = Math.min(Math.max(0, capaian.inti_selesai ?? 0), intiTotal)
  const tantangan = Math.max(0, capaian.tantangan_selesai ?? 0)
  const badge = Math.max(0, capaian.jumlah_badge ?? 0)
  const proporsiInti = intiTotal > 0 ? intiSelesai / intiTotal : 0
  const dasar = proporsiInti * 100 * b.dasarInti
  const bonus = tantangan * b.poinPerTantangan + badge * b.poinPerBadge
  const nilai = Math.round(Math.min(dasar + bonus, b.maksimum))
  return {
    nilai, dasar: Math.round(dasar), bonus: Math.round(bonus),
    tuntas: intiTotal > 0 && intiSelesai === intiTotal,
    predikat: predikatUntuk(nilai),
    rincian: { intiSelesai, intiTotal, tantangan, badge },
  }
}

export function predikatUntuk(nilai) {
  if (nilai >= 90) return 'Sangat Baik'
  if (nilai >= 80) return 'Baik'
  if (nilai >= 70) return 'Cukup'
  return 'Perlu Bimbingan'
}

export function warnaPredikat(nilai) {
  if (nilai >= 90) return 'hijau'
  if (nilai >= 80) return 'biru'
  if (nilai >= 70) return 'kuning'
  return 'merah'
}
