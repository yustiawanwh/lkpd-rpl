/**
 * Dialog "Impor nilai (Excel)" di halaman review guru.
 *
 * 1. Guru memilih tugas → unduh templat .xlsx berisi daftar murid kelas.
 * 2. Isi kolom "Nilai baru" (0–100 atau A–E) dan opsional "Umpan balik".
 * 3. Unggah → pratinjau (siapa dinilai, dilewati, bermasalah) → Terapkan.
 *
 * Penilaian memakai RPC yang SAMA dengan menilai manual (nilai_tugas /
 * nilai_tugas_angka), sehingga XP, badge, kunci tugas, dan rekap tetap
 * berjalan seperti biasa. Pustaka Excel dimuat hanya saat dialog dipakai.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, roti, dialog } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { KOLOM, barisTemplat, rencanaImpor, sudahKumpul } from '../lib/impor-nilai.js'

export async function dialogImporNilai(penugasanId, pen, padaSelesai) {
  const tpId = pen?.tujuan_pembelajaran?.id
  let murid = [], sprints = []
  try {
    const [rd, rs] = await Promise.all([
      sb.from('pendaftaran').select('murid_id, profil:murid_id(nama, no_absen)')
        .eq('kelas_id', pen.kelas_id).eq('aktif', true),
      sb.from('sprint').select('nomor, nama, tugas(id, kode, judul, urutan)')
        .eq('tujuan_pembelajaran_id', tpId).order('nomor'),
    ])
    if (rd.error) throw rd.error
    if (rs.error) throw rs.error
    murid = (rd.data ?? []).map(d => ({ murid_id: d.murid_id, nama: d.profil?.nama ?? '—', no_absen: d.profil?.no_absen ?? '' }))
    sprints = rs.data ?? []
  } catch (err) { roti(pesanGalat(err), '⚠'); return }

  const fTugas = el('select', {},
    el('option', { value: '' }, '— pilih tugas —'),
    ...sprints.map(s => el('optgroup', { label: `Sprint ${s.nomor}${s.nama ? ' — ' + s.nama : ''}` },
      ...[...(s.tugas ?? [])].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0) || String(a.kode).localeCompare(String(b.kode)))
        .map(t => el('option', { value: String(t.id) }, `${t.kode} — ${t.judul}`)))))
  const info = el('div', { class: 'impor-info' })
  const tblUnduh = el('button', { class: 'tbl tbl-kecil', disabled: true, onClick: unduhTemplat }, '⬇ Unduh templat Excel')
  const fBerkas = el('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disabled: true })
  const cekTimpa = el('input', { type: 'checkbox' })
  const area = el('div', { class: 'impor-pratinjau' })
  const tblTerapkan = el('button', { class: 'tbl tbl-utama', disabled: true, onClick: terapkan }, 'Terapkan')

  let tugas = null, petaProgres = new Map(), rows = null, rencana = null, sedangSimpan = false, adaPerubahan = false

  function tugasDipilih() {
    const id = Number(fTugas.value)
    for (const s of sprints) for (const t of (s.tugas ?? [])) if (t.id === id) return t
    return null
  }

  fTugas.addEventListener('change', async () => {
    tugas = tugasDipilih(); rows = null; rencana = null; fBerkas.value = ''
    isi(area); tblTerapkan.disabled = true
    tblUnduh.disabled = fBerkas.disabled = !tugas
    if (!tugas) { isi(info); return }
    isi(info, 'Memuat…')
    try {
      const { data, error } = await sb.from('progres_tugas')
        .select('id, murid_id, status, nilai_huruf, nilai_angka, umpan_balik')
        .eq('penugasan_id', penugasanId).eq('tugas_id', tugas.id)
      if (error) throw error
      petaProgres = new Map((data ?? []).map(p => [p.murid_id, p]))
      const kumpul = murid.filter(m => sudahKumpul(petaProgres.get(m.murid_id))).length
      const dinilai = murid.filter(m => petaProgres.get(m.murid_id)?.nilai_huruf).length
      isi(info, `${murid.length} murid · ${kumpul} sudah mengumpulkan · ${dinilai} sudah dinilai`)
    } catch (err) { isi(info, el('span', { class: 'teks-galat' }, pesanGalat(err))) }
  })

  async function unduhTemplat() {
    if (!tugas) return
    tblUnduh.disabled = true
    try {
      const { default: writeExcelFile } = await import('write-excel-file/universal')
      const tebal = (v) => ({ value: v, fontWeight: 'bold' })
      const kepala = [KOLOM.absen, KOLOM.nama, KOLOM.status, KOLOM.sekarang, KOLOM.baru, KOLOM.umpan, KOLOM.id].map(tebal)
      const data = barisTemplat(murid, petaProgres).map(b => [
        { value: String(b.absen) }, { value: b.nama }, { value: b.status }, { value: b.sekarang },
        { value: null }, { value: null }, { value: b.id },
      ])
      const kelas = pen?.kelas?.nama ?? ''
      const petunjuk = [
        [tebal('Kelas'), { value: kelas }],
        [tebal('Tugas'), { value: `${tugas.kode} — ${tugas.judul}` }],
        [tebal('Kode tugas'), { value: tugas.kode }],
        [],
        [tebal('Cara mengisi')],
        [{ value: '1. Isi kolom "Nilai baru" di sheet Nilai: angka 0–100 (mis. 87) atau huruf A–E.' }],
        [{ value: '2. Kolom "Umpan balik" boleh diisi, boleh dikosongkan.' }],
        [{ value: '3. Sel nilai yang kosong dilewati. Jangan mengubah kolom ID.' }],
        [{ value: '4. Murid yang belum mengumpulkan tugas ini di aplikasi akan dilewati.' }],
        [{ value: '5. Simpan, lalu unggah kembali di Brantas Dev Studio → Review → Impor nilai.' }],
        [],
        [{ value: 'Huruf otomatis untuk nilai angka: A ≥ 90 · B ≥ 80 · C ≥ 70 · D ≥ 60 · E < 60' }],
      ]
      const blob = await writeExcelFile([
        { data: [kepala, ...data], sheet: 'Nilai', stickyRowsCount: 1,
          columns: [{ width: 9 }, { width: 30 }, { width: 22 }, { width: 14 }, { width: 26 }, { width: 44 }, { width: 38 }] },
        { data: petunjuk, sheet: 'Petunjuk', columns: [{ width: 14 }, { width: 70 }] },
      ]).toBlob()
      const aman = (s) => String(s).replace(/[^\p{L}\p{N}._-]+/gu, '_')
      const a = el('a', { href: URL.createObjectURL(blob), download: `Nilai_${aman(kelas)}_${aman(tugas.kode)}.xlsx` })
      document.body.append(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch (err) { roti('Gagal membuat templat: ' + pesanGalat(err), '⚠') }
    finally { tblUnduh.disabled = !tugas }
  }

  fBerkas.addEventListener('change', async () => {
    const berkas = fBerkas.files?.[0]
    if (!berkas || !tugas) return
    isi(area, el('div', { class: 'impor-info' }, 'Membaca berkas…'))
    try {
      const { readSheet } = await import('read-excel-file/universal')
      rows = await readSheet(berkas, 'Nilai').catch(() => readSheet(berkas))
      let peringatan = null
      try {
        const ptj = await readSheet(berkas, 'Petunjuk')
        const baris = ptj.find(r => String(r?.[0] ?? '').trim().toLowerCase() === 'kode tugas')
        const kode = String(baris?.[1] ?? '').trim()
        if (kode && kode !== tugas.kode) {
          peringatan = `Berkas ini dibuat untuk tugas ${kode}, sedangkan yang dipilih ${tugas.kode}. Periksa lagi sebelum menerapkan.`
        }
      } catch { /* tanpa sheet Petunjuk: tidak apa-apa */ }
      gambarPratinjau(peringatan)
    } catch (err) {
      rows = null
      isi(area, el('div', { class: 'pesan pesan-galat' },
        'Berkas tidak bisa dibaca. Pastikan formatnya .xlsx (Excel). ' + pesanGalat(err)))
    }
  })
  cekTimpa.addEventListener('change', () => { if (rows) gambarPratinjau() })

  let peringatanTerakhir = null
  function gambarPratinjau(peringatan = peringatanTerakhir) {
    peringatanTerakhir = peringatan
    rencana = rencanaImpor(rows, murid, petaProgres, { timpa: cekTimpa.checked })
    if (rencana.galat) {
      isi(area, el('div', { class: 'pesan pesan-galat' }, rencana.galat)); tblTerapkan.disabled = true; return
    }
    const hitung = (a) => rencana.baris.filter(b => b.aksi === a).length
    const nNilai = hitung('nilai'), nLewati = hitung('lewati'), nGalat = hitung('galat')
    const adaTimpaan = rencana.baris.some(b => b.ket?.startsWith('Sudah dinilai') || b.ket?.startsWith('Timpa'))
    tblTerapkan.disabled = nNilai === 0
    tblTerapkan.textContent = nNilai ? `Terapkan ${nNilai} nilai` : 'Terapkan'
    const urut = { galat: 0, nilai: 1, lewati: 2 }
    isi(area,
      peringatan && el('div', { class: 'pesan pesan-galat', gaya: { marginBottom: '8px' } }, '⚠ ' + peringatan),
      el('div', { class: 'impor-ringkas' },
        el('span', { class: 'chip-impor nilai' }, `${nNilai} akan dinilai`),
        el('span', { class: 'chip-impor lewati' }, `${nLewati} dilewati`),
        nGalat ? el('span', { class: 'chip-impor galat' }, `${nGalat} bermasalah`) : null),
      adaTimpaan && el('label', { class: 'impor-timpa' }, cekTimpa,
        'Timpa nilai yang sudah ada (bila tidak dicentang, murid yang sudah dinilai dilewati)'),
      rencana.baris.length
        ? el('div', { class: 'impor-tabel-bungkus' }, el('table', { class: 'lk impor-tabel' },
            el('thead', {}, el('tr', {}, ...['Baris', 'Nama', 'Nilai lama', 'Nilai baru', 'Keterangan'].map(h => el('th', {}, h)))),
            el('tbody', {}, ...[...rencana.baris].sort((a, b) => urut[a.aksi] - urut[b.aksi] || a.nomorBaris - b.nomorBaris)
              .map(b => el('tr', { class: 'impor-' + b.aksi },
                el('td', {}, String(b.nomorBaris)), el('td', {}, b.nama),
                el('td', {}, b.lama || '—'), el('td', {}, b.baru ?? '—'),
                el('td', {}, b.ket + (b.umpan && b.aksi === 'nilai' ? ' · + umpan balik' : '')))))))
        : el('div', { class: 'impor-info' }, 'Tidak ada baris nilai yang terisi di berkas ini.'))
  }

  async function terapkan() {
    if (!rencana || sedangSimpan) return
    const target = rencana.baris.filter(b => b.aksi === 'nilai')
    if (!target.length) return
    sedangSimpan = true; tblTerapkan.disabled = true; fBerkas.disabled = true; fTugas.disabled = true
    let ok = 0; const gagal = []
    for (let i = 0; i < target.length; i++) {
      const b = target[i]
      tblTerapkan.textContent = `Menyimpan ${i + 1}/${target.length}…`
      const { error } = b.nilai.huruf
        ? await sb.rpc('nilai_tugas', { p_progres: b.progresId, p_huruf: b.nilai.huruf, p_umpan: b.umpan })
        : await sb.rpc('nilai_tugas_angka', { p_progres: b.progresId, p_angka: b.nilai.angka, p_umpan: b.umpan })
      if (error) gagal.push(`${b.nama}: ${pesanGalat(error)}`); else ok++
    }
    sedangSimpan = false; adaPerubahan = ok > 0
    isi(area,
      el('div', { class: 'pesan ' + (gagal.length ? 'pesan-galat' : 'pesan-info') },
        `${ok} nilai tersimpan untuk ${tugas.kode}.` + (gagal.length ? ` ${gagal.length} gagal:` : '')),
      gagal.length ? el('ul', { class: 'impor-gagal' }, ...gagal.map(g => el('li', {}, g))) : null)
    tblTerapkan.textContent = 'Selesai'
    roti(`${ok} nilai diimpor`)
  }

  const tutup = dialog({
    judul: '📥 Impor nilai dari Excel',
    badan: el('div', {},
      el('p', { class: 'impor-pengantar' },
        'Pilih tugas, unduh templatnya, isi kolom "Nilai baru" dengan angka 0–100 atau huruf A–E, lalu unggah kembali. ' +
        'Murid yang belum mengumpulkan tugas itu dilewati. Penilaian sama dengan menilai manual: tugas dikunci, XP & badge ikut cair.'),
      el('div', { class: 'ruas' }, el('label', {}, '1. Tugas'), fTugas, info),
      el('div', { class: 'ruas' }, el('label', {}, '2. Templat'), el('div', {}, tblUnduh)),
      el('div', { class: 'ruas' }, el('label', {}, '3. Unggah berkas yang sudah diisi (.xlsx)'), fBerkas),
      area),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Tutup'), tblTerapkan)],
    lebar: '760px',
    bisaTutup: async () => {
      if (sedangSimpan) { roti('Tunggu sampai penyimpanan selesai'); return false }
      if (adaPerubahan) setTimeout(() => padaSelesai?.(), 0)
      return true
    },
  })
}
