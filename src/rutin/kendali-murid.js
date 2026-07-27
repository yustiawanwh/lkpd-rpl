/**
 * Kendali murid (sisi murid).
 *
 * - Mengirim "denyut" berkala agar guru tahu murid sedang daring dan
 *   tugas apa yang dikerjakan.
 * - Mendengarkan perubahan status kendali (aktif/dijeda/dikunci) secara
 *   real-time, lalu menampilkan tirai jeda/kunci bila perlu.
 *
 * Catatan: ini alat bantu pengawasan kelas, bukan pengaman mutlak. Murid
 * yang benar-benar nakal masih bisa menutup peramban; tujuannya memberi
 * guru pemantauan & isyarat, bukan mengurung.
 */
import { sb } from '../lib/supabase.js'
import { el, $ } from '../lib/dom.js'
import { keadaan } from '../main.js'
import { hentikanTimer } from '../halaman/tiket.js'

let timerDenyut = null
let kanal = null
let tugasAktifSaatIni = null

/** Mulai denyut + langganan kendali untuk penugasan yang sedang dibuka. */
export async function mulaiKendaliMurid(penugasanId) {
  hentikanKendaliMurid()   // bersihkan yang lama

  // Denyut pertama, lalu tiap 30 detik.
  kirimDenyut(penugasanId)
  timerDenyut = setInterval(() => kirimDenyut(penugasanId), 30_000)

  // Muat status kendali awal (agar tirai langsung muncul bila sudah dikunci).
  try {
    const { data } = await sb.from('pendaftaran')
      .select('kendali, kendali_pesan')
      .eq('murid_id', keadaan.profil.id)
      .limit(1).maybeSingle()
    if (data) terapkan(data.kendali, data.kendali_pesan)
  } catch { /* diam */ }

  // Langganan real-time perubahan kendali diri sendiri.
  const namaKanal = 'kendali-' + keadaan.profil.id
  for (const k of sb.getChannels()) {
    if (k.topic === 'realtime:' + namaKanal) sb.removeChannel(k)
  }
  kanal = sb.channel(namaKanal)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pendaftaran',
        filter: `murid_id=eq.${keadaan.profil.id}` },
      (payload) => {
        const b = payload.new
        if (b) terapkan(b.kendali, b.kendali_pesan)
      })
    .subscribe()
}

export function hentikanKendaliMurid() {
  if (timerDenyut) { clearInterval(timerDenyut); timerDenyut = null }
  if (kanal) { sb.removeChannel(kanal); kanal = null }
  tutupTirai()
}

/** Catat tugas yang sedang dikerjakan (dipanggil saat murid buka tiket). */
export function setTugasAktif(tugasId) {
  tugasAktifSaatIni = tugasId ?? null
}

async function kirimDenyut(penugasanId) {
  if (penugasanId == null) return
  try {
    await sb.rpc('denyut_murid', { p_penugasan: penugasanId, p_tugas: tugasAktifSaatIni ?? null })
  } catch { /* diam: denyut gagal tak fatal */ }
}

/* ---- Tirai jeda / kunci ---- */
function terapkan(kendali, pesan) {
  if (kendali === 'dijeda') { hentikanTimer?.(); tampilkanTirai('jeda', pesan) }
  else if (kendali === 'dikunci') { hentikanTimer?.(); tampilkanTirai('kunci', pesan) }
  else tutupTirai()
}

function tampilkanTirai(mode, pesan) {
  tutupTirai()
  const kunci = mode === 'kunci'
  const tirai = el('div', { class: 'tirai-kendali', id: 'tirai-kendali' },
    el('div', { class: 'tirai-kendali-kotak' },
      el('div', { class: 'tirai-kendali-ikon' }, kunci ? '🔒' : '⏸'),
      el('h2', {}, kunci ? 'Layar Dikunci Guru' : 'Dijeda Sementara'),
      el('p', {}, kunci
        ? 'Gurumu mengunci layarmu untuk sementara. Tunggu sampai gurumu membukanya kembali.'
        : 'Gurumu menjeda sesi kerjamu. Silakan berhenti sejenak; layar akan aktif lagi saat dilanjutkan.'),
      pesan
        ? el('div', { class: 'tirai-kendali-pesan' }, '“' + pesan + '”')
        : null,
      el('p', { gaya: { marginTop: '16px', fontSize: '12.5px' } },
        'Waktu pengerjaanmu berhenti selama ini.'),
    ),
  )
  document.body.append(tirai)
  document.body.style.overflow = 'hidden'
}

function tutupTirai() {
  const t = $('#tirai-kendali')
  if (t) { t.remove(); document.body.style.overflow = '' }
}
