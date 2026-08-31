/**
 * Pengawasan Kelas — pemantauan real-time progres murid + kendali
 * per-murid (jeda / kunci layar).
 *
 * Memakai Supabase Realtime: papan ter-update otomatis saat murid
 * bekerja, tanpa perlu memuat ulang. Timer pengerjaan tiap murid
 * berjalan langsung di layar guru.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, dialog, konfirmasi, inisial, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { formatWaktu } from '../lib/pangkat.js'
import { keadaan, pergiKe } from '../main.js'
import { ambilSemua } from '../rutin/papan.js'

const STATUS_LABEL = {
  backlog: 'Backlog', dikerjakan: 'Dikerjakan', review: 'Menunggu review', selesai: 'Selesai',
}
const STATUS_KELAS = {
  backlog: 'lencana-backlog', dikerjakan: 'lencana-dikerjakan',
  review: 'lencana-review', selesai: 'lencana-selesai',
}

export async function halamanPengawasan(wadah, kelasId) {
  isi(wadah, rangkaMuat('240px'))

  let kelas, murid, penugasan
  try {
    const [rk, rm, rp] = await Promise.all([
      sb.from('kelas').select('id, nama, kode_gabung').eq('id', kelasId).single(),
      sb.from('pendaftaran')
        .select('id, murid_id, tim, kendali, kendali_pesan, denyut_pada, tugas_aktif, tugas_mulai, profil:murid_id(nama, no_absen)')
        .eq('kelas_id', kelasId).eq('aktif', true),
      sb.from('penugasan')
        .select('id, dibuka, tujuan_pembelajaran(id, kode, judul)')
        .eq('kelas_id', kelasId).eq('dibuka', true),
    ])
    if (rk.error) throw rk.error
    kelas = rk.data; murid = rm.data ?? []; penugasan = rp.data ?? []
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  // Muat progres semua murid pada penugasan yang terbuka.
  const penIds = penugasan.map(p => p.id)
  let progres = []
  if (penIds.length) {
    // Pakai ambilSemua agar TIDAK terpotong batas 1000 baris — kalau terpotong,
    // sebagian murid tampil kosong padahal punya progres (bug "kolom kosong").
    progres = await ambilSemua(() => sb.from('progres_tugas')
      .select('id, murid_id, tugas_id, status, nilai_huruf, detik_terpakai, dimulai_pada, penugasan_id, tugas:tugas_id(kode, judul, jenis)')
      .in('penugasan_id', penIds))
  }

  // Peta murid_id -> data gabungan.
  const peta = new Map()
  for (const m of murid) {
    peta.set(m.murid_id, {
      ...m,
      progres: [],
      selesai: 0, dikerjakan: 0, review: 0,
    })
  }
  for (const p of progres) {
    const m = peta.get(p.murid_id); if (!m) continue
    m.progres.push(p)
    if (p.status === 'selesai') m.selesai++
    else if (p.status === 'dikerjakan') m.dikerjakan++
    else if (p.status === 'review') m.review++
  }

  // Ticker untuk timer berjalan (update tiap detik).
  let ticker = null
  let mode = 'kanban'   // 'kanban' | 'kartu'

  function daring(m) {
    if (!m.denyut_pada) return false
    return (Date.now() - new Date(m.denyut_pada).getTime()) < 90_000  // 90 detik
  }

  function gambar() {
    const baris = [...peta.values()].sort((a, b) =>
      (a.profil?.no_absen ?? '').localeCompare(b.profil?.no_absen ?? '', undefined, { numeric: true }))

    const jmlDaring = baris.filter(daring).length
    const jmlReview = baris.reduce((n, m) => n + m.review, 0)
    const jmlDikendalikan = baris.filter(m => m.kendali !== 'aktif').length

    isi(wadah,
      el('div', { class: 'kepala' },
        el('div', {},
          el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
            onClick: () => { bersih(); pergiKe(`kelas/${kelasId}`) } }, '← Kembali ke kelas'),
          el('h1', {}, 'Pengawasan Kelas'),
          el('p', {},
            el('span', { class: 'titik-hidup' }), ' Pantauan langsung · ',
            `${kelas.nama} · ${penugasan.length ? penugasan.map(p => p.tujuan_pembelajaran.kode).join(', ') : 'tidak ada tugas terbuka'}`),
        ),
        el('div', { class: 'kepala-kanan' },
          el('div', { class: 'alih', gaya: { display: 'flex', gap: '2px', marginRight: '4px' } },
            el('button', { class: 'tbl tbl-kecil' + (mode === 'kanban' ? ' tbl-utama' : ''),
              onClick: () => { mode = 'kanban'; gambar() } }, 'Kanban'),
            el('button', { class: 'tbl tbl-kecil' + (mode === 'kartu' ? ' tbl-utama' : ''),
              onClick: () => { mode = 'kartu'; gambar() } }, 'Kartu')),
          el('span', { class: 'lencana lencana-selesai' }, `${jmlDaring} daring`),
          jmlReview > 0 && el('span', { class: 'lencana lencana-review' }, `${jmlReview} perlu review`),
          jmlDikendalikan > 0 && el('span', { class: 'lencana lencana-backlog' }, `${jmlDikendalikan} dikendalikan`),
        ),
      ),

      !penugasan.length
        ? el('div', { class: 'pesan pesan-info' },
            'Belum ada tugas yang dibuka untuk kelas ini, jadi belum ada yang bisa dipantau. ' +
            'Buka sebuah penugasan lebih dulu.')
        : mode === 'kanban'
          ? papanKanban(baris)
          : el('div', { class: 'awasi-kisi' }, ...baris.map(m => kartuMurid(m))),
    )

    // Mulai/lanjutkan ticker timer.
    if (!ticker) ticker = setInterval(perbaruiTimer, 1000)
  }

  // Kanban per-murid: tiap baris seorang murid, dengan kolom
  // Dikerjakan / Direview / Tuntas. Bergerak otomatis lewat realtime.
  function papanKanban(baris) {
    return el('div', { class: 'kanban-bung' },
      // Kepala kolom
      el('div', { class: 'kanban-kepala' },
        el('div', { class: 'kanban-sel-murid' }, 'Murid'),
        el('div', { class: 'kanban-kol-judul kol-dikerjakan' }, 'Dikerjakan'),
        el('div', { class: 'kanban-kol-judul kol-review' }, 'Menunggu Review'),
        el('div', { class: 'kanban-kol-judul kol-selesai' }, 'Tuntas'),
      ),
      ...baris.map(barisKanban),
    )
  }

  function barisKanban(m) {
    const online = daring(m)
    const dikerjakan = m.progres.filter(p => p.status === 'dikerjakan')
    const review = m.progres.filter(p => p.status === 'review')
    const selesai = m.progres.filter(p => p.status === 'selesai')

    const kartuTugas = (p, opsi = {}) => el('div', { class: 'kanban-tugas' + (opsi.kelas ? ' ' + opsi.kelas : '') },
      el('span', { class: 'mono kanban-tugas-kode' }, p.tugas?.kode ?? ''),
      el('span', { class: 'kanban-tugas-judul' }, p.tugas?.judul ?? '—'),
      p.nilai_huruf && el('span', { class: 'lencana-nilai' }, p.nilai_huruf),
    )

    const kolom = (daftar, kelas, kosong) =>
      el('div', { class: 'kanban-kol ' + kelas },
        daftar.length
          ? el('div', {}, ...daftar.map(p => kartuTugas(p)))
          : el('div', { class: 'kanban-kosong' }, kosong))

    return el('div', { class: 'kanban-baris' + (m.kendali !== 'aktif' ? ' kanban-dikendalikan' : '') },
      el('div', { class: 'kanban-sel-murid' },
        el('div', { gaya: { display: 'flex', gap: '8px', alignItems: 'center' } },
          el('span', { class: 'avatar', gaya: { width: '28px', height: '28px', fontSize: '10px', flexShrink: '0' } },
            inisial(m.profil?.nama)),
          el('div', { gaya: { minWidth: '0' } },
            el('div', { gaya: { fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
              m.profil?.nama ?? '—'),
            el('div', { gaya: { fontSize: '10.5px', color: 'var(--tinta-lembut)' } },
              (m.profil?.no_absen ? `No ${m.profil.no_absen}` : '') +
              (m.kendali === 'dijeda' ? ' · ⏸ dijeda' : m.kendali === 'dikunci' ? ' · 🔒 dikunci' : '')))),
        el('span', { class: 'titik ' + (online ? 'titik-daring' : 'titik-luring'),
          gaya: { marginTop: '6px' }, title: online ? 'Daring' : 'Tidak aktif' }),
      ),
      kolom(dikerjakan, 'kol-dikerjakan', 'Tidak ada'),
      kolom(review, 'kol-review', '—'),
      kolom(selesai, 'kol-selesai', '—'),
    )
  }

  function kartuMurid(m) {
    const online = daring(m)
    const tugasAktif = m.progres.find(p => p.tugas_id === m.tugas_aktif && p.status === 'dikerjakan')
      || m.progres.find(p => p.status === 'dikerjakan')

    const kelasKendali = m.kendali === 'dijeda' ? 'awasi-dijeda'
      : m.kendali === 'dikunci' ? 'awasi-dikunci' : ''

    return el('div', { class: 'awasi-kartu ' + kelasKendali, data: { murid: m.murid_id } },
      // Kepala kartu
      el('div', { class: 'awasi-kartu-kepala' },
        el('span', { class: 'avatar', gaya: { width: '32px', height: '32px', fontSize: '12px', flexShrink: '0' } },
          inisial(m.profil?.nama)),
        el('div', { gaya: { flex: '1', minWidth: '0' } },
          el('div', { gaya: { fontWeight: '600', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
            m.profil?.nama ?? '—'),
          el('div', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } },
            [m.profil?.no_absen ? `Absen ${m.profil.no_absen}` : null, m.tim].filter(Boolean).join(' · ') || '—')),
        el('span', { class: 'titik ' + (online ? 'titik-daring' : 'titik-luring'),
          title: online ? 'Daring' : 'Tidak aktif' }),
      ),

      // Status kendali (bila ada)
      m.kendali !== 'aktif' && el('div', { class: 'awasi-kendali-info' },
        m.kendali === 'dijeda' ? '⏸ Dijeda' : '🔒 Dikunci',
        m.kendali_pesan ? ` — ${m.kendali_pesan}` : ''),

      // Tugas yang sedang dikerjakan + timer
      tugasAktif
        ? el('div', { class: 'awasi-tugas' },
            el('div', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)', marginBottom: '2px' } }, 'Sedang mengerjakan'),
            el('div', { gaya: { fontSize: '13px', fontWeight: '600', lineHeight: '1.3' } },
              tugasAktif.tugas?.judul ?? '—'),
            el('div', { class: 'awasi-timer mono', data: { mulai: tugasAktif.dimulai_pada ?? '', dasar: String(tugasAktif.detik_terpakai) } },
              formatWaktu(hitungDetik(tugasAktif))))
        : el('div', { class: 'awasi-tugas awasi-tugas-kosong' },
            online ? 'Tidak sedang mengerjakan tugas' : 'Belum/berhenti bekerja'),

      // Ringkasan progres
      el('div', { class: 'awasi-ringkas' },
        el('span', { class: 'lencana lencana-selesai' }, `✓ ${m.selesai}`),
        m.dikerjakan > 0 && el('span', { class: 'lencana lencana-dikerjakan' }, `${m.dikerjakan} aktif`),
        m.review > 0 && el('span', { class: 'lencana lencana-review' }, `${m.review} review`),
      ),

      // Tombol kendali
      el('div', { class: 'awasi-aksi' },
        m.kendali === 'aktif'
          ? el('button', { class: 'tbl tbl-kecil', onClick: () => aturKendali(m, 'dijeda') }, 'Jeda')
          : el('button', { class: 'tbl tbl-kecil', onClick: () => aturKendali(m, 'aktif') }, 'Lanjutkan'),
        m.kendali === 'dikunci'
          ? el('button', { class: 'tbl tbl-kecil', onClick: () => aturKendali(m, 'aktif') }, 'Buka kunci')
          : el('button', { class: 'tbl tbl-kecil tbl-bahaya', onClick: () => aturKendali(m, 'dikunci') }, 'Kunci layar'),
      ),
    )
  }

  function hitungDetik(p) {
    const dasar = p.detik_terpakai ?? 0
    if (p.status === 'dikerjakan' && p.dimulai_pada) {
      const jalan = Math.floor((Date.now() - new Date(p.dimulai_pada).getTime()) / 1000)
      return dasar + Math.max(0, jalan)
    }
    return dasar
  }

  function perbaruiTimer() {
    $$('.awasi-timer').forEach(elem => {
      const mulai = elem.dataset.mulai
      const dasar = Number(elem.dataset.dasar || 0)
      if (mulai) {
        const jalan = Math.floor((Date.now() - new Date(mulai).getTime()) / 1000)
        elem.textContent = formatWaktu(dasar + Math.max(0, jalan))
      }
    })
    // Perbarui indikator daring/luring tiap 30 detik sekali cukup;
    // di sini kita biarkan Realtime yang memicu gambar ulang.
  }

  async function aturKendali(m, kendali) {
    let pesan = null
    if (kendali === 'dijeda' || kendali === 'dikunci') {
      pesan = await tanyaAlasan(kendali)
      if (pesan === null) return   // dibatalkan
    }
    try {
      const { error } = await sb.rpc('set_kendali_murid', {
        p_pendaftaran: m.id, p_kendali: kendali, p_pesan: pesan || null,
      })
      if (error) throw error
      // Perbarui lokal; Realtime juga akan memicu, tapi ini responsif.
      m.kendali = kendali; m.kendali_pesan = pesan
      roti(kendali === 'aktif' ? `${m.profil?.nama} dilanjutkan`
        : kendali === 'dijeda' ? `${m.profil?.nama} dijeda`
        : `Layar ${m.profil?.nama} dikunci`)
      gambar()
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  function tanyaAlasan(kendali) {
    return new Promise(resolve => {
      const input = el('input', { type: 'text',
        placeholder: kendali === 'dikunci' ? 'mis. Terdeteksi membuka tab lain' : 'mis. Istirahat sejenak' })
      let tutup
      tutup = dialog({
        judul: kendali === 'dikunci' ? 'Kunci layar murid' : 'Jeda murid',
        badan: el('div', {},
          el('p', { gaya: { margin: '0 0 10px', fontSize: '13.5px', lineHeight: '1.55' } },
            kendali === 'dikunci'
              ? 'Layar murid akan menampilkan pesan terkunci dan ia tidak bisa melanjutkan sampai kamu membuka kuncinya. Timer-nya berhenti.'
              : 'Timer murid akan dijeda dan ia diberi tahu untuk berhenti sejenak. Bisa dilanjutkan kapan saja.'),
          el('div', { class: 'ruas' }, el('label', {}, 'Pesan untuk murid (opsional)'), input)),
        kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
          el('button', { class: 'tbl', onClick: () => { tutup(); resolve(null) } }, 'Batal'),
          el('button', { class: kendali === 'dikunci' ? 'tbl tbl-bahaya' : 'tbl tbl-utama',
            onClick: () => { tutup(); resolve(input.value.trim()) } },
            kendali === 'dikunci' ? 'Kunci' : 'Jeda'))],
        lebar: '460px',
      })
    })
  }

  // ---- Realtime: dengarkan perubahan progres & kendali ----
  // Bersihkan kanal lama dengan nama sama (mis. saat halaman dibuka ulang),
  // agar tidak memicu "cannot add callbacks after subscribe()".
  const namaKanal = 'awasi-' + kelasId
  for (const k of sb.getChannels()) {
    if (k.topic === 'realtime:' + namaKanal) sb.removeChannel(k)
  }

  const kanal = sb.channel(namaKanal)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'progres_tugas' },
      (payload) => terapkanProgres(payload))
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pendaftaran', filter: `kelas_id=eq.${kelasId}` },
      (payload) => terapkanPendaftaran(payload))
    .subscribe()

  function terapkanProgres(payload) {
    const baru = payload.new
    if (!baru || !peta.has(baru.murid_id)) return
    const m = peta.get(baru.murid_id)
    const idx = m.progres.findIndex(p => p.id === baru.id)
    // Muat ulang ringkas: cara paling sederhana & benar adalah menarik
    // ulang progres murid ini. Tapi untuk hemat, perbarui di tempat.
    if (idx >= 0) Object.assign(m.progres[idx], baru)
    else m.progres.push(baru)
    // Hitung ulang ringkasan.
    m.selesai = m.progres.filter(p => p.status === 'selesai').length
    m.dikerjakan = m.progres.filter(p => p.status === 'dikerjakan').length
    m.review = m.progres.filter(p => p.status === 'review').length
    gambar()
  }

  function terapkanPendaftaran(payload) {
    const baru = payload.new
    if (!baru || !peta.has(baru.murid_id)) return
    Object.assign(peta.get(baru.murid_id), baru)
    gambar()
  }

  function bersih() {
    if (ticker) { clearInterval(ticker); ticker = null }
    sb.removeChannel(kanal)
  }

  // Bersihkan saat meninggalkan halaman.
  window.addEventListener('hashchange', bersih, { once: true })

  gambar()
}
