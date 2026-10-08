/**
 * Penyunting lembar kerja & badge.
 *
 * Penyunting lembar kerja adalah bagian tersulit: ia menyusun "resep"
 * JSON yang nanti dibaca sisi murid untuk menggambar tabel. Guru cukup
 * menambah baris & kolom lewat form; JSON-nya dibuat di balik layar.
 */
import { sb } from '../lib/supabase.js'
import { el, isi, $, $$, roti, dialog, konfirmasi } from '../lib/dom.js'
import { pesanGalat } from '../lib/kesalahan.js'
import * as LK from '../lib/lembar.js'
import { halamanSuntingLkpd } from './kelola-lkpd.js'

/* ==========================================================
   LEMBAR KERJA
   ========================================================== */
export function dialogLembar(wadah, tpId, sprints, urutanBaru, l = null) {
  const fKode = el('input', { type: 'text', placeholder: 'A', value: l?.kode ?? '',
    gaya: { textTransform: 'uppercase', maxWidth: '120px' } })
  const fJudul = el('input', { type: 'text', placeholder: 'Analisis Komponen', value: l?.judul ?? '' })
  const fTipe = el('select', {}, ...Object.entries(LK.TIPE).map(([v, label]) =>
    el('option', { value: v, selected: (l?.tipe ?? 'matriks') === v }, label)))
  const fSprint = el('select', {},
    el('option', { value: '' }, '— tidak terikat sprint —'),
    ...sprints.map(s => el('option', { value: s.id, selected: l?.sprint_id === s.id }, `Sprint ${s.nomor}`)))
  const fKeterangan = el('input', { type: 'text', placeholder: 'Keterangan singkat (opsional)',
    value: l?.keterangan ?? '' })

  // Keadaan kerja untuk baris & kolom
  let baris = [...(l?.struktur?.baris ?? [])]
  let kolom = (l?.struktur?.kolom ?? []).map(k => ({ ...k }))
  let jumlahBaris = Number(l?.struktur?.jumlah_baris ?? 5)
  // Khusus referensi: judul kolom bacaan + isi data (larik baris → larik sel)
  let kolomBaca = [...(l?.struktur?.kolom_baca ?? [])]
  let dataRef = (l?.struktur?.data ?? []).map(b => [...b])
  if (!kolomBaca.length) kolomBaca = ['', '']
  if (!dataRef.length) dataRef = [kolomBaca.map(() => '')]

  // Khusus soal: salinan butir agar suntingan bisa dibatalkan.
  let soal = (l?.struktur?.soal ?? []).map(q => ({ ...q, opsi: [...(q.opsi ?? [])],
    kunci: Array.isArray(q.kunci) ? [...q.kunci] : (q.kunci ?? null),
    label: q.label ? [...q.label] : null }))

  // Referensi & soal boleh tanpa kolom isian (tabel bacaan murni / butir soal).
  if (!kolom.length && !['referensi', 'soal'].includes(l?.tipe ?? 'matriks')) {
    kolom = [{ label: 'Jawaban', input: 'textarea', key: 'jawaban' }]
  }

  const galat = el('div')
  const areaBaris = el('div')
  const areaKolom = el('div')
  const bagianKolom = el('div', { gaya: { borderTop: '1px solid var(--garis)', margin: '6px 0', paddingTop: '12px' } },
    el('label', { gaya: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase',
                          letterSpacing: '.05em', color: 'var(--tinta-lembut)', display: 'block', marginBottom: '8px' } },
      'Kolom isian murid'),
    areaKolom,
    el('button', { class: 'tbl tbl-kecil', gaya: { marginTop: '4px' },
      onClick: () => { kolom.push({ label: '', input: 'textarea' }); gambarKolom() } }, '+ Kolom'))

  function gambarKolom() {
    isi(areaKolom, ...kolom.map((k, i) => el('div', {
      gaya: { display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' } },
      el('input', { type: 'text', value: k.label, placeholder: 'Nama kolom',
        gaya: { flex: '1' }, onInput: (e) => { k.label = e.target.value } }),
      k.input === 'pilihan' && el('input', { type: 'text', value: (k.opsi ?? []).join(', '),
        placeholder: 'Pilihan, pisahkan koma', title: 'Daftar pilihan (dropdown), pisahkan dengan koma',
        gaya: { flex: '1' }, onInput: (e) => {
          k.opsi = e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }),
      (() => {
        const s = el('select', { gaya: { maxWidth: '150px' },
          onChange: (e) => { k.input = e.target.value; gambarKolom() } },
          ...Object.entries(LK.INPUT).map(([v, lb]) =>
            el('option', { value: v, selected: (k.input ?? 'textarea') === v }, lb)))
        return s
      })(),
      (kolom.length > 1 || fTipe.value === 'referensi') && el('button', { class: 'tbl tbl-kecil tbl-bahaya',
        title: 'Hapus kolom', onClick: () => { kolom.splice(i, 1); gambarKolom() } }, '✕'),
    )))
    if (!kolom.length) {
      areaKolom.append(el('p', { class: 'ref-catatan' },
        'Tanpa kolom isian: murid hanya membaca tabel ini.'))
    }
  }

  const labelKecil = (t) => el('label', { gaya: { fontSize: '11px', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--tinta-lembut)',
    display: 'block', marginBottom: '6px' } }, t)

  /* ---- Penyunting tabel referensi ---- */
  function gambarReferensi() {
    const n = kolomBaca.length
    const kisi = el('div', { class: 'ref-kisi' },
      el('table', { class: 'ref-tabel' },
        el('thead', {}, el('tr', {},
          ...kolomBaca.map((h, j) => el('th', {},
            el('div', { class: 'ref-kepala' },
              el('input', { type: 'text', value: h, placeholder: `Kolom ${j + 1}`,
                onInput: (e) => { kolomBaca[j] = e.target.value } }),
              n > 1 && el('button', { class: 'tbl tbl-kecil tbl-bahaya', title: 'Hapus kolom ini',
                onClick: () => { kolomBaca.splice(j, 1); dataRef.forEach(b => b.splice(j, 1)); gambarReferensi() } }, '✕')))),
          el('th', { class: 'ref-aksi' }))),
        el('tbody', {}, ...dataRef.map((brs, i) => el('tr', {},
          ...kolomBaca.map((_, j) => el('td', {},
            el('textarea', { rows: '1', placeholder: '…',
              onInput: (e) => { dataRef[i][j] = e.target.value } }, brs[j] ?? ''))),
          el('td', { class: 'ref-aksi' },
            el('button', { class: 'tbl tbl-kecil', title: 'Naikkan', disabled: i === 0,
              onClick: () => { [dataRef[i - 1], dataRef[i]] = [dataRef[i], dataRef[i - 1]]; gambarReferensi() } }, '↑'),
            el('button', { class: 'tbl tbl-kecil tbl-bahaya', title: 'Hapus baris',
              onClick: () => { dataRef.splice(i, 1); if (!dataRef.length) dataRef.push(kolomBaca.map(() => '')); gambarReferensi() } }, '✕')))))))

    isi(areaBaris,
      labelKecil('Isi tabel bacaan'),
      el('p', { class: 'ref-catatan' },
        'Baris judul = nama kolom bacaan. Baris di bawahnya = data yang dibaca murid. ' +
        'Kolom isian murid (di atas) muncul di sebelah kanan tabel ini.'),
      kisi,
      el('div', { gaya: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
        el('button', { class: 'tbl tbl-kecil',
          onClick: () => { dataRef.push(kolomBaca.map(() => '')); gambarReferensi() } }, '+ Baris'),
        el('button', { class: 'tbl tbl-kecil',
          onClick: () => { kolomBaca.push(''); dataRef.forEach(b => b.push('')); gambarReferensi() } }, '+ Kolom bacaan'),
        el('button', { class: 'tbl tbl-kecil', onClick: dialogTempel }, '📋 Tempel dari Excel/Word')),
    )
  }

  // Panel tempel (di dalam dialog yang sama — bukan dialog bertumpuk,
  // agar tombol Esc tidak menutup penyunting sekaligus).
  function dialogTempel() {
    const ada = $('.ref-panel-tempel', areaBaris)
    if (ada) { ada.remove(); return }
    const ta = el('textarea', { rows: '7', class: 'ref-tempel',
      placeholder: 'Salin tabel dari Excel, Google Sheets, atau Word, lalu tempel (Ctrl+V) di sini.' })
    const cekJudul = el('input', { type: 'checkbox', checked: true })
    const info = el('p', { class: 'ref-catatan' })
    ta.addEventListener('input', () => {
      const r = LK.uraiTempelan(ta.value)
      info.textContent = r.length ? `Terbaca ${r.length} baris × ${Math.max(...r.map(x => x.length))} kolom.` : ''
    })
    const panel = el('div', { class: 'ref-panel-tempel' },
      ta,
      el('label', { gaya: { display: 'flex', gap: '6px', alignItems: 'center', margin: '6px 0', fontSize: '13px' } },
        cekJudul, 'Baris pertama adalah judul kolom'),
      info,
      el('div', { gaya: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
        el('button', { class: 'tbl tbl-kecil', onClick: () => panel.remove() }, 'Batal'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', onClick: () => {
          const r = LK.uraiTempelan(ta.value)
          if (!r.length) { info.textContent = 'Belum ada tabel yang terbaca.'; return }
          const lebar = Math.max(...r.map(x => x.length))
          const rata = r.map(x => Array.from({ length: lebar }, (_, j) => x[j] ?? ''))
          if (cekJudul.checked) { kolomBaca = rata[0]; dataRef = rata.slice(1) }
          else {
            kolomBaca = Array.from({ length: lebar }, (_, j) => kolomBaca[j] || `Kolom ${j + 1}`)
            dataRef = rata
          }
          if (!dataRef.length) dataRef = [kolomBaca.map(() => '')]
          gambarReferensi(); roti('Tabel ditempel — periksa lalu Simpan')
        } }, 'Pakai (ganti isi tabel)')),
    )
    areaBaris.append(panel)
    ta.focus()
  }

  /* ---- Penyunting lembar SOAL ---- */
  function gambarSoal() {
    const kartu = soal.map((q, i) => {
      const fNo = el('input', { type: 'text', value: q.no ?? '', placeholder: 'No', class: 'soal-ed-no',
        title: 'Nomor butir, mis. 2b', onInput: (e) => { q.no = e.target.value } })
      const fJenis = el('select', { class: 'soal-ed-jenis', onChange: (e) => {
        q.jenis = e.target.value
        if ((q.jenis === 'pg' || q.jenis === 'centang') && (q.opsi ?? []).length < 2) q.opsi = [...(q.opsi ?? []), '', ''].slice(0, Math.max(2, q.opsi?.length ?? 0))
        q.kunci = q.jenis === 'centang' ? (Array.isArray(q.kunci) ? q.kunci : []) : (Array.isArray(q.kunci) ? (q.kunci[0] ?? null) : q.kunci)
        if (q.jenis === 'kolom' && !q.label?.length) q.label = [...LK.LABEL_TEBAK]
        gambarSoal()
      } }, ...Object.entries(LK.JENIS_SOAL).map(([v, t]) => el('option', { value: v, selected: q.jenis === v }, t)))
      const fTeks = el('textarea', { rows: '3', class: 'soal-ed-teks',
        placeholder: 'Pertanyaan / petunjuk. Boleh **tebal**, `kode`, dan blok ```js … ```',
        onInput: (e) => { q.teks = e.target.value } }, q.teks ?? '')

      const bagian = [
        el('div', { class: 'soal-ed-kepala' }, fNo, fJenis,
          el('button', { class: 'tbl tbl-kecil', title: 'Naikkan', disabled: i === 0,
            onClick: () => { [soal[i - 1], soal[i]] = [soal[i], soal[i - 1]]; gambarSoal() } }, '↑'),
          el('button', { class: 'tbl tbl-kecil', title: 'Turunkan', disabled: i === soal.length - 1,
            onClick: () => { [soal[i + 1], soal[i]] = [soal[i], soal[i + 1]]; gambarSoal() } }, '↓'),
          el('button', { class: 'tbl tbl-kecil tbl-bahaya', title: 'Hapus butir',
            onClick: () => { soal.splice(i, 1); gambarSoal() } }, '✕')),
        fTeks,
      ]

      if (q.jenis === 'pg' || q.jenis === 'centang') {
        const ganda = q.jenis === 'centang'
        const nama = 'kunci-' + q.id
        bagian.push(el('div', { class: 'soal-ed-opsi' },
          ...(q.opsi ?? []).map((o, j) => el('div', { class: 'soal-ed-opsi-baris' },
            el('input', { type: ganda ? 'checkbox' : 'radio', name: nama, title: 'Tandai sebagai jawaban benar',
              checked: ganda ? (q.kunci ?? []).includes(j) : q.kunci === j,
              onChange: (e) => {
                if (ganda) {
                  const set = new Set(q.kunci ?? []); e.target.checked ? set.add(j) : set.delete(j)
                  q.kunci = [...set].sort((a, b) => a - b)
                } else q.kunci = j
              } }),
            el('input', { type: 'text', value: o, placeholder: `Pilihan ${String.fromCharCode(65 + j)}`,
              onInput: (e) => { q.opsi[j] = e.target.value } }),
            el('button', { class: 'tbl tbl-kecil tbl-bahaya', title: 'Hapus pilihan', onClick: () => {
              q.opsi.splice(j, 1)
              if (ganda) q.kunci = (q.kunci ?? []).filter(x => x !== j).map(x => x > j ? x - 1 : x)
              else q.kunci = q.kunci === j ? null : (q.kunci > j ? q.kunci - 1 : q.kunci)
              gambarSoal()
            } }, '✕'))),
          el('div', { class: 'soal-ed-bawah' },
            el('button', { class: 'tbl tbl-kecil', onClick: () => { q.opsi.push(''); gambarSoal() } }, '+ Pilihan'),
            el('span', {}, ganda ? 'Centang kotak di kiri = kunci (opsional, boleh lebih dari satu).'
                                 : 'Klik bulatan di kiri = kunci (opsional).'),
            !ganda && q.kunci !== null && q.kunci !== undefined &&
              el('button', { class: 'tbl tbl-kecil tbl-hantu', onClick: () => { q.kunci = null; gambarSoal() } }, 'Hapus kunci'))))
      } else if (q.jenis === 'kolom') {
        bagian.push(el('div', { class: 'ruas', gaya: { margin: '6px 0 0' } },
          el('label', {}, 'Judul kotak jawaban (pisahkan dengan / )'),
          el('input', { type: 'text', value: (q.label ?? LK.LABEL_TEBAK).join(' / '),
            onInput: (e) => { q.label = e.target.value.split('/').map(x => x.trim()).filter(Boolean) } })))
      }
      return el('div', { class: 'soal-ed-butir' }, ...bagian)
    })

    isi(areaBaris,
      labelKecil(`Butir soal (${soal.length})`),
      el('p', { class: 'ref-catatan' },
        'Tiap butir tampil ke murid lengkap dengan tempat menjawab. Kunci jawaban tidak pernah terlihat oleh murid.'),
      ...kartu,
      el('div', { gaya: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
        el('button', { class: 'tbl tbl-kecil', onClick: () => {
          soal.push({ id: LK.idSoalBaru(), no: '', jenis: 'panjang', teks: '', opsi: [], kunci: null, label: null })
          gambarSoal()
          areaBaris.querySelectorAll('.soal-ed-teks')[soal.length - 1]?.focus()
        } }, '+ Butir'),
        el('button', { class: 'tbl tbl-kecil', onClick: () => panelTeksSoal(false) }, '📥 Impor dari teks'),
        soal.length > 0 && el('button', { class: 'tbl tbl-kecil', onClick: () => panelTeksSoal(true) }, '📝 Sunting sebagai teks')),
    )
  }

  // Panel impor / sunting-sebagai-teks (di dalam dialog yang sama).
  function panelTeksSoal(sunting) {
    $('.ref-panel-tempel', areaBaris)?.remove()
    const ta = el('textarea', { rows: '12', class: 'ref-tempel' }, sunting ? LK.soalKeTeks(soal) : '')
    ta.placeholder = '### 2b | pg\nSebelum menjalankan, lingkari tebakan kalian:\n- [ ] Error\n- [x] Berhasil, kuota menjadi 25\n\n### 2d | panjang\nApa yang terjadi?'
    const info = el('p', { class: 'ref-catatan' })
    const perbarui = () => {
      const r = LK.uraiSoalTeks(ta.value)
      info.textContent = r.length ? `Terbaca ${r.length} butir.` : ''
    }
    ta.addEventListener('input', perbarui); perbarui()
    const terapkan = (ganti) => {
      const r = LK.uraiSoalTeks(ta.value)
      if (!r.length) { info.textContent = 'Belum ada butir yang terbaca.'; return }
      if (sunting) {
        // Pertahankan penanda butir lama berdasarkan urutan, agar jawaban murid tidak hilang.
        r.forEach((q, i) => { if (soal[i]) q.id = soal[i].id })
      }
      soal = ganti ? r : [...soal, ...r]
      panel.remove(); gambarSoal(); roti(`${r.length} butir ${ganti ? 'diterapkan' : 'ditambahkan'} — periksa lalu Simpan`)
    }
    const panel = el('div', { class: 'ref-panel-tempel' },
      el('details', { class: 'soal-format' },
        el('summary', {}, 'Format teks (klik untuk melihat)'),
        el('pre', {}, [
          '### <nomor> | <jenis>      ← awal tiap butir',
          'Teks pertanyaan (boleh beberapa baris dan blok ```js)',
          '- [ ] pilihan biasa         ← untuk pg / centang',
          '- [x] pilihan benar (kunci, opsional)',
          '',
          'Jenis: singkat · panjang · pg · centang · tebak · info',
          'Kotak sendiri:  ### 2f | kolom: Method / Hasil',
        ].join('\n'))),
      ta, info,
      el('div', { gaya: { display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' } },
        el('button', { class: 'tbl tbl-kecil', onClick: () => panel.remove() }, 'Batal'),
        !sunting && soal.length > 0 && el('button', { class: 'tbl tbl-kecil', onClick: () => terapkan(false) }, 'Tambahkan di akhir'),
        el('button', { class: 'tbl tbl-kecil tbl-utama', onClick: () => terapkan(true) },
          sunting ? 'Terapkan perubahan' : (soal.length ? 'Ganti semua butir' : 'Pakai'))))
    areaBaris.append(panel)
    ta.focus()
  }

  function gambarBaris() {
    const tipe = fTipe.value
    bagianKolom.style.display = tipe === 'soal' ? 'none' : ''
    if (tipe === 'soal') {
      areaBaris.closest('.dialog')?.style.setProperty('max-width', '780px')
      gambarSoal(); return
    }
    if (tipe === 'matriks' || tipe === 'formulir') {
      // Baris berlabel
      isi(areaBaris,
        el('label', { gaya: { fontSize: '11px', fontWeight: '600', textTransform: 'uppercase',
                              letterSpacing: '.05em', color: 'var(--tinta-lembut)', display: 'block', marginBottom: '5px' } },
          'Label tiap baris'),
        ...baris.map((b, i) => el('div', {
          gaya: { display: 'flex', gap: '6px', marginBottom: '6px' } },
          el('input', { type: 'text', value: b, placeholder: `Baris ${i + 1}`,
            gaya: { flex: '1' }, onInput: (e) => { baris[i] = e.target.value } }),
          el('button', { class: 'tbl tbl-kecil tbl-bahaya',
            onClick: () => { baris.splice(i, 1); gambarBaris() } }, '✕'),
        )),
        el('button', { class: 'tbl tbl-kecil', onClick: () => { baris.push(''); gambarBaris() } }, '+ Baris'),
      )
    } else if (tipe === 'daftar') {
      isi(areaBaris,
        el('div', { class: 'ruas' },
          el('label', {}, 'Jumlah baris kosong'),
          el('input', { type: 'number', min: '1', max: '50', value: jumlahBaris,
            gaya: { maxWidth: '120px' }, onInput: (e) => { jumlahBaris = Number(e.target.value) } })),
      )
    } else {
      gambarReferensi()
    }
  }

  fTipe.addEventListener('change', () => {
    // Lembar baru yang diubah ke referensi: buang kolom isian bawaan "Jawaban"
    // agar tabel bacaan murni tidak memunculkan kolom isian tanpa sengaja.
    if (!l && fTipe.value === 'referensi' && kolom.length === 1 &&
        kolom[0].key === 'jawaban' && kolom[0].label === 'Jawaban') kolom = []
    gambarKolom(); gambarBaris()
  })
  gambarKolom(); gambarBaris()

  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')
  const hapus = l && el('button', { class: 'tbl tbl-bahaya', onClick: () => hapusLembar(wadah, tpId, l) }, 'Hapus')

  async function kirim() {
    if (!fKode.value.trim() || !fJudul.value.trim()) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Kode dan judul wajib diisi.')); return
    }
    // Bangun struktur, lengkapi key otomatis dari label
    const kolomBersih = kolom
      .filter(k => k.label.trim())
      .map(k => ({ key: k.key || LK.jadikanKey(k.label), label: k.label.trim(), input: k.input || 'textarea',
                   ...(k.input === 'pilihan' ? { opsi: k.opsi ?? [] } : {}) }))

    const tipe = fTipe.value
    if (!kolomBersih.length && !['referensi', 'soal'].includes(tipe)) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Minimal satu kolom dengan nama.')); return
    }

    const struktur = { kolom: tipe === 'soal' ? [] : kolomBersih }
    if (tipe === 'soal') {
      struktur.soal = soal.map(q => {
        const b = { id: q.id || LK.idSoalBaru(), no: String(q.no ?? '').trim(), jenis: q.jenis,
                    teks: String(q.teks ?? '').replace(/\s+$/, '') }
        if (q.jenis === 'pg' || q.jenis === 'centang') {
          // Buang pilihan kosong sambil menyesuaikan indeks kunci.
          const peta = new Map(); const opsi = []
          ;(q.opsi ?? []).forEach((o, j) => { if (String(o).trim()) { peta.set(j, opsi.length); opsi.push(String(o).trim()) } })
          b.opsi = opsi
          b.kunci = q.jenis === 'centang'
            ? (Array.isArray(q.kunci) && q.kunci.length ? q.kunci.filter(j => peta.has(j)).map(j => peta.get(j)) : null)
            : (q.kunci !== null && q.kunci !== undefined && peta.has(q.kunci) ? peta.get(q.kunci) : null)
          if (Array.isArray(b.kunci) && !b.kunci.length) b.kunci = null
        }
        if (q.jenis === 'kolom') b.label = (q.label ?? []).length ? q.label : [...LK.LABEL_TEBAK]
        return b
      })
    } else if (tipe === 'matriks' || tipe === 'formulir') {
      const barisBersih = baris.filter(b => b.trim())
      if (!barisBersih.length) {
        isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Tabel jenis ini butuh minimal satu baris berlabel.')); return
      }
      struktur.baris = barisBersih
    } else if (tipe === 'daftar') {
      struktur.jumlah_baris = jumlahBaris
    } else {
      // Referensi: buang kolom bacaan tanpa judul & baris yang seluruhnya kosong.
      const pakaiKolom = kolomBaca.map((h, j) => [h.trim(), j]).filter(([h]) => h)
      if (!pakaiKolom.length) {
        isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Beri nama minimal satu kolom bacaan.')); return
      }
      struktur.kolom_baca = pakaiKolom.map(([h]) => h)
      struktur.data = dataRef
        .map(b => pakaiKolom.map(([, j]) => String(b[j] ?? '').trim()))
        .filter(b => b.some(c => c !== ''))
    }

    // Validasi akhir memakai pustaka yang sama dengan sisi murid
    const masalah = LK.periksaStruktur(tipe, struktur)
    if (masalah.length) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, masalah[0])); return
    }

    // Kunci jawaban TIDAK ikut di struktur (yang boleh dibaca murid);
    // disimpan terpisah di tabel kunci_lembar yang hanya bisa dibaca guru.
    let petaKunci = null
    if (tipe === 'soal') {
      petaKunci = {}
      struktur.soal = struktur.soal.map(({ kunci, ...q }) => {
        if (kunci !== null && kunci !== undefined) petaKunci[q.id] = kunci
        return q
      })
    }

    simpan.disabled = true; isi(galat)
    const data = {
      tujuan_pembelajaran_id: tpId, kode: fKode.value.trim().toUpperCase(),
      judul: fJudul.value.trim(), tipe, struktur,
      sprint_id: fSprint.value ? Number(fSprint.value) : null,
      keterangan: fKeterangan.value.trim() || null,
      urutan: l?.urutan ?? urutanBaru,
    }
    try {
      const { data: hasil, error } = l
        ? await sb.from('lembar_kerja').update(data).eq('id', l.id).select('id').single()
        : await sb.from('lembar_kerja').insert(data).select('id').single()
      if (error) {
        if (error.code === '23505') throw new Error('Kode lembar ini sudah dipakai pada TP ini.')
        throw error
      }
      if (petaKunci) {
        const { error: eK } = await sb.from('kunci_lembar')
          .upsert({ lembar_kerja_id: hasil?.id ?? l?.id, kunci: petaKunci, diubah_pada: new Date().toISOString() })
        if (eK) throw new Error('Soal tersimpan, tetapi kunci jawaban gagal disimpan: ' + pesanGalat(eK) +
          '. Pastikan migrasi 20260101002700_kunci_rahasia.sql sudah dijalankan.')
      }
      tutup(); roti(l ? 'Lembar diperbarui' : 'Lembar ditambahkan'); halamanSuntingLkpd(wadah, tpId)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  tutup = dialog({
    judul: l ? `Ubah ${l.tipe === 'soal' ? 'Soal' : 'Tabel'} ${l.kode}` : 'Lembar kerja baru',
    badan: el('div', {}, galat,
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Kode (mis. A, B, C1)'), fKode),
        el('div', { class: 'ruas' }, el('label', {}, 'Terikat sprint'), fSprint)),
      el('div', { class: 'ruas' }, el('label', {}, 'Judul'), fJudul),
      el('div', { class: 'ruas' }, el('label', {}, 'Jenis lembar'), fTipe),
      el('div', { class: 'ruas' }, el('label', {}, 'Keterangan'), fKeterangan),
      bagianKolom,
      el('div', { gaya: { borderTop: '1px solid var(--garis)', margin: '12px 0 0', paddingTop: '12px' } }, areaBaris),
    ),
    kaki: [hapus, el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)].filter(Boolean),
    lebar: (l?.tipe === 'soal') ? '780px' : '600px',
  })
  // gambarBaris pertama terjadi sebelum dialog terpasang; atur lebar ulang bila soal.
  if (fTipe.value === 'soal') areaBaris.closest('.dialog')?.style.setProperty('max-width', '780px')
}

async function hapusLembar(wadah, tpId, l) {
  const ya = await konfirmasi({
    judul: `Hapus Tabel ${l.kode}?`,
    pesan: `"${l.judul}" akan dihapus. Isian murid pada tabel ini juga akan hilang.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('lembar_kerja').delete().eq('id', l.id)
    if (error) throw error
    $('.tirai')?.remove(); document.body.style.overflow = ''
    roti('Lembar dihapus'); halamanSuntingLkpd(wadah, tpId)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}

/* ==========================================================
   BADGE
   ========================================================== */
const TIPE_SYARAT = {
  task_selesai:       'Menyelesaikan satu tugas tertentu',
  sprint_tuntas:      'Menuntaskan semua tugas inti satu sprint',
  semua_inti_tuntas:  'Menuntaskan semua tugas inti seluruh TP',
  level_tantangan:    'Menyelesaikan tantangan level tertentu',
  tepat_estimasi:     'Beberapa tugas selesai dalam estimasi waktu',
  jadi_tutor:         'Menjadi tutor sebaya',
  jumlah_tugas:       'Menyelesaikan sejumlah tugas apa pun',
}

export function dialogBadge(wadah, tpId, sprints, urutanBaru, b = null) {
  const fNama = el('input', { type: 'text', placeholder: 'Environment Ready', value: b?.nama ?? '' })
  const fEmoji = el('input', { type: 'text', placeholder: '🧰', maxlength: '4',
    value: b?.emoji ?? '', gaya: { maxWidth: '80px', textAlign: 'center', fontSize: '20px' } })
  const fKode = el('input', { type: 'text', placeholder: 'env_ready', value: b?.kode ?? '' })
  const fXp = el('input', { type: 'number', min: '0', placeholder: '50', value: b?.xp ?? '' })
  const fDesk = el('input', { type: 'text', placeholder: 'IDE + SDK terpasang', value: b?.deskripsi ?? '' })

  const syaratAda = b?.syarat?.tipe ?? 'task_selesai'
  const fTipe = el('select', {}, ...Object.entries(TIPE_SYARAT).map(([v, label]) =>
    el('option', { value: v, selected: syaratAda === v }, label)))

  // Ruas tambahan tergantung tipe syarat
  const areaSyarat = el('div')
  function gambarSyarat() {
    const tipe = fTipe.value
    const s = b?.syarat ?? {}
    if (tipe === 'task_selesai') {
      isi(areaSyarat, el('div', { class: 'ruas' },
        el('label', {}, 'Kode tugas yang harus selesai'),
        el('input', { type: 'text', id: 'sy-task', placeholder: 'RPL-12.1-101', value: s.task_kode ?? '' })))
    } else if (tipe === 'sprint_tuntas') {
      isi(areaSyarat, el('div', { class: 'ruas' },
        el('label', {}, 'Sprint nomor berapa'),
        el('select', { id: 'sy-sprint' }, ...sprints.map(sp =>
          el('option', { value: sp.nomor, selected: s.sprint_nomor === sp.nomor }, `Sprint ${sp.nomor}`)))))
    } else if (tipe === 'level_tantangan') {
      isi(areaSyarat, el('div', { class: 'ruas' },
        el('label', {}, 'Level tantangan'),
        el('select', { id: 'sy-level' }, ...[1,2,3].map(lv =>
          el('option', { value: lv, selected: s.level === lv }, `Level ${lv}`)))))
    } else if (tipe === 'tepat_estimasi' || tipe === 'jumlah_tugas') {
      isi(areaSyarat, el('div', { class: 'ruas' },
        el('label', {}, 'Jumlah tugas'),
        el('input', { type: 'number', id: 'sy-jumlah', min: '1', value: s.jumlah ?? 3 })))
    } else {
      isi(areaSyarat)
    }
  }
  fTipe.addEventListener('change', gambarSyarat)
  gambarSyarat()

  const galat = el('div')
  let tutup
  const simpan = el('button', { class: 'tbl tbl-utama', onClick: kirim }, 'Simpan')
  const hapus = b && el('button', { class: 'tbl tbl-bahaya', onClick: () => hapusBadge(wadah, tpId, b) }, 'Hapus')

  async function kirim() {
    if (!fNama.value.trim() || !fKode.value.trim()) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, 'Nama dan kode wajib diisi.')); return
    }
    // Susun syarat
    const tipe = fTipe.value
    const syarat = { tipe }
    if (tipe === 'task_selesai') syarat.task_kode = $('#sy-task')?.value.trim()
    else if (tipe === 'sprint_tuntas') syarat.sprint_nomor = Number($('#sy-sprint')?.value)
    else if (tipe === 'level_tantangan') syarat.level = Number($('#sy-level')?.value)
    else if (tipe === 'tepat_estimasi' || tipe === 'jumlah_tugas') syarat.jumlah = Number($('#sy-jumlah')?.value)

    simpan.disabled = true; isi(galat)
    const data = {
      tujuan_pembelajaran_id: tpId, kode: fKode.value.trim(), nama: fNama.value.trim(),
      emoji: fEmoji.value.trim() || null, deskripsi: fDesk.value.trim() || null,
      xp: fXp.value ? Number(fXp.value) : 0, syarat, urutan: b?.urutan ?? urutanBaru,
    }
    try {
      const { error } = b
        ? await sb.from('badge').update(data).eq('id', b.id)
        : await sb.from('badge').insert(data)
      if (error) {
        if (error.code === '23505') throw new Error('Kode badge ini sudah dipakai pada TP ini.')
        throw error
      }
      tutup(); roti(b ? 'Badge diperbarui' : 'Badge ditambahkan'); halamanSuntingLkpd(wadah, tpId)
    } catch (err) {
      isi(galat, el('div', { class: 'pesan pesan-galat' }, pesanGalat(err))); simpan.disabled = false
    }
  }

  tutup = dialog({
    judul: b ? `Ubah badge — ${b.nama}` : 'Badge baru',
    badan: el('div', {}, galat,
      el('div', { gaya: { display: 'flex', gap: '10px', alignItems: 'flex-end' } },
        el('div', { class: 'ruas', gaya: { marginBottom: '14px' } }, el('label', {}, 'Emoji'), fEmoji),
        el('div', { class: 'ruas', gaya: { flex: '1' } }, el('label', {}, 'Nama badge'), fNama)),
      el('div', { class: 'kisi-2' },
        el('div', { class: 'ruas' }, el('label', {}, 'Kode (unik)'), fKode),
        el('div', { class: 'ruas' }, el('label', {}, 'XP hadiah'), fXp)),
      el('div', { class: 'ruas' }, el('label', {}, 'Deskripsi'), fDesk),
      el('div', { gaya: { borderTop: '1px solid var(--garis)', margin: '4px 0', paddingTop: '12px' } },
        el('div', { class: 'ruas' }, el('label', {}, 'Syarat memperoleh'), fTipe),
        areaSyarat),
    ),
    kaki: [hapus, el('div', { gaya: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
      el('button', { class: 'tbl', onClick: () => tutup() }, 'Batal'), simpan)].filter(Boolean),
    lebar: '520px',
  })
}

async function hapusBadge(wadah, tpId, b) {
  const ya = await konfirmasi({
    judul: 'Hapus badge?',
    pesan: `Badge "${b.nama}" akan dihapus.`,
    tombol: 'Hapus', bahaya: true,
  })
  if (!ya) return
  try {
    const { error } = await sb.from('badge').delete().eq('id', b.id)
    if (error) throw error
    $('.tirai')?.remove(); document.body.style.overflow = ''
    roti('Badge dihapus'); halamanSuntingLkpd(wadah, tpId)
  } catch (err) { roti(pesanGalat(err), '⚠') }
}
