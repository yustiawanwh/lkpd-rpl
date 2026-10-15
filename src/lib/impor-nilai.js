/**
 * Logika impor nilai dari Excel (tanpa DOM / jaringan, sehingga bisa diuji).
 *
 * Alur: templat berisi daftar murid sebuah tugas → guru mengisi kolom
 * "Nilai baru" (angka 0–100 atau huruf A–E) dan opsional "Umpan balik" →
 * berkas diunggah → rencanaImpor() menentukan baris mana yang akan dinilai.
 *
 * Aturan (disepakati):
 *   - Murid yang BELUM mengumpulkan (belum berstatus review/selesai) dilewati.
 *   - Murid yang sudah dinilai hanya ditimpa bila opsi `timpa` aktif.
 *   - Sel nilai kosong dilewati.
 */

export const KOLOM = {
  absen: 'No. Absen',
  nama: 'Nama',
  status: 'Status',
  sekarang: 'Nilai sekarang',
  baru: 'Nilai baru (0–100 atau A–E)',
  umpan: 'Umpan balik (opsional)',
  id: 'ID (jangan diubah)',
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Teks status progres untuk templat & pratinjau. */
export function labelStatus(pr) {
  if (!pr) return 'Belum mulai'
  if (pr.status === 'review') return 'Menunggu review'
  if (pr.status === 'selesai') return pr.nilai_huruf ? 'Sudah dinilai' : 'Selesai (belum dinilai)'
  return 'Belum mengumpulkan'
}

export function sudahKumpul(pr) {
  return !!pr && (pr.status === 'review' || pr.status === 'selesai')
}

export function teksNilaiPr(pr) {
  if (!pr?.nilai_huruf) return ''
  return pr.nilai_angka != null ? `${pr.nilai_angka} (${pr.nilai_huruf})` : pr.nilai_huruf
}

/**
 * Baca isi satu sel nilai.
 * @returns {{kosong:true} | {angka:number, dibulatkan?:boolean} | {huruf:string} | {galat:string}}
 */
export function bacaNilai(v) {
  if (v === null || v === undefined) return { kosong: true }
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0 || v > 100) return { galat: `Angka ${v} di luar 0–100` }
    const r = Math.round(v)
    return r === v ? { angka: r } : { angka: r, dibulatkan: true }
  }
  const t = String(v).trim()
  if (t === '') return { kosong: true }
  if (/^[a-e]$/i.test(t)) return { huruf: t.toUpperCase() }
  if (/^\d+([.,]\d+)?$/.test(t)) return bacaNilai(Number(t.replace(',', '.')))
  return { galat: `"${t}" bukan angka 0–100 atau huruf A–E` }
}

/** Baris data templat (urut absen lalu nama). */
export function barisTemplat(murid, petaProgres) {
  return [...murid]
    .sort((a, b) => String(a.no_absen ?? '').localeCompare(String(b.no_absen ?? ''), undefined, { numeric: true })
      || String(a.nama ?? '').localeCompare(String(b.nama ?? '')))
    .map(m => {
      const pr = petaProgres.get(m.murid_id)
      return {
        absen: m.no_absen ?? '', nama: m.nama ?? '', status: labelStatus(pr),
        sekarang: teksNilaiPr(pr), id: m.murid_id,
      }
    })
}

/** Temukan baris judul & posisi kolom pada data sheet. */
export function cariKolom(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const h = (rows[r] ?? []).map(norm)
    const idx = (uji) => h.findIndex(uji)
    const iBaru = idx(x => x.startsWith('nilai baru')) >= 0 ? idx(x => x.startsWith('nilai baru'))
      : idx(x => x.startsWith('nilai') && !x.startsWith('nilai sekarang') && !x.startsWith('nilai lama'))
    const iNama = idx(x => x === 'nama' || x.startsWith('nama '))
    if (iBaru >= 0 && (iNama >= 0 || idx(x => x.startsWith('id')) >= 0)) {
      return {
        baris: r, baru: iBaru, nama: iNama,
        id: idx(x => x.startsWith('id')),
        absen: idx(x => x.startsWith('no. absen') || x.startsWith('no absen') || x === 'absen' || x === 'no'),
        umpan: idx(x => x.startsWith('umpan')),
      }
    }
  }
  return null
}

/**
 * Susun rencana impor.
 * @param rows        data sheet (array baris dari read-excel-file)
 * @param murid       [{ murid_id, nama, no_absen }]
 * @param petaProgres Map murid_id → { id, status, nilai_huruf, nilai_angka, umpan_balik }
 * @param opsi        { timpa: boolean }
 * @returns { galat?: string, baris: [{ nomorBaris, nama, lama, baru, umpan, aksi, ket, progresId, nilai }] }
 *   aksi: 'nilai' | 'lewati' | 'galat'
 */
export function rencanaImpor(rows, murid, petaProgres, { timpa = false } = {}) {
  const kol = cariKolom(rows)
  if (!kol) return { galat: 'Kolom "Nama" dan "Nilai baru" tidak ditemukan. Pakai templat dari tombol "Unduh templat".', baris: [] }

  const perId = new Map(murid.map(m => [String(m.murid_id), m]))
  const perNama = new Map()
  for (const m of murid) {
    const k = norm(m.nama)
    perNama.set(k, perNama.has(k) ? null : m)   // null = nama kembar → tak bisa dipakai
  }
  const perAbsen = new Map()
  for (const m of murid) if (m.no_absen != null && m.no_absen !== '') {
    const k = String(m.no_absen).trim()
    perAbsen.set(k, perAbsen.has(k) ? null : m)
  }

  const hasil = []
  const sudah = new Set()
  for (let r = kol.baris + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const sel = (i) => (i >= 0 ? row[i] : null)
    const namaSel = String(sel(kol.nama) ?? '').trim()
    const idSel = String(sel(kol.id) ?? '').trim()
    const nilaiSel = sel(kol.baru)
    const umpanSel = String(sel(kol.umpan) ?? '').trim()
    if (!namaSel && !idSel && (nilaiSel === null || String(nilaiSel).trim() === '')) continue   // baris kosong

    const dasar = { nomorBaris: r + 1, nama: namaSel || '—', umpan: umpanSel || null }
    let m = (idSel && perId.get(idSel)) || (namaSel && perNama.get(norm(namaSel)))
      || (kol.absen >= 0 && perAbsen.get(String(sel(kol.absen) ?? '').trim())) || null

    const n = bacaNilai(nilaiSel)
    if (!m) {
      if (n.kosong) continue
      hasil.push({ ...dasar, aksi: 'galat', ket: 'Murid tidak ditemukan di kelas ini' }); continue
    }
    dasar.nama = m.nama
    const pr = petaProgres.get(m.murid_id)
    dasar.lama = teksNilaiPr(pr)

    if (sudah.has(m.murid_id)) { hasil.push({ ...dasar, aksi: 'galat', ket: 'Murid muncul lebih dari sekali' }); continue }
    sudah.add(m.murid_id)

    if (n.kosong) { hasil.push({ ...dasar, aksi: 'lewati', ket: 'Nilai kosong' }); continue }
    if (n.galat) { hasil.push({ ...dasar, aksi: 'galat', ket: n.galat }); continue }
    dasar.baru = n.huruf ?? String(n.angka)
    dasar.nilai = n

    if (!sudahKumpul(pr)) { hasil.push({ ...dasar, aksi: 'lewati', ket: 'Belum mengumpulkan' }); continue }
    if (pr.nilai_huruf) {
      const sama = n.huruf ? (pr.nilai_angka == null && pr.nilai_huruf === n.huruf)
                           : (pr.nilai_angka === n.angka)
      if (sama && !umpanSel) { hasil.push({ ...dasar, aksi: 'lewati', ket: 'Tidak berubah' }); continue }
      if (!timpa) { hasil.push({ ...dasar, aksi: 'lewati', ket: 'Sudah dinilai (timpa nonaktif)' }); continue }
    }
    hasil.push({ ...dasar, aksi: 'nilai', progresId: pr.id,
      ket: (pr.nilai_huruf ? 'Timpa nilai lama' : 'Akan dinilai') + (n.dibulatkan ? ' · dibulatkan' : '') })
  }
  return { baris: hasil }
}
