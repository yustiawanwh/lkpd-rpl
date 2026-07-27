-- ============================================================
--  Bagian 2: Kurikulum
-- ------------------------------------------------------------
--  Inti dari kemampuan aplikasi menampung LKPD apa pun.
--  Struktur LKPD disimpan sebagai DATA (jsonb), bukan kode — sehingga
--  membuat TP baru tidak memerlukan perubahan program sama sekali.
-- ============================================================

create table tujuan_pembelajaran (
  id                bigint generated always as identity primary key,
  mata_pelajaran_id bigint not null references mata_pelajaran(id) on delete cascade,
  dibuat_oleh       uuid   references profil(id) on delete set null,

  kode              text not null,          -- "TP 12.1"
  judul             text not null,
  deskripsi         text,
  petunjuk_umum     text,

  sifat_pengerjaan  sifat_kerja not null default 'mandiri',
  total_jp          smallint not null default 0,
  total_menit       smallint not null default 0,

  terbit            boolean  not null default false,
  urutan            smallint not null default 0,
  dibuat_pada       timestamptz not null default now(),
  diubah_pada       timestamptz not null default now(),

  -- Kode TP unik per mata pelajaran, bukan global.
  -- "TP 1.1" boleh ada di RPL dan di Bisnis Digital sekaligus.
  unique (mata_pelajaran_id, kode)
);

create index tp_terbit_idx  on tujuan_pembelajaran (terbit, urutan);
create index tp_pemilik_idx on tujuan_pembelajaran (dibuat_oleh);

create trigger tp_diubah before update on tujuan_pembelajaran
  for each row execute function set_diubah_pada();

create table kktp_indikator (
  id                     bigint generated always as identity primary key,
  tujuan_pembelajaran_id bigint not null references tujuan_pembelajaran(id) on delete cascade,
  nomor                  smallint not null,
  indikator              text not null,
  unique (tujuan_pembelajaran_id, nomor)
);

create table sprint (
  id                     bigint generated always as identity primary key,
  tujuan_pembelajaran_id bigint not null references tujuan_pembelajaran(id) on delete cascade,

  nomor        smallint not null,
  nama         text not null,
  hari         text,
  jp           text,                       -- "8 JP"
  durasi_menit smallint not null default 0,
  menit_inti   smallint not null default 0,
  tujuan       text,
  kktp_terkait text,

  unique (tujuan_pembelajaran_id, nomor)
);

create table tugas (
  id        bigint generated always as identity primary key,
  sprint_id bigint not null references sprint(id) on delete cascade,

  kode           text not null unique,      -- "RPL-12.1-101"
  judul          text not null,
  deskripsi      text,
  bukti_diminta  text,

  jenis          jenis_tugas not null default 'inti',
  level          smallint check (level between 1 and 3),

  estimasi_menit smallint not null default 0,
  xp             smallint not null default 0,
  wajib_bukti    boolean  not null default false,
  urutan         smallint not null default 0,

  -- Level hanya berlaku untuk tugas tantangan.
  constraint level_hanya_tantangan
    check ((jenis = 'tantangan') or (level is null))
);

create index tugas_sprint_idx on tugas (sprint_id, jenis, urutan);

create table lembar_kerja (
  id                     bigint generated always as identity primary key,
  tujuan_pembelajaran_id bigint not null references tujuan_pembelajaran(id) on delete cascade,
  sprint_id              bigint references sprint(id) on delete set null,

  kode       text not null,                -- "A", "B", "C1", "REF"
  judul      text not null,
  keterangan text,
  tipe       tipe_lembar not null default 'matriks',

  -- Struktur tabel. Contoh untuk Tabel A:
  -- {
  --   "baris": ["IDE","SDK","Emulator","Kendali Versi"],
  --   "kolom": [
  --     {"key":"fungsi","label":"Fungsi","input":"textarea"},
  --     {"key":"akibat","label":"Akibat bila tidak ada","input":"textarea"}
  --   ]
  -- }
  struktur      jsonb not null default '{}'::jsonb,
  baris_dinamis boolean not null default false,
  urutan        smallint not null default 0,

  unique (tujuan_pembelajaran_id, kode),

  -- Struktur wajib berupa objek, bukan larik atau nilai tunggal.
  constraint struktur_objek check (jsonb_typeof(struktur) = 'object')
);

create index lembar_sprint_idx on lembar_kerja (sprint_id);

create table badge (
  id                     bigint generated always as identity primary key,
  tujuan_pembelajaran_id bigint references tujuan_pembelajaran(id) on delete cascade,

  kode      text not null,
  nama      text not null,
  emoji     text,
  deskripsi text,
  xp        smallint not null default 0,

  -- Syarat perolehan, dinilai oleh fungsi nilai_badge().
  -- Contoh: {"tipe":"sprint_tuntas","sprint_nomor":1}
  syarat    jsonb,
  urutan    smallint not null default 0,

  unique (tujuan_pembelajaran_id, kode),
  constraint syarat_objek check (syarat is null or jsonb_typeof(syarat) = 'object')
);
