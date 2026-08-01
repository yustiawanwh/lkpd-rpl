/**
 * Halaman murid: papan kanban, lembar kerja, kemajuan.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, inisial, tunda, tanggalId, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { pangkatUntuk, ambangBerikutnya, persenKeBerikutnya, formatWaktu } from '../lib/pangkat.js'
import { hitungNilai, hitungNilaiSprint, predikatUntuk } from '../lib/nilai.js'
import { muatPapan, ubahStatus, catatWaktu, papanPeringkat, statistikSaya, badgeSaya, rekapNilaiPerSprint }
  from '../rutin/papan.js'
import { muatLembar, simpanIsian, buatPenyimpan } from '../rutin/lembar-kerja.js'
import * as LK from '../lib/lembar.js'
import { keadaan, pergiKe, keluar } from '../main.js'
import { dialogTiket, timerAktif, hentikanTimer } from './tiket.js'
import { mulaiKendaliMurid, hentikanKendaliMurid, setTugasAktif } from '../rutin/kendali-murid.js'

const LAJUR = [
  ['backlog',    'Backlog',          '#8A9A91'],
  ['dikerjakan', 'Dikerjakan',       '#1F5C99'],
  ['review',     'Menunggu Review',  '#8A6A2F'],
  ['selesai',    'Selesai',          '#1B6B4F'],
]

export async function halamanMurid(wadah, r) {
  const p = keadaan.profil

  // Belum memilih kelas → tampilkan daftar
  if (!keadaan.penugasan || r.nama === '') {
    await daftarKelas(wadah)
    return
  }

  const tampilan = r.nama || 'papan'
  isi(wadah, bilah(tampilan), el('div', { class: 'isi', id: 'isi-utama' },
    el('div', { class: 'tumpuk' }, rangkaMuat('120px'), rangkaMuat('220px'))))

  const utama = $('#isi-utama')

  if (tampilan === 'lembar')      await tampilLembar(utama)
  else if (tampilan === 'maju')   await tampilKemajuan(utama)
  else                             await tampilPapan(utama)
}

/* ==========================================================
   Bilah atas
   ========================================================== */
function bilah(aktif) {
  const p = keadaan.profil
  const nav = [
    ['papan',  'Papan Sprint'],
    ['lembar', 'Lembar Kerja'],
    ['maju',   'Kemajuan'],
  ]

  return el('header', { class: 'bilah' },
    el('div', { class: 'bilah-merek' },
      el('span', { class: 'bilah-tanda' }, 'B'), 'Brantas Dev Studio'),

    el('nav', { class: 'bilah-nav' },
      ...nav.map(([kunci, label]) =>
        el('button', {
          'aria-current': aktif === kunci ? 'page' : null,
          onClick: () => pergiKe(kunci),
        }, label)),
    ),

    el('div', { class: 'bilah-kanan' },
      el('button', {
        class: 'tbl tbl-kecil',
        gaya: { background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'transparent' },
        onClick: () => { hentikanKendaliMurid(); keadaan.penugasan = null; pergiKe('') },
      }, 'Ganti kelas'),

      el('div', { class: 'bilah-siapa' },
        el('b', {}, p.nama),
        el('span', {}, 'Junior Developer'),
      ),
      el('div', { class: 'avatar' }, inisial(p.nama)),
      el('button', {
        class: 'tbl tbl-kecil tbl-hantu',
        gaya: { color: 'rgba(255,255,255,.8)' },
        onClick: keluar,
      }, 'Keluar'),
    ),
  )
}

/* ==========================================================
   Daftar kelas
   ========================================================== */
async function daftarKelas(wadah) {
  const p = keadaan.profil

  isi(wadah,
    el('header', { class: 'bilah' },
      el('div', { class: 'bilah-merek' },
        el('span', { class: 'bilah-tanda' }, 'B'), 'Brantas Dev Studio'),
      el('div', { class: 'bilah-kanan' },
        el('div', { class: 'bilah-siapa' }, el('b', {}, p.nama)),
        el('div', { class: 'avatar' }, inisial(p.nama)),
        el('button', { class: 'tbl tbl-kecil tbl-hantu',
                       gaya: { color: 'rgba(255,255,255,.8)' }, onClick: keluar }, 'Keluar'),
      ),
    ),
    el('div', { class: 'isi', id: 'daftar-kelas' }, rangkaMuat('180px')),
  )

  const kotak = $('#daftar-kelas')

  try {
    const { data, error } = await sb
      .from('penugasan')
      .select('id, mulai, tenggat, dibuka, tujuan_pembelajaran(id, kode, judul, total_jp, total_menit), kelas(nama, mata_pelajaran(nama, tingkat))')
      .eq('dibuka', true)
    if (error) throw error

    if (!data.length) {
      isi(kotak, gabungKelas(), el('div', { class: 'panel', gaya: { marginTop: '14px' } },
        el('div', { class: 'kosong' },
          el('h3', {}, 'Belum ada tugas'),
          el('p', {}, 'Kamu belum tergabung di kelas mana pun, atau gurumu belum ' +
                      'membuka penugasan. Masukkan kode kelas dari gurumu di atas.'),
        ),
      ))
      return
    }

    isi(kotak,
      el('div', { class: 'kepala' },
        el('div', {},
          el('h1', {}, 'Pilih ruang kerja'),
          el('p', {}, 'Tugas yang sedang terbuka untukmu.'),
        ),
      ),
      gabungKelas(),
      el('div', { class: 'tumpuk', gaya: { marginTop: '14px' } },
        ...data.map((a) => el('button', {
          class: 'panel',
          gaya: { textAlign: 'left', width: '100%', cursor: 'pointer' },
          onClick: () => { keadaan.penugasan = a; pergiKe('papan') },
        },
          el('div', { class: 'panel-isi' },
            el('div', { class: 'mono', gaya: { fontSize: '11px', color: 'var(--tinta-lembut)' } },
              a.tujuan_pembelajaran.kode),
            el('h2', { gaya: { fontSize: '17px', margin: '3px 0 5px' } },
              a.tujuan_pembelajaran.judul),
            el('p', { gaya: { margin: 0, fontSize: '13px', color: 'var(--tinta-lembut)' } },
              [a.kelas?.nama, a.kelas?.mata_pelajaran?.nama,
               a.tujuan_pembelajaran.total_jp ? `${a.tujuan_pembelajaran.total_jp} JP` : null,
               a.tenggat ? `Tenggat ${tanggalId(a.tenggat, true)}` : null,
              ].filter(Boolean).join(' · ')),
          ),
        )),
      ),
    )
  } catch (err) {
    isi(kotak, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
  }
}

function gabungKelas() {
  let sibuk = false

  const input = el('input', {
    type: 'text', placeholder: 'Contoh: 5WW5CC', maxlength: '6',
    gaya: { textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '.1em' },
    'aria-label': 'Kode kelas',
  })

  const tombol = el('button', { class: 'tbl tbl-utama', onClick: gabung }, 'Gabung')
  const pesan = el('div')

  async function gabung() {
    const kode = input.value.trim().toUpperCase()
    if (!kode) return
    if (sibuk) return

    sibuk = true; tombol.disabled = true; tombol.textContent = 'Memeriksa…'
    isi(pesan)

    try {
      // Memakai fungsi aman gabung_kelas: memvalidasi kode & mendaftarkan
      // dalam satu langkah. Ini menghindari masalah "kode tidak ditemukan"
      // yang terjadi bila murid mencoba membaca kelas sebelum tergabung.
      const { data, error } = await sb.rpc('gabung_kelas', { p_kode: kode })
      if (error) throw error

      const hasil = Array.isArray(data) ? data[0] : data
      const status = hasil?.status

      if (status === 'tidak_ditemukan') {
        isi(pesan, el('div', { class: 'pesan pesan-galat' },
          'Kode kelas tidak ditemukan. Periksa lagi ejaan hurufnya.'))
        return
      }
      if (status === 'ditutup') {
        isi(pesan, el('div', { class: 'pesan pesan-galat' },
          'Kelas ini sudah ditutup untuk anggota baru.'))
        return
      }
      if (status === 'sudah_gabung') {
        isi(pesan, el('div', { class: 'pesan pesan-info' }, 'Kamu sudah tergabung di kelas ini.'))
        setTimeout(() => location.reload(), 1200)
        return
      }
      if (status === 'tidak_login') {
        isi(pesan, el('div', { class: 'pesan pesan-galat' },
          'Sesi login berakhir. Muat ulang halaman lalu coba lagi.'))
        return
      }

      // status === 'berhasil'
      roti(`Berhasil bergabung ke ${hasil.nama}`)
      setTimeout(() => location.reload(), 800)
    } catch (err) {
      isi(pesan, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
    } finally {
      sibuk = false; tombol.disabled = false; tombol.textContent = 'Gabung'
    }
  }

  return el('div', { class: 'panel' },
    el('div', { class: 'panel-kepala' }, el('h2', {}, 'Gabung kelas baru')),
    el('div', { class: 'panel-isi' },
      el('p', { gaya: { margin: '0 0 11px', fontSize: '13px', color: 'var(--tinta-lembut)' } },
        'Masukkan kode 6 huruf yang diberikan gurumu.'),
      el('div', { gaya: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('div', { gaya: { flex: '1', minWidth: '180px' } }, input),
        tombol),
      pesan,
    ),
  )
}

/* ==========================================================
   Papan kanban
   ========================================================== */
async function tampilPapan(wadah) {
  const a = keadaan.penugasan
  let data

  try {
    data = await muatPapan(a.id)
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
    return
  }

  // Mulai denyut & langganan kendali guru untuk penugasan ini.
  mulaiKendaliMurid(a.id)

  let sprintAktif = data.sprints[0]?.id ?? null

  function gambar() {
    const s = data.sprints.find(x => x.id === sprintAktif) ?? data.sprints[0]
    if (!s) {
      isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'kosong' },
        el('h3', {}, 'Belum ada sprint'),
        el('p', {}, 'Gurumu belum menyusun sprint untuk tugas ini.'))))
      return
    }

    const inti = s.tugas.filter(t => t.jenis === 'inti')
    const selesai = inti.filter(t => t.progres?.status === 'selesai').length
    const persen = inti.length ? Math.round(selesai / inti.length * 100) : 0
    const detik = s.tugas.reduce((n, t) => n + (t.progres?.detik_terpakai ?? 0), 0)

    const R = 26, K = 2 * Math.PI * R

    isi(wadah,
      // Tab sprint
      el('div', { class: 'tab-lembar', role: 'tablist' },
        ...data.sprints.map(x => {
          const xi = x.tugas.filter(t => t.jenis === 'inti')
          const xs = xi.filter(t => t.progres?.status === 'selesai').length
          return el('button', {
            role: 'tab', 'aria-selected': String(x.id === s.id),
            onClick: () => { sprintAktif = x.id; gambar() },
          }, `Sprint ${x.nomor}`,
             el('span', { class: 'mono', gaya: { marginLeft: '6px', fontSize: '11px', opacity: '.7' } },
               `${xs}/${xi.length}`))
        }),
      ),

      // Spanduk
      el('div', { class: 'spanduk' },
        el('div', {},
          el('div', { class: 'spanduk-tag' },
            `Sprint ${s.nomor}${s.hari ? ' · ' + s.hari : ''}${s.jp ? ' · ' + s.jp : ''}`),
          el('h2', {}, s.nama),
          s.tujuan && el('p', { class: 'spanduk-tujuan' }, s.tujuan),
        ),
        el('div', { class: 'spanduk-angka' },
          el('div', { class: 'angka-blok' },
            el('b', {}, `${selesai}/${inti.length}`), el('span', {}, 'Tugas inti')),
          el('div', { class: 'angka-blok' },
            el('b', {}, `${Math.round(detik / 60)}′`),
            el('span', {}, s.menit_inti ? `dari ${s.menit_inti}′` : 'tercatat')),
          el('div', { class: 'cincin', html: `
            <svg width="64" height="64" aria-hidden="true">
              <circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="5"/>
              <circle cx="32" cy="32" r="${R}" fill="none" stroke="#8FD9BC" stroke-width="5"
                stroke-linecap="round" stroke-dasharray="${K}"
                stroke-dashoffset="${K - (K * persen / 100)}"/>
            </svg>
            <span class="cincin-label">${persen}%</span>` }),
        ),
      ),

      // Papan
      el('div', { class: 'papan' },
        ...LAJUR.map(([kunci, label, warna]) => {
          const kartu = s.tugas.filter(t => (t.progres?.status ?? 'backlog') === kunci)
          return el('div', { class: 'lajur', data: { lajur: kunci } },
            el('div', { class: 'lajur-kepala' },
              el('span', { class: 'lajur-titik', gaya: { background: warna } }),
              el('h3', {}, label),
              el('span', { class: 'lajur-jml' }, String(kartu.length)),
            ),
            el('div', { class: 'lajur-isi', data: { jatuh: kunci } },
              ...kartu.map(t => kartuTugas(t, pindah)),
            ),
          )
        }),
      ),

      el('p', { gaya: { marginTop: '14px', fontSize: '12.5px', color: 'var(--tinta-lembut)',
                        lineHeight: '1.55' } },
        'Seret kartu antar kolom, atau ketuk kartu untuk membuka tiketnya. ' +
        'Kartu ungu adalah Tantangan — kerjakan berurutan Level 1 → 2 → 3 ' +
        'setelah tugas inti selesai.'),
    )

    pasangSeret(wadah, pindah)
  }

  async function pindah(tugasId, status) {
    const s = data.sprints.find(x => x.id === sprintAktif)
    const t = s?.tugas.find(x => x.id === tugasId)
    if (!t) return
    if ((t.progres?.status ?? 'backlog') === status) return

    const sebelum = t.progres?.status ?? 'backlog'
    t.progres = { ...(t.progres ?? {}), status }   // gambar dulu, biar terasa cepat
    gambar()

    try {
      const baru = await ubahStatus(keadaan.penugasan.id, keadaan.profil.id, tugasId, status)
      t.progres = baru
      if (status === 'selesai' && t.xp > 0) roti(`${t.kode} selesai — +${t.xp} XP`)
      periksaBadgeBaru()
    } catch (err) {
      t.progres = { ...(t.progres ?? {}), status: sebelum }   // kembalikan
      gambar()
      roti(pesanGalat(err), '⚠')
    }
  }

  gambar()
}

function kartuTugas(t, pindah) {
  const pr = t.progres
  const status = pr?.status ?? 'backlog'
  const detik = pr?.detik_terpakai ?? 0
  const est = (t.estimasi_menit ?? 0) * 60
  const persen = est ? Math.min(100, detik / est * 100) : 0
  const lewat = est > 0 && detik > est

  const kelas = ['kartu',
    t.jenis === 'tantangan' ? 'tantangan' : '',
    t.jenis === 'tutor' ? 'tutor' : ''].filter(Boolean).join(' ')

  return el('button', {
    class: kelas, draggable: 'true', data: { id: t.id },
    onClick: () => { setTugasAktif(t.id); dialogTiket(t, () => { setTugasAktif(null); pergiKe('papan') }) },
  },
    el('div', { class: 'kartu-kode' }, t.kode),
    el('div', { class: 'kartu-judul' }, t.judul),
    el('div', { class: 'kartu-kaki' },
      t.estimasi_menit > 0 && el('span', { class: 'tanda tanda-menit' }, `⏱ ${t.estimasi_menit}′`),
      t.level && el('span', { class: 'tanda tanda-level' }, `LEVEL ${t.level}`),
      t.jenis === 'tutor' && el('span', { class: 'tanda tanda-tutor' }, 'MENTOR'),
      t.xp > 0 && el('span', { class: 'tanda tanda-xp' }, `+${t.xp} XP`),
    ),
    est > 0 && el('div', { class: 'kartu-bar' },
      el('i', { class: lewat ? 'lewat' : '', gaya: { width: persen + '%' } })),
  )
}

/** Seret & jatuh, dengan penanganan sentuh sebagai cadangan (ketuk kartu). */
function pasangSeret(wadah, pindah) {
  let seretId = null

  $$('.kartu', wadah).forEach(k => {
    k.addEventListener('dragstart', (e) => {
      seretId = Number(k.dataset.id)
      k.classList.add('seret')
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', String(seretId)) } catch {}
    })
    k.addEventListener('dragend', () => {
      k.classList.remove('seret')
      seretId = null
      $$('.lajur', wadah).forEach(l => l.classList.remove('incar'))
    })
  })

  $$('.lajur-isi', wadah).forEach(zona => {
    const lajur = zona.closest('.lajur')
    zona.addEventListener('dragover', (e) => { e.preventDefault(); lajur.classList.add('incar') })
    zona.addEventListener('dragleave', (e) => {
      if (!zona.contains(e.relatedTarget)) lajur.classList.remove('incar')
    })
    zona.addEventListener('drop', (e) => {
      e.preventDefault()
      lajur.classList.remove('incar')
      const id = seretId ?? Number(e.dataTransfer.getData('text/plain'))
      if (id) pindah(id, zona.dataset.jatuh)
    })
  })
}

let badgeTerakhir = null
async function periksaBadgeBaru() {
  try {
    const daftar = await badgeSaya(keadaan.penugasan.id)
    const kode = daftar.map(b => b.badge.kode).sort().join(',')
    if (badgeTerakhir !== null && kode !== badgeTerakhir) {
      const baru = daftar.filter(b => !badgeTerakhir.includes(b.badge.kode))
      baru.forEach(b => roti(`Badge diraih — ${b.badge.nama}`, b.badge.emoji ?? '🏅'))
    }
    badgeTerakhir = kode
  } catch {}
}

/* ==========================================================
   Lembar kerja
   ========================================================== */
async function tampilLembar(wadah) {
  const a = keadaan.penugasan
  let daftar, kodeTerkunci, petaKodeTugas

  try {
    daftar = await muatLembar(a.tujuan_pembelajaran.id, a.id)
    // lembar_kode bisa berisi BEBERAPA kode dipisah koma (mis. "C1,C2,C3").
    // Semua kode itu dimiliki oleh tugas yang sama → mengikuti timer & kunci
    // tugas tersebut.
    const pisahKode = (s) => String(s ?? '').split(/[,;]/)
      .map(x => x.trim().toUpperCase()).filter(Boolean)

    const { data: prog } = await sb.from('progres_tugas')
      .select('terkunci, tugas:tugas_id(id, lembar_kode)')
      .eq('penugasan_id', a.id).eq('murid_id', keadaan.profil.id)

    // Kode yang terkunci (tugas ditandai selesai/dinilai).
    kodeTerkunci = new Set()
    for (const p of (prog ?? [])) {
      if (!p.terkunci) continue
      for (const k of pisahKode(p.tugas?.lembar_kode)) kodeTerkunci.add(k)
    }
    // Peta: kode lembar → daftar id tugas yang memakainya (untuk cek timer).
    petaKodeTugas = new Map()
    for (const p of (prog ?? [])) {
      if (!p.tugas?.id) continue
      for (const K of pisahKode(p.tugas?.lembar_kode)) {
        if (!petaKodeTugas.has(K)) petaKodeTugas.set(K, [])
        petaKodeTugas.get(K).push(p.tugas.id)
      }
    }
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
    return
  }

  if (!daftar.length) {
    isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'kosong' },
      el('h3', {}, 'Belum ada lembar kerja'),
      el('p', {}, 'Gurumu belum menambahkan tabel untuk tugas ini.'))))
    return
  }

  let aktif = daftar[0].kode

  function gambar() {
    const l = daftar.find(x => x.kode === aktif) ?? daftar[0]
    const terkunci = kodeTerkunci.has((l.kode ?? '').toUpperCase())

    // Kunci mengikuti timer: tabel hanya bisa diisi bila salah satu tugas yang
    // memakai lembar ini timernya sedang BERJALAN. Konsisten dengan tiket.
    const idTugasLembar = petaKodeTugas.get((l.kode ?? '').toUpperCase()) ?? []
    const timerJalan = idTugasLembar.includes(timerAktif())
    const terkunciTimer = !terkunci && !timerJalan

    isi(wadah,
      el('div', { class: 'kepala' },
        el('div', {},
          el('h1', {}, `Tabel ${l.kode} — ${l.judul}`),
          l.keterangan && el('p', {}, l.keterangan),
        ),
        el('div', { class: 'kepala-kanan' },
          terkunci
            ? el('span', { gaya: { fontSize: '13px', color: 'var(--tinta-lembut)' } }, '🔒 Terkunci')
            : el('span', { class: 'simpan-tanda', id: 'tanda-simpan' }, 'Tersimpan otomatis'),
        ),
      ),

      el('div', { class: 'tab-lembar', role: 'tablist' },
        ...daftar.map(x => el('button', {
          role: 'tab', 'aria-selected': String(x.kode === l.kode),
          onClick: () => { aktif = x.kode; gambar() },
        }, `Tabel ${x.kode}` + (kodeTerkunci.has((x.kode ?? '').toUpperCase()) ? ' 🔒' : ''))),
      ),

      terkunci && el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '12px' } },
        'Tabel ini terkunci karena tugasnya sudah kamu tandai selesai. ' +
        'Isiannya tidak bisa diubah lagi. Minta gurumu membuka kunci bila perlu diperbaiki.'),

      // Petunjuk bila terkunci karena timer belum berjalan.
      terkunciTimer && el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '12px' } },
        '⏱ Tabel ini aktif saat kamu menjalankan timer tugasnya. Buka tugas yang ' +
        'memakai tabel ini lalu tekan “Mulai”, baru tabel bisa diisi. ' +
        'Ini mencegah pengisian tanpa mengerjakan.'),

      el('div', { class: 'panel' },
        el('div', { class: 'panel-isi' }, tabelLembar(l, terkunci || terkunciTimer)),
      ),
    )
  }

  gambar()

  // Bila status timer berubah (dari mana pun), segarkan agar kunci menyesuaikan.
  // Berhenti mendengarkan begitu halaman ini tak lagi tampil.
  const saatTimer = () => {
    if (document.body.contains(wadah)) gambar()
    else window.removeEventListener('brantas-timer', saatTimer)
  }
  window.addEventListener('brantas-timer', saatTimer)
}

function tabelLembar(l, terkunci = false) {
  const data = { ...(l.isian?.data ?? {}) }
  const kolom = LK.kolom(l)
  const nBaris = LK.jumlahBaris(l)

  // Jaga-jaga: bila struktur tabel kosong (mis. dibuat guru tapi belum
  // diisi kolom/baris), tampilkan pesan jelas alih-alih panel kosong.
  if (!kolom.length || (l.tipe !== 'referensi' && nBaris === 0)) {
    return el('div', { class: 'kosong', gaya: { padding: '28px' } },
      el('h3', {}, 'Tabel ini belum siap'),
      el('p', {}, 'Struktur tabel belum lengkap (belum ada kolom atau baris). ' +
                  'Sampaikan ke gurumu agar melengkapinya di panel LKPD.'))
  }

  function laporSimpan(status, info) {
    const tanda = $('#tanda-simpan')
    if (!tanda) return
    tanda.classList.remove('aktif', 'gagal', 'nunggu')
    switch (status) {
      case 'menyimpan': tanda.textContent = 'Menyimpan…'; break
      case 'tersimpan': tanda.textContent = '✓ Tersimpan'; tanda.classList.add('aktif')
        setTimeout(() => { if (tanda && tanda.textContent === '✓ Tersimpan') tanda.classList.remove('aktif') }, 1400); break
      case 'menunggu-koneksi': tanda.textContent = '⚠ Menunggu koneksi…'; tanda.classList.add('nunggu'); break
      case 'akan-coba-lagi': tanda.textContent = `⚠ Gagal — mencoba lagi (${info?.percobaan})…`; tanda.classList.add('nunggu'); break
      case 'gagal': tanda.textContent = '✗ Belum tersimpan'; tanda.classList.add('gagal'); break
    }
  }

  const penyimpan = buatPenyimpan(
    (d) => simpanIsian(keadaan.penugasan.id, keadaan.profil.id, l.id, d),
    laporSimpan,
  )

  // Simpan sebelum menutup tab: peringatkan bila masih ada yang tertunda.
  const jagaKeluar = (e) => {
    if (penyimpan.adaTertunda()) {
      penyimpan.flush()
      e.preventDefault(); e.returnValue = ''
      return ''
    }
  }
  window.addEventListener('beforeunload', jagaKeluar)

  function ubah(baris, kunci, nilai) {
    data[String(baris)] = { ...(data[String(baris)] ?? {}), [kunci]: nilai }
    penyimpan.jadwalkan({ ...data }, 700)
  }

  function sel(baris, k) {
    const nilai = data[String(baris)]?.[k.key] ?? ''

    // Tugas terkunci: tampilkan nilai tanpa input.
    if (terkunci) {
      let tampil = nilai
      if (k.input === 'tri') tampil = nilai === '1' ? '✓' : nilai === '0' ? '✗' : '—'
      return el('div', { class: 'baca-saja' }, String(tampil || '—'))
    }

    if (k.input === 'tri') {
      const bikin = (v, label) => el('button', {
        class: nilai === v ? 'aktif' : '', data: { nilai: v },
        'aria-label': label, 'aria-pressed': String(nilai === v),
        onClick: (e) => {
          const baruNilai = nilai === v ? '' : v
          ubah(baris, k.key, baruNilai)
          const grup = e.target.parentElement
          $$('button', grup).forEach(b => {
            b.classList.toggle('aktif', b.dataset.nilai === baruNilai)
            b.setAttribute('aria-pressed', String(b.dataset.nilai === baruNilai))
          })
        },
      }, label)
      return el('div', { class: 'tri' }, bikin('1', '✓'), bikin('0', '✗'))
    }

    if (k.input === 'pilihan') {
      return el('select', { onChange: (e) => ubah(baris, k.key, e.target.value) },
        el('option', { value: '' }, '—'),
        ...(k.opsi ?? []).map(o => el('option', { value: o, selected: nilai === o }, o)),
      )
    }

    if (k.input === 'text' || k.input === 'angka') {
      return el('input', {
        type: k.input === 'angka' ? 'number' : 'text', value: nilai,
        'aria-label': k.label,
        onInput: (e) => ubah(baris, k.key, e.target.value),
      })
    }

    const ta = el('textarea', { rows: '2', 'aria-label': k.label,
      onInput: (e) => { e.target.style.height = 'auto'
                        e.target.style.height = Math.max(40, e.target.scrollHeight) + 'px'
                        ubah(baris, k.key, e.target.value) } }, nilai)
    return ta
  }

  /* ---- Referensi: baris bacaan + kolom isian ---- */
  if (l.tipe === 'referensi') {
    const baca = LK.kolomBaca(l)
    const isiRef = LK.dataReferensi(l)

    return el('div', { class: 'tabel-bungkus' },
      el('table', { class: 'lk' },
        el('thead', {}, el('tr', {},
          ...baca.map(h => el('th', {}, h)),
          ...kolom.map(k => el('th', {}, k.label)),
        )),
        el('tbody', {},
          ...isiRef.map((baris, i) => el('tr', {},
            ...baris.map(c => el('td', {}, el('div', { class: 'baca-saja' }, c))),
            ...kolom.map(k => el('td', {}, sel(i, k))),
          )),
        ),
      ),
    )
  }

  /* ---- Matriks & formulir: label baris di kiri ---- */
  if (l.tipe === 'matriks' || l.tipe === 'formulir') {
    const label = LK.labelBaris(l)
    return el('div', { class: 'tabel-bungkus' },
      el('table', { class: 'lk' },
        kolom.length > 1 && el('thead', {}, el('tr', {},
          el('th', {}, ''), ...kolom.map(k => el('th', {}, k.label)))),
        el('tbody', {},
          ...label.map((lb, i) => el('tr', {},
            el('td', { class: 'label' }, lb),
            ...kolom.map(k => el('td', {}, sel(i, k))),
          )),
        ),
      ),
    )
  }

  /* ---- Daftar: baris bernomor ---- */
  return el('div', { class: 'tabel-bungkus' },
    el('table', { class: 'lk' },
      el('thead', {}, el('tr', {},
        el('th', { gaya: { width: '40px' } }, 'No'),
        ...kolom.map(k => el('th', {}, k.label)))),
      el('tbody', {},
        ...Array.from({ length: nBaris }, (_, i) => el('tr', {},
          el('td', { class: 'label' }, String(i + 1)),
          ...kolom.map(k => el('td', {}, sel(i, k))),
        )),
      ),
    ),
  )
}

/* ==========================================================
   Kemajuan
   ========================================================== */
async function tampilKemajuan(wadah) {
  const a = keadaan.penugasan
  let stat, badges, peringkat, semuaBadge, bobot = {}, rekapSprint = null

  try {
    ;[stat, badges, peringkat] = await Promise.all([
      statistikSaya(a.id, keadaan.profil.id),
      badgeSaya(a.id),
      papanPeringkat(a.id),
    ])
    const { data } = await sb.from('badge').select('*')
      .eq('tujuan_pembelajaran_id', a.tujuan_pembelajaran.id).order('urutan')
    semuaBadge = data ?? []
    // Pengaturan nilai (KKM, ambang warna, bobot) — dipakai untuk kartu nilai.
    const { data: setelan } = await sb.from('pengaturan')
      .select('nilai').eq('kunci', 'bobot_nilai').maybeSingle()
    bobot = setelan?.nilai ?? {}
    // Rekap per sprint (memuat porsi tantangan) untuk nilai total yang konsisten
    // dengan yang dilihat guru.
    rekapSprint = await rekapNilaiPerSprint(a.id, a.tujuan_pembelajaran.id)
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
    return
  }

  const xp = stat?.total_xp ?? 0
  const dapat = new Set(badges.map(b => b.badge.id))

  // Nilai total = rata-rata nilai tiap sprint (tiap sprint sudah menerapkan
  // porsi tantangan). Konsisten dengan halaman nilai guru (mode per sprint).
  const KKM = bobot.kkm ?? 75
  const AMBANG_HIJAU = bobot.ambang_hijau ?? 85
  const sayaSprint = rekapSprint.murid.find(m => m.murid_id === keadaan.profil.id)
  let nilaiTotal = 0
  if (rekapSprint.sprints.length) {
    let jml = 0
    for (const s of rekapSprint.sprints) {
      const ps = sayaSprint?.perSprint?.[s.id] ?? { huruf: [], badge: 0 }
      const hasil = hitungNilaiSprint({
        hurufList: ps.huruf ?? [],
        intiTotal: s.intiTotal,
        jumlahBadge: ps.badge ?? 0,
        tantanganTotal: s.tantanganTotal ?? 0,
        tantanganDinilai: ps.tantanganDinilai ?? 0,
        kecepatan: { sudahKumpul: ps.sudahKumpul === true, jamDurasi: ps.jamDurasi },
      }, bobot)
      jml += hasil.nilai
    }
    nilaiTotal = Math.round(jml / rekapSprint.sprints.length)
  }
  // Pengurangan poin bila murid ini punya kelonggaran susulan pada penugasan ini.
  try {
    const { count } = await sb.from('kelonggaran_sprint')
      .select('id', { count: 'exact', head: true })
      .eq('penugasan_id', a.id).eq('murid_id', keadaan.profil.id).eq('susulan', true)
    if (count > 0) nilaiTotal = Math.max(0, nilaiTotal - (bobot.penalti_susulan ?? 0))
  } catch (_) {}
  // Warna dinamis: merah < KKM, kuning-kehijauan lulus, hijau ≥ ambang.
  const warnaNilai = nilaiTotal < KKM ? 'merah'
    : nilaiTotal >= AMBANG_HIJAU ? 'hijau' : 'kuning'
  const labelPredikat = nilaiTotal < KKM ? 'Belum Lulus'
    : nilaiTotal >= AMBANG_HIJAU ? 'Sangat Baik' : 'Lulus'

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Kemajuan'),
        el('p', {}, 'Rekap capaianmu pada tugas ini.'),
      ),
      el('div', { class: 'kepala-kanan' },
        el('button', { class: 'tbl', onClick: () => window.print() }, 'Cetak'),
      ),
    ),

    el('div', { gaya: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px',
                        gap: '14px', alignItems: 'start' }, id: 'maju-kisi' },

      el('div', { class: 'tumpuk' },
        el('div', { class: 'xp-kotak' },
          el('div', { class: 'xp-pangkat' }, pangkatUntuk(xp)),
          el('div', { class: 'xp-angka' }, String(xp),
            el('small', {}, ` / ${ambangBerikutnya(xp)} XP`)),
          el('div', { class: 'xp-bar' },
            el('i', { gaya: { width: persenKeBerikutnya(xp) + '%' } })),
        ),

        // Kartu nilai total + predikat, warna latar dinamis mengikuti nilai.
        el('div', { class: 'nilai-kotak nilai-latar-' + warnaNilai },
          el('div', { class: 'nilai-kotak-label' }, 'Nilai'),
          el('div', { class: 'nilai-kotak-angka' }, String(nilaiTotal),
            el('small', {}, ' / 100')),
          el('div', { class: 'nilai-kotak-predikat' }, labelPredikat),
          el('div', { class: 'nilai-kotak-ket' },
            nilaiTotal < KKM ? `KKM ${KKM} — belum tercapai`
              : `KKM ${KKM} — tercapai`),
        ),

        el('div', { class: 'panel' },
          el('div', { class: 'panel-kepala' },
            el('h2', {}, 'Badge'),
            el('span', { class: 'mono', gaya: { marginLeft: 'auto', fontSize: '12px',
                                                color: 'var(--tinta-lembut)' } },
              `${dapat.size} / ${semuaBadge.length}`),
          ),
          el('div', { class: 'panel-isi' },
            semuaBadge.length
              ? el('div', { class: 'badge-kisi' },
                  ...semuaBadge.map(b => el('div', { class: 'badge' + (dapat.has(b.id) ? ' dapat' : '') },
                    el('div', { class: 'badge-emoji' }, b.emoji ?? '🏅'),
                    el('b', {}, b.nama),
                    b.deskripsi && el('span', {}, b.deskripsi),
                    b.xp > 0 && el('span', { class: 'badge-xp' }, `+${b.xp} XP`),
                  )))
              : el('p', { class: 'kosong' }, 'Belum ada badge pada tugas ini.'),
          ),
        ),
      ),

      el('div', { class: 'tumpuk' },
        el('div', { class: 'panel' },
          el('div', { class: 'panel-kepala' }, el('h2', {}, 'Papan peringkat')),
          peringkat.length
            ? el('div', {}, ...peringkat.map((p, i) => el('div', {
                class: 'peringkat-baris' + (p.profil?.id === keadaan.profil.id ? ' saya' : ''),
              },
                el('span', { class: 'peringkat-no' }, String(i + 1)),
                el('span', { class: 'peringkat-nama' },
                  el('span', { class: 'avatar', gaya: { width: '24px', height: '24px',
                                                        fontSize: '10px', border: 'none' } },
                    inisial(p.profil?.nama)),
                  el('span', {}, p.profil?.nama ?? '—')),
                el('span', { gaya: { fontSize: '13px' } }, '🏅'.repeat(Math.min(3, p.jumlah_badge))),
                el('span', { class: 'peringkat-xp' }, `${p.total_xp} XP`),
              )))
            : el('div', { class: 'kosong' }, el('p', {}, 'Belum ada data.')),
        ),

        el('div', { class: 'panel' },
          el('div', { class: 'panel-kepala' }, el('h2', {}, 'Ringkasan')),
          el('div', { class: 'panel-isi' },
            el('dl', { class: 'dl', gaya: { marginBottom: 0 } },
              el('dt', {}, 'Tugas inti'), el('dd', {}, String(stat?.tugas_selesai ?? 0)),
              el('dt', {}, 'Tantangan'), el('dd', {}, String(stat?.tantangan_selesai ?? 0)),
              el('dt', {}, 'Waktu'), el('dd', {}, formatWaktu(stat?.total_detik ?? 0)),
            ),
          ),
        ),
      ),
    ),
  )

  // Satu kolom di layar sempit
  if (window.matchMedia('(max-width: 900px)').matches) {
    const kisi = $('#maju-kisi')
    if (kisi) kisi.style.gridTemplateColumns = '1fr'
  }
}
