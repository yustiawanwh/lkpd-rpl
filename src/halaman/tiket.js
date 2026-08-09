/**
 * Tiket tugas: deskripsi, pelacak waktu, catatan, unggah bukti.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, dialog, tunda, konfirmasi, tanggalId } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { teksKeHtml } from '../lib/teks.js'
import { unggahBukti, urlBukti, hapusBukti } from '../lib/bukti.js'
import { formatWaktu } from '../lib/pangkat.js'
import { ubahStatus, catatWaktu, simpanCatatan } from '../rutin/papan.js'
import { buatTabelIsi, muatLembarSatu } from '../rutin/lembar-kerja.js'
import * as LK from '../lib/lembar.js'
import { keadaan } from '../main.js'

const LABEL = {
  backlog: 'Backlog', dikerjakan: 'Dikerjakan',
  review: 'Menunggu review', selesai: 'Selesai',
}

/* ==========================================================
   Timer
   ----------------------------------------------------------
   Satu timer aktif untuk seluruh aplikasi. Waktunya dihitung dari
   selisih jam, bukan dari jumlah detak — supaya tetap akurat meski
   tab peramban dijeda sistem (yang sering terjadi di ponsel).
   ========================================================== */
let timer = {
  tugasId: null, judul: '', mulai: 0, dasar: 0, iv: null, mini: null,
}

export const timerAktif = () => timer.tugasId

function detikSekarang() {
  if (!timer.tugasId) return 0
  return timer.dasar + Math.floor((Date.now() - timer.mulai) / 1000)
}

export async function hentikanTimer() {
  if (!timer.tugasId) return

  const detik = detikSekarang()
  const id = timer.tugasId

  clearInterval(timer.iv)
  timer.mini?.remove()
  timer = { tugasId: null, judul: '', mulai: 0, dasar: 0, iv: null, mini: null }

  try {
    await catatWaktu(keadaan.penugasan.id, keadaan.profil.id, id, detik)
  } catch (err) {
    roti(pesanGalat(err), '⚠')
  }
  // Beri tahu halaman lain (mis. Lembar) agar kunci tabel menyesuaikan.
  try { window.dispatchEvent(new Event('brantas-timer')) } catch (_) { /* abaikan */ }
  return detik
}

function mulaiTimer(tugas, dasarDetik, saatDetak) {
  timer.tugasId = tugas.id
  timer.judul = tugas.judul
  timer.dasar = dasarDetik
  timer.mulai = Date.now()

  // Jam mengambang, tetap terlihat saat berpindah halaman
  const angka = el('span', { class: 'mini-angka' }, formatWaktu(dasarDetik))
  timer.mini = el('div', { class: 'waktu-mini', role: 'status' },
    angka,
    el('span', { class: 'mini-judul' }, tugas.judul),
    el('button', { 'aria-label': 'Hentikan pelacak waktu',
                   onClick: () => hentikanTimer().then(() => saatDetak?.(true)) }, '■'),
  )
  document.body.append(timer.mini)
  // Beri tahu halaman lain (mis. Lembar) agar kunci tabel menyesuaikan.
  try { window.dispatchEvent(new Event('brantas-timer')) } catch (_) { /* abaikan */ }

  timer.iv = setInterval(() => {
    const d = detikSekarang()
    angka.textContent = formatWaktu(d)
    saatDetak?.(false, d)

    // Simpan berkala supaya waktu tidak hilang bila tab tertutup mendadak
    if (d % 30 === 0) {
      catatWaktu(keadaan.penugasan.id, keadaan.profil.id, tugas.id, d).catch(() => {})
    }
  }, 1000)
}

// Simpan waktu bila tab ditutup selagi timer berjalan
window.addEventListener('beforeunload', () => {
  if (timer.tugasId) {
    const d = detikSekarang()
    navigator.sendBeacon?.(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/progres_tugas`,
      new Blob([JSON.stringify({ detik_terpakai: d })], { type: 'application/json' }),
    )
  }
})

/* ==========================================================
   Dialog tiket
   ========================================================== */
export function dialogTiket(tugas, saatBerubah) {
  const pr = tugas.progres ?? {}
  let detik = pr.detik_terpakai ?? 0
  let status = pr.status ?? 'backlog'
  let tutup

  // Tugas terkunci: seluruh input (timer, catatan, bukti) dinonaktifkan.
  const terkunci = pr.terkunci === true
  let sprintLewat = false       // true bila sprint tugas ini sudah lewat tenggat
  // Belum waktunya: tanggal mulai penugasan masih di masa depan.
  // 'mulai' bertipe date (YYYY-MM-DD); tafsirkan sebagai 00:00 WIB (+07:00)
  // agar konsisten dengan kunci server (Asia/Jakarta).
  const mulaiPen = keadaan.penugasan?.mulai
    ? new Date(String(keadaan.penugasan.mulai).slice(0, 10) + 'T00:00:00+07:00')
    : null
  const belumMulai = !!(mulaiPen && Date.now() < mulaiPen.getTime())
  let tabelIsiApi = null       // API tabel isian (untuk kunci mengikuti timer)
  let petunjukKerja = null     // banner petunjuk "tekan Mulai dulu"

  const est = (tugas.estimasi_menit ?? 0) * 60

  /* ---- Pelacak waktu ---- */
  const angkaWaktu = el('span', {
    class: 'waktu-angka' + (est && detik > est ? ' lewat' : ''),
  }, formatWaktu(detik))

  const tblTimer = el('button', { class: 'tbl tbl-kecil tbl-utama', onClick: toggleTimer,
                                   disabled: terkunci || belumMulai },
    belumMulai ? '🔒 Belum waktunya' : (timerAktif() === tugas.id ? '⏸ Jeda' : '▶ Mulai'))

  function perbaruiWaktu(berhenti, d) {
    if (typeof d === 'number') detik = d
    angkaWaktu.textContent = formatWaktu(detik)
    angkaWaktu.className = 'waktu-angka'
      + (timerAktif() === tugas.id ? ' jalan' : '')
      + (est && detik > est ? ' lewat' : '')
    tblTimer.textContent = belumMulai ? '🔒 Belum waktunya'
      : (timerAktif() === tugas.id ? '⏸ Jeda' : '▶ Mulai')
    perbaruiKunciIsi()
  }

  // Poin 4: isian hanya boleh diisi saat timer BERJALAN untuk tugas ini
  // (dan tugas tidak terkunci nilai/guru). Saat belum start atau dijeda,
  // isian dinonaktifkan agar murid tidak mengisi tanpa "bekerja".
  const sedangKerja = () => timerAktif() === tugas.id && !terkunci && !sprintLewat && !belumMulai
  function perbaruiKunciIsi() {
    const boleh = sedangKerja()
    if (catatan) catatan.disabled = !boleh
    if (kotakUnggah && !terkunci) {
      kotakUnggah.disabled = !boleh
      const ket = $('.unggah-ket', kotakUnggah)
      if (ket && !kotakUnggah.classList.contains('ada')) {
        ket.textContent = boleh
          ? (tugas.bukti_diminta ?? 'PNG atau JPG, maksimal 5 MB')
          : 'Tekan “Mulai” dulu untuk mengaktifkan'
      }
    }
    // Tabel di dalam tiket: aktif/nonaktif mengikuti timer.
    if (tabelIsiApi?.setBacaSaja) tabelIsiApi.setBacaSaja(!boleh)
    // Petunjuk di area isian.
    if (petunjukKerja) petunjukKerja.style.display = boleh ? 'none' : ''
  }

  async function toggleTimer() {
    if (terkunci) return   // tugas terkunci: timer tidak bisa dijalankan
    if (belumMulai && timerAktif() !== tugas.id) {
      roti('Belum waktunya — penugasan ini baru bisa dikerjakan mulai ' +
        tanggalId(keadaan.penugasan.mulai, true), '🔒')
      return
    }
    // Sprint sudah lewat tenggat: hanya boleh menghentikan bila sedang jalan,
    // tapi tidak boleh MEMULAI lagi.
    if (sprintLewat && timerAktif() !== tugas.id) {
      roti('Tenggat sprint sudah lewat — tugas ini tidak bisa dikerjakan lagi', '🔒')
      return
    }
    if (timerAktif() === tugas.id) {
      detik = await hentikanTimer() ?? detik
      perbaruiWaktu(true)
      saatBerubah?.()
      return
    }
    if (timerAktif()) await hentikanTimer()

    // Mulai berarti sedang dikerjakan
    if (status === 'backlog') {
      status = 'dikerjakan'
      lencana.className = 'lencana lencana-' + status
      lencana.textContent = LABEL[status]
      try {
        await ubahStatus(keadaan.penugasan.id, keadaan.profil.id, tugas.id, status)
        tugas.progres = { ...(tugas.progres ?? {}), status }
      } catch (err) { roti(pesanGalat(err), '⚠') }
    }

    mulaiTimer(tugas, detik, perbaruiWaktu)
    perbaruiWaktu(false)
    roti('Timer berjalan — ' + tugas.judul, '⏱')
  }

  /* ---- Catatan ---- */
  const simpanCat = tunda(async (nilai) => {
    try {
      await simpanCatatan(keadaan.penugasan.id, keadaan.profil.id, tugas.id, nilai)
      tandaCat.textContent = 'Tersimpan'
      setTimeout(() => { tandaCat.textContent = 'Tersimpan otomatis' }, 1400)
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }, 700)

  const tandaCat = el('span', { class: 'simpan-tanda' }, 'Tersimpan otomatis')
  const bolehAwal = timerAktif() === tugas.id && !terkunci
  const catatan = el('textarea', {
    rows: '3', 'aria-label': 'Catatan kerja',
    placeholder: 'Apa yang kamu kerjakan, kendala yang muncul, dan cara mengatasinya…',
    disabled: terkunci || !bolehAwal,
    onInput: (e) => { tandaCat.textContent = 'Menyimpan…'; simpanCat(e.target.value) },
  }, pr.catatan ?? '')

  /* ---- Bukti (boleh beberapa, terus menambah) ---- */
  let daftarBukti = []   // { id, nama_asli, path }
  const berkasInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
                                     onChange: pilihBerkas })
  const kotakUnggah = el('button', { class: 'unggah', disabled: terkunci || !bolehAwal,
                                      onClick: () => { if (sedangKerja()) berkasInput.click() } },
    el('div', { class: 'unggah-judul' }, terkunci ? 'Bukti terkunci' : 'Tambah tangkapan layar'),
    el('div', { class: 'unggah-ket' }, terkunci
      ? 'Tugas sudah dikunci — bukti tidak bisa diganti'
      : (bolehAwal ? (tugas.bukti_diminta ?? 'Boleh beberapa gambar. PNG/JPG, maks 5 MB per gambar')
                   : 'Tekan “Mulai” dulu untuk mengaktifkan')),
  )
  const pratinjau = el('div', { class: 'bukti-galeri' })

  async function pilihBerkas() {
    const berkas = Array.from(berkasInput.files ?? [])
    if (!berkas.length) return
    kotakUnggah.disabled = true
    let sukses = 0

    for (let i = 0; i < berkas.length; i++) {
      const f = berkas[i]
      if (f.size > 5 * 1024 * 1024) {
        roti(`"${f.name}" terlalu besar — dilewati (maks 5 MB)`, '⚠')
        continue
      }
      $('.unggah-judul', kotakUnggah).textContent =
        berkas.length > 1 ? `Mengunggah ${i + 1}/${berkas.length}…` : 'Mengunggah…'
      try {
        const kecil = await kecilkanGambar(f)
        const sidik = await sidikGambar(kecil)
        const nama = `${keadaan.profil.id}/${tugas.id}-${Date.now()}-${i}.jpg`
        const { path } = await unggahBukti(nama, kecil)   // R2 (r2:...) atau Supabase
        const p = await ubahStatus(keadaan.penugasan.id, keadaan.profil.id, tugas.id, status)
        const { data: baris, error: e2 } = await sb.from('lampiran').insert({
          murid_id: keadaan.profil.id, progres_tugas_id: p.id,
          nama_asli: f.name, path, mime: 'image/jpeg', ukuran: kecil.size, sidik,
        }).select('id, nama_asli, path').single()
        if (e2) throw e2
        daftarBukti.push(baris)
        sukses++
      } catch (err) {
        roti(`Gagal mengunggah "${f.name}": ${pesanGalat(err)}`, '⚠')
      }
    }

    if (sukses) roti(sukses > 1 ? `${sukses} bukti tersimpan` : 'Bukti tersimpan')
    perbaruiKotakBukti()
    gambarGaleri()
    kotakUnggah.disabled = false
    berkasInput.value = ''
  }

  function perbaruiKotakBukti() {
    if (terkunci) return
    kotakUnggah.classList.toggle('ada', daftarBukti.length > 0)
    $('.unggah-judul', kotakUnggah).textContent = daftarBukti.length
      ? `📎 ${daftarBukti.length} bukti — ketuk untuk menambah`
      : 'Tambah tangkapan layar'
    $('.unggah-ket', kotakUnggah).textContent = daftarBukti.length
      ? 'Boleh menambah lagi'
      : (tugas.bukti_diminta ?? 'Boleh beberapa gambar. PNG/JPG, maks 5 MB per gambar')
  }

  async function hapusBukti(item) {
    const ya = await konfirmasi({
      judul: 'Hapus bukti?', pesan: `Hapus "${item.nama_asli}"? Tindakan ini tidak bisa dibatalkan.`,
      tombol: 'Hapus', bahaya: true,
    })
    if (!ya) return
    try {
      await hapusBukti(item.path)   // R2 atau Supabase sesuai path
      const { error } = await sb.from('lampiran').delete().eq('id', item.id)
      if (error) throw error
      daftarBukti = daftarBukti.filter(x => x.id !== item.id)
      perbaruiKotakBukti()
      gambarGaleri()
      roti('Bukti dihapus')
    } catch (err) { roti(pesanGalat(err), '⚠') }
  }

  async function gambarGaleri() {
    isi(pratinjau)
    for (const item of daftarBukti) {
      const kartu = el('div', { class: 'bukti-item' })
      try {
        const src = await urlBukti(item.path)
        if (src) {
          kartu.append(el('img', { class: 'bukti-gambar', src,
                                    alt: 'Bukti ' + tugas.kode }))
        }
      } catch {}
      if (!terkunci) {
        kartu.append(el('button', { class: 'bukti-hapus', title: 'Hapus bukti',
          onClick: () => hapusBukti(item) }, '✕'))
      }
      pratinjau.append(kartu)
    }
  }

  /* ---- Status ---- */
  const lencana = el('span', { class: 'lencana lencana-' + status }, LABEL[status])

  async function setStatus(baru) {
    if (baru === status) { tutup(); return }

    // #4: Tandai selesai → konfirmasi + kunci. Setelah dikunci, murid tak
    // bisa mengubah lagi; hanya guru yang bisa membuka.
    if (baru === 'selesai') {
      const ya = await konfirmasi({
        judul: 'Tandai selesai & kunci?',
        pesan: 'Setelah ditandai selesai, tugas ini akan DIKUNCI: kamu tidak bisa ' +
               'menggesernya lagi atau mengubah isian/tabelnya. Hanya gurumu yang bisa ' +
               'membuka kunci bila ada yang perlu diperbaiki. Lanjutkan?',
        tombol: 'Ya, selesai & kunci', bahaya: false,
      })
      if (!ya) return
    }

    const sebelum = status
    status = baru
    lencana.className = 'lencana lencana-' + baru
    lencana.textContent = LABEL[baru]

    try {
      if (baru !== 'dikerjakan' && timerAktif() === tugas.id) await hentikanTimer()

      if (baru === 'selesai') {
        // Pakai RPC yang sekaligus mengunci.
        const { error } = await sb.rpc('selesaikan_tugas', {
          p_penugasan: keadaan.penugasan.id, p_tugas: tugas.id,
        })
        if (error) throw error
        if (tugas.xp > 0) roti(`${tugas.kode} selesai — +${tugas.xp} XP · terkunci`)
      } else {
        const p = await ubahStatus(keadaan.penugasan.id, keadaan.profil.id, tugas.id, baru)
        tugas.progres = p
      }
      tutup()
      saatBerubah?.()
    } catch (err) {
      status = sebelum
      lencana.className = 'lencana lencana-' + sebelum
      lencana.textContent = LABEL[sebelum]
      roti(pesanGalat(err), '⚠')
    }
  }

  /* ---- Tabel lembar kerja terkait (bila tugas menyebutkannya) ---- */
  const wadahLembar = el('div', {})
  muatLembarTiket()

  async function muatLembarTiket() {
    // lembar_kode bisa berisi beberapa kode (mis. "C1,C2,C3"). Di KARTU hanya
    // tabel PERTAMA yang ditampilkan & bisa diisi; sisanya muncul di halaman
    // Lembar (ikut terbuka saat timer tugas ini berjalan).
    const kode = String(tugas.lembar_kode ?? '').split(/[,;]/)[0]?.trim()
    const tpId = keadaan.penugasan?.tujuan_pembelajaran?.id
    const penId = keadaan.penugasan?.id
    if (!kode || !tpId || !penId) return   // tugas ini tak punya tabel

    isi(wadahLembar,
      el('div', { class: 'bagian-judul' }, `Tabel ${kode} — isi di sini`),
      el('div', { class: 'muat-kecil' }, 'Memuat tabel…'))

    try {
      const lembar = await muatLembarSatu(tpId, penId, kode)
      if (!lembar) {
        isi(wadahLembar,
          el('div', { class: 'bagian-judul' }, `Tabel ${kode}`),
          el('div', { class: 'pesan pesan-info' },
            `Tabel ${kode} belum dibuat gurumu untuk tugas ini. Kamu tetap bisa ` +
            'mengerjakan bagian lain; sampaikan ke gurumu bila tabelnya diperlukan.'))
        return
      }
      const tabelEl = buatTabelIsi(lembar, {
        penugasanId: penId, muridId: keadaan.profil.id,
        el, $, $$, LK, roti, pesanGalat,
        bacaSaja: tugas.progres?.terkunci === true,
      })
      // Simpan API agar bisa dikunci/dibuka mengikuti timer (poin 4).
      tabelIsiApi = tabelEl
      isi(wadahLembar,
        el('div', { class: 'bagian-judul' }, `Tabel ${lembar.kode} — ${lembar.judul}`),
        lembar.keterangan
          ? el('p', { gaya: { fontSize: '13px', color: 'var(--tinta-lembut)', margin: '0 0 8px' } }, lembar.keterangan)
          : null,
        tabelEl)
      // Terapkan status awal (terkunci bila timer belum jalan).
      if (!terkunci) tabelIsiApi.setBacaSaja(!sedangKerja())
    } catch (err) {
      isi(wadahLembar, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
    }
  }

  /* ---- Susun dialog ---- */
  const nilaiHuruf = pr.nilai_huruf
  const umpanGuru = pr.umpan_balik
  const LABEL_HURUF = { A: 'Sempurna', B: 'Bagus', C: 'Cukup', D: 'Kurang', E: 'Tidak lulus' }

  const badan = el('div', {},
    // Poin 5: umpan balik & nilai dari guru terlihat oleh murid.
    (nilaiHuruf || umpanGuru) && el('div', { class: 'umpan-guru' },
      el('div', { class: 'umpan-guru-kepala' },
        el('span', {}, '💬 Dari gurumu'),
        nilaiHuruf && el('span', { class: 'lencana-nilai nilai-' + nilaiHuruf },
          `Nilai ${nilaiHuruf}` + (LABEL_HURUF[nilaiHuruf] ? ` · ${LABEL_HURUF[nilaiHuruf]}` : ''))),
      umpanGuru
        ? el('div', { class: 'umpan-guru-isi' }, umpanGuru)
        : el('div', { class: 'umpan-guru-isi', gaya: { fontStyle: 'italic', color: 'var(--tinta-lembut)' } },
            'Tidak ada catatan tambahan.')),

    el('dl', { class: 'dl' },
      el('dt', {}, 'Status'), el('dd', {}, lencana),
      el('dt', {}, 'Estimasi'), el('dd', {}, tugas.estimasi_menit ? `${tugas.estimasi_menit} menit` : '—'),
      el('dt', {}, 'Nilai'), el('dd', {}, `+${tugas.xp} XP` + (tugas.level ? ` · Tantangan Level ${tugas.level}` : '')),
      tugas.bukti_diminta && [el('dt', {}, 'Bukti'), el('dd', {}, tugas.bukti_diminta)],
    ),

    tugas.deskripsi && [
      el('div', { class: 'bagian-judul' }, 'Deskripsi tugas'),
      el('div', { class: 'teks-format', gaya: { fontSize: '14px', lineHeight: '1.6' },
        html: teksKeHtml(tugas.deskripsi) }),
    ],

    // Pelacak waktu DIPINDAH KE ATAS: murid menekan "Mulai" dulu, baru isian
    // di bawahnya aktif (poin 4). Urutan ini lebih natural.
    tugas.estimasi_menit > 0 && [
      el('div', { class: 'bagian-judul' }, 'Pelacak waktu'),
      el('div', { class: 'waktu-kotak' },
        angkaWaktu,
        el('div', { class: 'waktu-ket' },
          `Estimasi ${tugas.estimasi_menit}′`, el('br'),
          el('span', { gaya: { color: 'var(--tinta-lembut)' } },
            est && detik > est
              ? 'Melewati estimasi — catat kendalanya'
              : 'Tekan mulai saat kamu mengerjakan')),
        el('div', { class: 'waktu-tbl' }, tblTimer),
      ),
    ],

    // Petunjuk: isian aktif hanya saat timer berjalan (poin 4).
    !terkunci && (petunjukKerja = el('div', {
      class: belumMulai ? 'pesan pesan-galat' : 'pesan pesan-info',
      gaya: { display: (!belumMulai && timerAktif() === tugas.id) ? 'none' : '' } },
      belumMulai
        ? '🔒 Belum waktunya. Penugasan ini baru bisa dikerjakan mulai ' +
          tanggalId(keadaan.penugasan.mulai, true) + '.'
        : '⏱ Tekan “Mulai” pada pelacak waktu untuk mulai mengisi tabel, catatan, dan bukti. ' +
          'Saat timer dijeda, isian terkunci lagi.')),

    // Tabel yang harus diisi untuk tugas ini (bila ada kaitannya).
    wadahLembar,

    el('div', { class: 'bagian-judul' }, 'Catatan kerja & kendala'),
    el('div', { class: 'ruas' }, catatan, tandaCat),

    el('div', { class: 'bagian-judul' }, 'Bukti pengerjaan'),
    kotakUnggah, berkasInput, pratinjau,
  )

  const kaki = terkunci
    ? [el('div', { gaya: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                           fontSize: '13px', color: 'var(--tinta-lembut)' } },
        el('span', {}, '🔒'),
        el('span', {}, tugas.progres?.nilai_huruf
          ? `Sudah dinilai ${tugas.progres.nilai_huruf} & dikunci. Hubungi gurumu bila perlu diperbaiki.`
          : 'Tugas ini terkunci. Hanya gurumu yang bisa membukanya.'),
        el('button', { class: 'tbl tbl-kecil', gaya: { marginLeft: 'auto' }, onClick: () => tutup() }, 'Tutup'))]
    : [
        el('button', { class: 'tbl tbl-kecil', onClick: () => setStatus('backlog') }, 'Backlog'),
        el('button', { class: 'tbl tbl-kecil', onClick: () => setStatus('dikerjakan') }, 'Dikerjakan'),
        // "Minta review" adalah aksi UTAMA (agar dapat nilai) → hijau/menonjol.
        el('button', { class: 'tbl tbl-utama', gaya: { marginLeft: 'auto' },
                       onClick: () => setStatus('review') }, 'Minta review'),
        // "Tandai selesai" mengunci tugas → merah (hati-hati).
        el('button', { class: 'tbl tbl-kecil tbl-bahaya',
                       onClick: () => setStatus('selesai') }, 'Tandai selesai'),
      ]

  tutup = dialog({ judul: `${tugas.kode} — ${tugas.judul}`, badan, kaki, lebar: '640px',
    bisaTutup: async () => {
      // Pastikan isian tabel benar-benar tersimpan sebelum menutup.
      if (tabelIsiApi?.adaTertunda && tabelIsiApi.adaTertunda()) {
        roti('Menyimpan isian tabel dulu…', '⏳')
        let ok = false
        try { ok = await tabelIsiApi.flush() } catch (_) { ok = false }
        if (!ok) {
          const paksa = await konfirmasi({
            judul: 'Isian belum tersimpan',
            pesan: 'Sebagian isian tabel belum berhasil tersimpan (mungkin karena ' +
                   'koneksi lambat). Kalau ditutup sekarang, isian terakhir bisa hilang. ' +
                   'Tetap tutup?',
            tombol: 'Tetap tutup', bahaya: true,
          })
          return paksa
        }
      }
      return true
    },
  })

  // Cek apakah sprint tugas ini sudah lewat tenggat (kunci server).
  ;(async () => {
    if (terkunci) return
    try {
      const { data } = await sb.rpc('tugas_sprint_terkunci', {
        p_penugasan: keadaan.penugasan.id, p_tugas: tugas.id,
      })
      if (data === true) {
        sprintLewat = true
        tblTimer.disabled = true
        tblTimer.textContent = '🔒 Tenggat lewat'
        if (petunjukKerja) {
          petunjukKerja.className = 'pesan pesan-galat'
          petunjukKerja.style.display = ''
          petunjukKerja.textContent = '🔒 Tenggat sprint sudah lewat. Tugas ini tidak bisa dikerjakan lagi. ' +
            'Hubungi gurumu bila perlu susulan.'
        }
        // Kunci juga isian tabel bila sudah termuat.
        if (tabelIsiApi?.setBacaSaja) tabelIsiApi.setBacaSaja(true)
      }
    } catch (_) {}
  })()

  // Muat semua bukti yang sudah ada
  ;(async () => {
    if (!pr.id) return
    try {
      const { data } = await sb.from('lampiran').select('id, nama_asli, path')
        .eq('progres_tugas_id', pr.id).order('id', { ascending: true })
      daftarBukti = data ?? []
      perbaruiKotakBukti()
      gambarGaleri()
    } catch {}
  })()

  return tutup
}

/* ==========================================================
   Mengecilkan gambar sebelum diunggah
   ----------------------------------------------------------
   Ini yang menjaga kuota Storage tetap aman. Tanpa pengecilan,
   384 murid × 10 tangkapan layar bisa mencapai 1,1 GB — melebihi
   batas gratis Supabase. Setelah dikecilkan, biasanya di bawah 200 KB
   per gambar dan tetap terbaca jelas.
   ========================================================== */
export function kecilkanGambar(berkas, maksSisi = 1400, mutu = 0.72) {
  return new Promise((selesai, gagal) => {
    const url = URL.createObjectURL(berkas)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width: w, height: h } = img
      if (w > maksSisi || h > maksSisi) {
        const skala = maksSisi / Math.max(w, h)
        w = Math.round(w * skala)
        h = Math.round(h * skala)
      }

      const kanvas = document.createElement('canvas')
      kanvas.width = w; kanvas.height = h

      const ctx = kanvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)

      kanvas.toBlob(
        (b) => b ? selesai(b) : gagal(new Error('Gagal mengecilkan gambar')),
        'image/jpeg', mutu,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Berkas bukan gambar yang bisa dibaca')) }
    img.src = url
  })
}

/**
 * Sidik gambar (perceptual hash / average-hash 16x16 = 256 bit).
 * Gambar diperkecil ke 16x16 abu-abu, lalu tiap piksel ditandai 1 bila di atas
 * rata-rata. Gambar identik/mirip menghasilkan hash sama/berdekatan (jarak
 * Hamming kecil). Dikembalikan sebagai string hex 64 karakter.
 */
export function sidikGambar(berkas) {
  return new Promise((selesai) => {
    try {
      const url = URL.createObjectURL(berkas)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const N = 16
        const k = document.createElement('canvas')
        k.width = N; k.height = N
        const ctx = k.getContext('2d')
        ctx.drawImage(img, 0, 0, N, N)
        const d = ctx.getImageData(0, 0, N, N).data
        const abu = new Array(N * N)
        let jml = 0
        for (let i = 0; i < N * N; i++) {
          const r = d[i*4], g = d[i*4+1], b = d[i*4+2]
          const v = 0.299*r + 0.587*g + 0.114*b
          abu[i] = v; jml += v
        }
        const rata = jml / (N * N)
        // Rakit bit menjadi hex.
        let hex = ''
        for (let i = 0; i < N * N; i += 4) {
          let nib = 0
          for (let j = 0; j < 4; j++) if (abu[i + j] > rata) nib |= (1 << (3 - j))
          hex += nib.toString(16)
        }
        selesai(hex)
      }
      img.onerror = () => { URL.revokeObjectURL(url); selesai(null) }
      img.src = url
    } catch (_) { selesai(null) }
  })
}

/** Jarak Hamming antara dua sidik hex (jumlah bit berbeda). 0 = identik. */
export function jarakSidik(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) { d += x & 1; x >>= 1 }
  }
  return d
}
