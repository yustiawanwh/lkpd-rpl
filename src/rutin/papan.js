/**
 * Kueri papan kanban murid.
 *
 * Semua penyaringan hak akses ditangani RLS di basis data, jadi kueri di
 * sini tidak perlu menambahkan `.eq('murid_id', ...)` untuk keamanan —
 * Supabase hanya akan mengembalikan baris yang memang boleh dibaca.
 * Penyaring yang ada di bawah semata untuk mempersempit hasil.
 */
import { sb } from '../lib/supabase.js'

/** Seluruh tugas satu TP beserta progres murid yang sedang masuk. */
export async function muatPapan(penugasanId) {
  const { data: penugasan, error: e1 } = await sb
    .from('penugasan')
    .select('id, dibuka, mulai, tenggat, tujuan_pembelajaran(id, kode, judul, total_menit)')
    .eq('id', penugasanId)
    .single()
  if (e1) throw e1

  // Ambil kolom pengantar (deskripsi, petunjuk_umum, materi_awal) SECARA
  // TERPISAH & toleran: bila sebagian kolom belum ada (migrasi belum jalan),
  // jangan sampai menggagalkan seluruh papan. Coba lengkap dulu, lalu mundur.
  if (penugasan?.tujuan_pembelajaran?.id) {
    const tpId = penugasan.tujuan_pembelajaran.id
    let pengantar = null
    for (const kolom of ['deskripsi, petunjuk_umum, materi_awal', 'deskripsi, petunjuk_umum', 'deskripsi']) {
      const r = await sb.from('tujuan_pembelajaran').select(kolom).eq('id', tpId).single()
      if (!r.error) { pengantar = r.data; break }
    }
    if (pengantar) Object.assign(penugasan.tujuan_pembelajaran, pengantar)
  }

  const { data: sprints, error: e2 } = await sb
    .from('sprint')
    .select('id, nomor, nama, hari, jp, durasi_menit, menit_inti, tujuan, kktp_terkait, tugas(*)')
    .eq('tujuan_pembelajaran_id', penugasan.tujuan_pembelajaran.id)
    .order('nomor')
  if (e2) throw e2

  const { data: progres, error: e3 } = await sb
    .from('progres_tugas')
    .select('*')
    .eq('penugasan_id', penugasanId)
  if (e3) throw e3

  const petaProgres = Object.fromEntries(progres.map(p => [p.tugas_id, p]))

  return {
    penugasan,
    sprints: sprints.map(s => ({
      ...s,
      tugas: (s.tugas ?? [])
        .sort((a, b) => a.urutan - b.urutan)
        .map(t => ({ ...t, progres: petaProgres[t.id] ?? null })),
    })),
  }
}

/**
 * Memindahkan tugas ke status baru.
 * XP, badge, dan statistik ditangani trigger di basis data — tidak ada
 * yang perlu dihitung di sini.
 */
export async function ubahStatus(penugasanId, muridId, tugasId, status) {
  const { data, error } = await sb
    .from('progres_tugas')
    .upsert(
      { penugasan_id: penugasanId, murid_id: muridId, tugas_id: tugasId, status },
      { onConflict: 'penugasan_id,murid_id,tugas_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

/** Menyimpan waktu dari timer. */
export async function catatWaktu(penugasanId, muridId, tugasId, detik) {
  const { data, error } = await sb
    .from('progres_tugas')
    .upsert(
      { penugasan_id: penugasanId, murid_id: muridId, tugas_id: tugasId,
        detik_terpakai: Math.max(0, Math.round(detik)) },
      { onConflict: 'penugasan_id,murid_id,tugas_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function simpanCatatan(penugasanId, muridId, tugasId, catatan) {
  const { error } = await sb
    .from('progres_tugas')
    .upsert(
      { penugasan_id: penugasanId, murid_id: muridId, tugas_id: tugasId, catatan },
      { onConflict: 'penugasan_id,murid_id,tugas_id' }
    )
  if (error) throw error
}

/** Papan peringkat sekelas. RLS membatasinya hanya pada penugasan ini. */
export async function papanPeringkat(penugasanId) {
  const { data, error } = await sb
    .from('statistik_murid')
    .select('total_xp, jumlah_badge, tugas_selesai, profil(id, nama)')
    .eq('penugasan_id', penugasanId)
    .order('total_xp', { ascending: false })
    .limit(30)
  if (error) throw error
  return data
}

export async function statistikSaya(penugasanId, muridId) {
  const { data, error } = await sb
    .from('statistik_murid')
    .select('*')
    .eq('penugasan_id', penugasanId)
    .eq('murid_id', muridId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function badgeSaya(penugasanId) {
  const { data, error } = await sb
    .from('perolehan_badge')
    .select('diraih_pada, badge(*)')
    .eq('penugasan_id', penugasanId)
  if (error) throw error
  return data
}

/**
 * Data rekap nilai satu penugasan: capaian tiap murid + jumlah tugas inti
 * total sebagai pembagi. Dipakai halaman rekap nilai guru.
 */
export async function rekapNilai(penugasanId, tpId) {
  // 1. Jumlah tugas inti total pada TP ini (pembagi nilai dasar).
  const { data: sprintIds, error: e0 } = await sb
    .from('sprint').select('id').eq('tujuan_pembelajaran_id', tpId)
  if (e0) throw e0

  let intiTotal = 0
  if (sprintIds?.length) {
    const { count, error: e1 } = await sb
      .from('tugas')
      .select('id', { count: 'exact', head: true })
      .in('sprint_id', sprintIds.map(s => s.id))
      .eq('jenis', 'inti')
    if (e1) throw e1
    intiTotal = count ?? 0
  }

  // 2. Statistik tiap murid pada penugasan ini.
  const { data: stat, error: e2 } = await sb
    .from('statistik_murid')
    .select('murid_id, total_xp, jumlah_badge, tugas_selesai, tantangan_selesai, total_detik, profil:murid_id(nama, no_absen)')
    .eq('penugasan_id', penugasanId)
  if (e2) throw e2

  return { intiTotal, murid: stat ?? [] }
}

/**
 * Rekap nilai per sprint: untuk tiap murid, ketuntasan tugas inti
 * dihitung terpisah per sprint. Cocok untuk penilaian harian, karena
 * satu sprint = satu hari kerja / LKPD harian.
 *
 * Mengembalikan { sprints:[{id,nomor,nama,intiTotal}], murid:[{...}] }
 * dengan tiap murid memuat perSprint[sprintId] = { intiSelesai }.
 */
export async function rekapNilaiPerSprint(penugasanId, tpId) {
  // 1. Sprint + tugas inti-nya, plus tenggat penugasan.
  const [{ data: sprints, error: e0 }, { data: pen }] = await Promise.all([
    sb.from('sprint').select('id, nomor, nama, tugas(id, jenis)')
      .eq('tujuan_pembelajaran_id', tpId).order('nomor'),
    sb.from('penugasan').select('tenggat, mulai').eq('id', penugasanId).single(),
  ])
  if (e0) throw e0

  // Tenggat kini timestamptz (tanggal + jam). Bila kosong = tanpa tenggat.
  const tenggat = pen?.tenggat ? new Date(pen.tenggat) : null
  const mulai = pen?.mulai ? new Date(pen.mulai) : null

  const intiKeSprint = {}       // tugas_id -> sprint_id
  const intiSet = new Set()     // tugas_id inti
  const tantanganKeSprint = {}  // tugas_id (tantangan) -> sprint_id
  const daftarSprint = (sprints ?? []).map(s => {
    const inti = (s.tugas ?? []).filter(t => t.jenis === 'inti')
    const tantangan = (s.tugas ?? []).filter(t => t.jenis === 'tantangan')
    inti.forEach(t => { intiKeSprint[t.id] = s.id; intiSet.add(t.id) })
    tantangan.forEach(t => { tantanganKeSprint[t.id] = s.id })
    return { id: s.id, nomor: s.nomor, nama: s.nama,
             intiTotal: inti.length, tantanganTotal: tantangan.length }
  })

  // 2. Progres SELESAI + nilai huruf + waktu serah.
  const { data: progres, error: e1 } = await sb
    .from('progres_tugas')
    .select('murid_id, tugas_id, status, nilai_huruf, diserahkan_pada, profil:murid_id(nama, no_absen)')
    .eq('penugasan_id', penugasanId)
    .eq('status', 'selesai')
  if (e1) throw e1

  // 3. Badge per sprint: perolehan + syarat badge (untuk tahu sprint mana).
  const [{ data: perolehan }, { data: badges }] = await Promise.all([
    sb.from('perolehan_badge').select('murid_id, badge_id, diraih_pada').eq('penugasan_id', penugasanId),
    sb.from('badge').select('id, syarat').eq('tujuan_pembelajaran_id', tpId),
  ])
  const badgeKeSprintNomor = {}
  for (const b of (badges ?? [])) {
    const nomor = b.syarat?.sprint_nomor
    if (nomor != null) badgeKeSprintNomor[b.id] = nomor
  }
  const nomorKeSprintId = {}
  for (const s of daftarSprint) nomorKeSprintId[s.nomor] = s.id

  // 4. Kelompokkan per murid.
  const petaMurid = {}
  function pastikan(murid_id, profil) {
    if (!petaMurid[murid_id]) {
      petaMurid[murid_id] = {
        murid_id, profil, perSprint: {},   // sprintId -> { huruf:[], badge:0, serahTerakhir:Date|null }
      }
    }
    return petaMurid[murid_id]
  }

  for (const p of (progres ?? [])) {
    const sprintInti = intiKeSprint[p.tugas_id]
    const sprintTantangan = tantanganKeSprint[p.tugas_id]

    // Tugas inti: kumpulkan huruf & waktu serah (untuk review & kecepatan).
    if (sprintInti) {
      const m = pastikan(p.murid_id, p.profil)
      if (!m.perSprint[sprintInti]) m.perSprint[sprintInti] = { huruf: [], badge: 0, serahTerakhir: null, tantanganDinilai: 0 }
      const ps = m.perSprint[sprintInti]
      ps.selesai = (ps.selesai ?? 0) + 1
      if (p.nilai_huruf) ps.huruf.push(p.nilai_huruf)
      if (p.diserahkan_pada) {
        const t = new Date(p.diserahkan_pada)
        if (!ps.serahTerakhir || t > ps.serahTerakhir) ps.serahTerakhir = t
      }
    }

    // Tugas tantangan yang sudah DINILAI: hitung untuk porsi tantangan.
    if (sprintTantangan && p.nilai_huruf) {
      const m = pastikan(p.murid_id, p.profil)
      if (!m.perSprint[sprintTantangan]) m.perSprint[sprintTantangan] = { huruf: [], badge: 0, serahTerakhir: null, tantanganDinilai: 0 }
      m.perSprint[sprintTantangan].tantanganDinilai =
        (m.perSprint[sprintTantangan].tantanganDinilai ?? 0) + 1
    }
  }

  for (const pb of (perolehan ?? [])) {
    const nomor = badgeKeSprintNomor[pb.badge_id]
    const sprintId = nomor != null ? nomorKeSprintId[nomor] : null
    if (!sprintId || !petaMurid[pb.murid_id]) {
      // badge tanpa sprint jelas → taruh di sprint 1 bila ada murid
      if (petaMurid[pb.murid_id] && daftarSprint[0]) {
        const sid = daftarSprint[0].id
        petaMurid[pb.murid_id].perSprint[sid] = petaMurid[pb.murid_id].perSprint[sid]
          ?? { huruf: [], badge: 0, serahTerakhir: null }
        petaMurid[pb.murid_id].perSprint[sid].badge++
      }
      continue
    }
    const m = petaMurid[pb.murid_id]
    if (!m.perSprint[sprintId]) m.perSprint[sprintId] = { huruf: [], badge: 0, serahTerakhir: null }
    m.perSprint[sprintId].badge++
  }

  // Sertakan murid terdaftar walau belum mengerjakan.
  const { data: terdaftar } = await sb
    .from('statistik_murid')
    .select('murid_id, profil:murid_id(nama, no_absen)')
    .eq('penugasan_id', penugasanId)
  for (const t of (terdaftar ?? [])) pastikan(t.murid_id, t.profil)

  // 5. Ketepatan waktu per sprint: berdasarkan tenggat penugasan (tanggal+jam),
  //    BUKAN urutan antar murid. Tanpa tenggat = semua tepat waktu.
  for (const s of daftarSprint) {
    for (const m of Object.values(petaMurid)) {
      const ps = m.perSprint[s.id]
      if (!ps) continue
      ps.sudahKumpul = !!ps.serahTerakhir
      // Durasi (jam) dari tanggal MULAI penugasan (patokan sama untuk semua)
      // sampai waktu serah terakhir murid. Dipakai skor kecepatan (durasi target).
      ps.jamDurasi = (mulai && ps.serahTerakhir)
        ? Math.max(0, (ps.serahTerakhir - mulai) / 3_600_000) : null
    }
  }

  return { sprints: daftarSprint, murid: Object.values(petaMurid), tenggat: pen?.tenggat ?? null }
}
