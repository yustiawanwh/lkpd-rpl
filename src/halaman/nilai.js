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
import { hitungNilai, hitungNilaiSprint, predikatUntuk, warnaPredikat, BOBOT_BAWAAN } from '../lib/nilai.js'
import { keadaan, pergiKe } from '../main.js'

export async function halamanNilai(wadah, penugasanId) {
  isi(wadah, rangkaMuat('220px'))

  // Muat info penugasan (untuk judul & tpId), lalu rekapnya.
  let pen, rekap, rekapSprint
  try {
    const { data, error } = await sb.from('penugasan')
      .select('id, kelas_id, kelas(nama), tujuan_pembelajaran(id, kode, judul)')
      .eq('id', penugasanId).single()
    if (error) throw error
    pen = data
    rekap = await rekapNilai(penugasanId, pen.tujuan_pembelajaran.id)
    rekapSprint = await rekapNilaiPerSprint(penugasanId, pen.tujuan_pembelajaran.id)
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
  function hitungSemua() {
    return rekap.murid
      .map(m => {
        const hasil = hitungNilai({
          inti_selesai: m.tugas_selesai,
          inti_total: rekap.intiTotal,
          tantangan_selesai: m.tantangan_selesai,
          jumlah_badge: m.jumlah_badge,
        }, bobot)
        return { ...m, ...hasil }
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
          mode === 'total' && el('button', { class: 'tbl', onClick: () => dialogBobot() }, 'Atur bobot'),
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
        `Nilai dasar dari ketuntasan ${rekap.intiTotal} tugas inti (tuntas semua = 100). ` +
        `Tantangan +${bobot.poinPerTantangan}/tugas dan badge +${bobot.poinPerBadge}/badge menambah di atasnya, ` +
        `dibatasi maksimal 100. "Tuntas" berarti seluruh tugas inti selesai.`),
      baris.length
        ? el('div', { class: 'panel' },
            el('div', { class: 'tabel-bungkus' },
              el('table', { class: 'data', gaya: { minWidth: '760px' } },
                el('thead', {}, el('tr', {},
                  el('th', { class: 'tengah' }, 'Absen'), el('th', {}, 'Nama'),
                  el('th', { class: 'tengah' }, 'Inti'), el('th', { class: 'angka' }, 'Tantangan'),
                  el('th', { class: 'angka' }, 'Badge'),
                  el('th', { class: 'angka' }, 'Dasar'), el('th', { class: 'angka' }, 'Bonus'),
                  el('th', { class: 'angka' }, 'Nilai'), el('th', {}, 'Predikat'),
                  el('th', { class: 'tengah' }, 'Tuntas'))),
                el('tbody', {}, ...baris.map(r => el('tr', {},
                  el('td', { class: 'mono tengah' }, r.profil?.no_absen ?? '—'),
                  el('td', { class: 'utama' }, r.profil?.nama ?? '—'),
                  el('td', { class: 'mono tengah' }, `${r.rincian.intiSelesai}/${r.rincian.intiTotal}`),
                  el('td', { class: 'angka' }, String(r.rincian.tantangan)),
                  el('td', { class: 'angka' }, String(r.rincian.badge)),
                  el('td', { class: 'angka lembut' }, String(r.dasar)),
                  el('td', { class: 'angka lembut' }, r.bonus > 0 ? `+${r.bonus}` : '0'),
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
            kecepatan: ps.peringkat != null
              ? { peringkat: ps.peringkat, jumlahKumpul: ps.jumlahKumpul, jamTelat: ps.jamTelat }
              : null,
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
        'Nilai tiap sprint dihitung dari ketuntasan tugas inti pada sprint itu saja ' +
        '(tuntas semua inti sprint = 100). Cocok untuk nilai harian, karena satu sprint = satu hari kerja.'),
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
                      return el('td', { class: 'angka',
                        gaya: { color: warnaNilai(v.nilai) } },
                        el('span', { title: `${v.selesai}/${v.total} inti` }, String(v.nilai)))
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

  function dialogBobot() {
    const fTantangan = el('input', { type: 'number', min: '0', max: '20', value: bobot.poinPerTantangan })
    const fBadge = el('input', { type: 'number', min: '0', max: '20', value: bobot.poinPerBadge })
    let tutup
    tutup = dialog({
      judul: 'Atur bobot bonus',
      badan: el('div', {},
        el('p', { gaya: { margin: '0 0 12px', fontSize: '13.5px', color: 'var(--tinta-lembut)', lineHeight: '1.55' } },
          'Nilai dasar selalu dari ketuntasan tugas inti (tuntas semua = 100). ' +
          'Di sini kamu mengatur seberapa besar tambahan dari tantangan dan badge.'),
        el('div', { class: 'kisi-2' },
          el('div', { class: 'ruas' }, el('label', {}, 'Poin / tantangan'), fTantangan),
          el('div', { class: 'ruas' }, el('label', {}, 'Poin / badge'), fBadge)),
        el('p', { gaya: { margin: 0, fontSize: '12.5px', color: 'var(--tinta-lembut)' } },
          'Nilai akhir tetap dibatasi maksimal 100.'),
      ),
      kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
        el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'),
        el('button', { class: 'tbl tbl-utama', onClick: () => {
          bobot = { ...bobot,
            poinPerTantangan: Number(fTantangan.value) || 0,
            poinPerBadge: Number(fBadge.value) || 0 }
          tutup(); gambar()
        } }, 'Terapkan'))],
      lebar: '440px',
    })
  }

  function unduhCsv(baris) {
    const kepala = ['No Absen', 'Nama', 'Inti Selesai', 'Inti Total', 'Tantangan',
                    'Badge', 'Nilai Dasar', 'Bonus', 'Nilai Akhir', 'Predikat', 'Tuntas KKTP']
    const larik = baris.map(r => [
      r.profil?.no_absen ?? '', r.profil?.nama ?? '',
      r.rincian.intiSelesai, r.rincian.intiTotal, r.rincian.tantangan,
      r.rincian.badge, r.dasar, r.bonus, r.nilai, r.predikat,
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
