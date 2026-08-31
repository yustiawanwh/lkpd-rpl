/**
 * Perhitungan nilai TIGA RANAH gaya K13 (Kurikulum Merdeka berformat K13):
 *   - KOGNITIF   : rata-rata nilai tugas berlabel ranah 'kognitif'
 *   - PSIKOMOTOR : rata-rata nilai tugas berlabel ranah 'psikomotor'
 *   - AFEKTIF    : dihitung otomatis dari kedisiplinan (ketepatan waktu,
 *                  keaktifan, tak ada tugas telat, badge disiplin)
 *
 * Semua nilai berskala 0..100. Perhitungan MURNI dari data yang sudah ada —
 * tidak memerlukan penilaian manual tambahan dari guru.
 *
 * Sumber kebenaran huruf → angka mengikuti lib/nilai.js (A=100 dst).
 */
import { NILAI_HURUF } from './nilai.js'

// Rata-rata angka dari daftar huruf. Kosong → null (belum ada nilai).
function rataHuruf(hurufList) {
  if (!hurufList || hurufList.length === 0) return null
  const jml = hurufList.reduce((n, h) => n + (NILAI_HURUF[h] ?? 0), 0)
  return Math.round(jml / hurufList.length)
}

/**
 * Hitung tiga ranah untuk SATU murid.
 *
 * @param {object} arg
 *   hurufKognitif   : array huruf nilai tugas ranah kognitif
 *   hurufPsikomotor : array huruf nilai tugas ranah psikomotor
 *   afektif         : { tepatWaktu, keaktifan, tanpaTelat, badgeDisiplin }
 *                     tiap komponen 0..100 (atau null bila tak ada data)
 *   bobotAfektif    : bobot tiap komponen afektif (opsional)
 * @returns { kognitif, psikomotor, afektif, rincianAfektif }
 */
export function hitungTigaRanah(arg, bobotAfektif = BOBOT_AFEKTIF_BAWAAN) {
  const kognitif = rataHuruf(arg.hurufKognitif)
  const psikomotor = rataHuruf(arg.hurufPsikomotor)

  // Afektif mengukur SIKAP/KEDISIPLINAN. Komponen:
  //   - ketepatanKumpul : nilai dari JARAK waktu kumpul terhadap tenggat.
  //       Kumpul awal → mendekati 95, mepet → 75, telat → nilai tetap (batas
  //       bawah). Sudah berskala akhir (bukan proporsi), jadi TIDAK dipetakan
  //       ulang lewat baseline. Dihitung di rutin/papan.js.
  //   - keaktifan     : keterlibatan (tugas dikerjakan dari yang sudah waktunya)
  //   - badgeDisiplin : bonus opsional
  // Ketiga komponen digabung sebagai rata-rata tertimbang langsung (0..100).
  const a = arg.afektif ?? {}
  const komponen = [
    ['ketepatanKumpul', a.ketepatanKumpul, bobotAfektif.ketepatanKumpul],
    ['keaktifan', a.keaktifan, bobotAfektif.keaktifan],
    ['badgeDisiplin', a.badgeDisiplin, bobotAfektif.badgeDisiplin],
  ]
  let totalBobot = 0, totalNilai = 0
  const rincianAfektif = {}
  for (const [nama, nilai, bobot] of komponen) {
    rincianAfektif[nama] = nilai
    if (nilai != null && bobot > 0) { totalNilai += nilai * bobot; totalBobot += bobot }
  }
  const afektif = totalBobot > 0 ? Math.round(totalNilai / totalBobot) : null

  return { kognitif, psikomotor, afektif, rincianAfektif }
}

// Bobot komponen afektif (dinormalkan otomatis).
export const BOBOT_AFEKTIF_BAWAAN = {
  ketepatanKumpul: 50,  // nilai dari jarak kumpul→tenggat (awal=95, mepet=75, telat=batas bawah)
  keaktifan: 40,        // keterlibatan (tugas dikerjakan dari yang sudah waktunya)
  badgeDisiplin: 10,    // bonus bila meraih badge kedisiplinan
}

// Rentang nilai ketepatan pengumpulan (bisa disesuaikan bila perlu).
export const KETEPATAN_ATAS = 95    // kumpul paling awal
export const KETEPATAN_BAWAH = 75   // kumpul mepet tenggat
export const KETEPATAN_TELAT_BAWAAN = 60  // telat (batas bawah, dapat diatur)

/**
 * Nilai ketepatan pengumpulan SATU tugas dari posisi waktu kumpul dalam
 * rentang [mulai .. tenggat].
 *   - kumpul <= mulai      → KETEPATAN_ATAS (95)
 *   - kumpul == tenggat    → KETEPATAN_BAWAH (75)
 *   - di antaranya         → linear 95..75
 *   - kumpul > tenggat     → nilaiTelat (batas bawah, bawaan 60)
 * Bila tenggat tak ada → null (komponen diabaikan).
 */
export function nilaiKetepatanKumpul(kumpulMs, mulaiMs, tenggatMs, nilaiTelat = KETEPATAN_TELAT_BAWAAN) {
  if (tenggatMs == null || kumpulMs == null) return null
  if (kumpulMs > tenggatMs) return nilaiTelat            // telat
  // Bila mulai tak diketahui / rentang tak valid → anggap tepat waktu (95).
  if (mulaiMs == null || tenggatMs <= mulaiMs) return KETEPATAN_ATAS
  const posisi = (kumpulMs - mulaiMs) / (tenggatMs - mulaiMs)   // 0 (awal) .. 1 (mepet)
  const p = Math.min(1, Math.max(0, posisi))
  return Math.round(KETEPATAN_ATAS - p * (KETEPATAN_ATAS - KETEPATAN_BAWAH))
}

/** Predikat huruf sederhana dari angka (untuk tampilan opsional). */
export function predikatRanah(nilai) {
  if (nilai == null) return '—'
  if (nilai >= 90) return 'A'
  if (nilai >= 80) return 'B'
  if (nilai >= 70) return 'C'
  if (nilai >= 60) return 'D'
  return 'E'
}
