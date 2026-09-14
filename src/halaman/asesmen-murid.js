/**
 * Asesmen Diagnostik — sisi MURID (Tahap 1).
 *
 * - Daftar asesmen yang tersedia untuk murid (RLS yang menyaring).
 * - Mengerjakan asesmen: PG (pilih opsi), isian (ketik), skala (geser/pilih).
 * - Jawaban disimpan per soal (upsert), bisa dilanjutkan bila belum selesai.
 *
 * Tahap berikutnya: hasil/analisis untuk guru, gerbang "asesmen dulu".
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, roti, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { keadaan, pergiKe } from '../main.js'

/* ---------- Daftar asesmen tersedia ---------- */
export async function daftarAsesmenMurid(wadah) {
  isi(wadah, el('div', { class: 'tumpuk' }, rangkaMuat('100px'), rangkaMuat('100px')))

  let daftar, jawabanKu
  try {
    // RLS hanya mengembalikan asesmen terbit yang boleh dilihat murid ini.
    const { data, error } = await sb.from('asesmen')
      .select('id, judul, deskripsi, jenis, tujuan_pembelajaran(kode), kelas(nama)')
      .eq('terbit', true).order('urutan')
    if (error) throw error
    daftar = data ?? []
    // Berapa soal sudah dijawab murid, per asesmen (untuk status).
    const { data: jw } = await sb.from('asesmen_jawaban')
      .select('asesmen_id').eq('murid_id', keadaan.profil.id)
    jawabanKu = {}
    for (const j of (jw ?? [])) jawabanKu[j.asesmen_id] = (jawabanKu[j.asesmen_id] ?? 0) + 1
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  if (!daftar.length) {
    isi(wadah,
      el('div', { class: 'kepala' }, el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
          onClick: () => { keadaan.penugasan = null; pergiKe('') } }, '← Beranda'),
        el('h1', {}, 'Asesmen Diagnostik'))),
      el('div', { class: 'panel' }, el('div', { class: 'kosong' },
        el('h3', {}, 'Belum ada asesmen'),
        el('p', {}, 'Saat ini tidak ada asesmen yang perlu kamu kerjakan.'))))
    return
  }

  isi(wadah,
    el('div', { class: 'kepala' }, el('div', {},
      el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
        onClick: () => { keadaan.penugasan = null; pergiKe('') } }, '← Beranda'),
      el('h1', {}, 'Asesmen Diagnostik'),
      el('p', {}, 'Kerjakan asesmen berikut. Jawaban tersimpan otomatis.'))),
    el('div', { class: 'tumpuk' }, ...daftar.map(a => {
      const sudah = jawabanKu[a.id] ?? 0
      return el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
        el('div', { gaya: { display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' } },
          el('div', { gaya: { flex: '1', minWidth: '180px' } },
            el('div', { gaya: { fontWeight: '600', fontSize: '15px' } }, a.judul),
            a.deskripsi ? el('div', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)', marginTop: '3px' } }, a.deskripsi) : null,
            el('div', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)', marginTop: '3px' } },
              (a.jenis === 'kognitif' ? '🧠 Kognitif' : '💬 Non-kognitif') +
              (sudah ? ` · ${sudah} jawaban tersimpan` : ' · belum dikerjakan'))),
          el('button', { class: 'tbl tbl-utama',
            onClick: () => kerjakanAsesmen(wadah, a.id) }, sudah ? 'Lanjutkan' : 'Kerjakan'))))
    })),
  )
}

/* ---------- Mengerjakan satu asesmen ---------- */
async function kerjakanAsesmen(wadah, asesmenId) {
  isi(wadah, rangkaMuat('260px'))

  let asesmen, soal, jawaban
  try {
    const [{ data: a, error: e1 }, { data: s, error: e2 }, { data: jw }] = await Promise.all([
      sb.from('asesmen').select('id, judul, deskripsi, jenis').eq('id', asesmenId).single(),
      sb.from('asesmen_soal').select('id, tipe, teks, opsi, wajib, urutan').eq('asesmen_id', asesmenId).order('urutan'),
      sb.from('asesmen_jawaban').select('soal_id, jawaban').eq('asesmen_id', asesmenId).eq('murid_id', keadaan.profil.id),
    ])
    if (e1) throw e1
    if (e2) throw e2
    asesmen = a; soal = s ?? []
    jawaban = {}
    for (const j of (jw ?? [])) jawaban[j.soal_id] = j.jawaban
  } catch (err) {
    isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))))); return
  }

  // Simpan satu jawaban (upsert). Debounce ringan untuk isian teks.
  const timer = {}
  async function simpan(soalId, nilai) {
    try {
      const { error } = await sb.from('asesmen_jawaban').upsert(
        { asesmen_id: asesmenId, soal_id: soalId, murid_id: keadaan.profil.id, jawaban: nilai,
          penugasan_id: keadaan.penugasan?.id ?? null, dijawab_pada: new Date().toISOString() },
        { onConflict: 'soal_id,murid_id' })
      if (error) throw error
    } catch (err) { roti('Gagal menyimpan: ' + pesanGalat(err), '⚠') }
  }
  function simpanTunda(soalId, nilai) {
    clearTimeout(timer[soalId])
    timer[soalId] = setTimeout(() => simpan(soalId, nilai), 600)
  }

  const kartuSoal = soal.map((s, i) => {
    const isi_ = el('div', { class: 'asesmen-isi' })
    const nilaiAda = jawaban[s.id] ?? ''

    if (s.tipe === 'pg') {
      const opsi = s.opsi?.opsi ?? []
      opsi.forEach((o) => {
        const id = `s${s.id}`
        const radio = el('input', { type: 'radio', name: id, value: o, ...(nilaiAda === o ? { checked: '' } : {}) })
        radio.addEventListener('change', () => simpan(s.id, o))
        isi_.append(el('label', { class: 'asesmen-opsi' }, radio, el('span', {}, o)))
      })
    } else if (s.tipe === 'skala') {
      const mn = s.opsi?.min ?? 1, mx = s.opsi?.max ?? 5
      const baris = el('div', { class: 'asesmen-skala' })
      for (let v = mn; v <= mx; v++) {
        const id = `s${s.id}`
        const radio = el('input', { type: 'radio', name: id, value: String(v), ...(String(nilaiAda) === String(v) ? { checked: '' } : {}) })
        radio.addEventListener('change', () => simpan(s.id, String(v)))
        baris.append(el('label', { class: 'asesmen-skala-item' }, radio, el('span', {}, String(v))))
      }
      isi_.append(baris)
      if (s.opsi?.label_min || s.opsi?.label_maks) {
        isi_.append(el('div', { class: 'asesmen-skala-label' },
          el('span', {}, s.opsi?.label_min ?? ''), el('span', {}, s.opsi?.label_maks ?? '')))
      }
    } else {
      const ta = el('textarea', { class: 'umpan-review', rows: '3', placeholder: 'Tulis jawabanmu…' }, nilaiAda)
      ta.addEventListener('input', () => simpanTunda(s.id, ta.value))
      isi_.append(ta)
    }

    return el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('div', { gaya: { fontWeight: '600', marginBottom: '8px' } },
        `${i + 1}. ${s.teks}`, s.wajib ? el('span', { gaya: { color: 'var(--merah, #c0392b)' } }, ' *') : null),
      isi_))
  })

  isi(wadah,
    el('div', { class: 'kepala' }, el('div', {},
      el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
        onClick: () => daftarAsesmenMurid(wadah) }, '← Daftar asesmen'),
      el('h1', {}, asesmen.judul),
      asesmen.deskripsi ? el('p', {}, asesmen.deskripsi) : null)),
    el('div', { class: 'tumpuk' }, ...kartuSoal),
    el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('p', { gaya: { margin: '0', color: 'var(--tinta-lembut)', fontSize: '13px' } },
        '✓ Jawaban tersimpan otomatis. Kamu bisa menutup dan melanjutkan nanti.'),
      el('button', { class: 'tbl tbl-utama', gaya: { marginTop: '10px' },
        onClick: () => { roti('Asesmen tersimpan'); keadaan.penugasan = null; pergiKe('') } }, 'Selesai'))),
  )
}
