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

  // Afektif: rata-rata berbobot dari komponen kedisiplinan yang tersedia.
  const a = arg.afektif ?? {}
  const komponen = [
    ['tepatWaktu', a.tepatWaktu, bobotAfektif.tepatWaktu],
    ['keaktifan', a.keaktifan, bobotAfektif.keaktifan],
    ['tanpaTelat', a.tanpaTelat, bobotAfektif.tanpaTelat],
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

// Bobot komponen afektif (harus jumlah bebas; dinormalkan otomatis).
export const BOBOT_AFEKTIF_BAWAAN = {
  tepatWaktu: 35,     // menyerahkan tugas tepat/awal waktu
  keaktifan: 25,      // proporsi tugas dikerjakan (keterlibatan)
  tanpaTelat: 25,     // tidak ada tugas yang terlambat
  badgeDisiplin: 15,  // memperoleh badge kedisiplinan (tepat_estimasi)
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
