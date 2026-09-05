/**
 * Cetak PDF halaman review — untuk mengoreksi OFFLINE (tanpa internet).
 *
 * Alur:
 *   1. Guru memilih sprint/tugas yang ingin dicetak (dialog).
 *   2. Sistem mengambil isian tabel + bukti tiap murid, MENYEMATKAN gambar
 *      sebagai data URL (base64) agar tetap tampil saat PDF dibuka offline.
 *   3. Membuka jendela cetak (window.print) dengan tata letak PER TUGAS,
 *      lengkap kolom kosong untuk nilai & catatan.
 *
 * Memakai fitur cetak bawaan peramban (Simpan sebagai PDF) — tanpa pustaka,
 * tetap biaya Rp 0. WAJIB online saat mencetak (untuk mengunduh gambar).
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, roti, dialog } from '../lib/dom.js'
import { urlBukti } from '../lib/bukti.js'
import { pesanGalat } from '../lib/kesalahan.js'

// Ubah URL gambar menjadi data URL (base64) agar tersemat & bisa dilihat offline.
async function gambarKeDataUrl(url) {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.onerror = () => res(null)
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Render satu tabel isian murid menjadi HTML (baca-saja) untuk cetak.
function tabelHtml(lembar, data) {
  const d = data ?? {}
  let struktur = lembar.struktur
  if (typeof struktur === 'string') { try { struktur = JSON.parse(struktur) } catch { struktur = {} } }
  const kolom = struktur?.kolom ?? []
  const baris = struktur?.baris ?? []
  const nBaris = baris.length || Number(struktur?.jumlah_baris ?? 0)
  if (!kolom.length) return ''

  const isLabel = lembar.tipe === 'matriks' || lembar.tipe === 'formulir'
  const jml = isLabel ? baris.length : nBaris
  let barisHtml = ''
  for (let i = 0; i < jml; i++) {
    const label = isLabel ? baris[i] : String(i + 1)
    const sel = kolom.map(k => `<td>${escapeHtml(d[String(i)]?.[k.key] ?? '')}</td>`).join('')
    barisHtml += `<tr><td class="lbl">${escapeHtml(label)}</td>${sel}</tr>`
  }
  const kepala = kolom.map(k => `<th>${escapeHtml(k.judul ?? k.key)}</th>`).join('')
  return `<table class="lk"><thead><tr><th></th>${kepala}</tr></thead><tbody>${barisHtml}</tbody></table>`
}

/**
 * Titik masuk: dipanggil dari tombol "Cetak PDF" di halaman review.
 * @param penugasanId
 * @param tpId
 * @param data  array progres yang BELUM dikoreksi (dari antreanReview)
 */
export async function cetakReview(penugasanId, tpId, data) {
  if (!data || !data.length) { roti('Tidak ada tugas yang menunggu review'); return }

  // Kelompokkan tugas unik untuk dipilih.
  const petaTugas = new Map()
  for (const p of data) {
    const t = p.tugas
    if (!petaTugas.has(p.tugas_id)) {
      petaTugas.set(p.tugas_id, {
        tugas_id: p.tugas_id, kode: t?.kode ?? '—', judul: t?.judul ?? '',
        sprint: t?.sprint?.nomor ?? 0, jml: 0,
      })
    }
    petaTugas.get(p.tugas_id).jml++
  }
  const daftarTugas = [...petaTugas.values()].sort((a, b) =>
    a.sprint - b.sprint || (a.kode).localeCompare(b.kode))

  // Dialog pemilihan tugas.
  const kotak = new Map()
  const barisPilih = daftarTugas.map(t => {
    const cb = el('input', { type: 'checkbox', checked: '' })
    kotak.set(t.tugas_id, cb)
    return el('label', { class: 'cetak-pilih-baris' },
      cb, el('span', {}, `${t.kode} — ${t.judul} `),
      el('span', { class: 'cetak-jml' }, `(${t.jml} murid)`))
  })

  const semua = el('button', { class: 'tbl tbl-kecil' }, 'Pilih semua')
  const tak = el('button', { class: 'tbl tbl-kecil' }, 'Kosongkan')
  semua.onclick = () => kotak.forEach(cb => { cb.checked = true })
  tak.onclick = () => kotak.forEach(cb => { cb.checked = false })

  const tutupDialog = dialog({
    judul: '🖨️ Cetak PDF untuk koreksi offline',
    badan: el('div', {},
      el('p', { gaya: { fontSize: '13px', color: 'var(--tinta-lembut)', marginTop: '0' } },
        'Pilih tugas yang ingin dicetak. Cetakan disusun per tugas, memuat isian & ' +
        'bukti murid, plus kolom nilai & catatan untuk dikoreksi manual. ' +
        'Pastikan masih ada internet saat mencetak (untuk mengunduh gambar bukti).'),
      el('div', { gaya: { display: 'flex', gap: '6px', margin: '8px 0' } }, semua, tak),
      el('div', { class: 'cetak-pilih' }, ...barisPilih)),
    kaki: [
      el('button', { class: 'tbl tbl-utama', onClick: async (e) => {
        const pilih = daftarTugas.filter(t => kotak.get(t.tugas_id)?.checked).map(t => t.tugas_id)
        if (!pilih.length) { roti('Pilih minimal satu tugas'); return }
        e.target.disabled = true; e.target.textContent = 'Menyiapkan…'
        try {
          await siapkanCetak(penugasanId, tpId, data, new Set(pilih))
          tutupDialog()
        } catch (err) {
          roti(pesanGalat(err), '⚠')
          e.target.disabled = false; e.target.textContent = 'Cetak'
        }
      } }, 'Cetak'),
    ],
  })
}

// Ambil data & bangun dokumen cetak untuk tugas terpilih.
async function siapkanCetak(penugasanId, tpId, data, tugasDipilih) {
  const dipilih = data.filter(p => tugasDipilih.has(p.tugas_id))

  // Ambil semua lembar TP sekali (untuk pencocokan kode).
  const { data: semuaLk } = await sb.from('lembar_kerja')
    .select('id, kode, judul, tipe, struktur').eq('tujuan_pembelajaran_id', tpId)

  // Kelompokkan per tugas, di dalamnya urut absen.
  const grup = new Map()
  for (const p of dipilih) {
    if (!grup.has(p.tugas_id)) grup.set(p.tugas_id, { tugas: p.tugas, murid: [] })
    grup.get(p.tugas_id).murid.push(p)
  }
  const absen = (p) => {
    const n = parseInt(p.profil?.no_absen ?? '', 10)
    return Number.isNaN(n) ? Infinity : n
  }
  const grupUrut = [...grup.values()].sort((a, b) =>
    (a.tugas?.sprint?.nomor ?? 0) - (b.tugas?.sprint?.nomor ?? 0)
    || (a.tugas?.kode ?? '').localeCompare(b.tugas?.kode ?? ''))
  for (const g of grupUrut) g.murid.sort((a, b) => absen(a) - absen(b))

  // Bangun HTML per tugas → per murid.
  let body = ''
  for (const g of grupUrut) {
    body += `<section class="tugas-blok"><h2>${escapeHtml(g.tugas?.kode ?? '')} — ${escapeHtml(g.tugas?.judul ?? '')}</h2>`
    if (g.tugas?.sprint?.nomor != null) body += `<p class="sprint">Sprint ${g.tugas.sprint.nomor}</p>`

    for (const p of g.murid) {
      body += `<article class="murid-blok"><div class="murid-kepala">`
      body += `<strong>${escapeHtml(p.profil?.nama ?? '—')}</strong>`
      body += p.profil?.no_absen ? ` <span class="absen">Absen ${escapeHtml(p.profil.no_absen)}</span>` : ''
      body += `</div>`

      // Isian tabel (multi kode).
      const kodeLembar = String(p.tugas?.lembar_kode ?? '')
        .split(/[,;]/).map(x => x.trim().toUpperCase()).filter(Boolean)
      if (kodeLembar.length) {
        const urut = {}; kodeLembar.forEach((k, i) => { urut[k] = i })
        const lk = (semuaLk ?? [])
          .filter(l => kodeLembar.includes((l.kode ?? '').toUpperCase()))
          .sort((x, y) => (urut[(x.kode ?? '').toUpperCase()] ?? 99) - (urut[(y.kode ?? '').toUpperCase()] ?? 99))
        for (const l of lk) {
          const { data: is } = await sb.from('isian_lembar')
            .select('data').eq('penugasan_id', penugasanId)
            .eq('murid_id', p.murid_id).eq('lembar_kerja_id', l.id).maybeSingle()
          body += `<div class="lk-judul">Tabel ${escapeHtml(l.kode)} — ${escapeHtml(l.judul)}</div>`
          body += tabelHtml(l, is?.data ?? null)
        }
      }

      // Bukti (gambar disematkan base64).
      const { data: lampiran } = await sb.from('lampiran')
        .select('nama_asli, path, mime').eq('progres_tugas_id', p.id)
      const gambar = (lampiran ?? []).filter(f => (f.mime ?? '').startsWith('image/'))
      if (gambar.length) {
        body += `<div class="lk-judul">Bukti</div><div class="bukti-baris">`
        for (const f of gambar) {
          const url = await urlBukti(f.path).catch(() => null)
          const dataUrl = url ? await gambarKeDataUrl(url) : null
          if (dataUrl) body += `<img src="${dataUrl}" alt="${escapeHtml(f.nama_asli)}"/>`
        }
        body += `</div>`
      }

      // Kolom kosong untuk koreksi manual.
      body += `<div class="koreksi-kotak"><span class="k-nilai">Nilai: ______</span>` +
        `<span class="k-catatan">Catatan: ________________________________________________</span></div>`
      body += `</article>`
    }
    body += `</section>`
  }

  bukaCetak(body)
}

// Buka jendela cetak dengan gaya khusus print.
function bukaCetak(bodyHtml) {
  const w = window.open('', '_blank')
  if (!w) { roti('Izinkan pop-up untuk mencetak', '⚠'); return }
  const gaya = `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 18px; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .subjudul { color: #555; margin: 0 0 14px; font-size: 12px; }
    .tugas-blok { margin-bottom: 18px; page-break-inside: auto; }
    .tugas-blok > h2 { font-size: 15px; background: #1B5E3F; color: #fff; padding: 6px 10px; border-radius: 6px; margin: 14px 0 2px; }
    .sprint { color: #666; font-size: 11px; margin: 2px 0 8px; }
    .murid-blok { border: 1px solid #cbd5cf; border-radius: 8px; padding: 10px 12px; margin: 8px 0; page-break-inside: avoid; }
    .murid-kepala { border-bottom: 1px solid #e2e8e4; padding-bottom: 5px; margin-bottom: 7px; }
    .absen { color: #666; font-size: 11px; }
    .lk-judul { font-weight: 600; font-size: 11.5px; margin: 8px 0 4px; }
    table.lk { border-collapse: collapse; width: 100%; margin-bottom: 6px; }
    table.lk th, table.lk td { border: 1px solid #b7c6bc; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 11px; }
    table.lk th { background: #e4f0ea; }
    table.lk td.lbl { background: #f3f7f4; font-weight: 600; white-space: nowrap; }
    .bukti-baris { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0; }
    .bukti-baris img { max-width: 30%; max-height: 220px; border: 1px solid #cbd5cf; border-radius: 6px; object-fit: contain; }
    .koreksi-kotak { margin-top: 8px; padding-top: 7px; border-top: 1px dashed #b7c6bc; font-size: 12px; }
    .k-nilai { font-weight: 600; margin-right: 18px; }
    @media print { body { margin: 10mm; } .murid-blok { page-break-inside: avoid; } }
  `
  const tgl = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
  w.document.write(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Koreksi Offline</title>` +
    `<style>${gaya}</style></head><body>` +
    `<h1>Lembar Koreksi (Offline)</h1><p class="subjudul">Dicetak ${escapeHtml(tgl)} — isi nilai & catatan lalu masukkan kembali ke aplikasi saat online.</p>` +
    bodyHtml + `</body></html>`)
  w.document.close()
  // Beri jeda agar gambar base64 selesai dirender sebelum dialog cetak.
  w.onload = () => setTimeout(() => { w.focus(); w.print() }, 300)
  // Fallback bila onload sudah lewat.
  setTimeout(() => { try { w.focus(); w.print() } catch {} }, 800)
}
