/**
 * Rekap Nilai — mengubah capaian LKPD tiap murid menjadi nilai 0–100,
 * dan mengekspornya ke berkas yang bisa dibuka Excel.
 *
 * Ekspor memakai format CSV, bukan pustaka Excel berat, agar aplikasi
 * tetap ringan dan hanya bergantung pada satu pustaka luar. Excel dan
 * Google Sheets membuka CSV secara langsung.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, dialog, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { formatWaktu } from '../lib/pangkat.js'
import { rekapNilai, rekapNilaiPerSprint } from '../rutin/papan.js'
import { hitungNilaiSprint, predikatUntuk, warnaPredikat, BOBOT_BAWAAN } from '../lib/nilai.js'
import { keadaan, pergiKe } from '../main.js'

export async function halamanNilai(wadah, penugasanId) {
  isi(wadah, rangkaMuat('220px'))

  // Muat info penugasan (untuk judul & tpId), lalu rekapnya.
  let pen, rekap, rekapSprint, muridSusulan = new Set()
  try {
    const { data, error } = await sb.from('penugasan')
      .select('id, kelas_id, kelas(nama), tujuan_pembelajaran(id, kode, judul)')
      .eq('id', penugasanId).single()
    if (error) throw error
    pen = data
    rekap = await rekapNilai(penugasanId, pen.tujuan_pembelajaran.id)
    rekapSprint = await rekapNilaiPerSprint(penugasanId, pen.tujuan_pembelajaran.id)
    // Murid yang mendapat kelonggaran susulan (untuk pengurangan poin).
    const { data: kel } = await sb.from('kelonggaran_sprint')
      .select('murid_id').eq('penugasan_id', penugasanId).eq('susulan', true)
    muridSusulan = new Set((kel ?? []).map(k => k.murid_id))
    // Muat bobot dari pengaturan (bila ada).
    const { data: setelan } = await sb.from('pengaturan').select('nilai').eq('kunci', 'bobot_nilai').maybeSingle()
    if (setelan?.nilai) Object.assign(BOBOT_BAWAAN, setelan.nilai)
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  // Bobot untuk model sprint baru (dari pengaturan / default).
  let bobot = { ...BOBOT_BAWAAN }
  let mode = 'total'   // 'total' | 'sprint'

  // Susun baris nilai, urut nomor absen lalu nama.
  // Total = rata-rata nilai tiap sprint (tiap sprint sudah menerapkan porsi
  // tantangan), agar konsisten dengan mode per sprint & kartu murid.
  function hitungSemua() {
    return rekap.murid
      .map(m => {
        const mSprint = rekapSprint.murid.find(x => x.murid_id === m.murid_id)
        let jml = 0, n = 0
        for (const s of rekapSprint.sprints) {
          const ps = mSprint?.perSprint?.[s.id] ?? { huruf: [], badge: 0 }
          const h = hitungNilaiSprint({
            hurufList: ps.huruf ?? [],
            intiTotal: s.intiTotal,
            jumlahBadge: ps.badge ?? 0,
            tantanganTotal: s.tantanganTotal ?? 0,
            tantanganDinilai: ps.tantanganDinilai ?? 0,
            kecepatan: { sudahKumpul: ps.sudahKumpul === true, jamDurasi: ps.jamDurasi },
          }, bobot)
          jml += h.nilai; n++
        }
        const nilaiKotor = n ? Math.round(jml / n) : 0
        // Pengurangan poin bila murid ini mengerjakan lewat kelonggaran (susulan).
        const susulan = muridSusulan.has(m.murid_id)
        const potongan = susulan ? (bobot.penalti_susulan ?? 0) : 0
        const nilai = Math.max(0, nilaiKotor - potongan)
        // Ringkasan untuk kolom tabel & ekspor (agar tampilan tetap lengkap).
        const intiSelesai = m.tugas_selesai ?? 0
        const tantanganSelesai = m.tantangan_selesai ?? 0
        return { ...m, nilai, nilaiKotor, susulan, potongan, predikat: predikatUntuk(nilai),
                 tuntas: rekap.intiTotal > 0 && intiSelesai === rekap.intiTotal,
                 rincian: { intiSelesai, intiTotal: rekap.intiTotal,
                            tantangan: tantanganSelesai, badge: m.jumlah_badge ?? 0 } }
      })
      .sort((a, b) =>
        (a.profil?.no_absen ?? '').localeCompare(b.profil?.no_absen ?? '', undefined, { numeric: true })
        || (a.profil?.nama ?? '').localeCompare(b.profil?.nama ?? ''))
  }

  function gambar() {
    const baris = hitungSemua()

    isi(wadah,
      el('div', { class: 'kepala' },
        el('div', {},
          el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
            onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
          el('h1', {}, 'Rekap Nilai'),
          el('p', {}, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode} — ${pen.tujuan_pembelajaran?.judul}`),
        ),
        el('div', { class: 'kepala-kanan' },
          el('div', { class: 'alih', gaya: { display: 'flex', gap: '2px', marginRight: '4px' } },
            el('button', { class: 'tbl tbl-kecil' + (mode === 'total' ? ' tbl-utama' : ''),
              onClick: () => { mode = 'total'; gambar() } }, 'Total'),
            el('button', { class: 'tbl tbl-kecil' + (mode === 'sprint' ? ' tbl-utama' : ''),
              onClick: () => { mode = 'sprint'; gambar() } }, 'Per sprint')),
          mode === 'total' && el('span', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } },
            'Atur bobot & porsi di menu Pengaturan'),
          el('button', { class: 'tbl', onClick: () => window.print() }, 'Cetak'),
          el('button', { class: 'tbl tbl-utama',
            onClick: () => mode === 'total' ? unduhCsv(baris) : unduhCsvSprint() }, 'Unduh Excel (CSV)'),
        ),
      ),

      mode === 'sprint' ? blokSprint() : blokTotal(baris),
    )
  }

  function blokTotal(baris) {
    const rata = baris.length
      ? Math.round(baris.reduce((n, r) => n + r.nilai, 0) / baris.length) : 0
    const tuntas = baris.filter(r => r.tuntas).length

    return el('div', {},
      // Ringkasan
      el('div', { gaya: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' } },
        kartuAngka('Jumlah murid', String(baris.length)),
        kartuAngka('Rata-rata nilai', String(rata)),
        kartuAngka('Tuntas KKTP', `${tuntas} / ${baris.length}`),
        kartuAngka('Tugas inti', String(rekap.intiTotal)),
      ),
      el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '14px' } },
        `Nilai total adalah rata-rata nilai seluruh sprint. Tiap sprint menggabungkan review, badge, ` +
        `dan kecepatan pengerjaan, lalu dibatasi porsi tantangan (${bobot.tantangan ?? 10}%): nilai penuh hanya ` +
        `untuk yang menyelesaikan semua tugas termasuk tantangan. Tuntas berarti seluruh tugas inti selesai.`),
      baris.length
        ? el('div', { class: 'panel' },
            el('div', { class: 'tabel-bungkus' },
              el('table', { class: 'data', gaya: { minWidth: '760px' } },
                el('thead', {}, el('tr', {},
                  el('th', { class: 'tengah' }, 'Absen'), el('th', {}, 'Nama'),
                  el('th', { class: 'tengah' }, 'Inti'), el('th', { class: 'angka' }, 'Tantangan'),
                  el('th', { class: 'angka' }, 'Badge'),
                  el('th', { class: 'angka' }, 'Nilai'), el('th', {}, 'Predikat'),
                  el('th', { class: 'tengah' }, 'Tuntas'))),
                el('tbody', {}, ...baris.map(r => el('tr', {},
                  el('td', { class: 'mono tengah' }, r.profil?.no_absen ?? '—'),
                  el('td', { class: 'utama' }, r.profil?.nama ?? '—',
                    r.susulan ? el('span', { class: 'lencana-susulan',
                      title: `Susulan — dikurangi ${r.potongan} poin (nilai asli ${r.nilaiKotor})` },
                      `susulan −${r.potongan}`) : null),
                  el('td', { class: 'mono tengah' }, `${r.rincian.intiSelesai}/${r.rincian.intiTotal}`),
                  el('td', { class: 'angka' }, String(r.rincian.tantangan)),
                  el('td', { class: 'angka' }, String(r.rincian.badge)),
                  el('td', { class: 'angka', gaya: { fontWeight: '700', fontSize: '15px' } },
                    String(r.nilai)),
                  el('td', {}, lencanaPredikat(r.nilai)),
                  el('td', { class: 'tengah' }, r.tuntas
                    ? el('span', { gaya: { color: 'var(--hijau-terang)', fontWeight: '700' } }, '✓')
                    : el('span', { gaya: { color: 'var(--tinta-lembut)' } }, '—')),
                ))),
              ),
            ))
        : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada data'),
            el('p', {}, 'Belum ada murid yang mengerjakan tugas ini, jadi belum ada nilai untuk direkap.'))),
    )
  }

  // Nilai per sprint: tiap sprint dinilai dari ketuntasan tugas intinya sendiri.
  function hitungSprint() {
    return rekapSprint.murid
      .map(m => {
        const nilaiSprint = {}
        for (const s of rekapSprint.sprints) {
          const ps = m.perSprint[s.id] ?? { huruf: [], badge: 0 }
          const hasil = hitungNilaiSprint({
            hurufList: ps.huruf ?? [],
            intiTotal: s.intiTotal,
            jumlahBadge: ps.badge ?? 0,
            tantanganTotal: s.tantanganTotal ?? 0,
            tantanganDinilai: ps.tantanganDinilai ?? 0,
            kecepatan: { sudahKumpul: ps.sudahKumpul === true, jamDurasi: ps.jamDurasi },
          }, bobot)
          nilaiSprint[s.id] = {
            nilai: hasil.nilai, rincian: hasil.rincian,
            selesai: ps.selesai ?? 0, total: s.intiTotal,
            dinilai: (ps.huruf ?? []).length,
          }
        }
        return { ...m, nilaiSprint }
      })
      .sort((a, b) =>
        (a.profil?.no_absen ?? '').localeCompare(b.profil?.no_absen ?? '', undefined, { numeric: true })
        || (a.profil?.nama ?? '').localeCompare(b.profil?.nama ?? ''))
  }

  function blokSprint() {
    const baris = hitungSprint()
    const sprints = rekapSprint.sprints

    return el('div', {},
      el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '14px' } },
        'Nilai tiap sprint adalah gabungan berbobot: nilai review guru (A–E), badge, ' +
        'dan kecepatan pengerjaan (durasi dari tanggal mulai). Nilai baru muncul setelah guru menilai tugas — ' +
        'sebelum dinilai, nilai sprint masih 0. Arahkan kursor ke angka untuk melihat rinciannya.'),
      baris.length && sprints.length
        ? el('div', { class: 'panel' },
            el('div', { class: 'tabel-bungkus' },
              el('table', { class: 'data', gaya: { minWidth: (260 + sprints.length * 90) + 'px' } },
                el('thead', {}, el('tr', {},
                  el('th', { class: 'tengah' }, 'Absen'), el('th', {}, 'Nama'),
                  ...sprints.map(s => el('th', { class: 'angka', title: s.nama }, `S${s.nomor}`)),
                  el('th', { class: 'angka' }, 'Rata²'))),
                el('tbody', {}, ...baris.map(r => {
                  const nilaiArr = sprints.map(s => r.nilaiSprint[s.id].nilai)
                  const rata = nilaiArr.length ? Math.round(nilaiArr.reduce((a, b) => a + b, 0) / nilaiArr.length) : 0
                  return el('tr', {},
                    el('td', { class: 'mono tengah' }, r.profil?.no_absen ?? '—'),
                    el('td', { class: 'utama' }, r.profil?.nama ?? '—'),
                    ...sprints.map(s => {
                      const v = r.nilaiSprint[s.id]
                      const rc = v.rincian ?? {}
                      const t = rc.tantangan
                      const infoTantangan = t && t.total > 0
                        ? ` · tantangan ${t.dinilai}/${t.total} (batas ${t.persenBatas}%)`
                        : ''
                      const info = `${v.dinilai}/${v.total} inti dinilai · ` +
                        `review ${rc.review ?? 0}, badge ${rc.badge ?? 0}, kecepatan ${rc.kecepatan ?? 0}` +
                        infoTantangan
                      return el('td', { class: 'angka',
                        gaya: { color: warnaNilai(v.nilai) } },
                        el('span', { title: info }, String(v.nilai)))
                    }),
                    el('td', { class: 'angka', gaya: { fontWeight: '700' } }, String(rata)),
                  )
                })),
              ),
            ))
        : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada data'),
            el('p', {}, 'Belum ada sprint dengan tugas inti, atau belum ada murid yang mengerjakan.'))),
    )
  }


  function unduhCsv(baris) {
    const kepala = ['No Absen', 'Nama', 'Inti Selesai', 'Inti Total', 'Tantangan',
                    'Badge', 'Nilai Akhir', 'Predikat', 'Tuntas KKTP']
    const larik = baris.map(r => [
      r.profil?.no_absen ?? '', r.profil?.nama ?? '',
      r.rincian.intiSelesai, r.rincian.intiTotal, r.rincian.tantangan,
      r.rincian.badge, r.nilai, r.predikat,
      r.tuntas ? 'Tuntas' : 'Belum',
    ])

    // Bungkus tiap sel yang mengandung koma/kutip/baris-baru sesuai aturan CSV.
    const sel = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const isiCsv = [kepala, ...larik].map(b => b.map(sel).join(',')).join('\r\n')

    // BOM di depan supaya Excel membaca huruf Indonesia (é, dll) dengan benar.
    const blob = new Blob(['\uFEFF' + isiCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const namaBerkas = `Nilai_${pen.tujuan_pembelajaran?.kode ?? 'TP'}_${pen.kelas?.nama ?? ''}`
      .replace(/[^\w.-]+/g, '_') + '.csv'

    const a = el('a', { href: url, download: namaBerkas })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    roti('Berkas nilai diunduh — buka dengan Excel')
  }

  function unduhCsvSprint() {
    const baris = hitungSprint()
    const sprints = rekapSprint.sprints
    const kepala = ['No Absen', 'Nama',
      ...sprints.map(s => `Sprint ${s.nomor}`), 'Rata-rata']
    const larik = baris.map(r => {
      const nilaiArr = sprints.map(s => r.nilaiSprint[s.id].nilai)
      const rata = nilaiArr.length ? Math.round(nilaiArr.reduce((a, b) => a + b, 0) / nilaiArr.length) : 0
      return [r.profil?.no_absen ?? '', r.profil?.nama ?? '', ...nilaiArr, rata]
    })
    const sel = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const isiCsv = [kepala, ...larik].map(b => b.map(sel).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + isiCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const namaBerkas = `Nilai_PerSprint_${pen.tujuan_pembelajaran?.kode ?? 'TP'}_${pen.kelas?.nama ?? ''}`
      .replace(/[^\w.-]+/g, '_') + '.csv'
    const a = el('a', { href: url, download: namaBerkas })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    roti('Berkas nilai per sprint diunduh')
  }

  gambar()
}

function warnaNilai(n) {
  if (n >= 90) return 'var(--hijau-terang)'
  if (n >= 70) return 'var(--tinta)'
  if (n >= 1) return 'var(--kuning, #8a6a2f)'
  return 'var(--tinta-lembut)'
}

function kartuAngka(label, nilai) {
  return el('div', { class: 'panel', gaya: { flex: '1', minWidth: '130px' } },
    el('div', { class: 'panel-isi', gaya: { textAlign: 'center' } },
      el('div', { gaya: { fontFamily: 'var(--serif)', fontSize: '26px', fontWeight: '600',
                          color: 'var(--hijau-terang)' } }, nilai),
      el('div', { gaya: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em',
                          color: 'var(--tinta-lembut)', marginTop: '2px' } }, label)))
}

function lencanaPredikat(nilai) {
  const warna = warnaPredikat(nilai)
  const kelasLencana = {
    hijau: 'lencana-selesai', biru: 'lencana-dikerjakan',
    kuning: 'lencana-review', merah: 'lencana-backlog',
  }[warna]
  return el('span', { class: 'lencana ' + kelasLencana }, predikatUntuk(nilai))
}
