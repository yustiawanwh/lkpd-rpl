/**
 * Panel pengaturan & admin — mengganti kebutuhan menjalankan SQL.
 *
 * Berisi:
 *   - Tahun ajaran (tambah, aktifkan, hapus)
 *   - Mata pelajaran (tambah, ubah, hapus)
 *   - Pengguna (angkat guru/admin, nonaktifkan) — khusus admin
 *
 * Seluruh tindakan tetap tunduk pada RLS. Halaman ini hanya memudahkan;
 * andai ada yang mencoba menyalahgunakannya, basis data tetap menolak.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, dialog, konfirmasi, inisial, tanggalId, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import { keadaan, pergiKe } from '../main.js'

/* ==========================================================
   PENGATURAN — tahun ajaran & mata pelajaran
   ========================================================== */
export async function halamanPengaturan(wadah) {
  isi(wadah, el('div', { class: 'tumpuk' }, rangkaMuat('160px'), rangkaMuat('160px')))

  let tahun, mapel, bobot
  try {
    const [rt, rm, rb] = await Promise.all([
      sb.from('tahun_ajaran').select('*').order('nama', { ascending: false }),
      sb.from('mata_pelajaran').select('*').order('tingkat').order('nama'),
      sb.from('pengaturan').select('nilai').eq('kunci', 'bobot_nilai').maybeSingle(),
    ])
    if (rt.error) throw rt.error
    if (rm.error) throw rm.error
    tahun = rt.data; mapel = rm.data
    bobot = rb.data?.nilai ?? null
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
    return
  }

  const adminSaja = keadaan.profil.peran === 'admin'

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Pengaturan Sekolah'),
        el('p', {}, 'Data dasar yang dibutuhkan sebelum membuat kelas. Cukup diisi sekali di awal.'),
      ),
    ),

    // ---- Tahun ajaran ----
    el('div', { class: 'panel', gaya: { marginBottom: '14px' } },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, 'Tahun Ajaran'),
        adminSaja && el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
          onClick: () => dialogTahun(wadah) }, '+ Tambah'),
      ),
      tahun.length
        ? el('div', {}, ...tahun.map(t => barisTahun(t, adminSaja, wadah)))
        : el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada tahun ajaran'),
            el('p', {}, 'Tambahkan tahun ajaran pertama, mis. 2026/2027.'),
            adminSaja && el('button', { class: 'tbl tbl-utama', onClick: () => dialogTahun(wadah) }, '+ Tambah tahun ajaran')),
    ),

    // ---- Mata pelajaran ----
    el('div', { class: 'panel' },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, 'Mata Pelajaran'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
          onClick: () => dialogMapel(wadah) }, '+ Tambah'),
      ),
      mapel.length
        ? el('div', { class: 'tabel-bungkus' },
            el('table', { class: 'data', gaya: { minWidth: '520px' } },
              el('thead', {}, el('tr', {},
                el('th', {}, 'Kode'), el('th', {}, 'Nama'), el('th', { class: 'tengah' }, 'Fase'),
                el('th', { class: 'tengah' }, 'Tingkat'), el('th', {}, ''))),
              el('tbody', {}, ...mapel.map(m => el('tr', {},
                el('td', { class: 'mono' }, m.kode),
                el('td', { class: 'utama' }, m.nama),
                el('td', { class: 'tengah lembut' }, m.fase ?? '—'),
                el('td', { class: 'tengah lembut' }, m.tingkat ?? '—'),
                el('td', { class: 'aksi' },
                  el('div', {},
                    el('button', { class: 'tbl tbl-kecil', onClick: () => dialogMapel(wadah, m) }, 'Ubah'),
                    el('button', { class: 'tbl tbl-kecil tbl-bahaya',
                      onClick: () => hapusMapel(m, wadah) }, 'Hapus'),
                  )),
              ))),
            ))
        : el('div', { class: 'kosong' },
            el('h3', {}, 'Belum ada mata pelajaran'),
            el('p', {}, 'Tambahkan mapel, mis. RPL Kelas XII.'),
            el('button', { class: 'tbl tbl-utama', onClick: () => dialogMapel(wadah) }, '+ Tambah mata pelajaran')),
    ),

    !adminSaja && el('p', { gaya: { marginTop: '12px', fontSize: '12.5px', color: 'var(--tinta-lembut)' } },
      'Catatan: menambah atau mengubah tahun ajaran hanya bisa dilakukan admin.'),

    // ---- Pengaturan Nilai ----
    panelNilai(bobot, adminSaja, wadah),
  )
}

// Nilai bawaan bila belum ada di basis data.
const NILAI_BAWAAN = {
  review: 65, badge: 20, kecepatan: 15,
  huruf: { A: 100, B: 85, C: 75, D: 60, E: 40 },
  poin_per_badge: 10, penalti_telat_per_jam: 2, penalti_telat_maks: 40,
  // KKM & ambang warna predikat pada kartu murid.
  kkm: 75,            // di bawah ini = belum lulus (merah)
  ambang_hijau: 85,   // di atas/sama dengan ini = sangat baik (hijau)
}

function bobotLengkap(b) {
  const x = { ...NILAI_BAWAAN, ...(b ?? {}) }
  x.huruf = { ...NILAI_BAWAAN.huruf, ...(b?.huruf ?? {}) }
  return x
}

function panelNilai(bobot, adminSaja, wadah) {
  const b = bobotLengkap(bobot)
  const totalBobot = b.review + b.badge + b.kecepatan

  return el('div', { class: 'panel', gaya: { marginTop: '14px' } },
    el('div', { class: 'panel-kepala' },
      el('h2', {}, 'Pengaturan Nilai'),
      adminSaja && el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
        onClick: () => dialogNilai(b, wadah) }, 'Ubah'),
    ),
    el('div', { class: 'panel-isi' },
      el('p', { gaya: { margin: '0 0 14px', fontSize: '13px', color: 'var(--tinta-lembut)', lineHeight: '1.55' } },
        'Nilai akhir tiap sprint/LKPD adalah gabungan berbobot dari review guru, badge, ' +
        'dan kecepatan pengumpulan (maksimal 100). Berlaku untuk semua kelas.'),

      el('div', { class: 'kisi-nilai' },
        kotakNilai('Bobot Review', `${b.review}%`, 'dari nilai akhir'),
        kotakNilai('Bobot Badge', `${b.badge}%`, 'dari nilai akhir'),
        kotakNilai('Bobot Kecepatan', `${b.kecepatan}%`, 'dari nilai akhir'),
      ),
      totalBobot !== 100 && el('div', { class: 'pesan pesan-info', gaya: { marginTop: '10px' } },
        `Total bobot saat ini ${totalBobot}% (bukan 100%). Sistem tetap menormalkannya, ` +
        'tetapi sebaiknya dibuat pas 100% agar mudah dibaca.'),

      el('div', { class: 'bagian-judul', gaya: { marginTop: '16px' } }, 'Konversi nilai huruf'),
      el('div', { class: 'kisi-huruf' },
        ...['A','B','C','D','E'].map(h =>
          el('div', { class: 'kotak-huruf nilai-' + h },
            el('div', { class: 'huruf-besar' }, h),
            el('div', { class: 'huruf-angka' }, String(b.huruf[h]))))),

      el('div', { class: 'bagian-judul', gaya: { marginTop: '16px' } }, 'Parameter kecepatan'),
      el('div', { gaya: { fontSize: '13px', color: 'var(--tinta)', lineHeight: '1.7' } },
        el('div', {}, `Tiap badge menyumbang: ${b.poin_per_badge} poin`),
        el('div', {}, `Penalti keterlambatan: ${b.penalti_telat_per_jam} poin/jam`),
        el('div', {}, `Batas maksimal penalti: ${b.penalti_telat_maks} poin`)),

      el('div', { class: 'bagian-judul', gaya: { marginTop: '16px' } }, 'KKM & warna predikat'),
      el('div', { gaya: { fontSize: '13px', color: 'var(--tinta)', lineHeight: '1.7' } },
        el('div', {}, `KKM (batas lulus): ${b.kkm}`),
        el('div', {},
          el('span', { class: 'titik-warna merah' }), ` Belum lulus: nilai < ${b.kkm}`),
        el('div', {},
          el('span', { class: 'titik-warna kuning' }), ` Lulus: ${b.kkm} – ${b.ambang_hijau - 1}`),
        el('div', {},
          el('span', { class: 'titik-warna hijau' }), ` Sangat baik: ≥ ${b.ambang_hijau}`)),

      !adminSaja && el('p', { gaya: { marginTop: '12px', fontSize: '12.5px', color: 'var(--tinta-lembut)' } },
        'Hanya admin yang bisa mengubah pengaturan nilai.'),
    ),
  )
}

function kotakNilai(judul, angka, ket) {
  return el('div', { class: 'kotak-nilai' },
    el('div', { class: 'kotak-nilai-judul' }, judul),
    el('div', { class: 'kotak-nilai-angka' }, angka),
    el('div', { class: 'kotak-nilai-ket' }, ket))
}

function dialogNilai(b, wadah) {
  const fReview = el('input', { type: 'number', min: '0', max: '100', value: String(b.review) })
  const fBadge = el('input', { type: 'number', min: '0', max: '100', value: String(b.badge) })
  const fKecepatan = el('input', { type: 'number', min: '0', max: '100', value: String(b.kecepatan) })
  const fHuruf = {}
  for (const h of ['A','B','C','D','E']) {
    fHuruf[h] = el('input', { type: 'number', min: '0', max: '100', value: String(b.huruf[h]) })
  }
  const fBadgePoin = el('input', { type: 'number', min: '0', max: '100', value: String(b.poin_per_badge) })
  const fPenaltiJam = el('input', { type: 'number', min: '0', max: '100', value: String(b.penalti_telat_per_jam) })
  const fPenaltiMaks = el('input', { type: 'number', min: '0', max: '100', value: String(b.penalti_telat_maks) })
  const fKkm = el('input', { type: 'number', min: '0', max: '100', value: String(b.kkm) })
  const fAmbangHijau = el('input', { type: 'number', min: '0', max: '100', value: String(b.ambang_hijau) })

  const totalTanda = el('span', { class: 'mono', gaya: { fontWeight: '700' } })
  function perbaruiTotal() {
    const t = (+fReview.value || 0) + (+fBadge.value || 0) + (+fKecepatan.value || 0)
    totalTanda.textContent = t + '%'
    totalTanda.style.color = t === 100 ? 'var(--hijau-terang)' : 'var(--kuning, #8a6a2f)'
  }
  ;[fReview, fBadge, fKecepatan].forEach(f => f.addEventListener('input', perbaruiTotal))

  const galat = el('div')
  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

  async function kirim() {
    const nilai = {
      review: +fReview.value || 0, badge: +fBadge.value || 0, kecepatan: +fKecepatan.value || 0,
      huruf: Object.fromEntries(['A','B','C','D','E'].map(h => [h, +fHuruf[h].value || 0])),
      poin_per_badge: +fBadgePoin.value || 0,
      penalti_telat_per_jam: +fPenaltiJam.value || 0,
      penalti_telat_maks: +fPenaltiMaks.value || 0,
      kkm: +fKkm.value || 0,
      ambang_hijau: +fAmbangHijau.value || 0,
    }
    simpan.disabled = true; isi(galat)
    try {
      const { error } = await sb.from('pengaturan')
        .upsert({ kunci: 'bobot_nilai', nilai, diubah_pada: new Date().toISOString() },
                { onConflict: 'kunci' })
      if (error) throw error
      tutup(); roti('Pengaturan nilai disimpan'); halamanPengaturan(wadah)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  const ruasHuruf = el('div', { class: 'kisi-huruf-input' },
    ...['A','B','C','D','E'].map(h =>
      el('div', { class: 'ruas' },
        el('label', {}, `Huruf ${h}`), fHuruf[h])))

  perbaruiTotal()
  tutup = dialog({
    judul: 'Ubah Pengaturan Nilai',
    badan: el('div', {}, galat,
      el('div', { class: 'bagian-judul' }, 'Bobot komponen (idealnya total 100%)'),
      el('div', { class: 'kisi-3' },
        el('div', { class: 'ruas' }, el('label', {}, 'Review (%)'), fReview),
        el('div', { class: 'ruas' }, el('label', {}, 'Badge (%)'), fBadge),
        el('div', { class: 'ruas' }, el('label', {}, 'Kecepatan (%)'), fKecepatan)),
      el('div', { gaya: { fontSize: '13px', marginTop: '4px' } }, 'Total: ', totalTanda),

      el('div', { class: 'bagian-judul', gaya: { marginTop: '14px' } }, 'Konversi nilai huruf (0–100)'),
      ruasHuruf,

      el('div', { class: 'bagian-judul', gaya: { marginTop: '14px' } }, 'Parameter kecepatan'),
      el('div', { class: 'kisi-3' },
        el('div', { class: 'ruas' }, el('label', {}, 'Poin/badge'), fBadgePoin),
        el('div', { class: 'ruas' }, el('label', {}, 'Penalti/jam telat'), fPenaltiJam),
        el('div', { class: 'ruas' }, el('label', {}, 'Maks penalti'), fPenaltiMaks)),

      el('div', { class: 'bagian-judul', gaya: { marginTop: '14px' } }, 'KKM & warna predikat'),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'KKM (batas lulus)'), fKkm),
        el('div', { class: 'ruas' }, el('label', {}, 'Ambang hijau (sangat baik)'), fAmbangHijau)),
      el('p', { gaya: { margin: '4px 0 0', fontSize: '12px', color: 'var(--tinta-lembut)', lineHeight: '1.5' } },
        'Merah bila nilai di bawah KKM, kuning-kehijauan bila lulus (KKM sampai ambang hijau − 1), ' +
        'dan hijau bila nilai ≥ ambang hijau.'),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '540px',
  })
}

function barisTahun(t, bolehUbah, wadah) {
  return el('div', { gaya: { padding: '11px 15px', borderBottom: '1px solid var(--garis)',
                             display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
    el('div', { gaya: { flex: '1', minWidth: '160px' } },
      el('div', { gaya: { fontWeight: '600', fontSize: '15px' } }, t.nama),
      el('div', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)' } },
        `${tanggalId(t.mulai)} – ${tanggalId(t.selesai)}`),
    ),
    t.aktif
      ? el('span', { class: 'lencana lencana-selesai' }, 'Aktif')
      : bolehUbah && el('button', { class: 'tbl tbl-kecil', onClick: () => aktifkanTahun(t, wadah) }, 'Jadikan aktif'),
    bolehUbah && el('button', { class: 'tbl tbl-kecil tbl-bahaya', onClick: () => hapusTahun(t, wadah) }, 'Hapus'),
  )
}

function dialogTahun(wadah) {
  const th = new Date().getFullYear()
  const fNama = el('input', { type: 'text', placeholder: `${th}/${th + 1}`, value: `${th}/${th + 1}` })
  const fMulai = el('input', { type: 'date', value: `${th}-07-01` })
  const fSelesai = el('input', { type: 'date', value: `${th + 1}-06-30` })
  const fAktif = el('input', { type: 'checkbox', checked: true })
  const galat = el('div')

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

  async function kirim() {
    if (!fNama.value.trim()) { fNama.focus(); return }
    simpan.disabled = true; simpan.textContent = 'Menyimpan…'; isi(galat)
    try {
      // Bila ditandai aktif, nonaktifkan yang lain dulu
      if (fAktif.checked) {
        await sb.from('tahun_ajaran').update({ aktif: false }).eq('aktif', true)
      }
      const { error } = await sb.from('tahun_ajaran').insert({
        nama: fNama.value.trim(), mulai: fMulai.value, selesai: fSelesai.value, aktif: fAktif.checked,
      })
      if (error) throw error
      tutup(); roti('Tahun ajaran ditambahkan'); halamanPengaturan(wadah)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
      simpan.disabled = false; simpan.textContent = 'Simpan'
    }
  }

  tutup = dialog({
    judul: 'Tahun ajaran baru',
    badan: el('div', {}, galat,
      el('div', { class: 'ruas' }, el('label', {}, 'Nama'), fNama),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Mulai'), fMulai),
        el('div', { class: 'ruas' }, el('label', {}, 'Selesai'), fSelesai)),
      el('label', { gaya: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', cursor: 'pointer' } },
        fAktif, 'Jadikan tahun ajaran aktif'),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '460px',
  })
}

async function aktifkanTahun(t, wadah) {
  try {
    await sb.from('tahun_ajaran').update({ aktif: false }).eq('aktif', true)
    const { error } = await sb.from('tahun_ajaran').update({ aktif: true }).eq('id', t.id)
    if (error) throw error
    roti(`${t.nama} kini aktif`); halamanPengaturan(wadah)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}

async function hapusTahun(t, wadah) {
  const ya = await konfirmasi({
    judul: 'Hapus tahun ajaran?',
    pesan: `Tahun ajaran "${t.nama}" akan dihapus. Ini tidak bisa dilakukan bila sudah ada kelas yang memakainya.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('tahun_ajaran').delete().eq('id', t.id)
    if (error) throw error
    roti('Tahun ajaran dihapus'); halamanPengaturan(wadah)
  } catch (err) {
    roti(err.code === '23503' ? 'Tidak bisa dihapus — masih ada kelas yang memakai tahun ajaran ini.' : pesanGalat(err), '⚠')
  }
}

function dialogMapel(wadah, m = null) {
  const fKode = el('input', { type: 'text', placeholder: 'RPL-XII', value: m?.kode ?? '' })
  const fNama = el('input', { type: 'text', placeholder: 'Rekayasa Perangkat Lunak', value: m?.nama ?? '' })
  const fFase = el('select', {}, ...['', 'E', 'F'].map(f =>
    el('option', { value: f, selected: (m?.fase ?? '') === f }, f || '—')))
  const fTingkat = el('input', { type: 'number', min: '1', max: '13', placeholder: '12', value: m?.tingkat ?? '' })
  const galat = el('div')

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

  async function kirim() {
    if (!fKode.value.trim() || !fNama.value.trim()) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Kode dan nama wajib diisi.')); return
    }
    simpan.disabled = true; simpan.textContent = 'Menyimpan…'; isi(galat)
    const data = {
      kode: fKode.value.trim(), nama: fNama.value.trim(),
      fase: fFase.value || null, tingkat: fTingkat.value ? Number(fTingkat.value) : null,
    }
    try {
      const { error } = m
        ? await sb.from('mata_pelajaran').update(data).eq('id', m.id)
        : await sb.from('mata_pelajaran').insert(data)
      if (error) {
        if (error.code === '23505') throw new Error('Kode mata pelajaran ini sudah dipakai.')
        throw error
      }
      tutup(); roti(m ? 'Mata pelajaran diperbarui' : 'Mata pelajaran ditambahkan'); halamanPengaturan(wadah)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
      simpan.disabled = false; simpan.textContent = 'Simpan'
    }
  }

  tutup = dialog({
    judul: m ? 'Ubah mata pelajaran' : 'Mata pelajaran baru',
    badan: el('div', {}, galat,
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Kode'), fKode),
        el('div', { class: 'ruas' }, el('label', {}, 'Tingkat'), fTingkat)),
      el('div', { class: 'ruas' }, el('label', {}, 'Nama'), fNama),
      el('div', { class: 'ruas' }, el('label', {}, 'Fase'), fFase),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '460px',
  })
}

async function hapusMapel(m, wadah) {
  const ya = await konfirmasi({
    judul: 'Hapus mata pelajaran?',
    pesan: `"${m.nama}" akan dihapus. Tidak bisa bila masih ada kelas atau TP yang memakainya.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('mata_pelajaran').delete().eq('id', m.id)
    if (error) throw error
    roti('Mata pelajaran dihapus'); halamanPengaturan(wadah)
  } catch (err) {
    roti(err.code === '23503' ? 'Tidak bisa dihapus — masih dipakai kelas atau TP.' : pesanGalat(err), '⚠')
  }
}

/* ==========================================================
   PENGGUNA — khusus admin
   ========================================================== */
export async function halamanPengguna(wadah) {
  if (keadaan.profil.peran !== 'admin') {
    isi(wadah, el('div', { class: 'panel' }, el('div', { class: 'kosong' },
      el('h3', {}, 'Khusus admin'),
      el('p', {}, 'Hanya admin yang bisa mengelola pengguna.')))); return
  }

  isi(wadah, rangkaMuat('200px'))

  let orang
  try {
    const { data, error } = await sb.from('profil').select('*').order('peran').order('nama')
    if (error) throw error
    orang = data
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  const cari = el('input', { type: 'text', placeholder: 'Cari nama atau email…',
    gaya: { maxWidth: '280px' }, onInput: (e) => saring(e.target.value) })

  function saring(kata) {
    const k = kata.toLowerCase()
    $$('#tbl-orang tbody tr').forEach(tr => {
      tr.style.display = tr.dataset.cari.includes(k) ? '' : 'none'
    })
  }

  const badgePeran = (peran) => {
    const w = { admin: 'lencana-review', guru: 'lencana-dikerjakan', murid: 'lencana-backlog' }[peran]
    return el('span', { class: 'lencana ' + w }, peran)
  }

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Pengguna'),
        el('p', {}, 'Angkat guru atau admin, dan kelola status akun. Menggantikan perintah SQL.'),
      ),
      el('div', { class: 'kepala-kanan' }, cari),
    ),

    el('div', { class: 'panel' },
      el('div', { class: 'tabel-bungkus' },
        el('table', { class: 'data', id: 'tbl-orang', gaya: { minWidth: '760px' } },
          el('thead', {}, el('tr', {},
            el('th', {}, 'Nama'), el('th', {}, 'Email'), el('th', { class: 'tengah' }, 'Peran'),
            el('th', { class: 'tengah' }, 'Status'), el('th', {}, 'Ubah peran'), el('th', {}, 'Aksi'))),
          el('tbody', {}, ...orang.map(o => el('tr', {
            data: { cari: `${o.nama} ${o.email ?? ''}`.toLowerCase() },
          },
            el('td', { class: 'utama' },
              el('span', { gaya: { display: 'flex', gap: '8px', alignItems: 'center' } },
                el('span', { class: 'avatar', gaya: { width: '26px', height: '26px', fontSize: '10px', border: 'none', flexShrink: '0' } },
                  inisial(o.nama)), o.nama)),
            el('td', { class: 'mono lembut' }, o.email ?? '—'),
            el('td', { class: 'tengah' }, badgePeran(o.peran)),
            el('td', { class: 'tengah' }, o.aktif
              ? el('span', { gaya: { color: 'var(--hijau-terang)', fontSize: '12.5px', fontWeight: '600' } }, 'Aktif')
              : el('span', { gaya: { color: 'var(--merah)', fontSize: '12.5px', fontWeight: '600' } }, 'Nonaktif')),
            el('td', {}, gantiPeran(o, wadah)),
            el('td', { class: 'aksi' }, aksiPengguna(o, wadah)),
          ))),
        ),
      ),
    ),

    el('p', { gaya: { marginTop: '12px', fontSize: '12.5px', color: 'var(--tinta-lembut)', lineHeight: '1.55' } },
      'Demi keamanan, kamu tidak bisa menurunkan perananmu sendiri di sini — supaya sekolah tidak pernah kehilangan admin terakhir secara tak sengaja.'),
  )
}

function gantiPeran(o, wadah) {
  const sayaSendiri = o.id === keadaan.profil.id

  const pilih = el('select', {
    disabled: sayaSendiri,
    onChange: async (e) => {
      const baru = e.target.value
      if (baru === o.peran) return
      const ya = await konfirmasi({
        judul: 'Ubah peran?',
        pesan: `Ubah peran ${o.nama} dari "${o.peran}" menjadi "${baru}"?`,
        tombol: 'Ubah',
      })
      if (!ya) { e.target.value = o.peran; return }
      try {
        const { error } = await sb.from('profil').update({ peran: baru }).eq('id', o.id)
        if (error) throw error
        roti(`${o.nama} kini ${baru}`); halamanPengguna(wadah)
      } catch (err) { roti(pesanGalat(err), '⚠'); e.target.value = o.peran }
    },
  }, ...['murid', 'guru', 'admin'].map(r =>
    el('option', { value: r, selected: o.peran === r }, r)))

  if (sayaSendiri) return el('span', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } }, '(diri sendiri)')
  return pilih
}

function aksiPengguna(o, wadah) {
  const sayaSendiri = o.id === keadaan.profil.id
  if (sayaSendiri) {
    // Diri sendiri: hanya boleh edit data, tidak boleh nonaktif/hapus diri.
    return el('button', { class: 'tbl tbl-kecil', onClick: () => dialogEditPengguna(o, wadah) }, 'Edit')
  }
  return el('div', { gaya: { display: 'flex', gap: '5px', flexWrap: 'wrap' } },
    el('button', { class: 'tbl tbl-kecil', onClick: () => dialogEditPengguna(o, wadah) }, 'Edit'),
    el('button', { class: 'tbl tbl-kecil',
      onClick: () => alihAktif(o, wadah) }, o.aktif ? 'Nonaktifkan' : 'Aktifkan'),
    el('button', { class: 'tbl tbl-kecil tbl-bahaya',
      onClick: () => hapusPengguna(o, wadah) }, 'Hapus'),
  )
}

function dialogEditPengguna(o, wadah) {
  const fNama = el('input', { type: 'text', value: o.nama ?? '' })
  const fAbsen = el('input', { type: 'text', value: o.no_absen ?? '', placeholder: '01' })
  const fNis = el('input', { type: 'text', value: o.nis ?? '', placeholder: 'NIS (opsional)' })
  const galat = el('div')
  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

  async function kirim() {
    if (!fNama.value.trim()) { fNama.focus(); return }
    simpan.disabled = true; isi(galat)
    try {
      const { error } = await sb.from('profil').update({
        nama: fNama.value.trim(),
        no_absen: fAbsen.value.trim() || null,
        nis: fNis.value.trim() || null,
      }).eq('id', o.id)
      if (error) throw error
      tutup(); roti('Data pengguna diperbarui'); halamanPengguna(wadah)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  tutup = dialog({
    judul: 'Ubah data pengguna',
    badan: el('div', {}, galat,
      el('div', { class: 'ruas' }, el('label', {}, 'Nama'), fNama),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'No. absen'), fAbsen),
        el('div', { class: 'ruas' }, el('label', {}, 'NIS'), fNis)),
      el('p', { gaya: { margin: 0, fontSize: '12px', color: 'var(--tinta-lembut)' } },
        'Email dan peran diubah lewat kolom lain. Email login tidak bisa diubah dari sini.'),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '460px',
  })
}

async function alihAktif(o, wadah) {
  const jadiNonaktif = o.aktif
  const ya = await konfirmasi({
    judul: jadiNonaktif ? 'Nonaktifkan akun?' : 'Aktifkan kembali?',
    pesan: jadiNonaktif
      ? `${o.nama} tidak akan bisa masuk selama nonaktif. Datanya tetap tersimpan dan bisa diaktifkan lagi kapan saja. Ini cara aman untuk murid yang sudah lulus atau akun yang tak dipakai sementara.`
      : `${o.nama} akan bisa masuk kembali.`,
    tombol: jadiNonaktif ? 'Nonaktifkan' : 'Aktifkan',
    bahaya: jadiNonaktif,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('profil').update({ aktif: !o.aktif }).eq('id', o.id)
    if (error) throw error
    roti(jadiNonaktif ? `${o.nama} dinonaktifkan` : `${o.nama} diaktifkan`)
    halamanPengguna(wadah)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}

async function hapusPengguna(o, wadah) {
  // Penting & jujur: aplikasi hanya bisa menghapus PROFIL, bukan akun login
  // (email + kata sandi ada di Supabase Auth, di luar jangkauan aplikasi).
  let tutup

  async function jalankan() {
    try {
      const { error } = await sb.from('profil').delete().eq('id', o.id)
      if (error) throw error
      tutup(); roti(`Profil ${o.nama} dihapus`); halamanPengguna(wadah)
    } catch (err) {
      roti(err.code === '23503'
        ? 'Tidak bisa dihapus — pengguna ini masih pemilik kelas atau data lain.'
        : pesanGalat(err), '⚠')
    }
  }

  const infoBox = el('div', { class: 'pesan pesan-info', gaya: { marginBottom: '12px' } },
    'Perlu dipahami: tombol ini menghapus PROFIL (nama, peran, progres), tetapi ' +
    'TIDAK menghapus akun login-nya di Supabase. Bila orang itu login lagi, ' +
    'profilnya akan dibuat ulang otomatis.')

  const caraSupabase = el('p', { gaya: { margin: '0 0 10px', fontSize: '13.5px', lineHeight: '1.6' } },
    el('b', {}, 'Untuk benar-benar menghapus akun percobaan'),
    ': hapus lewat dasbor Supabase — menu Authentication, Users, cari emailnya, ' +
    'lalu Delete user. Itu menghapus akun sekaligus profilnya.')

  const konfirm = el('p', { gaya: { margin: 0, fontSize: '13.5px', lineHeight: '1.6', color: 'var(--tinta-lembut)' } },
    `Lanjut menghapus profil ${o.nama} saja dari aplikasi?`)

  tutup = dialog({
    judul: 'Hapus profil pengguna',
    badan: el('div', {}, infoBox, caraSupabase, konfirm),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'),
      el('button', { class: 'tbl tbl-bahaya', onClick: jalankan }, 'Hapus profil'))],
    lebar: '500px',
  })
}
