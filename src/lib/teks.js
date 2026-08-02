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
  const baris = escapeHtml(teks).split(/\r?\n/)

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
    const butir = t.match(/^[-•]\s+(.*)$/)         // "- item" atau "• item"
    const nomor = t.match(/^\d+[.)]\s+(.*)$/)      // "1. item" atau "1) item"

    if (butir) {
      tutupParagraf()
      if (mode !== 'ul') { tutupDaftar(); keluar.push('<ul>'); mode = 'ul' }
      keluar.push('<li>' + inline(butir[1]) + '</li>')
    } else if (nomor) {
      tutupParagraf()
      if (mode !== 'ol') { tutupDaftar(); keluar.push('<ol>'); mode = 'ol' }
      keluar.push('<li>' + inline(nomor[1]) + '</li>')
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
