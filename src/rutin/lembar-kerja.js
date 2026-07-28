/**
 * Membaca & menyimpan isian lembar kerja murid.
 *
 * Seluruh isian satu tabel disimpan sebagai SATU baris jsonb. Penyimpanan
 * otomatis mengirim seluruh tabel sekaligus, jadi tidak ada gunanya
 * memecah per sel.
 */
import { sb } from '../lib/supabase.js'

export async function muatLembar(tpId, penugasanId) {
  if (tpId == null || penugasanId == null) {
    throw new Error('Data penugasan belum lengkap. Muat ulang halaman lalu coba lagi.')
  }
  const { data: lembar, error: e1 } = await sb
    .from('lembar_kerja')
    .select('*')
    .eq('tujuan_pembelajaran_id', tpId)
    .order('urutan')
  if (e1) throw e1

  const { data: isian, error: e2 } = await sb
    .from('isian_lembar')
    .select('*')
    .eq('penugasan_id', penugasanId)
  if (e2) throw e2

  const peta = Object.fromEntries(isian.map(i => [i.lembar_kerja_id, i]))
  return lembar.map(l => ({ ...l, isian: peta[l.id] ?? null }))
}

export async function simpanIsian(penugasanId, muridId, lembarId, data) {
  const { error } = await sb
    .from('isian_lembar')
    .upsert(
      { penugasan_id: penugasanId, murid_id: muridId, lembar_kerja_id: lembarId, data },
      { onConflict: 'penugasan_id,murid_id,lembar_kerja_id' }
    )
  if (error) throw error
}

/**
 * Penyimpan andal untuk isian tabel — dirancang tahan internet lambat/putus.
 *
 * Fitur:
 *  - Menggabungkan perubahan beruntun (debounce) agar hemat permintaan.
 *  - Mencoba ulang otomatis bila gagal (jeda bertambah: 1s, 2s, 4s, …).
 *  - Menunggu koneksi kembali bila sedang offline, lalu menyimpan.
 *  - Melapor status lewat callback: 'menyimpan' | 'tersimpan' | 'gagal' |
 *    'menunggu-koneksi' | 'akan-coba-lagi'.
 *  - flush(): memaksa simpan segera & menunggu selesai (untuk saat menutup).
 *  - adaTertunda(): true bila masih ada perubahan yang belum tersimpan.
 *
 * @param simpanFn  async (data) => void   (melempar error bila gagal)
 * @param laporFn   (status, info) => void
 */
export function buatPenyimpan(simpanFn, laporFn = () => {}) {
  let jedaTimer = null
  let dataTertunda = null       // data terbaru yang menunggu disimpan
  let sedangJalan = false       // sedang ada proses simpan berjalan
  let versiTerkirim = 0         // nomor versi untuk mendeteksi perubahan baru
  let versiTerakhir = 0
  let percobaan = 0
  const MAKS_JEDA = 15000

  function adaTertunda() {
    return dataTertunda !== null || sedangJalan
  }

  function jadwalkan(data, jeda = 700) {
    dataTertunda = data
    versiTerakhir++
    laporFn('menyimpan')
    clearTimeout(jedaTimer)
    jedaTimer = setTimeout(jalankan, jeda)
  }

  async function jalankan() {
    if (sedangJalan) return           // biarkan proses berjalan menyelesaikan
    if (dataTertunda === null) return

    // Bila offline, tunggu online lalu ulangi.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      laporFn('menunggu-koneksi')
      tungguOnline()
      return
    }

    sedangJalan = true
    const dataIni = dataTertunda
    const versiIni = versiTerakhir
    dataTertunda = null
    versiTerkirim = versiIni
    laporFn('menyimpan')

    try {
      await simpanFn(dataIni)
      sedangJalan = false
      percobaan = 0
      // Bila ada perubahan LEBIH BARU sejak pengiriman ini, simpan lagi.
      if (versiTerakhir !== versiIni || dataTertunda !== null) {
        jalankan()
      } else {
        laporFn('tersimpan')
      }
    } catch (err) {
      sedangJalan = false
      // Kembalikan data ini sebagai tertunda (bila belum ada yang lebih baru).
      if (dataTertunda === null) dataTertunda = dataIni
      percobaan++
      const jeda = Math.min(1000 * 2 ** (percobaan - 1), MAKS_JEDA)
      laporFn('akan-coba-lagi', { percobaan, jeda, err })
      clearTimeout(jedaTimer)
      jedaTimer = setTimeout(jalankan, jeda)
    }
  }

  let penungguOnline = null
  function tungguOnline() {
    if (penungguOnline) return
    penungguOnline = () => {
      window.removeEventListener('online', penungguOnline)
      penungguOnline = null
      percobaan = 0
      jalankan()
    }
    if (typeof window !== 'undefined') window.addEventListener('online', penungguOnline)
  }

  /** Paksa simpan segera & tunggu sampai benar-benar tersimpan (atau gagal). */
  async function flush() {
    clearTimeout(jedaTimer)
    // Tunggu proses berjalan selesai, lalu pastikan sisa tertunda tersimpan.
    let putaran = 0
    while (adaTertunda() && putaran < 20) {
      putaran++
      if (!sedangJalan && dataTertunda !== null) {
        await jalankanSekali()
      } else {
        await new Promise(r => setTimeout(r, 150))
      }
    }
    return !adaTertunda()
  }

  // Versi jalankan yang menunggu hasilnya (untuk flush).
  async function jalankanSekali() {
    if (dataTertunda === null) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('offline')
    }
    sedangJalan = true
    const dataIni = dataTertunda
    dataTertunda = null
    laporFn('menyimpan')
    try {
      await simpanFn(dataIni)
      sedangJalan = false
      laporFn('tersimpan')
    } catch (err) {
      sedangJalan = false
      if (dataTertunda === null) dataTertunda = dataIni
      laporFn('gagal', { err })
      throw err
    }
  }

  return { jadwalkan, flush, adaTertunda }
}

/**
 * Penyimpanan otomatis dengan jeda.
 * Tanpa jeda, tiap ketikan akan mengirim satu permintaan ke server.
 */
export function simpanTertunda(jeda = 600) {
  let timer = null
  let terakhir = null

  return {
    jadwalkan(fn) {
      terakhir = fn
      clearTimeout(timer)
      timer = setTimeout(() => { terakhir?.(); terakhir = null }, jeda)
    },
    /** Menyimpan segera — dipanggil saat pindah halaman atau menutup tab. */
    async segera() {
      clearTimeout(timer)
      if (terakhir) { await terakhir(); terakhir = null }
    },
  }
}

/**
 * Membuat elemen tabel lembar kerja yang bisa diisi, mandiri (punya
 * simpan-otomatis sendiri). Dipakai baik di halaman Lembar Kerja maupun
 * di dalam tiket tugas, agar tabel muncul tepat di tempat murid diminta
 * mengisinya.
 *
 * @param lembar   objek lembar_kerja (dengan .isian bila ada)
 * @param ctx      { penugasanId, muridId, el, $, $$, LK, roti, pesanGalat }
 */
export function buatTabelIsi(lembar, ctx) {
  const { el, $, $$, LK, roti, pesanGalat } = ctx
  const bacaSaja = ctx.bacaSaja === true
  const data = { ...(lembar.isian?.data ?? {}) }
  const kolom = LK.kolom(lembar)
  const nBaris = LK.jumlahBaris(lembar)

  if (!kolom.length || (lembar.tipe !== 'referensi' && nBaris === 0)) {
    return el('div', { class: 'kosong', gaya: { padding: '20px' } },
      el('h3', {}, 'Tabel belum siap'),
      el('p', {}, 'Struktur tabel ini belum lengkap. Sampaikan ke gurumu.'))
  }

  let tanda = null

  // Perbarui tampilan status penyimpanan dengan jujur & jelas.
  function lapor(status, info) {
    if (!tanda) return
    tanda.classList.remove('aktif', 'gagal', 'nunggu')
    switch (status) {
      case 'menyimpan':
        tanda.textContent = 'Menyimpan…'; break
      case 'tersimpan':
        tanda.textContent = '✓ Tersimpan'; tanda.classList.add('aktif')
        setTimeout(() => { if (tanda && tanda.textContent === '✓ Tersimpan') tanda.classList.remove('aktif') }, 1400)
        break
      case 'menunggu-koneksi':
        tanda.textContent = '⚠ Menunggu koneksi…'; tanda.classList.add('nunggu'); break
      case 'akan-coba-lagi':
        tanda.textContent = `⚠ Gagal — mencoba lagi (${info?.percobaan})…`; tanda.classList.add('nunggu'); break
      case 'gagal':
        tanda.textContent = '✗ Belum tersimpan'; tanda.classList.add('gagal'); break
    }
  }

  const penyimpan = buatPenyimpan(
    (d) => simpanIsian(ctx.penugasanId, ctx.muridId, lembar.id, d),
    lapor,
  )
  // Diekspos agar tiket/halaman bisa memaksa simpan & memeriksa status.
  ctx.penyimpan = penyimpan

  function kirim() {
    // Kirim salinan data terkini agar retry memakai versi yang benar.
    penyimpan.jadwalkan({ ...data }, 700)
  }

  function ubah(baris, kunci, nilai) {
    data[String(baris)] = { ...(data[String(baris)] ?? {}), [kunci]: nilai }
    kirim()
  }

  function sel(baris, k) {
    const nilai = data[String(baris)]?.[k.key] ?? ''
    // Mode baca-saja (tugas terkunci): tampilkan nilai tanpa input.
    if (bacaSaja) {
      let tampil = nilai
      if (k.input === 'tri') tampil = nilai === '1' ? '✓' : nilai === '0' ? '✗' : '—'
      return el('div', { class: 'baca-saja' }, String(tampil || '—'))
    }
    if (k.input === 'tri') {
      const bikin = (v, label) => el('button', {
        class: nilai === v ? 'aktif' : '', data: { nilai: v },
        'aria-label': label, 'aria-pressed': String(nilai === v),
        onClick: (e) => {
          const baruNilai = data[String(baris)]?.[k.key] === v ? '' : v
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
        ...(k.opsi ?? []).map(o => el('option', { value: o, selected: nilai === o }, o)))
    }
    if (k.input === 'text' || k.input === 'angka') {
      return el('input', { type: k.input === 'angka' ? 'number' : 'text', value: nilai,
        'aria-label': k.label, onInput: (e) => ubah(baris, k.key, e.target.value) })
    }
    const ta = el('textarea', { rows: '2', 'aria-label': k.label,
      onInput: (e) => { e.target.style.height = 'auto'
                        e.target.style.height = Math.max(40, e.target.scrollHeight) + 'px'
                        ubah(baris, k.key, e.target.value) } }, nilai)
    return ta
  }

  let tabel
  if (lembar.tipe === 'referensi') {
    const baca = LK.kolomBaca(lembar); const isiRef = LK.dataReferensi(lembar)
    tabel = el('table', { class: 'lk' },
      el('thead', {}, el('tr', {}, ...baca.map(h => el('th', {}, h)), ...kolom.map(k => el('th', {}, k.label)))),
      el('tbody', {}, ...isiRef.map((brs, i) => el('tr', {},
        ...brs.map(c => el('td', {}, el('div', { class: 'baca-saja' }, c))),
        ...kolom.map(k => el('td', {}, sel(i, k)))))))
  } else if (lembar.tipe === 'matriks' || lembar.tipe === 'formulir') {
    const label = LK.labelBaris(lembar)
    tabel = el('table', { class: 'lk' },
      kolom.length > 1 && el('thead', {}, el('tr', {}, el('th', {}, ''), ...kolom.map(k => el('th', {}, k.label)))),
      el('tbody', {}, ...label.map((lb, i) => el('tr', {},
        el('td', { class: 'label' }, lb), ...kolom.map(k => el('td', {}, sel(i, k)))))))
  } else {
    tabel = el('table', { class: 'lk' },
      el('thead', {}, el('tr', {}, el('th', { gaya: { width: '40px' } }, 'No'), ...kolom.map(k => el('th', {}, k.label)))),
      el('tbody', {}, ...Array.from({ length: nBaris }, (_, i) => el('tr', {},
        el('td', { class: 'label' }, String(i + 1)), ...kolom.map(k => el('td', {}, sel(i, k)))))))
  }

  tanda = el('span', { class: 'simpan-tanda' }, 'Tersimpan otomatis')
  const bungkus = el('div', {},
    el('div', { gaya: { display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' } }, tanda),
    el('div', { class: 'tabel-bungkus' }, tabel))

  // Bila pemanggil ingin bisa mengubah status baca-saja secara dinamis
  // (mis. mengikuti timer di tiket), sediakan API. Ini menonaktifkan atau
  // mengaktifkan seluruh input di dalam tabel tanpa membangun ulang.
  bungkus.setBacaSaja = (nonaktif) => {
    bungkus.querySelectorAll('input, textarea, select, .tri button')
      .forEach((elm) => { elm.disabled = !!nonaktif })
    bungkus.classList.toggle('tabel-terkunci-timer', !!nonaktif)
  }
  // Ekspos penyimpan andal agar pemanggil bisa memaksa simpan (flush) saat
  // menutup/pindah, dan memeriksa apakah masih ada perubahan tertunda.
  bungkus.flush = () => penyimpan.flush()
  bungkus.adaTertunda = () => penyimpan.adaTertunda()
  return bungkus
}

/** Muat satu lembar (berdasarkan kode) untuk sebuah TP + isiannya. */
export async function muatLembarSatu(tpId, penugasanId, kode) {
  if (tpId == null || penugasanId == null || !kode) return null
  const { data: lembar, error } = await sb
    .from('lembar_kerja')
    .select('*')
    .eq('tujuan_pembelajaran_id', tpId)
    .eq('kode', kode)
    .maybeSingle()
  if (error) throw error
  if (!lembar) return null
  const { data: isian } = await sb
    .from('isian_lembar')
    .select('*')
    .eq('penugasan_id', penugasanId)
    .eq('lembar_kerja_id', lembar.id)
    .maybeSingle()
  return { ...lembar, isian: isian ?? null }
}
