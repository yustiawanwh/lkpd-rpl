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

  const simpan = simpanTertunda(700)
  let tanda = null

  async function kirim() {
    if (tanda) tanda.textContent = 'Menyimpan…'
    simpan.jadwalkan(async () => {
      try {
        await simpanIsian(ctx.penugasanId, ctx.muridId, lembar.id, data)
        if (tanda) { tanda.textContent = 'Tersimpan'; tanda.classList.add('aktif')
                     setTimeout(() => tanda.classList.remove('aktif'), 1400) }
      } catch (err) {
        if (tanda) tanda.textContent = 'Gagal menyimpan'
        roti(pesanGalat(err), '⚠')
      }
    })
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
  return el('div', {},
    el('div', { gaya: { display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' } }, tanda),
    el('div', { class: 'tabel-bungkus' }, tabel))
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
