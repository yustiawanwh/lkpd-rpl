/**
 * Penyunting LKPD — membuat & mengubah Tujuan Pembelajaran beserta
 * sprint, tugas, lembar kerja, dan badge, seluruhnya lewat form.
 *
 * Inilah pengganti utama berkas seed.sql: guru bisa menyusun LKPD baru
 * tanpa menyentuh SQL sama sekali.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, dialog, konfirmasi, rangkaMuat } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import * as LK from '../lib/lembar.js'
import { keadaan, pergiKe } from '../main.js'
import { dialogLembar, dialogBadge } from './kelola-lembar.js'

/* ==========================================================
   DAFTAR LKPD
   ========================================================== */
export async function halamanLkpd(wadah) {
  isi(wadah, rangkaMuat('200px'))

  let mapel, tpList
  try {
    const [rm, rt] = await Promise.all([
      sb.from('mata_pelajaran').select('*').order('nama'),
      sb.from('tujuan_pembelajaran')
        .select('*, mata_pelajaran(nama), sprint(count), penugasan(count)')
        .order('urutan'),
    ])
    if (rm.error) throw rm.error
    if (rt.error) throw rt.error
    mapel = rm.data; tpList = rt.data
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('h1', {}, 'Bank LKPD'),
        el('p', {}, 'Susun Tujuan Pembelajaran beserta isinya. Yang sudah diterbitkan bisa ditugaskan ke kelas.'),
      ),
      el('div', { class: 'kepala-kanan' },
        el('button', { class: 'tbl tbl-utama',
          onClick: () => { if (!mapel.length) { adaMapelDulu(); return } dialogTpBaru(wadah, mapel) } },
          '+ TP baru'),
      ),
    ),

    tpList.length
      ? el('div', { class: 'tumpuk' }, ...tpList.map(tp => el('div', { class: 'panel' },
          el('div', { class: 'panel-isi', gaya: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
            el('div', { gaya: { flex: '1', minWidth: '220px' } },
              el('div', { gaya: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
                el('span', { class: 'mono', gaya: { fontSize: '11px', color: 'var(--tinta-lembut)' } }, tp.kode),
                tp.terbit
                  ? el('span', { class: 'lencana lencana-selesai' }, 'Terbit')
                  : el('span', { class: 'lencana lencana-backlog' }, 'Draf'),
              ),
              el('h2', { gaya: { fontSize: '16px', margin: '3px 0 4px' } }, tp.judul),
              el('div', { gaya: { fontSize: '12.5px', color: 'var(--tinta-lembut)' } },
                [tp.mata_pelajaran?.nama, `${tp.sprint?.[0]?.count ?? 0} sprint`,
                 `${tp.penugasan?.[0]?.count ?? 0} kelas memakai`].filter(Boolean).join(' · ')),
            ),
            el('button', { class: 'tbl tbl-kecil tbl-utama',
              onClick: () => pergiKe(`lkpd/${tp.id}`) }, 'Sunting isi'),
          ),
        )))
      : el('div', { class: 'panel' }, el('div', { class: 'kosong' },
          el('h3', {}, 'Belum ada LKPD'),
          el('p', {}, 'Buat Tujuan Pembelajaran pertama. Setelah diisi dan diterbitkan, TP bisa ditugaskan ke kelas.'),
          el('button', { class: 'tbl tbl-utama',
            onClick: () => { if (!mapel.length) { adaMapelDulu(); return } dialogTpBaru(wadah, mapel) } },
            '+ TP baru'))),
  )
}

function adaMapelDulu() {
  dialog({
    judul: 'Tambahkan mata pelajaran dulu',
    badan: el('p', { gaya: { margin: 0, fontSize: '14px', lineHeight: '1.6' } },
      'Sebuah TP harus menempel pada mata pelajaran. Buka menu Pengaturan dan tambahkan minimal satu mata pelajaran lebih dulu.'),
    kaki: [el('button', { class: 'tbl tbl-utama', gaya: { marginLeft: 'auto' },
      onClick: () => { $('.tirai')?.remove(); document.body.style.overflow=''; pergiKe('pengaturan') } }, 'Ke Pengaturan')],
    lebar: '440px',
  })
}

function dialogTpBaru(wadah, mapel) {
  const fMapel = el('select', {}, ...mapel.map(m =>
    el('option', { value: m.id }, m.nama + (m.tingkat ? ` — Kelas ${m.tingkat}` : ''))))
  const fKode = el('input', { type: 'text', placeholder: 'TP 12.1' })
  const fJudul = el('input', { type: 'text', placeholder: 'Penyiapan Lingkungan Pengembangan…' })
  const fDesk = el('textarea', { rows: '3', placeholder: 'Deskripsi singkat capaian yang diharapkan.' })
  const galat = el('div')

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Buat & sunting')

  async function kirim() {
    if (!fKode.value.trim() || !fJudul.value.trim()) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Kode dan judul wajib diisi.')); return
    }
    simpan.disabled = true; simpan.textContent = 'Menyimpan…'; isi(galat)
    try {
      const { data, error } = await sb.from('tujuan_pembelajaran').insert({
        mata_pelajaran_id: Number(fMapel.value),
        kode: fKode.value.trim(), judul: fJudul.value.trim(),
        deskripsi: fDesk.value.trim() || null,
        dibuat_oleh: keadaan.profil.id, terbit: false,
      }).select().single()
      if (error) {
        if (error.code === '23505') throw new Error('Kode TP ini sudah dipakai pada mata pelajaran tersebut.')
        throw error
      }
      tutup(); roti('TP dibuat'); pergiKe(`lkpd/${data.id}`)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err)))
      simpan.disabled = false; simpan.textContent = 'Buat & sunting'
    }
  }

  tutup = dialog({
    judul: 'Tujuan Pembelajaran baru',
    badan: el('div', {}, galat,
      el('div', { class: 'ruas' }, el('label', {}, 'Mata pelajaran'), fMapel),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Kode'), fKode),
        el('div', {})),
      el('div', { class: 'ruas' }, el('label', {}, 'Judul'), fJudul),
      el('div', { class: 'ruas' }, el('label', {}, 'Deskripsi'), fDesk),
    ),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '520px',
  })
}

/* ==========================================================
   SUNTING SATU LKPD
   ========================================================== */
export async function halamanSuntingLkpd(wadah, tpId) {
  isi(wadah, rangkaMuat('220px'))

  let tp, sprints, lembar, badges
  try {
    const [rtp, rs, rl, rb] = await Promise.all([
      sb.from('tujuan_pembelajaran').select('*, mata_pelajaran(nama)').eq('id', tpId).single(),
      sb.from('sprint').select('*, tugas(*)').eq('tujuan_pembelajaran_id', tpId).order('nomor'),
      sb.from('lembar_kerja').select('*').eq('tujuan_pembelajaran_id', tpId).order('urutan'),
      sb.from('badge').select('*').eq('tujuan_pembelajaran_id', tpId).order('urutan'),
    ])
    if (rtp.error) throw rtp.error
    tp = rtp.data; sprints = rs.data ?? []; lembar = rl.data ?? []; badges = rb.data ?? []
  } catch (err) {
    isi(wadah, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); return
  }

  const totalInti = sprints.reduce((n, s) => n + (s.tugas?.filter(t => t.jenis === 'inti').length ?? 0), 0)
  const totalTantangan = sprints.reduce((n, s) => n + (s.tugas?.filter(t => t.jenis === 'tantangan').length ?? 0), 0)

  isi(wadah,
    el('div', { class: 'kepala' },
      el('div', {},
        el('button', { class: 'tbl tbl-kecil tbl-hantu', gaya: { padding: '2px 0', marginBottom: '4px' },
          onClick: () => pergiKe('lkpd') }, '← Bank LKPD'),
        el('div', { gaya: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          el('span', { class: 'mono', gaya: { fontSize: '11px', color: 'var(--tinta-lembut)' } }, tp.kode),
          tp.terbit ? el('span', { class: 'lencana lencana-selesai' }, 'Terbit')
                    : el('span', { class: 'lencana lencana-backlog' }, 'Draf')),
        el('h1', {}, tp.judul),
        el('p', {}, [tp.mata_pelajaran?.nama, `${totalInti} tugas inti`,
                     `${totalTantangan} tantangan`, `${lembar.length} lembar`, `${badges.length} badge`]
                     .filter(Boolean).join(' · ')),
      ),
      el('div', { class: 'kepala-kanan' },
        el('button', { class: 'tbl', onClick: () => dialogTpUbah(wadah, tp) }, 'Ubah info'),
        tp.terbit
          ? el('button', { class: 'tbl', onClick: () => setTerbit(wadah, tp, false) }, 'Jadikan draf')
          : el('button', { class: 'tbl tbl-utama', onClick: () => setTerbit(wadah, tp, true) }, 'Terbitkan'),
      ),
    ),

    !tp.terbit && el('div', { class: 'pesan pesan-info' },
      'TP ini masih draf, jadi belum bisa ditugaskan ke kelas. Selesaikan menyusun isinya, lalu tekan "Terbitkan".'),

    // ---- Sprint & tugas ----
    el('div', { class: 'panel', gaya: { marginBottom: '14px' } },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, 'Sprint & Tugas'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
          onClick: () => dialogSprint(wadah, tpId, sprints.length + 1) }, '+ Sprint'),
      ),
      el('div', { class: 'panel-isi' },
        sprints.length
          ? el('div', { class: 'tumpuk' }, ...sprints.map(s => kartuSprint(s, wadah, tpId)))
          : el('div', { class: 'kosong', gaya: { padding: '24px' } },
              el('p', {}, 'Belum ada sprint. Tambahkan sprint pertama (mis. "Menyiapkan Lingkungan Kerja").')),
      ),
    ),

    // ---- Lembar kerja ----
    el('div', { class: 'panel', gaya: { marginBottom: '14px' } },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, 'Lembar Kerja (Tabel)'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
          onClick: () => dialogLembar(wadah, tpId, sprints, lembar.length) }, '+ Tabel'),
      ),
      el('div', { class: 'panel-isi' },
        lembar.length
          ? el('div', { class: 'tumpuk' }, ...lembar.map(l => barisLembar(l, wadah, tpId, sprints)))
          : el('div', { class: 'kosong', gaya: { padding: '24px' } },
              el('p', {}, 'Belum ada lembar kerja. Tambahkan tabel isian seperti Tabel A, B, dst.')),
      ),
    ),

    // ---- Badge ----
    el('div', { class: 'panel' },
      el('div', { class: 'panel-kepala' },
        el('h2', {}, 'Badge'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', gaya: { marginLeft: 'auto' },
          onClick: () => dialogBadge(wadah, tpId, sprints, badges.length) }, '+ Badge'),
      ),
      el('div', { class: 'panel-isi' },
        badges.length
          ? el('div', { class: 'badge-kisi' }, ...badges.map(b => el('div', { class: 'badge dapat',
              gaya: { cursor: 'pointer' }, onClick: () => dialogBadge(wadah, tpId, sprints, 0, b) },
              el('div', { class: 'badge-emoji' }, b.emoji ?? '🏅'),
              el('b', {}, b.nama),
              b.xp > 0 && el('span', { class: 'badge-xp' }, `+${b.xp} XP`))))
          : el('div', { class: 'kosong', gaya: { padding: '24px' } },
              el('p', {}, 'Belum ada badge. Badge memberi motivasi lewat pencapaian.')),
      ),
    ),
  )
}

function kartuSprint(s, wadah, tpId) {
  const inti = s.tugas?.filter(t => t.jenis === 'inti') ?? []
  const tantangan = s.tugas?.filter(t => t.jenis === 'tantangan') ?? []
  const menitInti = inti.reduce((n, t) => n + (t.estimasi_menit ?? 0), 0)

  return el('div', { gaya: { border: '1px solid var(--garis)', borderRadius: '8px', overflow: 'hidden' } },
    el('div', { gaya: { padding: '11px 14px', background: 'var(--kertas)', display: 'flex',
                        gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      el('div', { gaya: { flex: '1', minWidth: '180px' } },
        el('div', { gaya: { fontWeight: '600' } }, `Sprint ${s.nomor} — ${s.nama}`),
        el('div', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } },
          [s.hari, s.jp, `${inti.length} inti`, `${tantangan.length} tantangan`,
           menitInti ? `${menitInti}′` : null].filter(Boolean).join(' · ')),
      ),
      el('button', { class: 'tbl tbl-kecil', onClick: () => dialogTugas(wadah, tpId, s) }, '+ Tugas'),
      el('button', { class: 'tbl tbl-kecil', onClick: () => dialogSprint(wadah, tpId, s.nomor, s) }, 'Ubah'),
      el('button', { class: 'tbl tbl-kecil tbl-bahaya', onClick: () => hapusSprint(wadah, tpId, s) }, 'Hapus'),
    ),
    (s.tugas?.length)
      ? el('div', {}, ...s.tugas.sort((a,b)=>a.urutan-b.urutan).map(t => el('div', {
          gaya: { padding: '8px 14px', borderTop: '1px solid var(--garis)', display: 'flex',
                  gap: '10px', alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' },
          onClick: () => dialogTugas(wadah, tpId, s, t),
        },
          el('span', { class: 'mono', gaya: { fontSize: '11px', color: 'var(--tinta-lembut)', minWidth: '96px' } }, t.kode),
          el('span', { gaya: { flex: '1', minWidth: '140px', fontSize: '13.5px' } }, t.judul),
          t.jenis === 'tantangan' && el('span', { class: 'tanda tanda-level' }, `L${t.level ?? '?'}`),
          t.jenis === 'tutor' && el('span', { class: 'tanda tanda-tutor' }, 'TUTOR'),
          t.estimasi_menit > 0 && el('span', { class: 'tanda tanda-menit' }, `${t.estimasi_menit}′`),
          el('span', { class: 'tanda tanda-xp' }, `+${t.xp}`),
        )))
      : el('div', { gaya: { padding: '10px 14px', borderTop: '1px solid var(--garis)',
                            fontSize: '12.5px', color: 'var(--tinta-lembut)' } }, 'Belum ada tugas di sprint ini.'),
  )
}

function barisLembar(l, wadah, tpId, sprints) {
  return el('div', { gaya: { padding: '10px 14px', border: '1px solid var(--garis)', borderRadius: '7px',
                             display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
                             cursor: 'pointer' }, onClick: () => dialogLembar(wadah, tpId, sprints, 0, l) },
    el('span', { class: 'mono', gaya: { fontSize: '12px', fontWeight: '600', minWidth: '40px' } }, l.kode),
    el('span', { gaya: { flex: '1', minWidth: '140px', fontWeight: '600', fontSize: '13.5px' } }, l.judul),
    el('span', { class: 'tanda' }, LK.TIPE[l.tipe]?.split('—')[0]?.trim() ?? l.tipe),
    el('span', { gaya: { fontSize: '12px', color: 'var(--tinta-lembut)' } },
      `${LK.kolom(l).length} kolom · ${LK.jumlahBaris(l)} baris`),
  )
}

/* ---------- Terbit / ubah info ---------- */
async function setTerbit(wadah, tp, terbit) {
  if (terbit) {
    // Cegah menerbitkan TP kosong
    const { count } = await sb.from('sprint').select('id', { count: 'exact', head: true })
      .eq('tujuan_pembelajaran_id', tp.id)
    if (!count) { roti('Tambahkan minimal satu sprint sebelum menerbitkan.', '⚠'); return }
  }
  try {
    const { error } = await sb.from('tujuan_pembelajaran').update({ terbit }).eq('id', tp.id)
    if (error) throw error
    roti(terbit ? 'TP diterbitkan — kini bisa ditugaskan' : 'TP dikembalikan ke draf')
    halamanSuntingLkpd(wadah, tp.id)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}

function dialogTpUbah(wadah, tp) {
  const fKode = el('input', { type: 'text', value: tp.kode })
  const fJudul = el('input', { type: 'text', value: tp.judul })
  const fDesk = el('textarea', { rows: '3' }, tp.deskripsi ?? '')
  const fPetunjuk = el('textarea', { rows: '3' }, tp.petunjuk_umum ?? '')
  const fMateri = el('textarea', { rows: '4' }, tp.materi_awal ?? '')
  const fJp = el('input', { type: 'number', min: '0', value: tp.total_jp ?? '' })
  const galat = el('div')
  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

  async function kirim() {
    simpan.disabled = true; isi(galat)
    try {
      const { error } = await sb.from('tujuan_pembelajaran').update({
        kode: fKode.value.trim(), judul: fJudul.value.trim(),
        deskripsi: fDesk.value.trim() || null,
        petunjuk_umum: fPetunjuk.value.trim() || null,
        materi_awal: fMateri.value.trim() || null,
        total_jp: fJp.value ? Number(fJp.value) : 0,
      }).eq('id', tp.id)
      if (error) throw error
      tutup(); roti('Info TP diperbarui'); halamanSuntingLkpd(wadah, tp.id)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  tutup = dialog({
    judul: 'Ubah info TP',
    badan: el('div', {}, galat,
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Kode'), fKode),
        el('div', { class: 'ruas' }, el('label', {}, 'Total JP'), fJp)),
      el('div', { class: 'ruas' }, el('label', {}, 'Judul'), fJudul),
      el('div', { class: 'ruas' }, el('label', {}, 'Latar belakang / deskripsi'), fDesk),
      el('div', { class: 'ruas' }, el('label', {}, 'Petunjuk pengerjaan'), fPetunjuk),
      el('div', { class: 'ruas' }, el('label', {}, 'Materi awal / bahan bacaan'), fMateri)),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '520px',
  })
}

/* ---------- Sprint ---------- */
function dialogSprint(wadah, tpId, nomorBaru, s = null) {
  const fNomor = el('input', { type: 'number', min: '1', value: s?.nomor ?? nomorBaru })
  const fNama = el('input', { type: 'text', placeholder: 'Menyiapkan Lingkungan Kerja', value: s?.nama ?? '' })
  const fHari = el('input', { type: 'text', placeholder: 'Senin', value: s?.hari ?? '' })
  const fJp = el('input', { type: 'text', placeholder: '8 JP', value: s?.jp ?? '' })
  const fTujuan = el('textarea', { rows: '2', placeholder: 'Tujuan sprint ini.' }, s?.tujuan ?? '')
  const galat = el('div')
  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')

  async function kirim() {
    if (!fNama.value.trim()) { fNama.focus(); return }
    simpan.disabled = true; isi(galat)
    const data = {
      tujuan_pembelajaran_id: tpId, nomor: Number(fNomor.value),
      nama: fNama.value.trim(), hari: fHari.value.trim() || null,
      jp: fJp.value.trim() || null, tujuan: fTujuan.value.trim() || null,
    }
    try {
      const { error } = s
        ? await sb.from('sprint').update(data).eq('id', s.id)
        : await sb.from('sprint').insert(data)
      if (error) {
        if (error.code === '23505') throw new Error('Sudah ada sprint dengan nomor itu pada TP ini.')
        throw error
      }
      tutup(); roti(s ? 'Sprint diperbarui' : 'Sprint ditambahkan'); halamanSuntingLkpd(wadah, tpId)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  tutup = dialog({
    judul: s ? `Ubah Sprint ${s.nomor}` : 'Sprint baru',
    badan: el('div', {}, galat,
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Nomor'), fNomor),
        el('div', { class: 'ruas' }, el('label', {}, 'Hari'), fHari)),
      el('div', { class: 'ruas' }, el('label', {}, 'Nama sprint'), fNama),
      el('div', { class: 'ruas' }, el('label', {}, 'JP (mis. "8 JP")'), fJp),
      el('div', { class: 'ruas' }, el('label', {}, 'Tujuan'), fTujuan)),
    kaki: [el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)],
    lebar: '520px',
  })
}

async function hapusSprint(wadah, tpId, s) {
  const ya = await konfirmasi({
    judul: `Hapus Sprint ${s.nomor}?`,
    pesan: `Sprint "${s.nama}" beserta semua tugasnya akan dihapus. Tidak bisa bila murid sudah mengerjakannya.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('sprint').delete().eq('id', s.id)
    if (error) throw error
    roti('Sprint dihapus'); halamanSuntingLkpd(wadah, tpId)
  } catch (err) {
    roti(err.code === '23503' ? 'Tidak bisa dihapus — sudah ada progres murid pada sprint ini.' : pesanGalat(err), '⚠')
  }
}

/* ---------- Tugas ---------- */
function dialogTugas(wadah, tpId, sprint, t = null) {
  const fKode = el('input', { type: 'text', placeholder: 'RPL-12.1-101', value: t?.kode ?? '' })
  const fJudul = el('input', { type: 'text', placeholder: 'Analisis Komponen', value: t?.judul ?? '' })
  const fJenis = el('select', {}, ...[['inti','Inti'],['tantangan','Tantangan'],['tutor','Tutor sebaya']].map(([v,l]) =>
    el('option', { value: v, selected: (t?.jenis ?? 'inti') === v }, l)))
  const fLevel = el('select', {}, ...[['','—'],['1','Level 1'],['2','Level 2'],['3','Level 3']].map(([v,l]) =>
    el('option', { value: v, selected: String(t?.level ?? '') === v }, l)))
  const fMenit = el('input', { type: 'number', min: '0', placeholder: '50', value: t?.estimasi_menit ?? '' })
  const fXp = el('input', { type: 'number', min: '0', placeholder: '25', value: t?.xp ?? '' })
  const fBukti = el('input', { type: 'text', placeholder: 'Tabel A terisi lengkap', value: t?.bukti_diminta ?? '' })
  const fLembar = el('input', { type: 'text', placeholder: 'mis. C1 atau C1,C2,C3 (kosongkan bila tak ada)',
    value: t?.lembar_kode ?? '',
    gaya: { textTransform: 'uppercase' } })
  const fDesk = el('textarea', { rows: '3', placeholder: 'Apa yang harus dikerjakan murid.' }, t?.deskripsi ?? '')
  const fWajib = el('input', { type: 'checkbox', checked: t?.wajib_bukti ?? false })
  const galat = el('div')

  // Level hanya relevan untuk tantangan
  const barisLevel = el('div', { class: 'ruas', gaya: { display: (t?.jenis ?? 'inti') === 'tantangan' ? '' : 'none' } },
    el('label', {}, 'Level tantangan'), fLevel)
  fJenis.addEventListener('change', () => {
    barisLevel.style.display = fJenis.value === 'tantangan' ? '' : 'none'
  })

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')
  const hapus = t && el('button', { class: 'tbl tbl-bahaya', onClick: () => hapusTugas(wadah, tpId, t) }, 'Hapus')

  async function kirim() {
    if (!fKode.value.trim() || !fJudul.value.trim()) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Kode dan judul wajib diisi.')); return
    }
    simpan.disabled = true; isi(galat)
    const jenis = fJenis.value
    const data = {
      sprint_id: sprint.id, kode: fKode.value.trim(), judul: fJudul.value.trim(),
      jenis, level: jenis === 'tantangan' && fLevel.value ? Number(fLevel.value) : null,
      estimasi_menit: fMenit.value ? Number(fMenit.value) : 0,
      xp: fXp.value ? Number(fXp.value) : 0,
      bukti_diminta: fBukti.value.trim() || null,
      lembar_kode: fLembar.value.trim().toUpperCase() || null,
      deskripsi: fDesk.value.trim() || null,
      wajib_bukti: fWajib.checked,
      urutan: t?.urutan ?? (sprint.tugas?.length ?? 0) + 1,
    }
    try {
      const { error } = t
        ? await sb.from('tugas').update(data).eq('id', t.id)
        : await sb.from('tugas').insert(data)
      if (error) {
        if (error.code === '23505') throw new Error('Kode tugas ini sudah dipakai. Kode harus unik.')
        throw error
      }
      tutup(); roti(t ? 'Tugas diperbarui' : 'Tugas ditambahkan'); halamanSuntingLkpd(wadah, tpId)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  tutup = dialog({
    judul: t ? `Ubah ${t.kode}` : `Tugas baru — Sprint ${sprint.nomor}`,
    badan: el('div', {}, galat,
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Kode (unik)'), fKode),
        el('div', { class: 'ruas' }, el('label', {}, 'Jenis'), fJenis)),
      barisLevel,
      el('div', { class: 'ruas' }, el('label', {}, 'Judul'), fJudul),
      el('div', { class: 'ruas' }, el('label', {}, 'Deskripsi'), fDesk),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Estimasi menit'), fMenit),
        el('div', { class: 'ruas' }, el('label', {}, 'XP'), fXp)),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Bukti diminta'), fBukti),
        el('div', { class: 'ruas' },
          el('label', {}, 'Tabel yang diisi'),
          fLembar,
          el('div', { gaya: { fontSize: '11.5px', color: 'var(--tinta-lembut)', marginTop: '3px' } },
            'Kode tabel terkait tugas ini. Boleh beberapa dipisah koma (mis. C1,C2,C3). ' +
            'Yang pertama (C1) tampil & bisa diisi di tiket; sisanya di halaman Lembar, ' +
            'ikut terbuka saat timer tugas ini berjalan. Kosongkan bila tak ada.'))),
      el('label', { gaya: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', cursor: 'pointer' } },
        fWajib, 'Bukti wajib diunggah'),
    ),
    kaki: [hapus, el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)].filter(Boolean),
    lebar: '560px',
  })
}

async function hapusTugas(wadah, tpId, t) {
  const ya = await konfirmasi({
    judul: 'Hapus tugas?',
    pesan: `Tugas "${t.judul}" akan dihapus. Tidak bisa bila murid sudah mengerjakannya.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('tugas').delete().eq('id', t.id)
    if (error) throw error
    $('.tirai')?.remove(); document.body.style.overflow = ''
    roti('Tugas dihapus'); halamanSuntingLkpd(wadah, tpId)
  } catch (err) {
    roti(err.code === '23503' ? 'Tidak bisa dihapus — sudah ada progres murid.' : pesanGalat(err), '⚠')
  }
}
