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
import { jarakSidik } from './tiket.js'
import { urlBukti } from '../lib/bukti.js'

export async function halamanGuru(wadah, r) {
  const tampilan = r.nama || 'kelas'

  isi(wadah, bilah(tampilan), el('div', { class: 'isi', id: 'isi-guru' },
    el('div', { class: 'tumpuk' }, rangkaMuat('120px'), rangkaMuat('200px'))))

  const utama = $('#isi-guru')

  try {
    if (tampilan === 'kelas' && r.bagian[0]) await detilKelas(utama, Number(r.bagian[0]))
    else if (tampilan === 'nilai' && r.bagian[0]) await antreanReview(utama, Number(r.bagian[0]))
    else if (tampilan === 'arsip' && r.bagian[0]) await arsipDinilai(utama, Number(r.bagian[0]))
    else if (tampilan === 'mirip' && r.bagian[0]) await halamanKemiripan(utama, Number(r.bagian[0]))
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
    el('button', { class: 'bilah-merek bilah-merek-klik', title: 'Kembali ke beranda',
      onClick: () => pergiKe('') },
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
                'Tenggat ' + tanggalId(p.tenggat, true)),
            ),
            el('span', { class: 'lencana ' + (p.dibuka ? 'lencana-selesai' : 'lencana-backlog') },
              p.dibuka ? 'Dibuka' : 'Ditutup'),
            el('div', { gaya: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => bukaTutup(p) }, p.dibuka ? 'Tutup' : 'Buka'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => dialogUbahTenggat(p, kelasId) }, 'Ubah tenggat'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => dialogSusulan(p, kelasId) }, 'Susulan'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => pergiKe(`nilai/${p.id}`) }, 'Review'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => pergiKe(`arsip/${p.id}`) }, 'Sudah Dinilai'),
              el('button', { class: 'tbl tbl-kecil',
                             onClick: () => pergiKe(`mirip/${p.id}`) }, '🔍 Kemiripan'),
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

  // Ubah tanggal mulai & tenggat (tanggal+jam) penugasan yang sudah dibuat.
  async function dialogUbahTenggat(p, kelasId) {
    // Ubah ISO → nilai datetime-local (YYYY-MM-DDTHH:mm) di zona waktu lokal.
    const keLokal = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      const p2 = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
    }
    // Muat daftar sprint TP ini + tenggat sprint yang sudah tersimpan.
    let sprints = [], tenggatSprint = {}
    try {
      const [{ data: s }, { data: pen }] = await Promise.all([
        sb.from('sprint').select('id, nomor, nama')
          .eq('tujuan_pembelajaran_id', p.tujuan_pembelajaran?.id).order('nomor'),
        sb.from('penugasan').select('tenggat_sprint').eq('id', p.id).single(),
      ])
      sprints = s ?? []
      tenggatSprint = pen?.tenggat_sprint ?? {}
    } catch (_) {}

    const fMulai = el('input', { type: 'date', value: p.mulai ? String(p.mulai).slice(0, 10) : '' })
    const fTenggat = el('input', { type: 'datetime-local', value: keLokal(p.tenggat) })
    // Satu input tenggat per sprint.
    const fSprint = {}
    const barisSprint = sprints.map(s => {
      const inp = el('input', { type: 'datetime-local', value: keLokal(tenggatSprint[s.id]) })
      fSprint[s.id] = inp
      return el('div', { class: 'ruas' },
        el('label', {}, `Sprint ${s.nomor}${s.nama ? ' — ' + s.nama : ''}`), inp)
    })
    const galat = el('div')
    let tutup

    async function simpan() {
      try {
        // Rakit tenggat_sprint hanya untuk sprint yang diisi.
        const ts = {}
        for (const s of sprints) {
          const v = fSprint[s.id]?.value
          if (v) ts[s.id] = new Date(v).toISOString()
        }
        const { error } = await sb.from('penugasan').update({
          mulai: fMulai.value || null,
          tenggat: fTenggat.value ? new Date(fTenggat.value).toISOString() : null,
          tenggat_sprint: ts,
        }).eq('id', p.id)
        if (error) throw error
        tutup(); roti('Tenggat diperbarui'); detilKelas(wadah, kelasId)
      } catch (err) { isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))) }
    }

    tutup = dialog({
      judul: `Ubah tenggat — ${p.tujuan_pembelajaran?.kode ?? ''}`,
      badan: el('div', {}, galat,
        el('div', { class: 'kisi-2' },
          el('div', { class: 'ruas' }, el('label', {}, 'Mulai'), fMulai),
          el('div', { class: 'ruas' }, el('label', {}, 'Tenggat keseluruhan'), fTenggat)),
        el('p', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)', margin: '8px 0' } },
          'Tenggat keseluruhan dipakai untuk skor ketepatan waktu. Kosongkan bila tanpa batas.'),
        sprints.length ? el('div', {},
          el('div', { class: 'bagian-judul', gaya: { marginTop: '10px' } }, 'Tenggat per sprint (kunci otomatis)'),
          el('p', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)', margin: '0 0 8px' } },
            'Setelah tenggat sprint lewat, tugas sprint itu TERKUNCI — murid tak bisa mengisi lagi. ' +
            'Kosongkan bila sprint tanpa batas. Untuk murid susulan, gunakan tombol “Susulan”.'),
          ...barisSprint) : null),
      kaki: [
        el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'),
        el('button', { class: 'tbl tbl-utama', gaya: { marginLeft: 'auto' }, onClick: simpan }, 'Simpan'),
      ],
      lebar: '480px',
    })
  }

  // Buka kunci susulan: beri kelonggaran sprint untuk murid tertentu (atau
  // perpanjang untuk semua). Murid dengan kelonggaran ditandai "susulan".
  async function dialogSusulan(p, kelasId) {
    let sprints = [], murid = [], adaKel = []
    try {
      const [{ data: s }, { data: pend }, { data: kel }] = await Promise.all([
        sb.from('sprint').select('id, nomor, nama')
          .eq('tujuan_pembelajaran_id', p.tujuan_pembelajaran?.id).order('nomor'),
        sb.from('pendaftaran').select('murid_id, profil:murid_id(nama, no_absen)')
          .eq('kelas_id', kelasId).eq('aktif', true),
        sb.from('kelonggaran_sprint').select('sprint_id, murid_id, tenggat_khusus')
          .eq('penugasan_id', p.id),
      ])
      sprints = s ?? []
      murid = (pend ?? []).sort((a, b) =>
        (a.profil?.no_absen ?? '').localeCompare(b.profil?.no_absen ?? '', undefined, { numeric: true }))
      adaKel = kel ?? []
    } catch (_) {}

    if (!sprints.length) { roti('TP ini belum punya sprint', '⚠'); return }

    const fSprint = el('select', {}, ...sprints.map(s =>
      el('option', { value: s.id }, `Sprint ${s.nomor}${s.nama ? ' — ' + s.nama : ''}`)))
    const fMurid = el('select', {},
      el('option', { value: '__semua__' }, '— Semua murid (perpanjang tenggat) —'),
      ...murid.map(m => el('option', { value: m.murid_id },
        `${m.profil?.no_absen ? m.profil.no_absen + '. ' : ''}${m.profil?.nama ?? '—'}`)))
    const fTenggat = el('input', { type: 'datetime-local' })
    const galat = el('div')
    let tutup

    const daftarKel = el('div', { gaya: { marginTop: '10px' } })
    function gambarKel() {
      const namaMurid = Object.fromEntries(murid.map(m => [m.murid_id, m.profil?.nama ?? '—']))
      const namaSprint = Object.fromEntries(sprints.map(s => [s.id, `Sprint ${s.nomor}`]))
      isi(daftarKel, adaKel.length
        ? el('div', {},
            el('div', { class: 'bagian-judul' }, 'Kelonggaran aktif'),
            ...adaKel.map(k => el('div', { class: 'mirip-baris' },
              el('span', { class: 'mirip-nama' }, namaMurid[k.murid_id] ?? '—'),
              el('span', {}, namaSprint[k.sprint_id] ?? ''),
              el('span', { class: 'mirip-ket' }, k.tenggat_khusus
                ? 'sampai ' + tanggalId(k.tenggat_khusus, true) : 'dibuka penuh'),
              el('button', { class: 'tbl tbl-kecil tbl-bahaya', gaya: { marginLeft: 'auto' },
                onClick: () => cabut(k) }, 'Cabut'))))
        : null)
    }

    async function cabut(k) {
      try {
        const { error } = await sb.from('kelonggaran_sprint').delete()
          .eq('penugasan_id', p.id).eq('sprint_id', k.sprint_id).eq('murid_id', k.murid_id)
        if (error) throw error
        adaKel = adaKel.filter(x => !(x.sprint_id === k.sprint_id && x.murid_id === k.murid_id))
        gambarKel(); roti('Kelonggaran dicabut')
      } catch (err) { roti(pesanGalat(err), '⚠') }
    }

    async function beri() {
      isi(galat)
      const sprintId = Number(fSprint.value)
      const tenggatKhusus = fTenggat.value ? new Date(fTenggat.value).toISOString() : null
      try {
        if (fMurid.value === '__semua__') {
          if (!tenggatKhusus) { isi(galat, el('div', { class: 'pesan pesan-galat' },
            'Untuk semua murid, isi dulu tenggat barunya.')); return }
          const { data: pen } = await sb.from('penugasan').select('tenggat_sprint').eq('id', p.id).single()
          const ts = { ...(pen?.tenggat_sprint ?? {}), [sprintId]: tenggatKhusus }
          const { error } = await sb.from('penugasan').update({ tenggat_sprint: ts }).eq('id', p.id)
          if (error) throw error
          tutup(); roti('Tenggat sprint diperpanjang untuk semua'); detilKelas(wadah, kelasId)
        } else {
          const { error } = await sb.from('kelonggaran_sprint').upsert({
            penugasan_id: p.id, sprint_id: sprintId, murid_id: fMurid.value,
            tenggat_khusus: tenggatKhusus, susulan: true,
          }, { onConflict: 'penugasan_id,sprint_id,murid_id' })
          if (error) throw error
          adaKel = adaKel.filter(x => !(x.sprint_id === sprintId && x.murid_id === fMurid.value))
          adaKel.push({ sprint_id: sprintId, murid_id: fMurid.value, tenggat_khusus: tenggatKhusus })
          gambarKel()
          roti('Kelonggaran diberikan')
        }
      } catch (err) { isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))) }
    }

    gambarKel()
    tutup = dialog({
      judul: `Susulan — ${p.tujuan_pembelajaran?.kode ?? ''}`,
      badan: el('div', {}, galat,
        el('div', { class: 'ruas' }, el('label', {}, 'Sprint'), fSprint),
        el('div', { class: 'ruas' }, el('label', {}, 'Murid'), fMurid),
        el('div', { class: 'ruas' }, el('label', {}, 'Batas susulan (kosongkan = buka penuh)'), fTenggat),
        el('p', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)', margin: '6px 0' } },
          'Satu murid: kosongkan batas untuk membuka penuh, atau isi batas susulan. ' +
          '“Semua murid”: isi batas untuk memperpanjang tenggat sprint bagi seluruh kelas. ' +
          'Murid susulan nantinya dapat pengurangan poin (diatur di Pengaturan).'),
        el('div', { gaya: { marginTop: '4px', textAlign: 'right' } },
          el('button', { class: 'tbl tbl-utama', onClick: beri }, 'Beri kelonggaran')),
        daftarKel),
      kaki: [el('button', { class: 'tbl', gaya: { marginLeft: 'auto' }, onClick: () => tutup() }, 'Tutup')],
      lebar: '500px',
    })
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
  const fTenggat = el('input', { type: 'datetime-local' })
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
        tenggat: fTenggat.value ? new Date(fTenggat.value).toISOString() : null,
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
    .select('id, status, detik_terpakai, catatan, diserahkan_pada, murid_id, tugas_id, nilai_huruf, umpan_balik, profil:murid_id(nama, no_absen), tugas(kode, judul, xp, estimasi_menit, bukti_diminta, lembar_kode, urutan, sprint(nomor, nama))')
    .eq('penugasan_id', penugasanId)
    .eq('status', 'review')
    .order('diserahkan_pada')
  if (error) throw error

  // Kelompokkan per murid. Di dalam tiap murid, urut tugas dari sprint
  // terkecil → terbesar (lalu urutan tugas). Antar murid: yang paling lama
  // menunggu (tugas tertua) di paling atas.
  const petaMurid = new Map()
  for (const p of data) {
    if (!petaMurid.has(p.murid_id)) {
      petaMurid.set(p.murid_id, { murid_id: p.murid_id, profil: p.profil, tugas: [] })
    }
    petaMurid.get(p.murid_id).tugas.push(p)
  }
  const kelompok = [...petaMurid.values()]
  for (const k of kelompok) {
    k.tugas.sort((a, b) =>
      (a.tugas?.sprint?.nomor ?? 0) - (b.tugas?.sprint?.nomor ?? 0)
      || (a.tugas?.urutan ?? 0) - (b.tugas?.urutan ?? 0)
      || (a.tugas?.kode ?? '').localeCompare(b.tugas?.kode ?? ''))
  }
  // Antar murid: urut berdasarkan NOMOR ABSEN agar urutannya tetap
  // (tidak berubah-ubah setelah tugas dinilai). Absen numerik diurut
  // sebagai angka; bila kosong, ditaruh di bawah.
  const nomorAbsen = (k) => {
    const a = k.profil?.no_absen
    if (a == null || a === '') return Infinity
    const n = parseInt(a, 10)
    return Number.isNaN(n) ? Infinity : n
  }
  kelompok.sort((a, b) =>
    nomorAbsen(a) - nomorAbsen(b)
    || (a.profil?.no_absen ?? '').localeCompare(b.profil?.no_absen ?? '')
    || (a.profil?.nama ?? '').localeCompare(b.profil?.nama ?? ''))

  // Penanda kemiripan: himpunan id murid dengan bukti/isian sangat mirip.
  const miripSet = await muridMirip(penugasanId, pen?.kelas_id)

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
                       onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
        el('h1', {}, 'Menunggu review'),
        el('p', { id: 'review-hitung' }, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode}` +
                    (data.length ? ` — ${data.length} tugas dari ${kelompok.length} murid` : '')),
      ),
    ),

    data.length
      ? el('div', { class: 'tumpuk-murid' }, ...kelompok.map(k =>
          el('div', { class: 'grup-murid' },
            el('div', { class: 'grup-murid-kepala' },
              el('span', { class: 'avatar', gaya: { width: '30px', height: '30px', fontSize: '11px' } },
                inisial(k.profil?.nama)),
              el('div', {},
                el('div', { gaya: { fontWeight: '600', fontSize: '14px' } }, k.profil?.nama ?? '—'),
                el('div', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } },
                  (k.profil?.no_absen ? `Absen ${k.profil.no_absen} · ` : '') +
                  `${k.tugas.length} tugas menunggu`)),
            ),
            el('div', { class: 'tumpuk' }, ...k.tugas.map(p => kartuReview(p, penugasanId, wadah, miripSet.get(p.id)))),
          )))
      : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Tidak ada yang menunggu'),
          el('p', {}, 'Semua pekerjaan murid sudah diperiksa.'))),
  )

  // Muat hasil pekerjaan murid (unggahan + isian tabel) ke tiap kartu.
  for (const p of data) {
    muatKoreksi(p, pen?.tujuan_pembelajaran?.id, penugasanId)
  }
}

// Poin 6: arsip pekerjaan murid yang SUDAH dinilai. Guru tetap bisa melihat
// hasil kerja (tabel + bukti), mengubah nilai, dan membuka kunci dari sini.
async function arsipDinilai(wadah, penugasanId) {
  const { data: pen } = await sb.from('penugasan')
    .select('id, kelas_id, kelas(nama), tujuan_pembelajaran(id, kode, judul)')
    .eq('id', penugasanId).single()

  const { data, error } = await sb
    .from('progres_tugas')
    .select('id, status, detik_terpakai, catatan, diserahkan_pada, disetujui_pada, murid_id, tugas_id, nilai_huruf, umpan_balik, terkunci, profil:murid_id(nama, no_absen), tugas(kode, judul, xp, estimasi_menit, bukti_diminta, lembar_kode, urutan, sprint(nomor, nama))')
    .eq('penugasan_id', penugasanId)
    .not('nilai_huruf', 'is', null)
    .order('disetujui_pada', { ascending: false })
  if (error) throw error

  // Kelompokkan per murid (antar murid diurut nomor absen agar tetap).
  const petaMurid = new Map()
  for (const p of data) {
    if (!petaMurid.has(p.murid_id)) {
      petaMurid.set(p.murid_id, { murid_id: p.murid_id, profil: p.profil, tugas: [] })
    }
    petaMurid.get(p.murid_id).tugas.push(p)
  }
  const nomorAbsen = (k) => {
    const a = k.profil?.no_absen
    if (a == null || a === '') return Infinity
    const n = parseInt(a, 10)
    return Number.isNaN(n) ? Infinity : n
  }
  const kelompok = [...petaMurid.values()].sort((a, b) =>
    nomorAbsen(a) - nomorAbsen(b)
    || (a.profil?.no_absen ?? '').localeCompare(b.profil?.no_absen ?? '')
    || (a.profil?.nama ?? '').localeCompare(b.profil?.nama ?? ''))

  // Penanda kemiripan: himpunan id murid dengan bukti/isian sangat mirip.
  const miripSet = await muridMirip(penugasanId, pen?.kelas_id)

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
                       onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
        el('h1', {}, 'Sudah Dinilai'),
        el('p', {}, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode}` +
                    (data.length ? ` — ${data.length} tugas dinilai dari ${kelompok.length} murid` : '')),
      ),
    ),

    data.length
      ? el('div', { class: 'tumpuk-murid' }, ...kelompok.map(k =>
          kartuMuridArsip(k, penugasanId, pen?.tujuan_pembelajaran?.id, wadah, miripSet)))
      : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Belum ada yang dinilai'),
          el('p', {}, 'Tugas yang sudah kamu beri nilai A–E akan muncul di sini, ' +
                      'lengkap dengan hasil pekerjaan murid.'))),
  )
}

// Satu murid pada halaman "Sudah Dinilai": nama bisa diklik untuk membuka/menutup
// daftar tugasnya (default tertutup agar ringkas). Di dalamnya, tugas
// dikelompokkan per sprint (1 → terbesar), tiap sprint diurut id terkecil→terbesar.
function kartuMuridArsip(k, penugasanId, tpId, wadah, miripMap = null) {
  // Kumpulkan nama lawan mirip dari SEMUA pekerjaan murid ini (untuk ringkasan
  // di kepala), sekaligus tahu tugas mana yang mirip (untuk penanda per-kartu).
  const namaLawan = new Set()
  let adaMirip = false
  for (const p of k.tugas) {
    const s = miripMap?.get?.(p.id)
    if (s && s.size) { adaMirip = true; for (const n of s) namaLawan.add(n) }
  }
  const mirip = adaMirip
  const miripNama = namaLawan
  let terbuka = false
  const isiTugas = el('div', { class: 'grup-murid-isi', gaya: { display: 'none' } })
  let sudahMuat = false

  // Kelompokkan tugas murid ini per sprint.
  const petaSprint = new Map()
  for (const p of k.tugas) {
    const no = p.tugas?.sprint?.nomor ?? 0
    if (!petaSprint.has(no)) {
      petaSprint.set(no, { nomor: no, nama: p.tugas?.sprint?.nama ?? `Sprint ${no}`, tugas: [] })
    }
    petaSprint.get(no).tugas.push(p)
  }
  const sprints = [...petaSprint.values()].sort((a, b) => a.nomor - b.nomor)
  for (const s of sprints) {
    // Di tiap sprint, urut tugas dari id terkecil ke terbesar.
    s.tugas.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  }

  function bangunIsi() {
    isi(isiTugas, ...sprints.map(s =>
      el('div', { class: 'arsip-sprint' },
        el('div', { class: 'arsip-sprint-judul' }, `Sprint ${s.nomor}${s.nama ? ' — ' + s.nama : ''}`),
        el('div', { class: 'tumpuk' }, ...s.tugas.map(p => kartuArsip(p, penugasanId, wadah, miripMap?.get?.(p.id)))),
      )))
    // Muat hasil pekerjaan (tabel + bukti) hanya saat dibuka → ringkas & cepat.
    for (const p of k.tugas) muatKoreksi(p, tpId, penugasanId)
    sudahMuat = true
  }

  const panah = el('span', { class: 'arsip-panah' }, '▸')
  const kepala = el('button', { class: 'grup-murid-kepala grup-murid-tbl',
    'aria-expanded': 'false',
    onClick: () => {
      terbuka = !terbuka
      panah.textContent = terbuka ? '▾' : '▸'
      kepala.setAttribute('aria-expanded', String(terbuka))
      isiTugas.style.display = terbuka ? '' : 'none'
      if (terbuka && !sudahMuat) bangunIsi()
    } },
    panah,
    el('span', { class: 'avatar', gaya: { width: '30px', height: '30px', fontSize: '11px' } },
      inisial(k.profil?.nama)),
    el('div', { gaya: { flex: '1', textAlign: 'left' } },
      el('div', { gaya: { fontWeight: '600', fontSize: '14px' } },
        (mirip ? '⚠ ' : '') + (k.profil?.nama ?? '—')),
      el('div', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } },
        (k.profil?.no_absen ? `Absen ${k.profil.no_absen} · ` : '') +
        `${k.tugas.length} tugas dinilai`),
      mirip && el('div', { class: 'mirip-dengan' },
        '🔍 Mirip dengan: ' + [...miripNama].join(', '))),
  )

  return el('div', { class: 'grup-murid' + (mirip ? ' grup-mirip' : '') }, kepala, isiTugas)
}

function kartuArsip(p, penugasanId, wadah, miripNama = null) {
  const mirip = miripNama && miripNama.size > 0
  const LABEL = { A: 'Sempurna', B: 'Bagus', C: 'Cukup', D: 'Kurang', E: 'Tidak lulus' }
  const umpan = el('textarea', { rows: '2', 'aria-label': 'Ubah umpan balik',
    placeholder: 'Ubah umpan balik (opsional)' }, p.umpan_balik ?? '')

  async function beriNilaiUlang(huruf) {
    try {
      const { error } = await sb.rpc('nilai_tugas', {
        p_progres: p.id, p_huruf: huruf, p_umpan: umpan.value.trim() || null,
      })
      if (error) throw error
      roti(`${p.tugas.kode} diperbarui menjadi ${huruf}`)
      arsipDinilai(wadah, penugasanId)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  async function bukaKunci() {
    try {
      const { error } = await sb.rpc('buka_kunci_tugas', { p_progres: p.id })
      if (error) throw error
      roti(`${p.tugas.kode} dibuka — murid bisa memperbaiki`)
      arsipDinilai(wadah, penugasanId)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  return el('div', { class: 'panel' + (mirip ? ' panel-mirip' : '') },
    el('div', { class: 'panel-isi' },
      el('div', { gaya: { display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' } },
        el('div', { class: 'avatar' }, inisial(p.profil?.nama)),
        el('div', { gaya: { flex: '1', minWidth: '180px' } },
          el('div', { gaya: { fontWeight: '600' } },
            p.profil?.nama, p.profil?.no_absen ? ` · absen ${p.profil.no_absen}` : ''),
          el('div', { class: 'mono', gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } },
            `${p.tugas.kode} — ${p.tugas.judul}`),
          mirip && el('div', { class: 'mirip-dengan' },
            '🔍 Mirip dengan: ' + [...miripNama].join(', '))),
        el('div', { gaya: { textAlign: 'right' } },
          el('span', { class: 'lencana-nilai nilai-' + p.nilai_huruf, gaya: { fontSize: '15px', padding: '4px 10px' } },
            `${p.nilai_huruf} · ${LABEL[p.nilai_huruf] ?? ''}`),
          el('div', { gaya: { fontSize: '11px', color: 'var(--tinta-lembut)', marginTop: '3px' } },
            p.terkunci ? '🔒 terkunci' : 'terbuka')),
      ),

      p.catatan && el('div', { gaya: { marginTop: '11px', padding: '10px 12px',
                                        background: 'var(--kertas)', borderRadius: '7px', fontSize: '13.5px' } },
        el('div', { gaya: { fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.06em',
                             color: 'var(--tinta-lembut)', marginBottom: '3px' } }, 'Catatan murid'),
        p.catatan),

      // Hasil pekerjaan murid (dimuat oleh muatKoreksi).
      el('div', { class: 'wadah-koreksi', data: { pid: String(p.id), tugas: String(p.tugas_id ?? '') } }),

      el('div', { gaya: { marginTop: '11px' } }, umpan),
      el('div', { gaya: { marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
        el('span', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } }, 'Ubah nilai:'),
        el('div', { class: 'nilai-pilih' },
          ...['A','B','C','D','E'].map(h =>
            el('button', { class: 'tbl tbl-kecil nilai-tbl nilai-' + h,
              title: LABEL[h], onClick: () => beriNilaiUlang(h) }, h))),
        p.terkunci && el('button', { class: 'tbl tbl-kecil', gaya: { marginLeft: 'auto' },
          onClick: bukaKunci }, '🔓 Buka kunci'),
      ),
    ),
  )
}

// Mengembalikan Set berisi id murid yang punya bukti/isian SANGAT MIRIP dengan
// murid lain pada penugasan ini (alat bantu; TIDAK memengaruhi nilai). Dipakai
// untuk menandai kartu review & arsip agar guru menilai dengan bijak.
// Mengembalikan Map: progres_tugas_id → Set nama murid lain yang bukti/isian
// pada TUGAS ITU sangat mirip (alat bantu; TIDAK memengaruhi nilai). Dengan
// begitu penanda merah hanya pada pekerjaan spesifik yang mirip, bukan seluruh
// tugas murid.
async function muridMirip(penugasanId, kelasId) {
  const peta = new Map()   // progres_tugas_id -> Set<nama lawan>
  try {
    const [{ data: lampiran }, { data: isian }, { data: pendaftaran }, { data: progres }] =
      await Promise.all([
        sb.from('lampiran')
          .select('murid_id, sidik, progres_tugas_id, progres_tugas:progres_tugas_id(penugasan_id)')
          .not('sidik', 'is', null),
        sb.from('isian_lembar')
          .select('murid_id, lembar_kerja_id, data, lembar:lembar_kerja_id(kode)')
          .eq('penugasan_id', penugasanId),
        sb.from('pendaftaran')
          .select('murid_id, profil:murid_id(nama)')
          .eq('kelas_id', kelasId).eq('aktif', true),
        sb.from('progres_tugas')
          .select('id, murid_id, tugas:tugas_id(lembar_kode)')
          .eq('penugasan_id', penugasanId),
      ])

    const nama = {}
    for (const d of (pendaftaran ?? [])) nama[d.murid_id] = d.profil?.nama ?? '—'

    // Catat dua progres (pekerjaan) sebagai saling mirip, simpan nama lawannya.
    const tandai = (pidA, muridA, pidB, muridB) => {
      if (!pidA || !pidB || muridA === muridB) return
      ;(peta.get(pidA) ?? peta.set(pidA, new Set()).get(pidA)).add(nama[muridB] ?? '—')
      ;(peta.get(pidB) ?? peta.set(pidB, new Set()).get(pidB)).add(nama[muridA] ?? '—')
    }

    // 1. Gambar: jarak Hamming <= 8. Tiap lampiran punya progres_tugas_id → kartu.
    const L = (lampiran ?? []).filter(l => l.sidik &&
      l.progres_tugas?.penugasan_id === penugasanId)
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        if (L[i].murid_id === L[j].murid_id) continue
        if (jarakSidik(L[i].sidik, L[j].sidik) <= 8) {
          tandai(L[i].progres_tugas_id, L[i].murid_id, L[j].progres_tugas_id, L[j].murid_id)
        }
      }
    }

    // 2. Isian tabel: proporsi sel sama >= 85%. Petakan lembar → progres tugas
    //    murid yang lembar_kode-nya memuat kode lembar tsb.
    const kodeProgres = (muridId, kodeLembar) => {
      if (!kodeLembar) return null
      const kode = String(kodeLembar).toUpperCase()
      const cocok = (progres ?? []).find(pr => pr.murid_id === muridId &&
        String(pr.tugas?.lembar_kode ?? '').toUpperCase()
          .split(/[,;]/).map(s => s.trim()).includes(kode))
      return cocok?.id ?? null
    }
    const perLembar = {}
    for (const it of (isian ?? [])) {
      (perLembar[it.lembar_kerja_id] ??= []).push(it)
    }
    const rasioSel = (a, b) => {
      const kunci = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
      let total = 0, sama = 0
      for (const baris of kunci) {
        const ra = a?.[baris] ?? {}, rb = b?.[baris] ?? {}
        for (const kol of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
          const va = String(ra[kol] ?? '').trim(), vb = String(rb[kol] ?? '').trim()
          if (va === '' && vb === '') continue
          total++; if (va !== '' && va === vb) sama++
        }
      }
      return total > 0 ? sama / total : 0
    }
    for (const k of Object.keys(perLembar)) {
      const arr = perLembar[k]
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[i].murid_id === arr[j].murid_id) continue
          if (rasioSel(arr[i].data, arr[j].data) >= 0.85) {
            const pidA = kodeProgres(arr[i].murid_id, arr[i].lembar?.kode)
            const pidB = kodeProgres(arr[j].murid_id, arr[j].lembar?.kode)
            tandai(pidA, arr[i].murid_id, pidB, arr[j].murid_id)
          }
        }
      }
    }
  } catch (_) { /* diam: penanda bersifat opsional */ }
  return peta
}

// Penanda kemiripan (alat bantu guru, TIDAK memengaruhi nilai). Membandingkan
// bukti gambar (via sidik perceptual-hash) dan isian tabel antar murid pada
// satu penugasan, lalu menandai pasangan yang mencurigakan.
async function halamanKemiripan(wadah, penugasanId) {
  const { data: pen } = await sb.from('penugasan')
    .select('id, kelas_id, kelas(nama), tujuan_pembelajaran(id, kode, judul)')
    .eq('id', penugasanId).single()

  isi(wadah, el('div', { class: 'kepala' },
    el('div', {},
      el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
                     onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
      el('h1', {}, '🔍 Penanda Kemiripan'),
      el('p', {}, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode}`)),
  ), el('div', { class: 'panel' }, el('div', { class: 'panel-isi' },
    el('p', { gaya: { color: 'var(--tinta-lembut)' } }, 'Memeriksa kemiripan…'))))

  // Ambil bukti gambar (dengan sidik) + isian tabel, beserta nama murid.
  const [{ data: lampiran }, { data: isian }, { data: pendaftaran }] = await Promise.all([
    sb.from('lampiran')
      .select('murid_id, path, sidik, progres_tugas:progres_tugas_id(tugas:tugas_id(kode))')
      .not('sidik', 'is', null),
    sb.from('isian_lembar')
      .select('murid_id, lembar_kerja_id, data, lembar_kerja:lembar_kerja_id(kode)')
      .eq('penugasan_id', penugasanId),
    sb.from('pendaftaran')
      .select('murid_id, profil:murid_id(nama, no_absen)')
      .eq('kelas_id', pen.kelas_id).eq('aktif', true),
  ])

  const nama = {}
  for (const d of (pendaftaran ?? [])) nama[d.murid_id] = d.profil?.nama ?? '—'
  const muridLampiran = new Set((lampiran ?? []).map(l => l.murid_id))

  // 1. Kemiripan GAMBAR: bandingkan tiap pasang bukti dengan jarak Hamming.
  //    Jarak kecil (<= 8 dari 256 bit) = sangat mirip / identik.
  const AMBANG_GAMBAR = 8
  const pasanganGambar = []
  const L = (lampiran ?? []).filter(l => l.sidik)
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      if (L[i].murid_id === L[j].murid_id) continue   // lewati milik murid sama
      const jarak = jarakSidik(L[i].sidik, L[j].sidik)
      if (jarak <= AMBANG_GAMBAR) {
        pasanganGambar.push({
          a: L[i].murid_id, b: L[j].murid_id, jarak,
          tugasA: L[i].progres_tugas?.tugas?.kode, tugasB: L[j].progres_tugas?.tugas?.kode,
        })
      }
    }
  }
  pasanganGambar.sort((x, y) => x.jarak - y.jarak)

  // 2. Kemiripan ISIAN TABEL: bandingkan data JSON per lembar antar murid.
  const AMBANG_TEKS = 0.85   // >= 85% sel sama dianggap mencurigakan
  const perLembar = {}
  for (const it of (isian ?? [])) {
    const k = it.lembar_kerja_id
    if (!perLembar[k]) perLembar[k] = []
    perLembar[k].push(it)
  }
  const kemiripanSel = (a, b) => {
    // Bandingkan nilai sel; hitung proporsi sel yang sama (dan tidak kosong).
    const semuaKunci = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
    let total = 0, sama = 0
    for (const baris of semuaKunci) {
      const ra = a?.[baris] ?? {}, rb = b?.[baris] ?? {}
      const kolom = new Set([...Object.keys(ra), ...Object.keys(rb)])
      for (const kol of kolom) {
        const va = String(ra[kol] ?? '').trim(), vb = String(rb[kol] ?? '').trim()
        if (va === '' && vb === '') continue
        total++
        if (va !== '' && va === vb) sama++
      }
    }
    return total > 0 ? sama / total : 0
  }
  const pasanganTeks = []
  for (const k of Object.keys(perLembar)) {
    const arr = perLembar[k]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].murid_id === arr[j].murid_id) continue
        const rasio = kemiripanSel(arr[i].data, arr[j].data)
        if (rasio >= AMBANG_TEKS) {
          pasanganTeks.push({
            a: arr[i].murid_id, b: arr[j].murid_id, rasio,
            lembar: arr[i].lembar_kerja?.kode ?? '?',
          })
        }
      }
    }
  }
  pasanganTeks.sort((x, y) => y.rasio - x.rasio)

  // Render hasil.
  const bagian = []
  bagian.push(el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '14px' } },
    'Ini alat bantu, bukan tuduhan. Kemiripan tinggi bisa berarti menyalin, tetapi ' +
    'bisa juga wajar (mis. tabel referensi berisi jawaban baku). Tinjau sebelum menindak.'))

  // Bagian gambar.
  bagian.push(el('div', { class: 'bagian-judul' }, `Bukti gambar mirip (${pasanganGambar.length})`))
  if (!pasanganGambar.length) {
    bagian.push(el('p', { gaya: { color: 'var(--tinta-lembut)', fontSize: '13px' } },
      muridLampiran.size ? 'Tidak ada bukti gambar yang mirip terdeteksi.'
        : 'Belum ada bukti gambar dengan sidik (unggahan lama belum bersidik).'))
  } else {
    bagian.push(el('div', { class: 'tumpuk' }, ...pasanganGambar.map(p =>
      el('div', { class: 'mirip-baris' },
        el('span', { class: 'mirip-nama' }, nama[p.a] ?? '—'),
        el('span', { class: 'mirip-vs' }, '↔'),
        el('span', { class: 'mirip-nama' }, nama[p.b] ?? '—'),
        el('span', { class: 'mirip-skor ' + (p.jarak <= 2 ? 'tinggi' : 'sedang') },
          p.jarak === 0 ? 'identik' : `mirip (beda ${p.jarak})`),
        (p.tugasA || p.tugasB) && el('span', { class: 'mirip-ket' },
          `${p.tugasA ?? '?'}${p.tugasB && p.tugasB !== p.tugasA ? ' / ' + p.tugasB : ''}`)))))
  }

  // Bagian tabel.
  bagian.push(el('div', { class: 'bagian-judul', gaya: { marginTop: '18px' } },
    `Isian tabel mirip (${pasanganTeks.length})`))
  if (!pasanganTeks.length) {
    bagian.push(el('p', { gaya: { color: 'var(--tinta-lembut)', fontSize: '13px' } },
      'Tidak ada isian tabel yang mencurigakan.'))
  } else {
    bagian.push(el('div', { class: 'tumpuk' }, ...pasanganTeks.map(p =>
      el('div', { class: 'mirip-baris' },
        el('span', { class: 'mirip-nama' }, nama[p.a] ?? '—'),
        el('span', { class: 'mirip-vs' }, '↔'),
        el('span', { class: 'mirip-nama' }, nama[p.b] ?? '—'),
        el('span', { class: 'mirip-skor ' + (p.rasio >= 0.95 ? 'tinggi' : 'sedang') },
          `${Math.round(p.rasio * 100)}% sama`),
        el('span', { class: 'mirip-ket' }, `Tabel ${p.lembar}`)))))
  }

  isi(wadah, el('div', { class: 'kepala' },
    el('div', {},
      el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
                     onClick: () => pergiKe(`kelas/${pen.kelas_id}`) }, '← Kembali ke kelas'),
      el('h1', {}, '🔍 Penanda Kemiripan'),
      el('p', {}, `${pen.kelas?.nama} · ${pen.tujuan_pembelajaran?.kode}`)),
  ), el('div', { class: 'panel' }, el('div', { class: 'panel-isi' }, ...bagian)))
}

async function muatKoreksi(p, tpId, penugasanId) {
  const wadah = document.querySelector(`.wadah-koreksi[data-pid="${p.id}"]`)
  if (!wadah) return

  try {
    // 1. Unggahan bukti.
    const { data: lampiran } = await sb.from('lampiran')
      .select('id, nama_asli, path, mime, ukuran')
      .eq('progres_tugas_id', p.id)

    // 2. Isian tabel — tugas bisa terkait BEBERAPA lembar (kode dipisah koma,
    //    mis. "C1,C2,C3"). Muat & tampilkan semuanya, bukan hanya yang pertama.
    //    Pencocokan kode tidak peduli huruf besar/kecil.
    const kodeLembar = String(p.tugas?.lembar_kode ?? '')
      .split(/[,;]/).map(x => x.trim().toUpperCase()).filter(Boolean)
    const lembarList = []   // { lembar, isian }
    if (kodeLembar.length && tpId) {
      // Ambil semua lembar TP lalu saring sesuai kode tugas (case-insensitive).
      const { data: semuaLk } = await sb.from('lembar_kerja')
        .select('id, kode, judul, tipe, struktur')
        .eq('tujuan_pembelajaran_id', tpId)
      const urut = {}; kodeLembar.forEach((k, i) => { urut[k] = i })
      const lkTerurut = (semuaLk ?? [])
        .filter(lk => kodeLembar.includes((lk.kode ?? '').toUpperCase()))
        .sort((x, y) =>
          (urut[(x.kode ?? '').toUpperCase()] ?? 99) - (urut[(y.kode ?? '').toUpperCase()] ?? 99))
      for (const lk of lkTerurut) {
        const { data: is } = await sb.from('isian_lembar')
          .select('data').eq('penugasan_id', penugasanId)
          .eq('murid_id', p.murid_id).eq('lembar_kerja_id', lk.id).maybeSingle()
        lembarList.push({ lembar: lk, isian: is?.data ?? null })
      }
    }

    if (!lampiran?.length && !lembarList.length) {
      isi(wadah, el('div', { class: 'koreksi-kosong' },
        'Belum ada hasil pekerjaan yang bisa dikoreksi (tidak ada unggahan maupun tabel).'))
      return
    }

    const anak = [el('div', { class: 'bagian-judul', gaya: { marginTop: '4px' } }, 'Hasil pekerjaan murid')]

    // Tampilkan SEMUA isian tabel terkait (baca saja).
    for (const { lembar, isian } of lembarList) {
      anak.push(el('div', { gaya: { fontSize: '12.5px', fontWeight: '600', margin: '6px 0 4px' } },
        `Tabel ${lembar.kode} — ${lembar.judul}`))
      anak.push(tabelKoreksi(lembar, isian))
    }

    // Tampilkan unggahan.
    if (lampiran?.length) {
      anak.push(el('div', { gaya: { fontSize: '12.5px', fontWeight: '600', margin: '10px 0 4px' } }, 'Bukti diunggah'))
      for (const f of lampiran) {
        const tautan = (await urlBukti(f.path).catch(() => null)) ?? '#'
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

function kartuReview(p, penugasanId, wadah, miripNama = null) {
  const mirip = miripNama && miripNama.size > 0
  const umpan = el('textarea', { rows: '2', 'aria-label': 'Umpan balik',
    placeholder: 'Umpan balik untuk murid (opsional saat menilai, wajib bila dikembalikan)' })

  // Hapus HANYA kartu ini dari DOM (tanpa memuat ulang seluruh halaman/gambar).
  // Bila grup murid jadi kosong, hapus grupnya juga.
  function lepasKartu() {
    const grup = kartu.closest('.grup-murid')
    kartu.remove()
    if (grup && !grup.querySelector('.panel')) {
      grup.remove()
    } else if (grup) {
      // Perbarui hitungan "N tugas menunggu" pada grup murid ini.
      const sisa = grup.querySelectorAll('.panel').length
      const ket = grup.querySelector('.grup-murid-kepala div div:last-child')
      if (ket) ket.textContent = ket.textContent.replace(/\d+ tugas menunggu/, `${sisa} tugas menunggu`)
    }
    // Perbarui hitungan di kepala halaman berdasarkan DOM terkini.
    const kartuSisa = wadah.querySelectorAll('.tumpuk-murid .panel').length
    const muridSisa = wadah.querySelectorAll('.grup-murid').length
    const kepala = wadah.querySelector('#review-hitung')
    if (kepala) {
      kepala.textContent = kepala.textContent.replace(/ — \d+ tugas dari \d+ murid/, '')
        + (kartuSisa ? ` — ${kartuSisa} tugas dari ${muridSisa} murid` : '')
    }
    if (!kartuSisa) {
      const bungkus = wadah.querySelector('.tumpuk-murid')
      if (bungkus) isi(bungkus,
        el('div', { class: 'kosong', gaya: { padding: '24px' } },
          el('h3', {}, 'Semua sudah diperiksa'),
          el('p', {}, 'Tidak ada lagi tugas yang menunggu review.')))
    }
  }

  async function beriNilai(huruf) {
    try {
      const { error } = await sb.rpc('nilai_tugas', {
        p_progres: p.id, p_huruf: huruf, p_umpan: umpan.value.trim() || null,
      })
      if (error) throw error
      roti(`${p.tugas.kode} dinilai ${huruf} — dikunci`)
      lepasKartu()
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
      lepasKartu()
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  const lewat = p.tugas.estimasi_menit > 0 && p.detik_terpakai > p.tugas.estimasi_menit * 60

  const kartu = el('div', { class: 'panel' + (mirip ? ' panel-mirip' : '') },
    el('div', { class: 'panel-isi' },
      el('div', { gaya: { display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' } },
        el('div', { class: 'avatar' }, inisial(p.profil?.nama)),
        el('div', { gaya: { flex: '1', minWidth: '180px' } },
          el('div', { gaya: { fontWeight: '600' } },
            p.profil?.nama, p.profil?.no_absen ? ` · absen ${p.profil.no_absen}` : ''),
          el('div', { class: 'mono', gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)' } },
            `${p.tugas.kode} — ${p.tugas.judul}`),
          mirip && el('div', { class: 'mirip-dengan' },
            '🔍 Mirip dengan: ' + [...miripNama].join(', ')),
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
  return kartu
}
