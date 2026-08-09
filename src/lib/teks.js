/* ==========================================================
   Pengubah teks berformat sederhana → HTML yang AMAN.

   Mendukung: paragraf, baris baru, **tebal**, *miring*, _garis bawah_,
   daftar butir (- atau •) dan daftar bernomor (1. 2. 3.).

   KEAMANAN: seluruh HTML di-escape lebih dulu, sehingga tag/skrip apa pun
   yang diketik pengguna tampil sebagai teks biasa (tidak dieksekusi). Hanya
   tag aman tanpa atribut yang dihasilkan (<strong>, <em>, <u>, <ul>, <ol>,
   <li>, <p>, <br>). Tidak ada <script>, <img>, <a>, atau atribut apa pun.
   ========================================================== */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Format inline: tebal, miring, garis bawah. Dijalankan pada teks yang SUDAH
// di-escape, jadi hanya penanda yang kita kenali yang berubah jadi tag.
function inline(teks) {
  return teks
    // **tebal**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // _garis bawah_
    .replace(/_([^_]+)_/g, '<u>$1</u>')
    // *miring* (setelah bold agar tak bentrok)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

/**
 * Ubah teks berformat menjadi HTML aman.
 * @returns {string} HTML siap dimasukkan ke el(..., { html })
 */
export function teksKeHtml(teks) {
  if (!teks) return ''

  // Tahap 1: pisahkan BLOK KODE berpagar (```lang ... ```) lebih dulu, agar
  // isinya tidak diproses sebagai paragraf/daftar. Setiap blok diganti
  // sementara dengan penanda unik, lalu dipulihkan di akhir sebagai HTML kode.
  const blokKode = []
  const teksTanpaKode = teks.replace(/```([a-zA-Z]*)\r?\n([\s\S]*?)```/g, (_, bahasa, isi) => {
    const idx = blokKode.length
    blokKode.push(kodeKeHtml(isi.replace(/\n$/, ''), (bahasa || '').toLowerCase()))
    return `\u0000KODE${idx}\u0000`
  })

  const baris = escapeHtml(teksTanpaKode).split(/\r?\n/)

  const keluar = []
  let mode = null          // null | 'ul' | 'ol'
  let paragraf = []

  const tutupParagraf = () => {
    if (paragraf.length) {
      keluar.push('<p>' + inline(paragraf.join('<br>')) + '</p>')
      paragraf = []
    }
  }
  const tutupDaftar = () => {
    if (mode) { keluar.push(`</${mode}>`); mode = null }
  }

  for (const b of baris) {
    const t = b.trim()
    // Baris yang HANYA berisi penanda blok kode → sisipkan HTML kode langsung.
    const penanda = t.match(/^\u0000KODE(\d+)\u0000$/)
    if (penanda) {
      tutupParagraf(); tutupDaftar()
      keluar.push(blokKode[Number(penanda[1])])
      continue
    }
    const butir = t.match(/^[-•]\s+(.*)$/)         // "- item" atau "• item"
    const nomor = t.match(/^(\d+)[.)]\s+(.*)$/)    // "1. item" atau "1) item" (grup 1 = angka)

    if (butir) {
      tutupParagraf()
      if (mode !== 'ul') { tutupDaftar(); keluar.push('<ul>'); mode = 'ul' }
      keluar.push('<li>' + inline(butir[1]) + '</li>')
    } else if (nomor) {
      tutupParagraf()
      if (mode !== 'ol') {
        tutupDaftar()
        // Hormati angka yang diketik: mulai <ol> dari angka pertama kelompok ini.
        const mulai = parseInt(nomor[1], 10)
        keluar.push(mulai > 1 ? `<ol start="${mulai}">` : '<ol>')
        mode = 'ol'
      }
      keluar.push('<li>' + inline(nomor[2]) + '</li>')
    } else if (t === '') {
      // Baris kosong → pisah paragraf / akhiri daftar.
      tutupParagraf(); tutupDaftar()
    } else {
      tutupDaftar()
      paragraf.push(b)
    }
  }
  tutupParagraf(); tutupDaftar()
  return keluar.join('')
}

/* ==========================================================
   Pewarna kode (syntax highlighting) sederhana untuk Dart/Flutter.

   KEAMANAN: kode di-escape lebih dulu (semua < > & jadi teks), lalu HANYA
   ditambahi <span class="..."> untuk pewarnaan. Tidak ada atribut lain, tidak
   ada eksekusi. Warna diberi lewat kelas CSS (tok-*), bukan gaya inline.

   Pendekatan: tokenisasi berurutan (komentar, string, angka, keyword, jenis,
   anotasi) memakai satu regex bergabung, agar tidak saling menimpa.
   ========================================================== */

const DART_KEYWORD = new Set([
  'abstract','as','assert','async','await','break','case','catch','class','const',
  'continue','covariant','default','deferred','do','dynamic','else','enum','export',
  'extends','extension','external','factory','false','final','finally','for','get',
  'hide','if','implements','import','in','is','late','library','mixin','new','null',
  'on','operator','part','required','rethrow','return','sealed','set','show','static',
  'super','switch','sync','this','throw','true','try','typedef','var','void','while',
  'with','yield','base','when',
])
// Jenis/kelas umum Flutter/Dart yang enak diberi warna berbeda.
const DART_TIPE = new Set([
  'int','double','num','bool','String','List','Map','Set','Future','Stream','void',
  'Widget','StatelessWidget','StatefulWidget','State','BuildContext','Key','Column',
  'Row','Container','Text','Scaffold','AppBar','Center','Padding','SizedBox','Icon',
  'MaterialApp','ThemeData','Color','Colors','EdgeInsets','Navigator','Route',
  'Object','Function','Iterable','Duration','GlobalKey','Expanded','Flexible',
])

function spanTok(kelas, teksAman) { return `<span class="tok-${kelas}">${teksAman}</span>` }

/** Ubah satu blok kode menjadi HTML berwarna yang aman. */
export function kodeKeHtml(kode, bahasa = '') {
  const aman = escapeHtml(kode)

  // Hanya warnai bila bahasa dart/flutter (atau kosong). Selain itu tampilkan polos.
  const warnai = bahasa === '' || bahasa === 'dart' || bahasa === 'flutter'
  let isi = aman

  if (warnai) {
    // Satu regex bergabung, diproses berurutan agar token tidak tumpang tindih.
    // Catatan: teks SUDAH di-escape, jadi kutip menjadi &#39; dan &quot;.
    // Grup: 1=komentar, 2=string, 3=anotasi, 4=angka, 5=identifier.
    const pola = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(&#39;(?:(?!&#39;).)*&#39;|&quot;(?:(?!&quot;).)*&quot;)|(@[A-Za-z_]\w*)|(\b\d+\.?\d*\b)|([A-Za-z_]\w*)/g
    isi = aman.replace(pola, (m, komentar, teks, anotasi, angka, kata) => {
      if (komentar) return spanTok('komentar', komentar)
      if (teks) return spanTok('teks', teks)
      if (anotasi) return spanTok('anotasi', anotasi)
      if (angka) return spanTok('angka', angka)
      if (kata) {
        if (DART_KEYWORD.has(kata)) return spanTok('kunci', kata)
        if (DART_TIPE.has(kata)) return spanTok('tipe', kata)
        return kata
      }
      return m
    })
  }

  const label = bahasa ? `<div class="kode-label">${escapeHtml(bahasa)}</div>` : ''
  return `<pre class="kode-blok">${label}<code>${isi}</code></pre>`
}
