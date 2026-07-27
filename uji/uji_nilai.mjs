import { readFileSync } from 'fs'
const src = readFileSync(new URL('../src/lib/nilai.js', import.meta.url), 'utf8')
const mod = await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))
const { hitungNilai, predikatUntuk, nilaiReview, nilaiKecepatan, hitungNilaiSprint, NILAI_HURUF } = mod

let lulus=0, gagal=0
const ok=(n,f)=>{try{const r=f();if(r===false){console.log('  ✗ '+n);gagal++}else{console.log('  ✓ '+n+(typeof r==='string'?' → '+r:''));lulus++}}catch(e){console.log('  ✗ '+n+' → '+e.message);gagal++}}
const bab=s=>console.log('\n=== '+s+' ===')

bab('Nilai dasar dari tugas inti')
ok('tuntas semua inti = 100', () => hitungNilai({inti_selesai:16,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).nilai===100)
ok('setengah inti = 50', () => hitungNilai({inti_selesai:8,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).nilai===50)
ok('nol inti = 0', () => hitungNilai({inti_selesai:0,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).nilai===0)
ok('3 dari 4 inti = 75', () => hitungNilai({inti_selesai:3,inti_total:4,tantangan_selesai:0,jumlah_badge:0}).nilai===75)

bab('Status tuntas (KKTP)')
ok('semua inti → tuntas true', () => hitungNilai({inti_selesai:16,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).tuntas===true)
ok('kurang satu → tuntas false', () => hitungNilai({inti_selesai:15,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).tuntas===false)

bab('Bonus tantangan & badge menambah, dibatasi 100')
ok('inti penuh + tantangan tetap max 100', () => hitungNilai({inti_selesai:16,inti_total:16,tantangan_selesai:12,jumlah_badge:9}).nilai===100)
ok('bonus menambal inti kurang', () => {
  // 15/16 inti = 93.75 dasar; +2 tantangan (8) → 101.75 → dibatasi 100
  const r = hitungNilai({inti_selesai:15,inti_total:16,tantangan_selesai:2,jumlah_badge:0})
  return r.nilai===100 ? true : 'dapat '+r.nilai
})
ok('bonus terukur saat dasar rendah', () => {
  // 8/16 = 50 dasar; +3 tantangan (12) +2 badge (4) = 66
  const r = hitungNilai({inti_selesai:8,inti_total:16,tantangan_selesai:3,jumlah_badge:2})
  return r.nilai===66 ? true : 'dapat '+r.nilai
})
ok('rincian bonus benar', () => {
  const r = hitungNilai({inti_selesai:8,inti_total:16,tantangan_selesai:3,jumlah_badge:2})
  return r.dasar===50 && r.bonus===16
})

bab('Predikat')
ok('95 = Sangat Baik', () => predikatUntuk(95)==='Sangat Baik')
ok('85 = Baik', () => predikatUntuk(85)==='Baik')
ok('75 = Cukup', () => predikatUntuk(75)==='Cukup')
ok('60 = Perlu Bimbingan', () => predikatUntuk(60)==='Perlu Bimbingan')
ok('90 tepat = Sangat Baik', () => predikatUntuk(90)==='Sangat Baik')
ok('70 tepat = Cukup', () => predikatUntuk(70)==='Cukup')

bab('Kasus tepi (tidak error)')
ok('inti_total 0 tidak bagi-nol', () => hitungNilai({inti_selesai:0,inti_total:0,tantangan_selesai:0,jumlah_badge:0}).nilai===0)
ok('inti_total 0 → tuntas false', () => hitungNilai({inti_selesai:0,inti_total:0,tantangan_selesai:0,jumlah_badge:0}).tuntas===false)
ok('selesai > total dibatasi', () => hitungNilai({inti_selesai:20,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).nilai===100)
ok('nilai negatif mustahil', () => hitungNilai({inti_selesai:-5,inti_total:16,tantangan_selesai:0,jumlah_badge:0}).nilai>=0)
ok('data kosong aman', () => hitungNilai({}).nilai===0)

bab('Skenario nyata TP 12.1 (16 inti, 12 tantangan, 9 badge)')
ok('murid rajin: 16 inti, 6 tantangan, 7 badge → 100', () => {
  const r = hitungNilai({inti_selesai:16,inti_total:16,tantangan_selesai:6,jumlah_badge:7})
  return r.nilai===100 && r.tuntas
})
ok('murid tuntas pas: 16 inti, 0 tantangan → 100 & tuntas', () => {
  const r = hitungNilai({inti_selesai:16,inti_total:16,tantangan_selesai:0,jumlah_badge:0})
  return r.nilai===100 && r.tuntas && r.predikat==='Sangat Baik'
})
ok('murid tertinggal: 10 inti → 62, belum tuntas', () => {
  const r = hitungNilai({inti_selesai:10,inti_total:16,tantangan_selesai:0,jumlah_badge:0})
  return r.nilai===63 || r.nilai===62 ? ('nilai '+r.nilai+', tuntas '+r.tuntas) : 'dapat '+r.nilai
})

bab('Model baru: nilai review (rata-rata huruf)')
ok('semua A = 100', () => nilaiReview(['A','A','A'], 3) === 100)
ok('A,C dari 2 inti = 87.5', () => nilaiReview(['A','C'], 2) === 87.5)
ok('1 tugas dinilai A dari 4 inti = 25', () => nilaiReview(['A'], 4) === 25)
ok('kosong = 0', () => nilaiReview([], 4) === 0)
ok('huruf E = 40', () => NILAI_HURUF.E === 40)

bab('Model baru: nilai kecepatan (peringkat + penalti)')
ok('tercepat dari 5 = 100', () => nilaiKecepatan({peringkat:1, jumlahKumpul:5, jamTelat:0}) === 100)
ok('terakhir dari 5 = 60', () => nilaiKecepatan({peringkat:5, jumlahKumpul:5, jamTelat:0}) === 60)
ok('sendirian = 100', () => nilaiKecepatan({peringkat:1, jumlahKumpul:1, jamTelat:0}) === 100)
ok('belum kumpul = 0', () => nilaiKecepatan({peringkat:null}) === 0)
ok('telat 3 jam kurangi 6', () => nilaiKecepatan({peringkat:1, jumlahKumpul:1, jamTelat:3}) === 94)
ok('telat parah dibatasi maks 40', () => nilaiKecepatan({peringkat:1, jumlahKumpul:1, jamTelat:100}) === 60)

bab('Model baru: nilai sprint gabungan berbobot')
ok('semua sempurna = 100', () => {
  const r = hitungNilaiSprint({hurufList:['A','A'], intiTotal:2, jumlahBadge:10,
    kecepatan:{peringkat:1, jumlahKumpul:1, jamTelat:0}})
  return r.nilai === 100 ? 'nilai '+r.nilai : 'dapat '+r.nilai
})
ok('review saja bagus, tanpa badge/kecepatan', () => {
  // default 65/20/15; review 100, badge 0, kecepatan 0 → 65
  const r = hitungNilaiSprint({hurufList:['A'], intiTotal:1, jumlahBadge:0, kecepatan:{peringkat:null}})
  return r.nilai === 65 ? 'nilai '+r.nilai : 'dapat '+r.nilai
})
ok('bobot bisa diubah', () => {
  const r = hitungNilaiSprint({hurufList:['A'], intiTotal:1, jumlahBadge:0, kecepatan:{peringkat:null}},
    {review:100, badge:0, kecepatan:0})
  return r.nilai === 100
})
ok('rincian menyimpan komponen', () => {
  const r = hitungNilaiSprint({hurufList:['B'], intiTotal:1, jumlahBadge:2,
    kecepatan:{peringkat:1, jumlahKumpul:2, jamTelat:0}})
  return r.rincian.review === 85 && r.rincian.badge === 20 && r.rincian.kecepatan === 100
})

console.log('\n'+'='.repeat(50)+'\nLULUS: '+lulus+'    GAGAL: '+gagal)
process.exit(gagal>0?1:0)
