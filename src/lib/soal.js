/**
 * Tampilan lembar jenis "Soal" — dipakai bersama oleh:
 *   - tiket tugas murid (rutin/lembar-kerja.js) & halaman Lembar murid,
 *   - koreksi guru (guru.js, baca saja + tanda kunci),
 *   - cetak PDF review (versi string HTML).
 *
 * Jawaban disimpan lewat fungsi `ubah(idButir, kunci, nilai)` milik pemanggil,
 * sama seperti sel tabel biasa, sehingga penyimpanan otomatis tidak berubah.
 * Kunci jawaban TIDAK pernah ditampilkan ke murid (hanya bila tampilKunci).
 */
import { el } from './dom.js'
import { teksKeHtml, inlineKeHtml } from './teks.js'
import * as LK from './lembar.js'

let nomorRender = 0

/**
 * @param lembar  objek lembar_kerja bertipe 'soal'
 * @param data    objek isian (dibaca langsung; pemanggil memperbaruinya via ubah)
 * @param ubah    (idButir, kunci, nilai) => void
 * @param opsi    { bacaSaja?: boolean, tampilKunci?: boolean }
 */
export function buatFormSoal(lembar, data, ubah, { bacaSaja = false, tampilKunci = false } = {}) {
  const daftar = LK.daftarSoal(lembar)
  const awalan = `soal-${lembar.id ?? 'x'}-${++nomorRender}`
  const jwb = (s) => data?.[s.id] ?? {}

  const butir = daftar.map((s) => {
    const kartu = el('div', { class: 'soal-butir', data: { jenis: s.jenis } })
    const hasilKunci = tampilKunci ? LK.cekKunci(s, jwb(s)) : null

    kartu.append(el('div', { class: 'soal-kepala' },
      s.no ? el('span', { class: 'soal-no' }, s.no) : null,
      hasilKunci === true ? el('span', { class: 'soal-cek benar' }, '✓ Benar') : null,
      hasilKunci === false ? el('span', { class: 'soal-cek salah' },
        jawabanKosong(s, jwb(s)) ? '— Belum dijawab' : '✗ Salah') : null,
    ))
    if (s.teks) kartu.append(el('div', { class: 'soal-teks teks-format', html: teksKeHtml(s.teks) }))

    if (s.jenis === 'singkat') {
      kartu.append(el('input', { type: 'text', class: 'soal-isian', value: jwb(s).jawab ?? '',
        disabled: bacaSaja, 'aria-label': `Jawaban ${s.no}`, placeholder: bacaSaja ? '' : 'Jawabanmu…',
        onInput: (e) => ubah(s.id, 'jawab', e.target.value) }))
    } else if (s.jenis === 'panjang') {
      kartu.append(kotakTeks(jwb(s).jawab ?? '', bacaSaja, `Jawaban ${s.no}`,
        (v) => ubah(s.id, 'jawab', v)))
    } else if (s.jenis === 'pg' || s.jenis === 'centang') {
      const ganda = s.jenis === 'centang'
      const nama = `${awalan}-${s.id}`
      const terpilih = ganda
        ? new Set((Array.isArray(jwb(s).pilih) ? jwb(s).pilih : []).map(Number))
        : new Set(jwb(s).pilih === undefined || jwb(s).pilih === '' ? [] : [Number(jwb(s).pilih)])
      const kunci = new Set(ganda ? (s.kunci ?? []).map(Number)
        : (s.kunci === null || s.kunci === undefined ? [] : [Number(s.kunci)]))
      const grup = el('div', { class: 'soal-opsi', role: ganda ? 'group' : 'radiogroup' })
      ;(s.opsi ?? []).forEach((o, i) => {
        const input = el('input', { type: ganda ? 'checkbox' : 'radio', name: nama, value: String(i),
          checked: terpilih.has(i), disabled: bacaSaja,
          onChange: () => {
            if (ganda) {
              const pilih = [...grup.querySelectorAll('input:checked')].map(x => Number(x.value))
              ubah(s.id, 'pilih', pilih)
            } else {
              ubah(s.id, 'pilih', String(i))
            }
          } })
        const kelas = ['opsi']
        if (tampilKunci && kunci.has(i)) kelas.push('opsi-kunci')
        if (tampilKunci && terpilih.has(i) && kunci.size && !kunci.has(i)) kelas.push('opsi-keliru')
        grup.append(el('label', { class: kelas.join(' ') }, input,
          el('span', { class: 'opsi-teks', html: inlineKeHtml(o) }),
          tampilKunci && kunci.has(i) ? el('span', { class: 'opsi-tanda' }, 'kunci') : null))
      })
      if (ganda && !bacaSaja) kartu.append(el('div', { class: 'soal-petunjuk' }, 'Boleh pilih lebih dari satu.'))
      kartu.append(grup)
    } else if (s.jenis === 'kolom') {
      const label = s.label?.length ? s.label : LK.LABEL_TEBAK
      kartu.append(el('div', { class: 'soal-kolom', style: `--n:${Math.min(label.length, 4)}` },
        ...label.map((lb, j) => el('div', { class: 'soal-kolom-sel' },
          el('div', { class: 'soal-kolom-judul' }, lb),
          kotakTeks(jwb(s)['k' + j] ?? '', bacaSaja, `${lb} ${s.no}`,
            (v) => ubah(s.id, 'k' + j, v), 1)))))
    }
    return kartu
  })

  const anak = []
  if (tampilKunci) {
    const { benar, total } = LK.skorKunci(lembar, data)
    if (total) anak.push(el('div', { class: 'soal-ringkas' },
      `Pilihan berkunci: ${benar} dari ${total} benar`,
      el('span', {}, ' · pertanyaan isian tetap dinilai guru')))
  }
  return el('div', { class: 'soal-daftar' }, ...anak, ...butir)
}

function kotakTeks(nilai, bacaSaja, label, padaUbah, baris = 2) {
  const ta = el('textarea', { rows: String(baris), class: 'soal-isian', 'aria-label': label,
    disabled: bacaSaja, placeholder: bacaSaja ? '' : 'Tulis jawabanmu…',
    onInput: (e) => {
      e.target.style.height = 'auto'
      e.target.style.height = Math.max(40, e.target.scrollHeight) + 'px'
      padaUbah(e.target.value)
    } }, nilai)
  return ta
}

function jawabanKosong(s, j) {
  if (s.jenis === 'centang') return !(Array.isArray(j?.pilih) && j.pilih.length)
  return j?.pilih === undefined || j?.pilih === null || j?.pilih === ''
}

/* ---------- Versi string HTML (cetak PDF) ---------- */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function soalKeHtmlCetak(lembar, data) {
  const d = data ?? {}
  let out = ''
  const { benar, total } = LK.skorKunci(lembar, d)
  if (total) out += `<p class="soal-ringkas">Pilihan berkunci: ${benar} dari ${total} benar</p>`
  for (const s of LK.daftarSoal(lembar)) {
    const j = d[s.id] ?? {}
    const cek = LK.cekKunci(s, j)
    out += `<div class="soal-butir">`
    out += `<div class="soal-kepala">${s.no ? `<b>${esc(s.no)}</b> ` : ''}` +
      (cek === true ? '<span class="benar">✓ Benar</span>' : cek === false ? '<span class="salah">✗ Salah</span>' : '') +
      `</div>`
    if (s.teks) out += `<div class="soal-teks">${teksKeHtml(s.teks)}</div>`
    if (s.jenis === 'singkat' || s.jenis === 'panjang') {
      out += `<div class="soal-jawab">${esc(j.jawab || '—').replace(/\n/g, '<br>')}</div>`
    } else if (s.jenis === 'pg' || s.jenis === 'centang') {
      const pilih = new Set((s.jenis === 'centang' ? (j.pilih ?? []) : (j.pilih === undefined || j.pilih === '' ? [] : [j.pilih])).map(Number))
      const kunci = new Set((s.jenis === 'centang' ? (s.kunci ?? []) : (s.kunci == null ? [] : [s.kunci])).map(Number))
      out += '<ul class="soal-opsi">' + (s.opsi ?? []).map((o, i) =>
        `<li>${pilih.has(i) ? '☑' : '☐'} ${inlineKeHtml(o)}${kunci.has(i) ? ' <i>(kunci)</i>' : ''}</li>`).join('') + '</ul>'
    } else if (s.jenis === 'kolom') {
      const label = s.label?.length ? s.label : LK.LABEL_TEBAK
      out += '<table class="lk"><tr>' + label.map(l => `<th>${esc(l)}</th>`).join('') + '</tr><tr>' +
        label.map((_, k) => `<td>${esc(j['k' + k] || '—').replace(/\n/g, '<br>')}</td>`).join('') + '</tr></table>'
    }
    out += `</div>`
  }
  return out
}
