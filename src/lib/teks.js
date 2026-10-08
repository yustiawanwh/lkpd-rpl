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
  const teksTanpaKode = teks.replace(/```([a-zA-Z][\w.+-]*)?[ \t]*\r?\n([\s\S]*?)```/g, (_, bahasa, isi) => {
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
   Pewarna kode (syntax highlighting) sederhana:
   Dart/Flutter, JavaScript, React (JSX), Next.js, TypeScript.

   KEAMANAN: kode di-escape lebih dulu (semua < > & jadi teks), lalu HANYA
   ditambahi <span class="..."> untuk pewarnaan. Tidak ada atribut lain, tidak
   ada eksekusi. Warna diberi lewat kelas CSS (tok-*), bukan gaya inline.

   Pendekatan: tokenisasi berurutan memakai satu regex bergabung, agar token
   tidak saling menimpa (komentar di dalam string tidak ikut diwarnai, dst).
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

const JS_KEYWORD = new Set([
  'async','await','break','case','catch','class','const','continue','debugger',
  'default','delete','do','else','export','extends','false','finally','for','from',
  'function','if','import','in','instanceof','let','new','null','of','return',
  'static','super','switch','this','throw','true','try','typeof','undefined','var',
  'void','while','with','yield','as',
  // TypeScript
  'type','interface','enum','implements','readonly','private','public','protected',
  'declare','namespace','keyof','satisfies',
])
// Objek bawaan JS + API umum React / Next.js.
const JS_TIPE = new Set([
  'Array','Object','String','Number','Boolean','Promise','Map','Set','Date','JSON',
  'Math','Error','TypeError','RegExp','Symbol','console','window','document',
  'fetch','Response','Request','URL','URLSearchParams','FormData','setTimeout',
  'setInterval','clearTimeout','clearInterval','structuredClone','globalThis',
  'process','require','module','exports',
  // TypeScript
  'string','number','boolean','any','unknown','never','object','Record','Partial',
  // React
  'React','useState','useEffect','useContext','useReducer','useRef','useMemo',
  'useCallback','useLayoutEffect','useId','useTransition','createContext',
  'Fragment','StrictMode','Suspense','createRoot','memo','forwardRef','lazy',
  // Next.js
  'Link','Image','Head','Script','useRouter','usePathname','useSearchParams',
  'useParams','redirect','notFound','NextResponse','NextRequest','Metadata',
  'getServerSideProps','getStaticProps','getStaticPaths','revalidatePath',
])

const BAHASA_DART = new Set(['', 'dart', 'flutter'])
const BAHASA_JS = new Set([
  'js','javascript','mjs','cjs','node','nodejs',
  'jsx','react','reactjs',
  'ts','typescript','tsx',
  'next','nextjs','next.js',
])
const NAMA_TAMPIL = {
  js: 'JavaScript', javascript: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  node: 'Node.js', nodejs: 'Node.js', jsx: 'React', react: 'React', reactjs: 'React',
  ts: 'TypeScript', typescript: 'TypeScript', tsx: 'React TS',
  next: 'Next.js', nextjs: 'Next.js', 'next.js': 'Next.js', dart: 'Dart', flutter: 'Flutter',
}

function spanTok(kelas, teksAman) { return `<span class="tok-${kelas}">${teksAman}</span>` }

function warnaiDart(aman) {
  // Catatan: teks SUDAH di-escape, jadi kutip menjadi &#39; dan &quot;.
  // Grup: 1=komentar, 2=string, 3=anotasi, 4=angka, 5=identifier.
  const pola = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(&#39;(?:(?!&#39;).)*&#39;|&quot;(?:(?!&quot;).)*&quot;)|(@[A-Za-z_]\w*)|(\b\d+\.?\d*\b)|([A-Za-z_]\w*)/g
  return aman.replace(pola, (m, komentar, teks, anotasi, angka, kata) => {
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

function warnaiJs(aman) {
  // Grup:
  //  1 komentar (// atau /* */ atau {/* */} JSX)
  //  2 string ('..', "..", `..` template — boleh lintas baris untuk template)
  //  3 pembuka tag JSX (&lt; atau &lt;/)  4 nama tag
  //  5 atribut JSX (nama tepat sebelum = " atau = {)
  //  6 angka  7 identifier  8 penanda ( setelah identifier → nama fungsi
  const pola = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(&#39;(?:(?!&#39;)[^\n])*&#39;|&quot;(?:(?!&quot;)[^\n])*&quot;|`[^`]*`)|(&lt;\/?)([A-Za-z][\w.]*)|([A-Za-z_][\w-]*)(?==(?:&quot;|&#39;|\{))|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g
  return aman.replace(pola, (m, komentar, teks, buka, tag, atribut, angka, kata, kurung) => {
    if (komentar) return spanTok('komentar', komentar)
    if (teks) return spanTok('teks', teks)
    if (buka) {
      // Komponen (huruf besar) → warna jenis; elemen HTML → warna tag.
      const kelas = /^[A-Z]/.test(tag) ? 'tipe' : 'tag'
      return buka + spanTok(kelas, tag)
    }
    if (atribut) return spanTok('atribut', atribut)
    if (angka) return spanTok('angka', angka)
    if (kata) {
      const sisa = kurung || ''
      if (JS_KEYWORD.has(kata)) return spanTok('kunci', kata) + sisa
      if (JS_TIPE.has(kata)) return spanTok('tipe', kata) + sisa
      if (kurung) return spanTok('fungsi', kata) + sisa
      return kata
    }
    return m
  })
}

/** Ubah satu blok kode menjadi HTML berwarna yang aman. */
export function kodeKeHtml(kode, bahasa = '') {
  const aman = escapeHtml(kode)
  let isi = aman
  if (BAHASA_DART.has(bahasa)) isi = warnaiDart(aman)
  else if (BAHASA_JS.has(bahasa)) isi = warnaiJs(aman)
  // Bahasa lain: tampil polos (tetap di kotak kode gelap).

  const nama = NAMA_TAMPIL[bahasa] || bahasa
  const label = nama ? `<div class="kode-label">${escapeHtml(nama)}</div>` : ''
  return `<pre class="kode-blok">${label}<code>${isi}</code></pre>`
}
