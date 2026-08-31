/**
 * Laporan TIGA RANAH (K13): Kognitif, Psikomotor, Afektif per murid.
 *
 * - Kognitif & Psikomotor: rata-rata nilai tugas berlabel ranah tsb.
 * - Afektif: otomatis dari kedisiplinan (ketepatan waktu, keaktifan,
 *   tanpa telat, badge disiplin).
 *
 * Nilai 0–100. Ekspor CSV agar mudah dibuka Excel/Sheets.
 */
import { el, isi, $$, roti, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { sb } from '../lib/supabase.js'
import { rekapTigaRanah } from '../rutin/papan.js'
import { hitungTigaRanah, predikatRanah } from '../lib/ranah.js'
import { pergiKe } from '../main.js'

export async function halamanTigaRanah(wadah, penugasanId) {
  isi(wadah, rangkaMuat('220px'))

  let pen, rekap, nilaiTelat = 60
  try {
    const [{ data, error }, { data: setDasar }] = await Promise.all([
      sb.from('penugasan')
        .select('id, kelas_id, kelas(nama), tujuan_pembelajaran(id, kode, judul)')
        .eq('id', penugasanId).single(),
      sb.from('pengaturan').select('nilai').eq('kunci', 'afektif_dasar').maybeSingle(),
    ])
    if (error) throw error
    pen = data
    // "afektif_dasar" kini bermakna NILAI UNTUK YANG TELAT (batas bawah).
    // Bawaan 60; dibatasi 0..100.
    const d = Number(setDasar?.nilai?.dasar)
    if (Number.isFinite(d)) nilaiTelat = Math.min(100, Math.max(0, d))
    rekap = await rekapTigaRanah(penugasanId, pen.tujuan_pembelajaran.id, nilaiTelat)
  } catch (err) {
    isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))))); return
  }

  // Hitung tiga ranah tiap murid, urut nomor absen.
  const baris = rekap.murid.map(m => {
    const r = hitungTigaRanah({
      kognitif: m.kognitif, psikomotor: m.psikomotor, afektif: m.afektif,
    })
    return { ...m, ...r }
  }).sort((a, b) => {
    const na = parseInt(a.profil?.no_absen ?? '', 10)
    const nb = parseInt(b.profil?.no_absen ?? '', 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return (a.profil?.nama ?? '').localeCompare(b.profil?.nama ?? '')
  })

  const angka = (n) => n == null ? '—' : String(n)

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
          onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
        el('h1', {}, 'Nilai Tiga Ranah'),
        el('p', {}, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode} — ${pen.tujuan_pembelajaran?.judul}`)),
      el('div', { class: 'kepala-kanan' },
        el('button', { class: 'tbl tbl-utama', onClick: () => unduhCsv(baris, pen) }, 'Unduh Excel (CSV)'))),

    el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('p', { gaya: { color: 'var(--tinta-lembut)', fontSize: '13px', marginTop: '0' } },
        'Kognitif & Psikomotor dihitung dari rata-rata nilai tugas sesuai ranahnya (label di penyunting LKPD). ' +
        'Afektif dihitung otomatis dari kedisiplinan: ketepatan pengumpulan (makin awal mengumpulkan sebelum tenggat makin tinggi, kisaran 75–95; telat mendapat nilai batas bawah), keaktifan mengerjakan tugas, dan bonus badge disiplin. ' +
        'Skala 0–100. Tanda “—” berarti belum ada data.'),

      el('div', { class: 'tabel-bungkus' },
        el('table', { class: 'data', gaya: { minWidth: '560px' } },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Absen'), el('th', {}, 'Nama'),
            el('th', { class: 'angka' }, 'Kognitif'),
            el('th', { class: 'angka' }, 'Psikomotor'),
            el('th', { class: 'angka' }, 'Afektif'))),
          el('tbody', {}, ...baris.map(r =>
            el('tr', {},
              el('td', { class: 'mono tengah' }, r.profil?.no_absen ?? '—'),
              el('td', {}, r.profil?.nama ?? '—'),
              selNilai(r.kognitif), selNilai(r.psikomotor), selNilai(r.afektif)))))),

      baris.length === 0 && el('p', { gaya: { color: 'var(--tinta-lembut)' } },
        'Belum ada data murid untuk penugasan ini.'))),
  )

  function selNilai(n) {
    const teks = n == null ? '—' : `${n} (${predikatRanah(n)})`
    return el('td', { class: 'angka' }, teks)
  }
}

// Ekspor CSV.
function unduhCsv(baris, pen) {
  const kolom = ['No Absen', 'Nama', 'Kognitif', 'Psikomotor', 'Afektif']
  const larik = [kolom]
  for (const r of baris) {
    larik.push([
      r.profil?.no_absen ?? '', r.profil?.nama ?? '',
      r.kognitif ?? '', r.psikomotor ?? '', r.afektif ?? '',
    ])
  }
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const isiCsv = larik.map(row => row.map(escape).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + isiCsv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const namaBerkas = ('nilai_tiga_ranah_' + (pen.kelas?.nama ?? '') + '_' + (pen.tujuan_pembelajaran?.kode ?? ''))
    .replace(/[^\w.-]+/g, '_') + '.csv'
  const a = el('a', { href: url, download: namaBerkas })
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
  roti('Berkas CSV diunduh')
}
