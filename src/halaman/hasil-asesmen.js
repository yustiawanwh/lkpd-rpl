/**
 * Hasil Asesmen — sisi guru/admin (Tahap 2).
 *
 * Dua tampilan:
 *   - Per Murid : skor & jawaban tiap murid.
 *   - Per Soal  : sebaran jawaban seluruh murid per soal (pola/miskonsepsi).
 *
 * Pemrosesan sesuai jenis:
 *   - Soal berkunci (kognitif) → benar/salah otomatis + skor per murid.
 *   - Soal tanpa kunci (skala/isian non-kognitif) → rekap jawaban (tanpa skor).
 *
 * Ekspor CSV per murid tersedia.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, roti, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { pergiKe } from '../main.js'

const LABEL_TIPE = { pg: 'Pilihan Ganda', isian: 'Isian/Esai', skala: 'Skala' }

// Bandingkan jawaban murid dengan kunci (toleran huruf besar/kecil & spasi).
function benar(jawaban, kunci) {
  if (kunci == null || kunci === '') return null   // tak dinilai
  const a = String(jawaban ?? '').trim().toLowerCase()
  const k = String(kunci).trim().toLowerCase()
  if (a === '') return false
  return a === k
}

export async function halamanHasilAsesmen(wadah, asesmenId) {
  isi(wadah, rangkaMuat('260px'))

  let asesmen, soal, jawaban, murid
  try {
    const [{ data: a, error: e1 }, { data: s, error: e2 }, { data: jw, error: e3 }] = await Promise.all([
      sb.from('asesmen').select('id, judul, jenis, tujuan_pembelajaran(kode), kelas(nama)').eq('id', asesmenId).single(),
      sb.from('asesmen_soal').select('id, tipe, teks, opsi, kunci, urutan').eq('asesmen_id', asesmenId).order('urutan'),
      sb.from('asesmen_jawaban').select('soal_id, murid_id, jawaban, dijawab_pada, profil:murid_id(nama, no_absen)').eq('asesmen_id', asesmenId),
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3
    asesmen = a; soal = s ?? []; jawaban = jw ?? []
  } catch (err) {
    isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
      el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))))); return
  }

  // Kumpulkan murid unik dari jawaban.
  const petaMurid = new Map()
  for (const j of jawaban) {
    if (!petaMurid.has(j.murid_id)) petaMurid.set(j.murid_id, { murid_id: j.murid_id, profil: j.profil, jw: {} })
    petaMurid.get(j.murid_id).jw[j.soal_id] = j.jawaban
  }
  murid = [...petaMurid.values()].sort((x, y) => {
    const nx = parseInt(x.profil?.no_absen ?? '', 10), ny = parseInt(y.profil?.no_absen ?? '', 10)
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny
    return (x.profil?.nama ?? '').localeCompare(y.profil?.nama ?? '')
  })

  // Soal berkunci (dinilai) — untuk skor.
  const soalBerkunci = soal.filter(s => s.kunci != null && s.kunci !== '' && s.tipe !== 'skala')
  const adaSkor = soalBerkunci.length > 0

  let mode = 'murid'   // 'murid' | 'soal'

  function skorMurid(m) {
    if (!adaSkor) return null
    let bnr = 0
    for (const s of soalBerkunci) if (benar(m.jw[s.id], s.kunci)) bnr++
    return { benar: bnr, total: soalBerkunci.length, nilai: Math.round((bnr / soalBerkunci.length) * 100) }
  }

  function gambar() {
    const tombolMode = (nilai, label) => el('button', {
      class: 'tbl tbl-kecil' + (mode === nilai ? ' tbl-utama' : ''),
      onClick: () => { if (mode !== nilai) { mode = nilai; gambar() } },
    }, label)

    isi(wadah,
      el('div', { class: 'kepala' },
        el('div', {},
          el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
            onClick: () => pergiKe('asesmen') }, '← Bank Asesmen'),
          el('h1', {}, 'Hasil: ' + asesmen.judul),
          el('p', {}, `${asesmen.jenis === 'kognitif' ? '🧠 Kognitif' : '💬 Non-kognitif'} · ` +
            `${murid.length} murid menjawab` + (adaSkor ? ` · ${soalBerkunci.length} soal dinilai` : ' · tanpa skor'))),
        el('div', { class: 'kepala-kanan' },
          el('div', { gaya: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } },
            el('button', { class: 'tbl tbl-kecil', onClick: () => unduhCsv(asesmen, soal, murid, skorMurid, adaSkor) }, 'Unduh CSV'),
            el('span', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)', margin: '0 2px' } }, 'Tampilan:'),
            tombolMode('murid', 'Per Murid'),
            tombolMode('soal', 'Per Soal')))),

      !murid.length
        ? el('div', { class: 'panel' }, el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada jawaban'),
            el('p', {}, 'Belum ada murid yang mengerjakan asesmen ini.')))
        : mode === 'murid' ? tampilPerMurid() : tampilPerSoal(),
    )
  }

  /* ---------- Tampilan PER MURID ---------- */
  function tampilPerMurid() {
    return el('div', { class: 'tumpuk' }, ...murid.map(m => {
      const sk = skorMurid(m)
      const kepala = el('div', { class: 'grup-murid-kepala' },
        el('div', { gaya: { flex: '1' } },
          el('div', { gaya: { fontWeight: '600', fontSize: '14px' } },
            (m.profil?.no_absen ? `${m.profil.no_absen}. ` : '') + (m.profil?.nama ?? '—')),
          sk ? el('div', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } },
            `Skor: ${sk.benar}/${sk.total} (${sk.nilai})`) : null))

      const daftarJawab = el('div', { gaya: { marginTop: '8px' } }, ...soal.map((s, i) => {
        const jw = m.jw[s.id]
        const b = benar(jw, s.kunci)
        const tanda = b === true ? '✅' : b === false ? '❌' : ''
        return el('div', { gaya: { padding: '5px 0', borderTop: i ? '1px solid var(--garis)' : 'none' } },
          el('div', { gaya: { fontSize: '12.5px', fontWeight: '600' } }, `${i + 1}. ${s.teks}`),
          el('div', { gaya: { fontSize: '12.5px', marginTop: '2px' } },
            `${tanda} Jawaban: ` + (jw != null && jw !== '' ? jw : '(kosong)') +
            (s.kunci ? `  ·  Kunci: ${s.kunci}` : '')))
      }))
      return el('div', { class: 'panel' }, el('div', { class: 'panel-isi' }, kepala, daftarJawab))
    }))
  }

  /* ---------- Tampilan PER SOAL ---------- */
  function tampilPerSoal() {
    return el('div', { class: 'tumpuk' }, ...soal.map((s, i) => {
      const jwbSoal = murid.map(m => m.jw[s.id]).filter(v => v != null && v !== '')
      let isiRekap
      if (s.tipe === 'pg') {
        const opsi = s.opsi?.opsi ?? []
        const hitung = {}; opsi.forEach(o => hitung[o] = 0)
        for (const v of jwbSoal) hitung[v] = (hitung[v] ?? 0) + 1
        isiRekap = el('div', {}, ...opsi.map(o => {
          const n = hitung[o] ?? 0
          const persen = jwbSoal.length ? Math.round((n / jwbSoal.length) * 100) : 0
          const kunciTanda = (s.kunci && String(s.kunci).trim().toLowerCase() === o.trim().toLowerCase()) ? ' ✅' : ''
          return el('div', { gaya: { display: 'flex', alignItems: 'center', gap: '8px', margin: '3px 0' } },
            el('div', { gaya: { width: '160px', fontSize: '12.5px' } }, o + kunciTanda),
            el('div', { class: 'bar-luar', gaya: { flex: '1', background: 'var(--garis)', borderRadius: '4px', height: '16px', overflow: 'hidden' } },
              el('div', { gaya: { width: persen + '%', height: '100%', background: 'var(--hijau-terang)' } })),
            el('div', { gaya: { width: '64px', fontSize: '12px', color: 'var(--tinta-lembut)' } }, `${n} (${persen}%)`))
        }))
      } else if (s.tipe === 'skala') {
        const mn = s.opsi?.min ?? 1, mx = s.opsi?.max ?? 5
        const hitung = {}; for (let v = mn; v <= mx; v++) hitung[v] = 0
        let jml = 0, cnt = 0
        for (const v of jwbSoal) { const n = Number(v); if (!Number.isNaN(n)) { hitung[n] = (hitung[n] ?? 0) + 1; jml += n; cnt++ } }
        const rata = cnt ? (jml / cnt).toFixed(2) : '—'
        isiRekap = el('div', {},
          el('div', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)', marginBottom: '4px' } },
            `Rata-rata: ${rata}` + (s.opsi?.label_min ? ` (${s.opsi.label_min} … ${s.opsi.label_maks ?? ''})` : '')),
          ...Object.keys(hitung).map(v => {
            const n = hitung[v]; const persen = jwbSoal.length ? Math.round((n / jwbSoal.length) * 100) : 0
            return el('div', { gaya: { display: 'flex', alignItems: 'center', gap: '8px', margin: '3px 0' } },
              el('div', { gaya: { width: '40px', fontSize: '12.5px' } }, v),
              el('div', { gaya: { flex: '1', background: 'var(--garis)', borderRadius: '4px', height: '16px', overflow: 'hidden' } },
                el('div', { gaya: { width: persen + '%', height: '100%', background: 'var(--hijau-terang)' } })),
              el('div', { gaya: { width: '64px', fontSize: '12px', color: 'var(--tinta-lembut)' } }, `${n} (${persen}%)`))
          }))
      } else {
        // isian/esai: tampilkan daftar jawaban.
        isiRekap = el('div', {}, ...(jwbSoal.length
          ? jwbSoal.map(v => el('div', { gaya: { fontSize: '12.5px', padding: '3px 0', borderTop: '1px solid var(--garis)' } }, '• ' + v))
          : [el('div', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)' } }, '(belum ada jawaban)')]))
      }

      return el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
        el('div', { gaya: { fontWeight: '600', marginBottom: '6px' } },
          `${i + 1}. ${s.teks}`,
          el('span', { gaya: { fontSize: '11px', color: 'var(--tinta-lembut)', fontWeight: '400' } }, `  [${LABEL_TIPE[s.tipe]}]`)),
        isiRekap))
    }))
  }

  gambar()
}

// Ekspor CSV per murid: kolom = absen, nama, tiap soal, (skor bila ada).
function unduhCsv(asesmen, soal, murid, skorMurid, adaSkor) {
  const kepala = ['No Absen', 'Nama', ...soal.map((s, i) => `S${i + 1}`)]
  if (adaSkor) kepala.push('Benar', 'Total', 'Nilai')
  const larik = [kepala]
  for (const m of murid) {
    const baris = [m.profil?.no_absen ?? '', m.profil?.nama ?? '', ...soal.map(s => m.jw[s.id] ?? '')]
    if (adaSkor) { const sk = skorMurid(m); baris.push(sk?.benar ?? '', sk?.total ?? '', sk?.nilai ?? '') }
    larik.push(baris)
  }
  const esc = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }
  const csv = larik.map(r => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const nama = ('hasil_asesmen_' + (asesmen.judul ?? '')).replace(/[^\w.-]+/g, '_') + '.csv'
  const a = el('a', { href: url, download: nama })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  roti('Berkas CSV diunduh')
}
