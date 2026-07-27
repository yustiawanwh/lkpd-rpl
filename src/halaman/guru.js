/**
 * Halaman guru: kelola kelas, penugasan, dan pantau progres murid.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, inisial, dialog, konfirmasi, tanggalId, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { formatWaktu, pangkatUntuk } from '../lib/pangkat.js'
import { keadaan, pergiKe, keluar } from '../main.js'
import { halamanPengaturan, halamanPengguna } from './kelola.js'
import { halamanLkpd, halamanSuntingLkpd } from './kelola-lkpd.js'
import { halamanNilai } from './nilai.js'
import { halamanPengawasan } from './pengawasan.js'
import { halamanDashboard } from './dashboard.js'

export async function halamanGuru(wadah, r) {
  const tampilan = r.nama || 'kelas'

  isi(wadah, bilah(tampilan), el('div', { class: 'isi', id: 'isi-guru' },
    el('div', { class: 'tumpuk' }, rangkaMuat('120px'), rangkaMuat('200px'))))

  const utama = $('#isi-guru')

  try {
    if (tampilan === 'kelas' && r.bagian[0]) await detilKelas(utama, Number(r.bagian[0]))
    else if (tampilan === 'nilai' && r.bagian[0]) await antreanReview(utama, Number(r.bagian[0]))
    else if (tampilan === 'rekap' && r.bagian[0]) await halamanNilai(utama, Number(r.bagian[0]))
    else if (tampilan === 'awasi' && r.bagian[0]) await halamanPengawasan(utama, Number(r.bagian[0]))
    else if (tampilan === 'dashboard') await halamanDashboard(utama)
    else if (tampilan === 'pengaturan') await halamanPengaturan(utama)
    else if (tampilan === 'pengguna') await halamanPengguna(utama)
    else if (tampilan === 'lkpd' && r.bagian[0]) await halamanSuntingLkpd(utama, Number(r.bagian[0]))
    else if (tampilan === 'lkpd') await halamanLkpd(utama)
    else await daftarKelas(utama)
  } catch (err) {
    isi(utama, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
  }
}

function bilah(aktif) {
  const p = keadaan.profil
  const admin = p.peran === 'admin'

  return el('header', { class: 'bilah' },
    el('div', { class: 'bilah-merek' },
      el('span', { class: 'bilah-tanda' }, 'B'), 'Brantas Dev Studio'),

    el('nav', { class: 'bilah-nav' },
      el('button', { 'aria-current': aktif === 'kelas' ? 'page' : null,
                     onClick: () => pergiKe('kelas') }, 'Kelas'),
      el('button', { 'aria-current': aktif === 'dashboard' ? 'page' : null,
                     onClick: () => pergiKe('dashboard') }, 'Dashboard'),
      el('button', { 'aria-current': aktif === 'lkpd' ? 'page' : null,
                     onClick: () => pergiKe('lkpd') }, 'Bank LKPD'),
      el('button', { 'aria-current': aktif === 'pengaturan' ? 'page' : null,
                     onClick: () => pergiKe('pengaturan') }, 'Pengaturan'),
      admin && el('button', { 'aria-current': aktif === 'pengguna' ? 'page' : null,
                     onClick: () => pergiKe('pengguna') }, 'Pengguna'),
    ),

    el('div', { class: 'bilah-kanan' },
      el('div', { class: 'bilah-siapa' },
        el('b', {}, p.nama),
        el('span', {}, p.peran === 'admin' ? 'Admin' : 'Guru')),
      el('div', { class: 'avatar' }, inisial(p.nama)),
      el('button', { class: 'tbl tbl-kecil tbl-hantu',
                     gaya: { color: 'rgba(255,255,255,.8)' }, onClick: keluar }, 'Keluar'),
    ),
  )
}

/* ==========================================================
   Daftar kelas
   ========================================================== */
async function daftarKelas(wadah) {
  const { data, error } = await sb
    .from('kelas')
    .select(`id, nama, kode_gabung, terbuka,
             mata_pelajaran(nama, tingkat), tahun_ajaran(nama),
             pendaftaran(count), penugasan(count)`)
    .order('nama')
  if (error) throw error

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Kelas yang saya ampu'),
        el('p', {}, 'Bagikan kode kelas kepada murid supaya mereka bisa bergabung sendiri.'),
      ),
      el('div', { class: 'kepala-kanan' },
        el('button', { class: 'tbl tbl-utama', onClick: () => dialogKelasBaru() }, 'Buat kelas'),
      ),
    ),

    data.length
      ? el('div', { class: 'tumpuk' },
          ...data.map(k => el('div', { class: 'panel' },
            el('div', { class: 'panel-isi',
                        gaya: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
              el('div', { gaya: { flex: '1', minWidth: '200px' } },
                el('h2', { gaya: { fontSize: '17px' } }, k.nama),
                el('p', { gaya: { margin: '3px 0 0', fontSize: '13px', color: 'var(--tinta-lembut)' } },
                  [k.mata_pelajaran?.nama,
                   k.mata_pelajaran?.tingkat ? `Kelas ${k.mata_pelajaran.tingkat}` : null,
                   k.tahun_ajaran?.nama,
                   `${k.pendaftaran?.[0]?.count ?? 0} murid`,
                   `${k.penugasan?.[0]?.count ?? 0} tugas`,
                  ].filter(Boolean).join(' · ')),
              ),

              el('div', { gaya: { textAlign: 'center' } },
                el('div', { class: 'mono',
                            gaya: { fontSize: '19px', fontWeight: '600', letterSpacing: '.14em' } },
                  k.kode_gabung),
                el('div', { gaya: { fontSize: '10.5px', color: 'var(--tinta-lembut)',
                                     textTransform: 'uppercase', letterSpacing: '.07em' } },
                  'Kode gabung'),
              ),

              el('div', { gaya: { display: 'flex', gap: '7px', flexWrap: 'wrap' } },
                el('button', { class: 'tbl tbl-kecil',
                               onClick: () => salinKode(k.kode_gabung) }, 'Salin kode'),
                el('button', { class: 'tbl tbl-kecil tbl-utama',
                               onClick: () => pergiKe(`kelas/${k.id}`) }, 'Buka'),
              ),
            ),
          )))
      : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Belum ada kelas'),
          el('p', {}, 'Buat kelas dulu, lalu bagikan kode gabungnya kepada murid.'),
          el('button', { class: 'tbl tbl-utama', onClick: () => dialogKelasBaru() }, 'Buat kelas'),
        )),
  )
}

async function salinKode(kode) {
  try {
    await navigator.clipboard.writeText(kode)
    roti(`Kode ${kode} disalin`)
  } catch {
    roti(`Kode kelas: ${kode}`)
  }
}

async function dialogKelasBaru() {
  const { data: mapel } = await sb.from('mata_pelajaran').select('*').order('tingkat').order('nama')
  const { data: tahun } = await sb.from('tahun_ajaran').select('*').order('nama', { ascending: false })

  if (!mapel?.length || !tahun?.length) {
    let tutup
    tutup = dialog({
      judul: 'Lengkapi data dulu',
      badan: el('p', { gaya: { margin: 0, fontSize: '14px', lineHeight: '1.6' } },
        'Sebelum membuat kelas, tambahkan dulu mata pelajaran dan tahun ajaran di halaman Pengaturan. ' +
        'Cukup sekali di awal — tidak perlu SQL lagi.'),
      kaki: [el('button', { class: 'tbl tbl-utama', gaya: { marginLeft: 'auto' },
        onClick: () => { tutup(); pergiKe('pengaturan') } }, 'Ke Pengaturan')],
      lebar: '460px',
    })
    return
  }

  const fNama = el('input', { type: 'text', required: true, placeholder: 'XII RPL 1' })
  const fMapel = el('select', {}, ...mapel.map(m =>
    el('option', { value: m.id }, m.nama + (m.tingkat ? ` — Kelas ${m.tingkat}` : ''))))
  const fTahun = el('select', {}, ...tahun.map(t =>
    el('option', { value: t.id, selected: t.aktif }, t.nama)))
  const galat = el('div')

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Buat kelas')

  async function kirim() {
    if (!fNama.value.trim()) { fNama.focus(); return }
    simpan.disabled = true; simpan.textContent = 'Menyimpan…'
    isi(galat)

    try {
      const { data, error } = await sb.from('kelas').insert({
        nama: fNama.value.trim(),
        mata_pelajaran_id: Number(fMapel.value),
        tahun_ajaran_id: Number(fTahun.value),
        guru_id: keadaan.profil.id,
      }).select().single()
      if (error) throw error

      tutup()
      roti(`Kelas dibuat — kode ${data.kode_gabung}`)
      pergiKe(`kelas/${data.id}`)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
      simpan.disabled = false; simpan.textContent = 'Buat kelas'
    }
  }

  tutup = dialog({
    judul: 'Kelas baru',
    badan: el('div', {},
      galat,
      el('div', { class: 'ruas' }, el('label', {}, 'Nama kelas'), fNama),
      el('div', { class: 'ruas' }, el('label', {}, 'Mata pelajaran'), fMapel),
      el('div', { class: 'ruas' }, el('label', {}, 'Tahun ajaran'), fTahun),
      el('p', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)', margin: 0 } },
        'Kode gabung dibuat otomatis. Huruf yang mudah tertukar (I, O, 0, 1) ' +
        'sengaja tidak dipakai supaya murid tidak salah ketik.'),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '480px',
  })
}

/* ==========================================================
   Detil kelas — daftar murid & progres
   ========================================================== */
async function detilKelas(wadah, kelasId) {
  const { data: kelas, error: e1 } = await sb
    .from('kelas')
    .select('id, nama, kode_gabung, terbuka, mata_pelajaran(nama, tingkat), tahun_ajaran(nama)')
    .eq('id', kelasId).single()
  if (e1) throw e1

  const { data: penugasan } = await sb
    .from('penugasan')
    .select('id, dibuka, mulai, tenggat, tujuan_pembelajaran(id, kode, judul)')
    .eq('kelas_id', kelasId)

  const { data: murid, error: eMurid } = await sb
    .from('pendaftaran')
    .select('id, tim, aktif, murid_id, profil:murid_id(id, nama, no_absen)')
    .eq('kelas_id', kelasId)
  if (eMurid) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' },
      'Gagal memuat daftar murid: ' + pesanGalat(eMurid)))
    return
  }

  // Jaring pengaman: bila embedding profil gagal (mis. perbedaan evaluasi
  // RLS pada join), ambil profil secara terpisah lalu gabungkan.
  let daftarMentah = murid ?? []
  const perluProfil = daftarMentah.filter(m => !m.profil && m.murid_id)
  if (perluProfil.length) {
    const idProfil = [...new Set(perluProfil.map(m => m.murid_id))]
    const { data: profil2 } = await sb
      .from('profil').select('id, nama, no_absen').in('id', idProfil)
    const petaProfil = Object.fromEntries((profil2 ?? []).map(p => [p.id, p]))
    daftarMentah = daftarMentah.map(m =>
      m.profil ? m : { ...m, profil: petaProfil[m.murid_id] ?? null })
  }

  const aktifPen = penugasan?.[0] ?? null
  let stat = []
  let antreanJml = 0

  if (aktifPen) {
    const { data } = await sb.from('statistik_murid')
      .select('murid_id, total_xp, jumlah_badge, tugas_selesai, tantangan_selesai, total_detik')
      .eq('penugasan_id', aktifPen.id)
    stat = data ?? []

    const { count } = await sb.from('progres_tugas')
      .select('id', { count: 'exact', head: true })
      .eq('penugasan_id', aktifPen.id).eq('status', 'review')
    antreanJml = count ?? 0
  }

  const petaStat = Object.fromEntries(stat.map(s => [s.murid_id, s]))
  const daftarMurid = daftarMentah
    .filter(m => m.profil)
    .sort((a, b) => (a.profil.no_absen ?? '').localeCompare(b.profil.no_absen ?? '')
                    || a.profil.nama.localeCompare(b.profil.nama))

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
                       onClick: () => pergiKe('kelas') }, '← Semua kelas'),
        el('h1', {}, kelas.nama),
        el('p', {}, [kelas.mata_pelajaran?.nama, kelas.tahun_ajaran?.nama,
                     `${daftarMurid.length} murid`].filter(Boolean).join(' · ')),
      ),
      el('div', { class: 'kepala-kanan' },
        el('div', { gaya: { textAlign: 'center', marginRight: '6px' } },
          el('div', { class: 'mono', gaya: { fontSize: '18px', fontWeight: '600',
                                              letterSpacing: '.14em' } }, kelas.kode_gabung),
          el('div', { gaya: { fontSize: '10px', color: 'var(--tinta-lembut)',
                               textTransform: 'uppercase', letterSpacing: '.07em' } }, 'Kode gabung'),
        ),
        el('button', { class: 'tbl', onClick: () => salinKode(kelas.kode_gabung) }, 'Salin'),
        el('button', { class: 'tbl tbl-utama', onClick: () => pergiKe(`awasi/${kelasId}`) },
          '● Pengawasan langsung'),
        aktifPen && antreanJml > 0 && el('button', {
          class: 'tbl tbl-utama', onClick: () => pergiKe(`nilai/${aktifPen.id}`),
        }, `Review (${antreanJml})`),
        el('button', { class: 'tbl tbl-utama', onClick: () => dialogTugaskan(kelasId) }, 'Tugaskan TP'),
      ),
    ),

    // Penugasan
    el('div', { class: 'panel', gaya: { marginBottom: '14px' } },
      el('div', { class: 'panel-kepala' }, el('h2', {}, 'Tugas yang berjalan')),
      penugasan?.length
        ? el('div', {}, ...penugasan.map(p => el('div', {
            gaya: { padding: '11px 15px', borderBottom: '1px solid var(--garis)',
                    display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
            el('div', { gaya: { flex: '1', minWidth: '180px' } },
              el('div', { class: 'mono', gaya: { fontSize: '11px', color: 'var(--tinta-lembut)' } },
                p.tujuan_pembelajaran.kode),
              el('div', { gaya: { fontWeight: '600' } }, p.tujuan_pembelajaran.judul),
              p.tenggat && el('div', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } },
                'Tenggat ' + tanggalId(p.tenggat)),
            ),
            el('span', { class: 'lencana ' + (p.dibuka ? 'lencana-selesai' : 'lencana-backlog') },
              p.dibuka ? 'Dibuka' : 'Ditutup'),
            el('div', { gaya: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => bukaTutup(p) }, p.dibuka ? 'Tutup' : 'Buka'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => pergiKe(`nilai/${p.id}`) }, 'Review'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => pergiKe(`rekap/${p.id}`) }, 'Nilai'),
              el('button', { class: 'tbl tbl-kecil tbl-bahaya',
                             onClick: () => hapusPenugasan(p) }, 'Hapus'),
            ),
          )))
        : el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada tugas'),
            el('p', {}, 'Tugaskan sebuah Tujuan Pembelajaran supaya murid bisa mulai bekerja.')),
    ),

    // Murid
    el('div', { class: 'panel' },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, 'Murid'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
          onClick: () => dialogTambahMurid(kelasId, kelas.nama) }, '+ Tambah murid'),
        el('span', { class: 'mono', gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } },
          `${daftarMurid.length} orang`),
      ),
      daftarMurid.length
        ? el('div', { class: 'tabel-bungkus' },
            el('table', { class: 'data', gaya: { minWidth: '680px' } },
              el('thead', {}, el('tr', {},
                el('th', { class: 'tengah' }, 'Absen'), el('th', {}, 'Nama'), el('th', {}, 'Tim'),
                el('th', { class: 'angka' }, 'XP'), el('th', { class: 'angka' }, 'Tugas'),
                el('th', { class: 'angka' }, 'Badge'), el('th', { class: 'angka' }, 'Waktu'),
                el('th', {}, ''))),
              el('tbody', {},
                ...daftarMurid.map(m => {
                  const s = petaStat[m.profil.id]
                  return el('tr', {},
                    el('td', { class: 'mono tengah' }, m.profil.no_absen ?? '—'),
                    el('td', { class: 'utama' }, m.profil.nama),
                    el('td', { class: 'lembut' }, m.tim ?? '—'),
                    el('td', { class: 'angka' }, String(s?.total_xp ?? 0)),
                    el('td', { class: 'angka' }, String(s?.tugas_selesai ?? 0)),
                    el('td', { class: 'angka' }, String(s?.jumlah_badge ?? 0)),
                    el('td', { class: 'angka' }, formatWaktu(s?.total_detik ?? 0)),
                    el('td', { class: 'aksi' },
                      el('div', {},
                        el('button', { class: 'tbl tbl-kecil',
                          onClick: () => dialogTugasMurid(kelasId, m) }, 'Tugas'),
                        el('button', { class: 'tbl tbl-kecil',
                          onClick: () => dialogEditMurid(kelasId, m) }, 'Edit'),
                        el('button', { class: 'tbl tbl-kecil tbl-bahaya',
                          onClick: () => keluarkanMurid(kelasId, m) }, 'Keluarkan'),
                      )),
                  )
                }),
              ),
            ))
        : el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada murid'),
            el('p', {}, `Bagikan kode ${kelas.kode_gabung} kepada murid supaya mereka bisa bergabung, atau tekan "Tambah murid".`)),
    ),
  )

  async function bukaTutup(p) {
    try {
      const { error } = await sb.from('penugasan')
        .update({ dibuka: !p.dibuka }).eq('id', p.id)
      if (error) throw error
      roti(p.dibuka ? 'Tugas ditutup' : 'Tugas dibuka')
      detilKelas(wadah, kelasId)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  async function hapusPenugasan(p) {
    // Periksa dulu: apakah sudah ada progres murid pada penugasan ini?
    // Kalau ada, menghapus akan membuang seluruh pekerjaan & XP mereka.
    let jumlahProgres = 0
    try {
      const { count } = await sb.from('progres_tugas')
        .select('id', { count: 'exact', head: true })
        .eq('penugasan_id', p.id)
      jumlahProgres = count ?? 0
    } catch { /* biar lanjut; konfirmasi tetap muncul */ }

    if (jumlahProgres > 0) {
      // Ada pekerjaan murid — tolak hapus, sarankan Tutup.
      let tutup
      tutup = dialog({
        judul: 'Tidak bisa dihapus',
        badan: el('div', {},
          el('p', { gaya: { margin: '0 0 10px', fontSize: '14px', lineHeight: '1.6' } },
            `Sudah ada pekerjaan murid pada tugas ini (${jumlahProgres} catatan progres). ` +
            'Menghapusnya akan membuang seluruh progres, isian tabel, bukti, dan XP murid ' +
            'secara permanen.'),
          el('p', { gaya: { margin: 0, fontSize: '14px', lineHeight: '1.6' } },
            'Kalau tujuannya menyembunyikan tugas ini dari murid, gunakan "Tutup" — ' +
            'datanya tetap aman dan bisa dibuka lagi kapan saja.'),
        ),
        kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
          el('button', { class: 'tbl', onClick: () => tutup() }, 'Mengerti'),
          p.dibuka && el('button', { class: 'tbl tbl-utama', onClick: () => { tutup(); bukaTutup(p) } },
            'Tutup saja'))],
        lebar: '480px',
      })
      return
    }

    // Belum ada pekerjaan murid — aman dihapus.
    const ya = await konfirmasi({
      judul: 'Hapus penugasan?',
      pesan: `Penugasan "${p.tujuan_pembelajaran.judul}" akan dihapus dari kelas ini. ` +
             'Belum ada murid yang mengerjakannya, jadi tidak ada data yang hilang. ' +
             'TP-nya sendiri tetap tersimpan di Bank LKPD dan bisa ditugaskan lagi nanti.',
      tombol: 'Hapus', bahaya: true,
    })
    if (!ya) return

    try {
      const { error } = await sb.from('penugasan').delete().eq('id', p.id)
      if (error) throw error
      roti('Penugasan dihapus')
      detilKelas(wadah, kelasId)
    } catch (err) {
      // Jaring pengaman: bila ternyata masih ada rujukan, jelaskan.
      roti(err.code === '23503'
        ? 'Tidak bisa dihapus — masih ada data murid yang menempel. Gunakan "Tutup" saja.'
        : pesanGalat(err), '⚠')
    }
  }

  // ---- Manajemen murid ----
  function dialogEditMurid(kelasId, m) {
    const fNama = el('input', { type: 'text', value: m.profil.nama ?? '' })
    const fAbsen = el('input', { type: 'text', value: m.profil.no_absen ?? '', placeholder: '01' })
    const fTim = el('input', { type: 'text', value: m.tim ?? '', placeholder: 'Mobile / Backend / QA' })
    const galat = el('div')
    let tutup
    const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

    async function kirim() {
      if (!fNama.value.trim()) { fNama.focus(); return }
      simpan.disabled = true; isi(galat)
      try {
        // Nama & absen ada di profil; tim ada di pendaftaran.
        const { error: e1 } = await sb.from('profil')
          .update({ nama: fNama.value.trim(), no_absen: fAbsen.value.trim() || null })
          .eq('id', m.profil.id)
        if (e1) throw e1
        const { error: e2 } = await sb.from('pendaftaran')
          .update({ tim: fTim.value.trim() || null })
          .eq('id', m.id)
        if (e2) throw e2
        tutup(); roti('Data murid diperbarui'); detilKelas(wadah, kelasId)
      } catch (err) {
        isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
        simpan.disabled = false
      }
    }

    tutup = dialog({
      judul: 'Ubah data murid',
      badan: el('div', {}, galat,
        el('div', { class: 'ruas' }, el('label', {}, 'Nama'), fNama),
        el('div', { class: 'kisi-2' },
          el('div', { class: 'ruas' }, el('label', {}, 'No. absen'), fAbsen),
          el('div', { class: 'ruas' }, el('label', {}, 'Tim'), fTim)),
      ),
      kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
        el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
      lebar: '460px',
    })
  }

  async function keluarkanMurid(kelasId, m) {
    const ya = await konfirmasi({
      judul: 'Keluarkan murid?',
      pesan: `${m.profil.nama} akan dikeluarkan dari kelas ini. Progres & XP-nya pada tugas ` +
             'kelas ini akan ikut terhapus. Akun muridnya sendiri tidak dihapus — ia masih ' +
             'bisa bergabung lagi dengan kode kelas.',
      tombol: 'Keluarkan', bahaya: true,
    })
    if (!ya) return
    try {
      // Hapus baris pendaftaran; cascade akan membersihkan progres di kelas ini.
      const { error } = await sb.from('pendaftaran').delete().eq('id', m.id)
      if (error) throw error
      roti(`${m.profil.nama} dikeluarkan`); detilKelas(wadah, kelasId)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  function dialogTambahMurid(kelasId, namaKelas) {
    // Menambah murid yang SUDAH punya akun, lewat email. Murid tanpa akun
    // tetap perlu mendaftar dulu (akun & kata sandi diurus Supabase Auth).
    const fEmail = el('input', { type: 'email', placeholder: 'murid@sekolah.sch.id' })
    const fAbsen = el('input', { type: 'text', placeholder: '01' })
    const fTim = el('input', { type: 'text', placeholder: 'Mobile / Backend / QA' })
    const galat = el('div')
    let tutup
    const tambah = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Tambahkan')

    async function kirim() {
      const email = fEmail.value.trim().toLowerCase()
      if (!email) { fEmail.focus(); return }
      tambah.disabled = true; isi(galat)
      try {
        // Cari profil murid berdasarkan email.
        const { data: prof, error: e0 } = await sb.from('profil')
          .select('id, nama, peran').eq('email', email).maybeSingle()
        if (e0) throw e0
        if (!prof) {
          throw new Error('Belum ada akun dengan email itu. Minta murid mendaftar dulu lewat halaman masuk, baru ditambahkan ke kelas.')
        }
        if (prof.peran !== 'murid') {
          throw new Error('Email itu milik guru/admin, bukan murid.')
        }
        // Perbarui absen bila diisi.
        if (fAbsen.value.trim()) {
          await sb.from('profil').update({ no_absen: fAbsen.value.trim() }).eq('id', prof.id)
        }
        // Daftarkan ke kelas.
        const { error: e1 } = await sb.from('pendaftaran')
          .insert({ kelas_id: kelasId, murid_id: prof.id, tim: fTim.value.trim() || null })
        if (e1) {
          if (e1.code === '23505') throw new Error(`${prof.nama} sudah terdaftar di kelas ini.`)
          throw e1
        }
        tutup(); roti(`${prof.nama} ditambahkan`); detilKelas(wadah, kelasId)
      } catch (err) {
        isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
        tambah.disabled = false
      }
    }

    tutup = dialog({
      judul: `Tambah murid ke ${namaKelas}`,
      badan: el('div', {}, galat,
        el('p', { gaya: { margin: '0 0 12px', fontSize: '13px', color: 'var(--tinta-lembut)', lineHeight: '1.55' } },
          'Masukkan email murid yang sudah punya akun. Kalau belum punya, minta ia mendaftar dulu ' +
          'lewat halaman masuk (akun & kata sandi diurus sistem login demi keamanan).'),
        el('div', { class: 'ruas' }, el('label', {}, 'Email murid'), fEmail),
        el('div', { class: 'kisi-2' },
          el('div', { class: 'ruas' }, el('label', {}, 'No. absen'), fAbsen),
          el('div', { class: 'ruas' }, el('label', {}, 'Tim'), fTim)),
      ),
      kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
        el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), tambah)],
      lebar: '480px',
    })
  }

  // ---- Lihat & buka kunci tugas seorang murid ----
  function dialogTugasMurid(kelasId, m) {
    const isi_ = el('div', {}, el('div', { class: 'muat-kecil' }, 'Memuat tugas…'))
    let tutup
    tutup = dialog({
      judul: `Tugas — ${m.profil?.nama ?? ''}`,
      badan: isi_,
      kaki: [el('button', { class: 'tbl', gaya: { marginLeft: 'auto' }, onClick: () => tutup() }, 'Tutup')],
      lebar: '620px',
    })
    muatTugasMurid()

    async function muatTugasMurid() {
      try {
        const penIds = (penugasan ?? []).map(p => p.id)
        if (!penIds.length) {
          isi(isi_, el('div', { class: 'kosong' }, el('p', {}, 'Belum ada penugasan di kelas ini.')))
          return
        }
        const { data, error } = await sb.from('progres_tugas')
          .select('id, status, terkunci, nilai_huruf, tugas:tugas_id(kode, judul, jenis)')
          .eq('murid_id', m.profil.id).in('penugasan_id', penIds)
          .order('id')
        if (error) throw error
        gambarTugas(data ?? [])
      } catch (err) {
        isi(isi_, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
      }
    }

    function gambarTugas(daftar) {
      const terkunci = daftar.filter(p => p.terkunci)
      const takKunci = daftar.filter(p => !p.terkunci)

      if (!daftar.length) {
        isi(isi_, el('div', { class: 'kosong' }, el('p', {}, 'Murid ini belum mengerjakan tugas apa pun.')))
        return
      }

      const barisTugas = (p) => el('div', { class: 'baris-tugas-murid' },
        el('div', { gaya: { flex: '1', minWidth: '0' } },
          el('span', { class: 'mono', gaya: { fontSize: '11px', color: 'var(--tinta-lembut)' } },
            p.tugas?.kode ?? ''),
          el('div', { gaya: { fontSize: '13px', fontWeight: '600' } }, p.tugas?.judul ?? '—')),
        el('span', { class: 'lencana lencana-' + p.status }, LABEL_STATUS[p.status] ?? p.status),
        p.nilai_huruf && el('span', { class: 'lencana-nilai', gaya: { background: 'var(--kertas)' } }, p.nilai_huruf),
        p.terkunci
          ? el('button', { class: 'tbl tbl-kecil tbl-utama', onClick: () => bukaKunci(p) }, '🔓 Buka kunci')
          : el('span', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } }, 'terbuka'),
      )

      isi(isi_,
        terkunci.length
          ? el('div', {},
              el('div', { class: 'bagian-judul' }, `Terkunci (${terkunci.length})`),
              ...terkunci.map(barisTugas))
          : el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '8px' } },
              'Tidak ada tugas yang sedang terkunci untuk murid ini.'),
        takKunci.length
          ? el('div', { gaya: { marginTop: '12px' } },
              el('div', { class: 'bagian-judul' }, `Belum terkunci (${takKunci.length})`),
              ...takKunci.map(barisTugas))
          : null,
      )
    }

    async function bukaKunci(p) {
      try {
        const { error } = await sb.rpc('buka_kunci_tugas', { p_progres: p.id })
        if (error) throw error
        roti(`${p.tugas?.kode ?? 'Tugas'} dibuka — murid bisa mengubah lagi`)
        muatTugasMurid()
      } catch (err) { roti(pesanGalat(err), '⚠') }
    }
  }
}

const LABEL_STATUS = {
  backlog: 'Backlog', dikerjakan: 'Dikerjakan', review: 'Review', selesai: 'Selesai',
}

async function dialogTugaskan(kelasId) {
  const { data: tp } = await sb.from('tujuan_pembelajaran')
    .select('id, kode, judul, terbit').eq('terbit', true).order('urutan')

  if (!tp?.length) {
    let tutup
    tutup = dialog({
      judul: 'Belum ada LKPD siap',
      badan: el('p', { gaya: { margin: 0, fontSize: '14px', lineHeight: '1.6' } },
        'Belum ada Tujuan Pembelajaran yang diterbitkan. Buka Bank LKPD untuk menyusun ' +
        'atau menerbitkan sebuah TP, lalu tugaskan ke kelas ini.'),
      kaki: [el('button', { class: 'tbl tbl-utama', gaya: { marginLeft: 'auto' },
        onClick: () => { tutup(); pergiKe('lkpd') } }, 'Ke Bank LKPD')],
      lebar: '460px',
    })
    return
  }

  const fTp = el('select', {}, ...tp.map(t => el('option', { value: t.id }, `${t.kode} — ${t.judul}`)))
  const fMulai = el('input', { type: 'date' })
  const fTenggat = el('input', { type: 'date' })
  const galat = el('div')

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Tugaskan')

  async function kirim() {
    simpan.disabled = true; simpan.textContent = 'Menyimpan…'
    isi(galat)
    try {
      const { error } = await sb.from('penugasan').insert({
        kelas_id: kelasId,
        tujuan_pembelajaran_id: Number(fTp.value),
        mulai: fMulai.value || null,
        tenggat: fTenggat.value || null,
        dibuka: true,
      })
      if (error) {
        if (error.code === '23505') throw new Error('TP ini sudah ditugaskan ke kelas tersebut.')
        throw error
      }
      tutup()
      roti('TP ditugaskan')
      pergiKe(`kelas/${kelasId}`)
      location.reload()
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
      simpan.disabled = false; simpan.textContent = 'Tugaskan'
    }
  }

  tutup = dialog({
    judul: 'Tugaskan Tujuan Pembelajaran',
    badan: el('div', {},
      galat,
      el('div', { class: 'ruas' }, el('label', {}, 'Tujuan Pembelajaran'), fTp),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Mulai'), fMulai),
        el('div', { class: 'ruas' }, el('label', {}, 'Tenggat'), fTenggat),
      ),
      el('p', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)', margin: 0 } },
        'Tanggal boleh dikosongkan. Setelah ditugaskan, murid langsung bisa mulai bekerja.'),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '520px',
  })
}

/* ==========================================================
   Antrean review
   ========================================================== */
async function antreanReview(wadah, penugasanId) {
  const { data: pen } = await sb.from('penugasan')
    .select('id, kelas_id, kelas(nama), tujuan_pembelajaran(id, kode, judul)')
    .eq('id', penugasanId).single()

  const { data, error } = await sb
    .from('progres_tugas')
    .select('id, status, detik_terpakai, catatan, diserahkan_pada, murid_id, tugas_id, nilai_huruf, umpan_balik, profil:murid_id(nama, no_absen), tugas(kode, judul, xp, estimasi_menit, bukti_diminta, lembar_kode)')
    .eq('penugasan_id', penugasanId)
    .eq('status', 'review')
    .order('diserahkan_pada')
  if (error) throw error

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
                       onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
        el('h1', {}, 'Menunggu review'),
        el('p', {}, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode}`),
      ),
    ),

    data.length
      ? el('div', { class: 'tumpuk' }, ...data.map(p => kartuReview(p, penugasanId, wadah)))
      : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Tidak ada yang menunggu'),
          el('p', {}, 'Semua pekerjaan murid sudah diperiksa.'))),
  )

  // Muat hasil pekerjaan murid (unggahan + isian tabel) ke tiap kartu.
  for (const p of data) {
    muatKoreksi(p, pen?.tujuan_pembelajaran?.id, penugasanId)
  }
}

async function muatKoreksi(p, tpId, penugasanId) {
  const wadah = document.querySelector(`.wadah-koreksi[data-pid="${p.id}"]`)
  if (!wadah) return
  try {
    // 1. Unggahan bukti.
    const { data: lampiran } = await sb.from('lampiran')
      .select('id, nama_asli, path, mime, ukuran')
      .eq('progres_tugas_id', p.id)

    // 2. Isian tabel (bila tugas terkait sebuah lembar).
    let isian = null, lembar = null
    if (p.tugas?.lembar_kode && tpId) {
      const { data: lk } = await sb.from('lembar_kerja')
        .select('id, kode, judul, tipe, struktur')
        .eq('tujuan_pembelajaran_id', tpId).eq('kode', p.tugas.lembar_kode).maybeSingle()
      if (lk) {
        lembar = lk
        const { data: is } = await sb.from('isian_lembar')
          .select('data').eq('penugasan_id', penugasanId)
          .eq('murid_id', p.murid_id).eq('lembar_kerja_id', lk.id).maybeSingle()
        isian = is?.data ?? null
      }
    }

    if (!lampiran?.length && !lembar) {
      isi(wadah, el('div', { class: 'koreksi-kosong' },
        'Belum ada hasil pekerjaan yang bisa dikoreksi (tidak ada unggahan maupun tabel).'))
      return
    }

    const anak = [el('div', { class: 'bagian-judul', gaya: { marginTop: '4px' } }, 'Hasil pekerjaan murid')]

    // Tampilkan isian tabel (baca saja).
    if (lembar) {
      anak.push(el('div', { gaya: { fontSize: '12.5px', fontWeight: '600', margin: '6px 0 4px' } },
        `Tabel ${lembar.kode} — ${lembar.judul}`))
      anak.push(tabelKoreksi(lembar, isian))
    }

    // Tampilkan unggahan.
    if (lampiran?.length) {
      anak.push(el('div', { gaya: { fontSize: '12.5px', fontWeight: '600', margin: '10px 0 4px' } }, 'Bukti diunggah'))
      for (const f of lampiran) {
        const { data: url } = await sb.storage.from('bukti').createSignedUrl(f.path, 3600)
        const tautan = url?.signedUrl ?? '#'
        const isImg = (f.mime ?? '').startsWith('image/')
        anak.push(el('div', { class: 'koreksi-berkas' },
          isImg
            ? el('a', { href: tautan, target: '_blank' },
                el('img', { src: tautan, alt: f.nama_asli, class: 'koreksi-gambar' }))
            : el('a', { href: tautan, target: '_blank', class: 'tbl tbl-kecil' },
                `📎 ${f.nama_asli}`)))
      }
    }

    isi(wadah, ...anak)
  } catch (err) {
    isi(wadah, el('div', { class: 'koreksi-kosong' }, 'Gagal memuat hasil pekerjaan.'))
  }
}

// Render tabel isian murid dalam mode baca-saja untuk dikoreksi guru.
function tabelKoreksi(lembar, data) {
  const d = data ?? {}
  let struktur = lembar.struktur
  if (typeof struktur === 'string') { try { struktur = JSON.parse(struktur) } catch { struktur = {} } }
  const kolom = struktur?.kolom ?? []
  const baris = struktur?.baris ?? []
  const nBaris = baris.length || Number(struktur?.jumlah_baris ?? 0)

  if (!kolom.length) return el('div', { class: 'koreksi-kosong' }, 'Struktur tabel kosong.')

  const baris2 = []
  const jml = lembar.tipe === 'matriks' || lembar.tipe === 'formulir' ? baris.length : nBaris
  for (let i = 0; i < jml; i++) {
    const label = (lembar.tipe === 'matriks' || lembar.tipe === 'formulir') ? baris[i] : String(i + 1)
    baris2.push(el('tr', {},
      el('td', { class: 'label' }, label),
      ...kolom.map(k => el('td', {},
        el('div', { class: 'baca-saja' }, d[String(i)]?.[k.key] ?? '—')))))
  }

  return el('div', { class: 'tabel-bungkus' },
    el('table', { class: 'lk' },
      kolom.length > 1 && el('thead', {}, el('tr', {}, el('th', {}, ''), ...kolom.map(k => el('th', {}, k.label)))),
      el('tbody', {}, ...baris2)))
}

function kartuReview(p, penugasanId, wadah) {
  const umpan = el('textarea', { rows: '2', 'aria-label': 'Umpan balik',
    placeholder: 'Umpan balik untuk murid (opsional saat menilai, wajib bila dikembalikan)' })

  async function beriNilai(huruf) {
    try {
      const { error } = await sb.rpc('nilai_tugas', {
        p_progres: p.id, p_huruf: huruf, p_umpan: umpan.value.trim() || null,
      })
      if (error) throw error
      roti(`${p.tugas.kode} dinilai ${huruf} — dikunci`)
      antreanReview(wadah, penugasanId)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  async function kembalikan() {
    if (!umpan.value.trim()) {
      roti('Tulis dulu umpan baliknya supaya murid tahu apa yang perlu diperbaiki', '⚠')
      umpan.focus(); return
    }
    try {
      const { error } = await sb.from('progres_tugas').update({
        status: 'dikerjakan', disetujui_pada: null, disetujui_oleh: null,
        umpan_balik: umpan.value.trim(),
      }).eq('id', p.id)
      if (error) throw error
      roti(`${p.tugas.kode} dikembalikan untuk diperbaiki`)
      antreanReview(wadah, penugasanId)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  const lewat = p.tugas.estimasi_menit > 0 && p.detik_terpakai > p.tugas.estimasi_menit * 60

  return el('div', { class: 'panel' },
    el('div', { class: 'panel-isi' },
      el('div', { gaya: { display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' } },
        el('div', { class: 'avatar' }, inisial(p.profil?.nama)),
        el('div', { gaya: { flex: '1', minWidth: '180px' } },
          el('div', { gaya: { fontWeight: '600' } },
            p.profil?.nama, p.profil?.no_absen ? ` · absen ${p.profil.no_absen}` : ''),
          el('div', { class: 'mono', gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } },
            `${p.tugas.kode} — ${p.tugas.judul}`),
        ),
        el('div', { gaya: { textAlign: 'right', fontSize: '12.5px' } },
          el('div', { class: 'mono', gaya: { fontWeight: '600', color: lewat ? 'var(--kuning)' : 'inherit' } },
            formatWaktu(p.detik_terpakai)),
          el('div', { gaya: { color: 'var(--tinta-lembut)' } },
            p.tugas.estimasi_menit ? `estimasi ${p.tugas.estimasi_menit}′` : ''),
        ),
      ),

      p.catatan && el('div', { gaya: { marginTop: '11px', padding: '10px 12px',
                                        background: 'var(--kertas)', borderRadius: '7px',
                                        fontSize: '13.5px', lineHeight: '1.55' } },
        el('div', { gaya: { fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.06em',
                             color: 'var(--tinta-lembut)', marginBottom: '3px' } }, 'Catatan murid'),
        p.catatan),

      // Hasil pekerjaan murid (bukti unggah + isian tabel/form) untuk dikoreksi.
      el('div', { class: 'wadah-koreksi', data: { pid: String(p.id), tugas: String(p.tugas_id ?? p.tugas?.id ?? '') } }),

      el('div', { gaya: { marginTop: '11px' } }, umpan),

      el('div', { gaya: { marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
        el('span', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } }, 'Beri nilai:'),
        el('div', { class: 'nilai-pilih' },
          ...['A','B','C','D','E'].map(h =>
            el('button', { class: 'tbl tbl-kecil nilai-tbl nilai-' + h,
              title: { A:'Sempurna', B:'Bagus', C:'Cukup', D:'Kurang', E:'Tidak lulus' }[h],
              onClick: () => beriNilai(h) }, h))),
        el('button', { class: 'tbl tbl-kecil tbl-bahaya', gaya: { marginLeft: 'auto' },
          onClick: kembalikan }, 'Kembalikan'),
      ),
    ),
  )
}
