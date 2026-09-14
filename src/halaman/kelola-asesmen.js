/**
 * Penyunting Asesmen Diagnostik (Tahap 1) — sisi guru.
 *
 * - Bank Asesmen: daftar asesmen (kognitif / non-kognitif).
 * - Buat/ubah asesmen: judul, jenis, penempatan (TP / kelas / mandiri), terbit.
 * - Kelola soal: tipe per-soal (pg / isian / skala), kunci opsional.
 *
 * Tahap berikutnya (belum di sini): penilaian otomatis, laporan, gerbang
 * "asesmen dulu sebelum sprint".
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, roti, dialog, konfirmasi, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { keadaan, pergiKe } from '../main.js'

const LABEL_TIPE = { pg: 'Pilihan Ganda', isian: 'Isian/Esai', skala: 'Skala' }

/* ========================================================
   DAFTAR ASESMEN (Bank Asesmen)
   ======================================================== */
export async function halamanAsesmen(wadah) {
  isi(wadah, el('div', { class: 'tumpuk' }, rangkaMuat('120px'), rangkaMuat('120px')))

  let daftar
  try {
    const { data, error } = await sb.from('asesmen')
      .select('id, judul, jenis, terbit, tujuan_pembelajaran_id, kelas_id, ' +
              'tujuan_pembelajaran(kode, judul), kelas(nama)')
      .order('dibuat_pada', { ascending: false })
    if (error) throw error
    daftar = data ?? []
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Bank Asesmen Diagnostik'),
        el('p', {}, 'Asesmen kognitif & non-kognitif. Bisa ditempatkan per TP, per kelas, atau mandiri.')),
      el('div', { class: 'kepala-kanan' },
        el('button', { class: 'tbl tbl-utama', onClick: () => dialogAsesmen(wadah) }, '+ Asesmen baru'))),

    !daftar.length
      ? el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Belum ada asesmen'),
          el('p', {}, 'Buat asesmen diagnostik untuk mengukur kesiapan murid.')))
      : el('div', { class: 'tumpuk' }, ...daftar.map(a => kartuAsesmen(a, wadah))),
  )
}

function penempatanTeks(a) {
  if (a.tujuan_pembelajaran_id) return `TP ${a.tujuan_pembelajaran?.kode ?? ''}`
  if (a.kelas_id) return `Kelas ${a.kelas?.nama ?? ''}`
  return 'Mandiri'
}

function kartuAsesmen(a, wadah) {
  return el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
    el('div', { gaya: { display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' } },
      el('div', { gaya: { flex: '1', minWidth: '200px' } },
        el('div', { gaya: { fontWeight: '600', fontSize: '15px' } }, a.judul),
        el('div', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)', marginTop: '3px' } },
          `${a.jenis === 'kognitif' ? '🧠 Kognitif' : '💬 Non-kognitif'} · ${penempatanTeks(a)} · ` +
          (a.terbit ? 'Terbit' : 'Draf'))),
      el('div', { gaya: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        el('button', { class: 'tbl tbl-kecil tbl-utama',
          onClick: () => pergiKe(`asesmen/${a.id}`) }, 'Kelola soal'),
        el('button', { class: 'tbl tbl-kecil',
          onClick: () => pergiKe(`asesmen/hasil/${a.id}`) }, '📊 Hasil'),
        el('button', { class: 'tbl tbl-kecil',
          onClick: () => dialogAsesmen(wadah, a) }, 'Ubah'),
        el('button', { class: 'tbl tbl-kecil tbl-bahaya',
          onClick: () => hapusAsesmen(a, wadah) }, 'Hapus')))))
}

async function dialogAsesmen(wadah, a = null) {
  // Ambil daftar TP & kelas untuk pilihan penempatan.
  const [{ data: tpList }, { data: kelasList }] = await Promise.all([
    sb.from('tujuan_pembelajaran').select('id, kode, judul').eq('terbit', true).order('kode'),
    sb.from('kelas').select('id, nama').order('nama'),
  ])

  const fJudul = el('input', { type: 'text', value: a?.judul ?? '', placeholder: 'mis. Asesmen Awal Pemrograman' })
  const fDesk = el('textarea', { rows: '2', placeholder: 'Keterangan singkat (opsional)' }, a?.deskripsi ?? '')
  const fJenis = el('select', {},
    el('option', { value: 'kognitif', selected: (a?.jenis ?? 'kognitif') === 'kognitif' }, '🧠 Kognitif (ada benar/salah)'),
    el('option', { value: 'non_kognitif', selected: a?.jenis === 'non_kognitif' }, '💬 Non-kognitif (tanpa nilai)'))

  // Penempatan: mandiri / TP / kelas
  const penAwal = a?.tujuan_pembelajaran_id ? 'tp' : a?.kelas_id ? 'kelas' : 'mandiri'
  const fMode = el('select', {},
    el('option', { value: 'mandiri', selected: penAwal === 'mandiri' }, 'Mandiri (tak terikat)'),
    el('option', { value: 'tp', selected: penAwal === 'tp' }, 'Per Tujuan Pembelajaran'),
    el('option', { value: 'kelas', selected: penAwal === 'kelas' }, 'Per Kelas'))
  const fTp = el('select', {}, ...(tpList ?? []).map(t =>
    el('option', { value: t.id, selected: a?.tujuan_pembelajaran_id === t.id }, `${t.kode} — ${t.judul}`)))
  const fKelas = el('select', {}, ...(kelasList ?? []).map(k =>
    el('option', { value: k.id, selected: a?.kelas_id === k.id }, k.nama)))
  const bungkusTp = el('div', { class: 'ruas' }, el('label', {}, 'Tujuan Pembelajaran'), fTp)
  const bungkusKelas = el('div', { class: 'ruas' }, el('label', {}, 'Kelas'), fKelas)
  const segarkanMode = () => {
    bungkusTp.style.display = fMode.value === 'tp' ? '' : 'none'
    bungkusKelas.style.display = fMode.value === 'kelas' ? '' : 'none'
  }
  fMode.addEventListener('change', segarkanMode)

  const fTerbit = el('input', { type: 'checkbox', ...(a?.terbit ? { checked: '' } : {}) })
  const galat = el('div')

  const tutup = dialog({
    judul: a ? 'Ubah asesmen' : 'Asesmen baru',
    badan: el('div', {},
      el('div', { class: 'ruas' }, el('label', {}, 'Judul'), fJudul),
      el('div', { class: 'ruas' }, el('label', {}, 'Deskripsi'), fDesk),
      el('div', { class: 'ruas' }, el('label', {}, 'Jenis'), fJenis),
      el('div', { class: 'ruas' }, el('label', {}, 'Penempatan'), fMode),
      bungkusTp, bungkusKelas,
      el('label', { class: 'anti-salin-baris' }, fTerbit, el('span', {}, 'Terbitkan (murid bisa mengerjakan)')),
      galat),
    kaki: [
      el('button', { class: 'tbl tbl-utama', onClick: async (e) => {
        isi(galat)
        if (!fJudul.value.trim()) { roti('Judul wajib diisi', '⚠'); return }
        const rec = {
          judul: fJudul.value.trim(),
          deskripsi: fDesk.value.trim() || null,
          jenis: fJenis.value,
          tujuan_pembelajaran_id: fMode.value === 'tp' ? Number(fTp.value) : null,
          kelas_id: fMode.value === 'kelas' ? Number(fKelas.value) : null,
          terbit: fTerbit.checked,
        }
        e.target.disabled = true
        try {
          if (a) {
            const { error } = await sb.from('asesmen').update(rec).eq('id', a.id)
            if (error) throw error
          } else {
            rec.dibuat_oleh = keadaan.profil.id
            const { error } = await sb.from('asesmen').insert(rec)
            if (error) throw error
          }
          tutup(); halamanAsesmen(wadah)
        } catch (err) {
          e.target.disabled = false
          isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
        }
      } }, 'Simpan'),
    ],
  })
  segarkanMode()
}

async function hapusAsesmen(a, wadah) {
  const ya = await konfirmasi({
    judul: 'Hapus asesmen?',
    pesan: `"${a.judul}" beserta semua soal & jawaban murid akan dihapus permanen.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('asesmen').delete().eq('id', a.id)
    if (error) throw error
    roti('Asesmen dihapus'); halamanAsesmen(wadah)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}

/* ========================================================
   KELOLA SOAL SATU ASESMEN
   ======================================================== */
export async function halamanSuntingAsesmen(wadah, asesmenId) {
  isi(wadah, rangkaMuat('220px'))

  let asesmen, soal
  try {
    const [{ data: a, error: e1 }, { data: s, error: e2 }] = await Promise.all([
      sb.from('asesmen').select('*, tujuan_pembelajaran(kode), kelas(nama)').eq('id', asesmenId).single(),
      sb.from('asesmen_soal').select('*').eq('asesmen_id', asesmenId).order('urutan'),
    ])
    if (e1) throw e1
    if (e2) throw e2
    asesmen = a; soal = s ?? []
  } catch (err) {
    isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))))); return
  }

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
          onClick: () => pergiKe('asesmen') }, '← Bank Asesmen'),
        el('h1', {}, asesmen.judul),
        el('p', {}, `${asesmen.jenis === 'kognitif' ? '🧠 Kognitif' : '💬 Non-kognitif'} · ${penempatanTeks(asesmen)}`)),
      el('div', { class: 'kepala-kanan' },
        el('div', { gaya: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          el('button', { class: 'tbl tbl-kecil', onClick: () => pergiKe(`asesmen/hasil/${asesmenId}`) }, '📊 Hasil'),
          el('button', { class: 'tbl tbl-utama', onClick: () => dialogSoal(wadah, asesmenId) }, '+ Tambah soal')))),

    !soal.length
      ? el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Belum ada soal'),
          el('p', {}, 'Tambahkan soal: pilihan ganda, isian, atau skala.')))
      : el('div', { class: 'tumpuk' }, ...soal.map((s, i) => kartuSoal(s, i, wadah, asesmenId))),
  )
}

function kartuSoal(s, i, wadah, asesmenId) {
  let detail = ''
  if (s.tipe === 'pg') {
    const opsi = s.opsi?.opsi ?? []
    detail = opsi.map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o}`).join('   ')
  } else if (s.tipe === 'skala') {
    detail = `Skala ${s.opsi?.min ?? 1}–${s.opsi?.max ?? 5}` +
      (s.opsi?.label_min ? ` (${s.opsi.label_min} … ${s.opsi.label_maks ?? ''})` : '')
  } else {
    detail = 'Jawaban isian/esai'
  }
  return el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
    el('div', { gaya: { display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' } },
      el('div', { gaya: { flex: '1', minWidth: '200px' } },
        el('div', { gaya: { fontWeight: '600' } }, `${i + 1}. ${s.teks}`),
        el('div', { class: 'mono', gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)', marginTop: '4px' } },
          `[${LABEL_TIPE[s.tipe]}] ${detail}`),
        s.kunci ? el('div', { gaya: { fontSize: '11.5px', color: 'var(--hijau-terang)', marginTop: '2px' } },
          `Kunci: ${s.kunci}`) : null),
      el('div', { gaya: { display: 'flex', gap: '6px' } },
        el('button', { class: 'tbl tbl-kecil', onClick: () => dialogSoal(wadah, asesmenId, s) }, 'Ubah'),
        el('button', { class: 'tbl tbl-kecil tbl-bahaya', onClick: () => hapusSoal(s, wadah, asesmenId) }, 'Hapus')))))
}

async function dialogSoal(wadah, asesmenId, s = null) {
  const fTipe = el('select', {},
    el('option', { value: 'pg', selected: (s?.tipe ?? 'pg') === 'pg' }, 'Pilihan Ganda'),
    el('option', { value: 'isian', selected: s?.tipe === 'isian' }, 'Isian/Esai'),
    el('option', { value: 'skala', selected: s?.tipe === 'skala' }, 'Skala'))
  const fTeks = el('textarea', { rows: '2', placeholder: 'Tulis pertanyaan…' }, s?.teks ?? '')

  // Bagian PG: daftar opsi.
  const opsiAwal = s?.tipe === 'pg' ? (s.opsi?.opsi ?? ['', '']) : ['', '']
  const opsiInputs = []
  const wadahOpsi = el('div', {})
  function gambarOpsi() {
    isi(wadahOpsi)
    opsiInputs.length = 0
    opsiAwal.forEach((o, idx) => {
      const inp = el('input', { type: 'text', value: o, placeholder: `Opsi ${String.fromCharCode(65 + idx)}` })
      opsiInputs.push(inp)
      wadahOpsi.append(el('div', { gaya: { display: 'flex', gap: '6px', marginBottom: '5px' } },
        inp, el('button', { class: 'tbl tbl-kecil tbl-bahaya', type: 'button',
          onClick: () => { opsiAwal.splice(idx, 1); if (opsiAwal.length < 2) opsiAwal.push(''); sinkronOpsi(); gambarOpsi() } }, '✕')))
    })
    wadahOpsi.append(el('button', { class: 'tbl tbl-kecil', type: 'button',
      onClick: () => { sinkronOpsi(); opsiAwal.push(''); gambarOpsi() } }, '+ Opsi'))
  }
  function sinkronOpsi() { opsiInputs.forEach((inp, idx) => { opsiAwal[idx] = inp.value }) }

  // Bagian skala.
  const fMin = el('input', { type: 'number', value: String(s?.opsi?.min ?? 1), gaya: { width: '70px' } })
  const fMax = el('input', { type: 'number', value: String(s?.opsi?.max ?? 5), gaya: { width: '70px' } })
  const fLabelMin = el('input', { type: 'text', value: s?.opsi?.label_min ?? '', placeholder: 'label bawah (mis. Tidak setuju)' })
  const fLabelMax = el('input', { type: 'text', value: s?.opsi?.label_maks ?? '', placeholder: 'label atas (mis. Sangat setuju)' })

  // Kunci (opsional).
  const fKunci = el('input', { type: 'text', value: s?.kunci ?? '',
    placeholder: 'Kunci jawaban (opsional; kosongkan bila tak dinilai)' })
  const fWajib = el('input', { type: 'checkbox', ...((s?.wajib ?? true) ? { checked: '' } : {}) })

  const bagPg = el('div', { class: 'ruas' }, el('label', {}, 'Opsi jawaban'), wadahOpsi)
  const bagSkala = el('div', { class: 'ruas' }, el('label', {}, 'Rentang skala'),
    el('div', { gaya: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      el('span', {}, 'Dari'), fMin, el('span', {}, 'sampai'), fMax),
    el('div', { gaya: { display: 'flex', gap: '8px', marginTop: '6px' } }, fLabelMin, fLabelMax))
  const bagKunci = el('div', { class: 'ruas' }, el('label', {}, 'Kunci jawaban'), fKunci,
    el('div', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)', marginTop: '3px' } },
      'Untuk PG: tulis teks opsi yang benar. Untuk isian: jawaban acuan. Kosongkan untuk non-kognitif.'))

  function segarkanTipe() {
    bagPg.style.display = fTipe.value === 'pg' ? '' : 'none'
    bagSkala.style.display = fTipe.value === 'skala' ? '' : 'none'
    // Skala umumnya tak berkunci; sembunyikan kunci untuk skala.
    bagKunci.style.display = fTipe.value === 'skala' ? 'none' : ''
  }
  fTipe.addEventListener('change', segarkanTipe)
  gambarOpsi()

  const galat = el('div')
  const tutup = dialog({
    judul: s ? 'Ubah soal' : 'Tambah soal',
    badan: el('div', {},
      el('div', { class: 'ruas' }, el('label', {}, 'Tipe soal'), fTipe),
      el('div', { class: 'ruas' }, el('label', {}, 'Pertanyaan'), fTeks),
      bagPg, bagSkala, bagKunci,
      el('label', { class: 'anti-salin-baris' }, fWajib, el('span', {}, 'Wajib dijawab')),
      galat),
    kaki: [
      el('button', { class: 'tbl tbl-utama', onClick: async (e) => {
        isi(galat)
        if (!fTeks.value.trim()) { roti('Pertanyaan wajib diisi', '⚠'); return }
        let opsi = null
        if (fTipe.value === 'pg') {
          sinkronOpsi()
          const bersih = opsiAwal.map(o => o.trim()).filter(Boolean)
          if (bersih.length < 2) { roti('Pilihan ganda perlu minimal 2 opsi', '⚠'); return }
          opsi = { opsi: bersih }
        } else if (fTipe.value === 'skala') {
          const mn = Number(fMin.value), mx = Number(fMax.value)
          if (!(mx > mn)) { roti('Rentang skala tidak valid', '⚠'); return }
          opsi = { min: mn, max: mx, label_min: fLabelMin.value.trim() || null, label_maks: fLabelMax.value.trim() || null }
        }
        const rec = {
          asesmen_id: asesmenId, tipe: fTipe.value, teks: fTeks.value.trim(),
          opsi, kunci: fTipe.value === 'skala' ? null : (fKunci.value.trim() || null),
          wajib: fWajib.checked,
        }
        e.target.disabled = true
        try {
          if (s) {
            const { error } = await sb.from('asesmen_soal').update(rec).eq('id', s.id)
            if (error) throw error
          } else {
            const { count } = await sb.from('asesmen_soal')
              .select('id', { count: 'exact', head: true }).eq('asesmen_id', asesmenId)
            rec.urutan = count ?? 0
            const { error } = await sb.from('asesmen_soal').insert(rec)
            if (error) throw error
          }
          tutup(); halamanSuntingAsesmen(wadah, asesmenId)
        } catch (err) {
          e.target.disabled = false
          isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
        }
      } }, 'Simpan'),
    ],
  })
  segarkanTipe()
}

async function hapusSoal(s, wadah, asesmenId) {
  const ya = await konfirmasi({ judul: 'Hapus soal?', pesan: 'Soal ini akan dihapus.', tombol: 'Hapus', bahaya: true })
  if (!ya) return
  try {
    const { error } = await sb.from('asesmen_soal').delete().eq('id', s.id)
    if (error) throw error
    roti('Soal dihapus'); halamanSuntingAsesmen(wadah, asesmenId)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}
