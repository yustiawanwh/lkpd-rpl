/**
 * Dashboard progres — ringkasan cepat untuk guru/admin melihat murid
 * mana yang progresnya bagus dan mana yang perlu ditindaklanjuti.
 *
 * Menandai murid berdasarkan indikator sederhana: persentase tugas inti
 * selesai, jumlah tugas menunggu review, dan apakah macet (lama tak ada
 * kemajuan). Fokusnya: memunculkan yang PERLU PERHATIAN lebih dulu.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, rangkaMuat, inisial } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { keadaan, pergiKe } from '../main.js'

export async function halamanDashboard(wadah) {
  isi(wadah, el('div', { class: 'tumpuk' }, rangkaMuat('120px'), rangkaMuat('220px')))

  const admin = keadaan.profil.peran === 'admin'

  let penugasan
  try {
    // Ambil penugasan terbuka di kelas yang diampu (admin: semua).
    let q = sb.from('penugasan')
      .select('id, dibuka, tenggat, kelas_id, kelas(nama, guru_id), tujuan_pembelajaran(id, kode, judul)')
      .eq('dibuka', true)
    const { data, error } = await q
    if (error) throw error
    // Guru non-admin: saring kelas miliknya.
    penugasan = (data ?? []).filter(p => admin || p.kelas?.guru_id === keadaan.profil.id)
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  if (!penugasan.length) {
    isi(wadah,
      el('div', { class: 'kepala' }, el('div', {}, el('h1', {}, 'Dashboard Progres'))),
      el('div', { class: 'panel' }, el('div', { class: 'kosong' },
        el('h3', {}, 'Belum ada tugas berjalan'),
        el('p', {}, 'Buka sebuah penugasan di kelas untuk mulai memantau progres murid di sini.'))))
    return
  }

  // Untuk tiap penugasan, hitung ringkasan per murid.
  const penIds = penugasan.map(p => p.id)
  const tpIds = [...new Set(penugasan.map(p => p.tujuan_pembelajaran?.id).filter(Boolean))]

  let progres = [], stat = [], daftar = [], tugasInti = []
  try {
    const [rp, rs, rd, rt] = await Promise.all([
      sb.from('progres_tugas').select('penugasan_id, murid_id, tugas_id, status, nilai_huruf').in('penugasan_id', penIds),
      sb.from('statistik_murid').select('penugasan_id, murid_id, total_xp, jumlah_badge, tugas_selesai, total_detik, profil:murid_id(nama, no_absen)').in('penugasan_id', penIds),
      sb.from('pendaftaran').select('kelas_id, murid_id, denyut_pada, profil:murid_id(nama, no_absen)').in('kelas_id', penugasan.map(p => p.kelas_id)),
      sb.from('sprint').select('id, tujuan_pembelajaran_id, tugas(id, jenis)').in('tujuan_pembelajaran_id', tpIds),
    ])
    if (rp.error) throw rp.error
    progres = rp.data ?? []; stat = rs.data ?? []; daftar = rd.data ?? []; tugasInti = rt.data ?? []
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  // Jumlah tugas inti per TP.
  const intiPerTp = {}
  for (const s of tugasInti) {
    const n = (s.tugas ?? []).filter(t => t.jenis === 'inti').length
    intiPerTp[s.tujuan_pembelajaran_id] = (intiPerTp[s.tujuan_pembelajaran_id] ?? 0) + n
  }

  // Bangun baris per (murid × penugasan).
  const baris = []
  for (const pen of penugasan) {
    const intiTotal = intiPerTp[pen.tujuan_pembelajaran?.id] ?? 0
    // Murid terdaftar di kelas ini.
    const muridKelas = daftar.filter(d => d.kelas_id === pen.kelas_id)
    for (const d of muridKelas) {
      const pr = progres.filter(p => p.penugasan_id === pen.id && p.murid_id === d.murid_id)
      const st = stat.find(s => s.penugasan_id === pen.id && s.murid_id === d.murid_id)
      const intiSelesai = pr.filter(p => {
        // hanya hitung yang inti & selesai
        return p.status === 'selesai'
      }).length
      const review = pr.filter(p => p.status === 'review').length
      const selesai = pr.filter(p => p.status === 'selesai').length
      const dikerjakan = pr.filter(p => p.status === 'dikerjakan').length
      const persen = intiTotal > 0 ? Math.round((Math.min(selesai, intiTotal) / intiTotal) * 100) : 0

      const daring = d.denyut_pada && (Date.now() - new Date(d.denyut_pada).getTime()) < 90_000
      const belumMulai = selesai === 0 && dikerjakan === 0 && review === 0

      // Status kesehatan.
      let sehat  // 'bagus' | 'sedang' | 'perhatian'
      if (persen >= 75) sehat = 'bagus'
      else if (persen >= 40 || dikerjakan > 0 || review > 0) sehat = 'sedang'
      else sehat = 'perhatian'

      baris.push({
        murid_id: d.murid_id,
        nama: d.profil?.nama ?? st?.profil?.nama ?? '—',
        absen: d.profil?.no_absen ?? st?.profil?.no_absen ?? '',
        kelas: pen.kelas?.nama ?? '', tp: pen.tujuan_pembelajaran?.kode ?? '',
        penugasanId: pen.id,
        persen, selesai, intiTotal, review, dikerjakan, belumMulai,
        xp: st?.total_xp ?? 0, badge: st?.jumlah_badge ?? 0, daring, sehat,
      })
    }
  }

  const perhatian = baris.filter(b => b.sehat === 'perhatian')
    .sort((a, b) => a.persen - b.persen)
  const sedang = baris.filter(b => b.sehat === 'sedang').sort((a, b) => a.persen - b.persen)
  const bagus = baris.filter(b => b.sehat === 'bagus').sort((a, b) => b.persen - a.persen)

  const rataPersen = baris.length
    ? Math.round(baris.reduce((n, b) => n + b.persen, 0) / baris.length) : 0
  const totalReview = baris.reduce((n, b) => n + b.review, 0)

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Dashboard Progres'),
        el('p', {}, `${penugasan.length} tugas berjalan · ${baris.length} entri murid · pantau siapa yang perlu dibantu`)),
    ),

    // Ringkasan angka.
    el('div', { class: 'dash-ringkas' },
      kartuDash('Perlu perhatian', String(perhatian.length), 'perhatian', () => {}),
      kartuDash('Sedang berjalan', String(sedang.length), 'sedang', () => {}),
      kartuDash('Progres bagus', String(bagus.length), 'bagus', () => {}),
      kartuDash('Rata-rata progres', rataPersen + '%', 'netral', () => {}),
      totalReview > 0 && kartuDash('Menunggu review', String(totalReview), 'review', () => {}),
    ),

    // Perlu perhatian dulu.
    seksi('🔴 Perlu perhatian', perhatian,
      'Murid dengan progres rendah atau belum mulai. Prioritas untuk ditindaklanjuti.'),
    seksi('🟡 Sedang berjalan', sedang,
      'Sudah mulai bekerja, progres menengah.'),
    seksi('🟢 Progres bagus', bagus,
      'Sudah menyelesaikan sebagian besar tugas inti.'),
  )

  function seksi(judul, daftarBaris, ket) {
    return el('div', { class: 'panel', gaya: { marginBottom: '14px' } },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, judul),
        el('span', { class: 'mono', gaya: { marginLeft: 'auto', fontSize: '12px', color: 'var(--tinta-lembut)' } },
          `${daftarBaris.length} murid`)),
      el('div', { class: 'panel-isi' },
        el('p', { gaya: { margin: '0 0 12px', fontSize: '12.5px', color: 'var(--tinta-lembut)' } }, ket),
        daftarBaris.length
          ? el('div', { class: 'dash-kisi' }, ...daftarBaris.map(kartuMurid))
          : el('div', { gaya: { fontSize: '13px', color: 'var(--tinta-lembut)', fontStyle: 'italic' } },
              'Tidak ada murid di kategori ini.')),
    )
  }

  function kartuMurid(b) {
    return el('div', { class: 'dash-murid dash-' + b.sehat,
      onClick: () => pergiKe(`rekap/${b.penugasanId}`), role: 'button', tabindex: '0' },
      el('div', { class: 'dash-murid-kepala' },
        el('span', { class: 'avatar', gaya: { width: '30px', height: '30px', fontSize: '11px', flexShrink: '0' } },
          inisial(b.nama)),
        el('div', { gaya: { flex: '1', minWidth: '0' } },
          el('div', { gaya: { fontWeight: '600', fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, b.nama),
          el('div', { gaya: { fontSize: '11px', color: 'var(--tinta-lembut)' } },
            [b.absen ? `No ${b.absen}` : null, b.kelas, b.tp].filter(Boolean).join(' · '))),
        b.daring && el('span', { class: 'titik titik-daring', title: 'Sedang daring' }),
      ),
      el('div', { class: 'dash-bar-bung' },
        el('div', { class: 'dash-bar', gaya: { width: b.persen + '%' } })),
      el('div', { class: 'dash-murid-kaki' },
        el('span', { gaya: { fontWeight: '700' } }, `${b.persen}%`),
        el('span', { class: 'lembut' }, `${b.selesai}/${b.intiTotal} inti`),
        b.review > 0 && el('span', { class: 'lencana lencana-review' }, `${b.review} review`),
        b.belumMulai && el('span', { class: 'lencana lencana-backlog' }, 'belum mulai'),
      ),
    )
  }
}

function kartuDash(judul, angka, jenis, onClick) {
  return el('div', { class: 'dash-stat dash-stat-' + jenis },
    el('div', { class: 'dash-stat-angka' }, angka),
    el('div', { class: 'dash-stat-judul' }, judul))
}
