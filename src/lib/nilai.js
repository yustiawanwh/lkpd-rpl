/**
 * Konversi capaian LKM menjadi nilai 0–100.
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
  tantangan: 10,
  poin_per_badge: 10,
  penalti_telat_per_jam: 2,
  penalti_telat_per_hari: 20,
  penalti_telat_maks: 100,
  durasi_target_jam: 24,
  penalti_lambat: 50,
  penalti_lambat_maks: 100,
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

/**
 * Skor KETEPATAN WAKTU (menggantikan "kecepatan-balapan" yang bisa dimanipulasi).
 *
 * Prinsip adil: tidak ada balapan antar murid. Yang mengumpulkan tepat waktu
 * (sebelum/pada tenggat) mendapat skor PENUH; yang telat dikenai penalti
 * sebanding lamanya keterlambatan. Urutan siapa duluan TIDAK lagi memengaruhi
 * nilai — sehingga menyelesaikan cepat di akhir (indikasi menyalin) tak lagi
 * memberi keuntungan.
 */
export function nilaiKecepatan(p, b = BOBOT_BAWAAN) {
  if (!p) return 0
  // Belum mengumpulkan: skor 0.
  if (p.sudahKumpul === false) return 0
  // Durasi pengerjaan (jam) dari tanggal mulai penugasan sampai serah.
  // Bila tanggal mulai tak diketahui, tak bisa dinilai adil → skor penuh.
  if (p.jamDurasi == null) return 100
  const target = Math.max(1, b.durasi_target_jam ?? 24)   // jam target (bawaan 1 hari)
  const durasi = Math.max(0, p.jamDurasi)
  if (durasi <= target) return 100        // selesai dalam target → penuh
  // Lebih lama dari target: turun bertahap per "kelipatan target" di atasnya.
  const kelebihan = (durasi - target) / target      // 1 = dua kali target
  const penalti = Math.min(kelebihan * (b.penalti_lambat ?? 50), b.penalti_lambat_maks ?? 100)
  return Math.max(0, Math.round(100 - penalti))
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
  const dasar = Math.min(100, review * wR + badge * wB + kecepatan * wK)

  // Porsi tantangan (Cara B): tantangan bertindak sebagai "pengunci" batas atas.
  // Tanpa tantangan, nilai dibatasi (100 - porsi)%. Porsi dibuka sebanding
  // dengan proporsi tugas tantangan yang sudah DINILAI. Bila sprint tidak punya
  // tugas tantangan, batas atas kembali 100% (tidak menghukum).
  const porsi = Math.max(0, Math.min(100, b.tantangan ?? 0)) / 100
  const tTotal = komp.tantanganTotal ?? 0
  const tDinilai = Math.min(komp.tantanganDinilai ?? 0, tTotal)
  const rasioTantangan = tTotal > 0 ? (tDinilai / tTotal) : 1   // tak ada tantangan = penuh
  const batas = (1 - porsi) + porsi * rasioTantangan            // 0..1
  const nilai = Math.round(Math.min(100, dasar) * batas)

  return {
    nilai,
    predikat: predikatUntuk(nilai),
    rincian: {
      review: Math.round(review), badge: Math.round(badge),
      kecepatan: Math.round(kecepatan),
      tantangan: { dinilai: tDinilai, total: tTotal, persenBatas: Math.round(batas * 100) },
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
