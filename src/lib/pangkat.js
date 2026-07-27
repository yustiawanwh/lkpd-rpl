/**
 * Pangkat & level berdasarkan XP.
 * Ambangnya harus sama persis dengan fungsi pangkat_untuk() di basis data.
 */

export const PANGKAT = [
  [0,    'Intern'],
  [100,  'Junior Developer I'],
  [250,  'Junior Developer II'],
  [450,  'Associate Developer'],
  [700,  'Developer'],
  [1000, 'Senior Developer'],
  [1400, 'Tech Lead'],
]

export function pangkatUntuk(xp) {
  let nama = 'Intern'
  for (const [ambang, label] of PANGKAT) if (xp >= ambang) nama = label
  return nama
}

export function levelUntuk(xp) {
  let level = 1
  PANGKAT.forEach(([ambang], i) => { if (xp >= ambang) level = i + 1 })
  return level
}

export function ambangBerikutnya(xp) {
  for (const [ambang] of PANGKAT) if (xp < ambang) return ambang
  return PANGKAT[PANGKAT.length - 1][0]
}

/** Persentase menuju pangkat berikutnya, 0–100. */
export function persenKeBerikutnya(xp) {
  const berikut = ambangBerikutnya(xp)
  let sekarang = 0
  for (const [ambang] of PANGKAT) if (xp >= ambang) sekarang = ambang
  if (berikut <= sekarang) return 100
  return Math.min(100, Math.round(((xp - sekarang) / (berikut - sekarang)) * 100))
}

/** Format detik menjadi "12:34" atau "1:02:03". */
export function formatWaktu(detik) {
  const d = Math.max(0, Math.round(detik))
  const j = Math.floor(d / 3600)
  const m = Math.floor((d % 3600) / 60)
  const s = d % 60
  const p = (n) => String(n).padStart(2, '0')
  return j ? `${j}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
}
