-- ============================================================
--  Data awal: LKPD TP 12.1
-- ------------------------------------------------------------
--  Dijalankan sekali setelah migrasi, lewat SQL Editor Supabase
--  atau `supabase db reset`.
--
--  Berkas ini sekaligus contoh bagi guru: begini bentuk data sebuah TP.
--  TP berikutnya dibuat lewat panel, bukan lewat SQL — tapi bentuk
--  datanya persis sama.
-- ============================================================

do $$
declare
  v_mapel  bigint;
  v_tp     bigint;
  v_s1 bigint; v_s2 bigint; v_s3 bigint; v_s4 bigint;
begin

  insert into mata_pelajaran (kode, nama, konsentrasi, fase, tingkat)
  values ('RPL-XII', 'Rekayasa Perangkat Lunak',
          'Rekayasa Perangkat Lunak — Program Keahlian PPLG', 'F', 12)
  on conflict (kode) do update set nama = excluded.nama
  returning id into v_mapel;

  insert into tujuan_pembelajaran (
    mata_pelajaran_id, kode, judul, deskripsi, petunjuk_umum,
    sifat_pengerjaan, total_jp, total_menit, terbit, urutan
  ) values (
    v_mapel, 'TP 12.1',
    'Penyiapan Lingkungan Pengembangan Aplikasi Perangkat Bergerak',
    'Murid mampu menganalisis kebutuhan lingkungan pengembangan aplikasi '
    || 'perangkat bergerak (IDE, SDK, emulator/perangkat uji, dan sistem '
    || 'kendali versi) serta mengonfigurasinya hingga proyek dasar berhasil '
    || 'dijalankan sesuai standar kerja industri perangkat lunak.',
    'Sifat pengerjaan: MANDIRI (individu). Setiap murid mengerjakan seluruh '
    || 'tugas sendiri pada perangkatnya masing-masing. Boleh bertanya kepada '
    || 'guru, tetapi hasil akhir dikerjakan sendiri.',
    'mandiri', 22, 880, true, 1
  )
  on conflict (mata_pelajaran_id, kode) do update set judul = excluded.judul
  returning id into v_tp;

  -- ---------- Indikator KKTP ----------
  delete from kktp_indikator where tujuan_pembelajaran_id = v_tp;
  insert into kktp_indikator (tujuan_pembelajaran_id, nomor, indikator) values
    (v_tp, 1, 'Menjelaskan fungsi minimal 4 komponen lingkungan pengembangan'),
    (v_tp, 2, 'Mengonfigurasi IDE + SDK + emulator/perangkat uji tanpa galat fatal'),
    (v_tp, 3, 'Menjalankan proyek awal & menampilkannya di perangkat uji'),
    (v_tp, 4, 'Menginisialisasi repositori kendali versi beserta commit awal');

  -- ---------- Sprint ----------
  insert into sprint (tujuan_pembelajaran_id, nomor, nama, hari, jp,
                      durasi_menit, menit_inti, tujuan, kktp_terkait)
  values (v_tp, 1, 'Menyiapkan Lingkungan Kerja', 'Senin', '8 JP', 320, 250,
    'Memahami fungsi komponen lingkungan pengembangan, lalu memasang IDE dan SDK hingga siap dipakai.',
    'Indikator (1) & awal indikator (2)')
  on conflict (tujuan_pembelajaran_id, nomor) do update set nama = excluded.nama
  returning id into v_s1;

  insert into sprint (tujuan_pembelajaran_id, nomor, nama, hari, jp,
                      durasi_menit, menit_inti, tujuan, kktp_terkait)
  values (v_tp, 2, 'Riset & Konfigurasi Target Uji', 'Selasa', '6 JP', 240, 180,
    'Mendata & membandingkan berbagai emulator/target uji yang cocok dengan spesifikasi '
    || 'perangkat masing-masing, lalu mengonfigurasi salah satunya hingga terhubung ke IDE.',
    'Indikator (2)')
  on conflict (tujuan_pembelajaran_id, nomor) do update set nama = excluded.nama
  returning id into v_s2;

  insert into sprint (tujuan_pembelajaran_id, nomor, nama, hari, jp,
                      durasi_menit, menit_inti, tujuan, kktp_terkait)
  values (v_tp, 3, 'Proyek Pertama Berjalan', 'Kamis', '4 JP', 160, 110,
    'Membuat proyek awal dan menjalankannya hingga tampil di perangkat uji.',
    'Indikator (3)')
  on conflict (tujuan_pembelajaran_id, nomor) do update set nama = excluded.nama
  returning id into v_s3;

  insert into sprint (tujuan_pembelajaran_id, nomor, nama, hari, jp,
                      durasi_menit, menit_inti, tujuan, kktp_terkait)
  values (v_tp, 4, 'Kendali Versi & Serah Terima', 'Jumat', '4 JP', 160, 120,
    'Menginisialisasi kendali versi + commit awal, menuntaskan studi kasus, '
    || 'dan merefleksikan capaian TP 12.1.',
    'Indikator (4) + evaluasi menyeluruh')
  on conflict (tujuan_pembelajaran_id, nomor) do update set nama = excluded.nama
  returning id into v_s4;

  -- ---------- Tugas ----------
  delete from tugas where sprint_id in (v_s1, v_s2, v_s3, v_s4);

  insert into tugas (sprint_id, kode, judul, deskripsi, bukti_diminta,
                     jenis, level, estimasi_menit, xp, wajib_bukti, urutan) values

  -- Sprint 1 (250 menit inti)
  (v_s1,'RPL-12.1-101','Analisis Komponen',
   'Lengkapi Tabel A: fungsi IDE, SDK, emulator/perangkat uji, dan kendali versi; '
   || 'serta akibat bila tiap komponen tidak ada.',
   'Tabel A terisi lengkap','inti',null,50,25,true,1),
  (v_s1,'RPL-12.1-102','Instalasi IDE',
   'Pasang IDE hingga terbuka tanpa galat. Catat tiap langkah & kendala pada Log Instalasi (Tabel B).',
   'Tangkapan layar IDE terbuka','inti',null,80,40,true,2),
  (v_s1,'RPL-12.1-103','Instalasi SDK & Komponen Pendukung',
   'Pasang SDK, verifikasi terdeteksi IDE (mis. lewat flutter doctor). Lanjutkan mengisi Log Instalasi.',
   'Tangkapan layar SDK terdeteksi','inti',null,80,40,true,3),
  (v_s1,'RPL-12.1-104','Rekap & Serahkan',
   'Rapikan Log Instalasi, tulis 2 kendala tersulit + solusinya, unggah seluruh bukti.',
   'Semua bukti + log','inti',null,40,20,true,4),
  (v_s1,'RPL-12.1-1S1','Konfigurasi PATH',
   'Konfigurasikan variabel lingkungan (PATH) untuk Flutter secara mandiri, '
   || 'lalu verifikasi dengan flutter --version.',
   null,'tantangan',1,0,30,false,5),
  (v_s1,'RPL-12.1-1S2','Perbaiki flutter doctor',
   'Jalankan flutter doctor dan perbaiki minimal satu item bertanda [!]/[×] hingga menjadi centang.',
   null,'tantangan',2,0,45,false,6),
  (v_s1,'RPL-12.1-1S3','Tulis panduan instalasi',
   'Tulis panduan instalasi ringkas versimu sendiri (5–7 langkah) yang bisa dipakai adik kelas.',
   null,'tantangan',3,0,60,false,7),

  -- Sprint 2 (180 menit inti)
  (v_s2,'RPL-12.1-201','Survei Silang Emulator',
   '(a) Isi Tabel C1 dengan spesifikasi perangkatmu; (b) berkeliling mendata minimal '
   || '4 teman pada Tabel C2; (c) tarik simpulan pada Tabel C3.',
   'Tabel C1, C2, C3 terisi','inti',null,45,25,true,1),
  (v_s2,'RPL-12.1-202','Konfigurasi Emulator / Perangkat Uji',
   'Pilih & jalankan target uji yang paling cocok dengan perangkatmu hingga terdeteksi IDE.',
   'Tangkapan layar target uji terdeteksi','inti',null,65,40,true,2),
  (v_s2,'RPL-12.1-203','Uji Koneksi',
   'Pastikan IDE dapat melihat perangkat (mis. flutter devices). Catat hasil pada Tabel D.',
   'Tangkapan layar daftar perangkat','inti',null,40,30,true,3),
  (v_s2,'RPL-12.1-204','Rekap & Serahkan',
   'Lengkapi Tabel D, tulis 1 galat koneksi + solusinya.',
   'Semua bukti + Tabel D','inti',null,30,15,true,4),
  (v_s2,'RPL-12.1-2S1','Uji target kedua',
   'Pasang & jalankan target uji kedua yang berbeda kategori, lalu bandingkan kecepatannya.',
   null,'tantangan',1,0,30,false,5),
  (v_s2,'RPL-12.1-2S2','Verifikasi spesifikasi resmi',
   'Cari spesifikasi minimum resmi salah satu emulator dari sumber terpercaya, '
   || 'lalu lengkapi kolom verifikasi pada Tabel Referensi.',
   null,'tantangan',2,0,45,false,6),
  (v_s2,'RPL-12.1-2S3','Rekomendasi lab',
   'Susun rekomendasi emulator terbaik untuk lab beserta alasannya berdasarkan hasil survei kelas.',
   null,'tantangan',3,0,60,false,7),

  -- Sprint 3 (110 menit inti)
  (v_s3,'RPL-12.1-301','Buat Proyek Awal',
   'Buat proyek aplikasi bergerak dasar (mis. flutter create) dengan nama sesuai ketentuan guru.',
   'Tangkapan layar struktur proyek','inti',null,30,25,true,1),
  (v_s3,'RPL-12.1-302','Jalankan Proyek',
   'Jalankan hingga tampil di emulator/perangkat uji. Tangkap layar hasil tampilan aplikasi.',
   'Tangkapan layar aplikasi berjalan','inti',null,45,40,true,2),
  (v_s3,'RPL-12.1-303','Analisis Struktur Proyek',
   'Isi Tabel E: sebutkan 4 berkas/folder penting pada proyek & fungsinya.',
   'Tabel E terisi','inti',null,25,25,true,3),
  (v_s3,'RPL-12.1-304','Serahkan Bukti',
   'Kumpulkan seluruh bukti.','Semua bukti','inti',null,10,10,true,4),
  (v_s3,'RPL-12.1-3S1','Ubah teks judul',
   'Ubah satu elemen tampilan proyek lalu jalankan ulang & tangkap layar perubahannya.',
   null,'tantangan',1,0,30,false,5),
  (v_s3,'RPL-12.1-3S2','Ubah warna tema',
   'Ubah warna tema aplikasi, jalankan ulang, bandingkan sebelum/sesudah.',
   null,'tantangan',2,0,45,false,6),
  (v_s3,'RPL-12.1-3S3','Telusuri main.dart',
   'Telusuri berkas main.dart & tandai baris mana yang menampilkan judul aplikasi.',
   null,'tantangan',3,0,60,false,7),

  -- Sprint 4 (120 menit inti)
  (v_s4,'RPL-12.1-401','Inisialisasi Kendali Versi',
   'Inisialisasi repositori (git init) pada proyek & lakukan commit awal dengan pesan yang benar.',
   'Tangkapan layar riwayat commit','inti',null,45,40,true,1),
  (v_s4,'RPL-12.1-402','Studi Kasus Klien',
   'Selesaikan Kasus F: susun rencana penyiapan lingkungan untuk sebuah usaha kecil.',
   'Jawaban Kasus F','inti',null,40,45,true,2),
  (v_s4,'RPL-12.1-403','Evaluasi Diri (KKTP)',
   'Centang capaian keempat indikator KKTP pada Tabel G & beri bukti singkat.',
   'Tabel G terisi','inti',null,20,20,true,3),
  (v_s4,'RPL-12.1-404','Retrospektif & Serah Terima',
   'Tulis jurnal refleksi (kendala terbesar, cara mengatasi, pelajaran), unggah semua bukti.',
   'Jurnal + seluruh bukti','inti',null,15,15,true,4),
  (v_s4,'RPL-12.1-4S1','Push ke repositori daring',
   'Tautkan repositori lokal ke repositori daring lalu push commit awal.',
   null,'tantangan',1,0,30,false,5),
  (v_s4,'RPL-12.1-4S2','Commit kedua + README',
   'Buat commit kedua setelah menambah berkas README berisi deskripsi proyek.',
   null,'tantangan',2,0,45,false,6),
  (v_s4,'RPL-12.1-4S3','Latihan pesan commit',
   'Tulis 3 pesan commit contoh yang baik untuk perubahan berbeda.',
   null,'tantangan',3,0,60,false,7),

  -- Peran tutor sebaya, berlaku lintas sprint
  (v_s4,'TP121-PEER','Peran Tutor Sebaya',
   'Setelah menuntaskan tugas inti, bantu teman yang kesulitan. '
   || 'Catat siapa yang kamu bantu dan bagian apa.',
   null,'tutor',null,0,50,false,99);

  -- ---------- Lembar kerja ----------
  delete from lembar_kerja where tujuan_pembelajaran_id = v_tp;

  insert into lembar_kerja (tujuan_pembelajaran_id, sprint_id, kode, judul,
                            keterangan, tipe, struktur, baris_dinamis, urutan) values

  (v_tp, v_s1, 'A', 'Analisis Komponen', null, 'matriks',
   '{"baris":["IDE","SDK","Emulator / Perangkat Uji","Sistem Kendali Versi"],
     "kolom":[{"key":"fungsi","label":"Fungsi","input":"textarea"},
              {"key":"akibat","label":"Akibat bila tidak ada","input":"textarea"}]}'::jsonb,
   false, 0),

  (v_tp, v_s1, 'B', 'Log Instalasi', null, 'daftar',
   '{"jumlah_baris":7,
     "kolom":[{"key":"langkah","label":"Langkah yang dilakukan","input":"textarea"},
              {"key":"status","label":"Status","input":"tri"},
              {"key":"kendala","label":"Kendala & cara mengatasi","input":"textarea"}]}'::jsonb,
   true, 1),

  (v_tp, v_s2, 'REF', 'Ragam Target Uji Aplikasi Flutter',
   'Angka spesifikasi bersifat perkiraan; wajib diverifikasi dari sumber resmi sesuai versi.',
   'referensi',
   '{"kolom":[{"key":"verifikasi","label":"Hasil verifikasimu","input":"textarea"}],
     "kolom_baca":["Target Uji","Kategori","Kelebihan","Kekurangan","Spesifikasi Minimum"],
     "data":[
       ["Emulator Android Studio (AVD)","Berat","Mirip ponsel asli; bisa atur banyak ukuran layar & versi Android","Butuh RAM & prosesor besar; perlu virtualisasi aktif","RAM >= 8 GB, mendukung VT-x/AMD-V [VERIFIKASI]"],
       ["Perangkat Android fisik (USB)","Ringan di PC","Paling cepat & nyata; bisa uji sensor/kamera","Perlu ponsel + kabel data; perlu USB debugging","PC apa pun; ponsel Android [VERIFIKASI]"],
       ["Mode Web (Chrome)","Ringan","Sangat ringan; tak perlu emulator","Hanya untuk aplikasi berbasis web","PC dengan Chrome; RAM >= 4 GB [PERKIRAAN]"],
       ["Emulator pihak ketiga ringan","Ringan-Sedang","Lebih ringan dari AVD; cocok PC menengah","Dukungan resmi bisa terbatas","RAM >= 4-6 GB [VERIFIKASI]"],
       ["Aplikasi Desktop (Windows/Linux)","Ringan","Berjalan langsung tanpa emulator; sangat cepat","Bukan lingkungan ponsel; hanya uji awal","PC standar; RAM >= 4 GB [PERKIRAAN]"]
     ]}'::jsonb,
   false, 2),

  (v_tp, v_s2, 'C1', 'Data Perangkatku Sendiri', null, 'formulir',
   '{"baris":["Merek/Tipe Laptop atau PC","RAM","Prosesor","Sistem Operasi",
              "Target uji yang BERHASIL dipasang","Target uji yang GAGAL / berat"],
     "kolom":[{"key":"isi","label":"Isian","input":"text"}]}'::jsonb,
   false, 3),

  (v_tp, v_s2, 'C2', 'Survei Silang: Data Perangkat Teman',
   'Data minimal 4 teman dengan perangkat berbeda.', 'daftar',
   '{"jumlah_baris":5,
     "kolom":[{"key":"nama","label":"Nama teman","input":"text"},
              {"key":"ram","label":"RAM","input":"text"},
              {"key":"target","label":"Target uji yang dipakai","input":"text"},
              {"key":"lancar","label":"Lancar / Lambat","input":"text"}]}'::jsonb,
   true, 4),

  (v_tp, v_s2, 'C3', 'Kesimpulan Survei', null, 'formulir',
   '{"baris":["Target uji paling cocok untuk perangkat RAM kecil (<= 4 GB)",
              "Target uji paling cocok untuk perangkat RAM besar (>= 8 GB)",
              "Target uji terbaik untuk perangkatku sendiri, beserta alasannya"],
     "kolom":[{"key":"jawaban","label":"Jawaban","input":"textarea"}]}'::jsonb,
   false, 5),

  (v_tp, v_s2, 'D', 'Troubleshooting Koneksi', null, 'daftar',
   '{"jumlah_baris":5,
     "kolom":[{"key":"gejala","label":"Langkah / gejala","input":"textarea"},
              {"key":"status","label":"Status","input":"tri"},
              {"key":"solusi","label":"Solusi","input":"textarea"}]}'::jsonb,
   true, 6),

  (v_tp, v_s3, 'E', 'Analisis Struktur Proyek', null, 'daftar',
   '{"jumlah_baris":4,
     "kolom":[{"key":"berkas","label":"Nama berkas / folder","input":"text"},
              {"key":"fungsi","label":"Fungsi","input":"textarea"}]}'::jsonb,
   true, 7),

  (v_tp, v_s4, 'F', 'Kasus F — Permintaan Klien',
   'Sebuah usaha kecil ingin dibuatkan aplikasi pencatatan sederhana. '
   || 'Sebelum menulis kode, susun rencana penyiapan lingkungan pengembangan.',
   'formulir',
   '{"baris":["(a) Komponen yang disiapkan","(b) Urutan pengerjaan",
              "(c) Cara memastikan lingkungan siap"],
     "kolom":[{"key":"jawaban","label":"Jawaban","input":"textarea"}]}'::jsonb,
   false, 8);

  -- ---------- Badge ----------
  delete from badge where tujuan_pembelajaran_id = v_tp;

  insert into badge (tujuan_pembelajaran_id, kode, nama, emoji, deskripsi, xp, syarat, urutan) values
  (v_tp,'env_ready','Environment Ready','🧰','IDE + SDK terpasang tanpa galat',50,
   '{"tipe":"sprint_tuntas","sprint_nomor":1}'::jsonb,0),
  (v_tp,'device_hunt','Device Hunter','📱','Survei 4 perangkat teman selesai',40,
   '{"tipe":"task_selesai","task_kode":"RPL-12.1-201"}'::jsonb,1),
  (v_tp,'doctor','Doctor Clean','🩺','Perbaiki item flutter doctor',45,
   '{"tipe":"task_selesai","task_kode":"RPL-12.1-1S2"}'::jsonb,2),
  (v_tp,'first_run','First Deploy','🚀','Aplikasi tampil di perangkat uji',50,
   '{"tipe":"task_selesai","task_kode":"RPL-12.1-302"}'::jsonb,3),
  (v_tp,'first_commit','First Commit','🌿','Repositori + commit awal',50,
   '{"tipe":"task_selesai","task_kode":"RPL-12.1-401"}'::jsonb,4),
  (v_tp,'senior','Senior Dev','⭐','Tuntaskan Tantangan Level 3',80,
   '{"tipe":"level_tantangan","level":3}'::jsonb,5),
  (v_tp,'mentor','Peer Mentor','🤝','Menjadi tutor sebaya',50,
   '{"tipe":"jadi_tutor"}'::jsonb,6),
  (v_tp,'on_time','On Estimate','⏱️','Tiga tugas selesai dalam estimasi',40,
   '{"tipe":"tepat_estimasi","jumlah":3}'::jsonb,7),
  (v_tp,'ship_it','Ship It','🏁','Semua tugas inti empat sprint tuntas',120,
   '{"tipe":"semua_inti_tuntas"}'::jsonb,8);

  raise notice 'Data TP 12.1 selesai dimuat.';
end $$;
