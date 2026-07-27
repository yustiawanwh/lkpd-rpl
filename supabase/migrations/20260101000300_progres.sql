-- ============================================================
--  Bagian 3: Progres murid
-- ------------------------------------------------------------
--  Tabel dengan lalu lintas tulis paling padat. Indeksnya dirancang
--  mengikuti pola kueri yang benar-benar dipakai, bukan sekadar
--  satu indeks per kolom.
-- ============================================================

create table pendaftaran (
  id       bigint generated always as identity primary key,
  kelas_id bigint not null references kelas(id) on delete cascade,
  murid_id uuid   not null references profil(id) on delete cascade,
  tim      text,                            -- Mobile, Backend, QA, DevOps
  aktif    boolean not null default true,
  bergabung_pada timestamptz not null default now(),

  unique (kelas_id, murid_id)
);

create index pendaftaran_murid_idx on pendaftaran (murid_id) where aktif;

-- ------------------------------------------------------------
-- Penugasan: TP mana ditugaskan ke kelas mana.
-- Seluruh progres murid bergantung pada baris ini, bukan langsung ke TP.
-- Itulah yang membuat kelas berbeda (atau tahun ajaran berbeda) yang
-- memakai TP sama tetap terpisah datanya.
-- ------------------------------------------------------------
create table penugasan (
  id                     bigint generated always as identity primary key,
  kelas_id               bigint not null references kelas(id) on delete cascade,
  tujuan_pembelajaran_id bigint not null references tujuan_pembelajaran(id) on delete cascade,
  mulai                  date,
  tenggat                date,
  dibuka                 boolean not null default true,
  dibuat_pada            timestamptz not null default now(),

  unique (kelas_id, tujuan_pembelajaran_id)
);

create index penugasan_kelas_idx on penugasan (kelas_id) where dibuka;

-- ------------------------------------------------------------
-- Fungsi bantu RLS untuk progres
-- ------------------------------------------------------------

-- Apakah saya guru pengampu kelas dari penugasan ini?
create or replace function saya_guru_penugasan(p_penugasan_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from penugasan p
    join kelas k on k.id = p.kelas_id
    where p.id = p_penugasan_id
      and k.guru_id = auth.uid()
  );
$$;

-- Apakah saya murid terdaftar aktif pada penugasan ini?
create or replace function saya_murid_penugasan(p_penugasan_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from penugasan p
    join pendaftaran d on d.kelas_id = p.kelas_id
    where p.id = p_penugasan_id
      and d.murid_id = auth.uid()
      and d.aktif
  );
$$;

-- Apakah saya guru pengampu kelas ini?
create or replace function saya_guru_kelas(p_kelas_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from kelas where id = p_kelas_id and guru_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- Progres tiap tugas per murid
-- ------------------------------------------------------------
create table progres_tugas (
  id           bigint generated always as identity primary key,
  penugasan_id bigint not null references penugasan(id) on delete cascade,
  murid_id     uuid   not null references profil(id) on delete cascade,
  tugas_id     bigint not null references tugas(id) on delete cascade,

  status         status_tugas not null default 'backlog',
  detik_terpakai integer not null default 0 check (detik_terpakai >= 0),
  catatan        text,

  dimulai_pada    timestamptz,
  diserahkan_pada timestamptz,
  disetujui_pada  timestamptz,
  disetujui_oleh  uuid references profil(id) on delete set null,
  umpan_balik     text,

  xp_diberikan smallint not null default 0,
  diubah_pada  timestamptz not null default now(),

  unique (penugasan_id, murid_id, tugas_id)
);

-- Papan kanban satu murid: penugasan + murid, disaring status
create index progres_papan_idx on progres_tugas (penugasan_id, murid_id, status);
-- Dasbor guru: sebaran status satu tugas untuk seluruh murid
create index progres_tugas_idx on progres_tugas (tugas_id, status);
-- Antrean review guru
create index progres_review_idx on progres_tugas (penugasan_id, status)
  where status = 'review';

create trigger progres_diubah before update on progres_tugas
  for each row execute function set_diubah_pada();

-- ------------------------------------------------------------
-- Isian lembar kerja
-- ------------------------------------------------------------
-- Seluruh isian satu tabel disimpan sebagai SATU baris jsonb, bukan
-- satu baris per sel. Alasannya: penyimpanan otomatis mengirim seluruh
-- tabel sekaligus, dan satu murid × satu tabel selalu dibaca utuh.
-- Pola ini memangkas jumlah baris dari puluhan ribu menjadi ratusan.
-- ------------------------------------------------------------
create table isian_lembar (
  id              bigint generated always as identity primary key,
  penugasan_id    bigint not null references penugasan(id) on delete cascade,
  murid_id        uuid   not null references profil(id) on delete cascade,
  lembar_kerja_id bigint not null references lembar_kerja(id) on delete cascade,

  -- Bentuk: {"0":{"fungsi":"...","akibat":"..."},"1":{...}}
  data        jsonb not null default '{}'::jsonb,
  diubah_pada timestamptz not null default now(),

  unique (penugasan_id, murid_id, lembar_kerja_id),
  constraint data_objek check (jsonb_typeof(data) = 'object')
);

create trigger isian_diubah before update on isian_lembar
  for each row execute function set_diubah_pada();

-- ------------------------------------------------------------
-- Bukti unggah
-- ------------------------------------------------------------
create table lampiran (
  id               bigint generated always as identity primary key,
  murid_id         uuid   not null references profil(id) on delete cascade,
  progres_tugas_id bigint references progres_tugas(id) on delete cascade,

  nama_asli   text not null,
  path        text not null,               -- path di Supabase Storage
  mime        text,
  ukuran      integer not null default 0,
  dibuat_pada timestamptz not null default now()
);

create index lampiran_progres_idx on lampiran (progres_tugas_id);

-- ------------------------------------------------------------
-- Jurnal refleksi per sprint
-- ------------------------------------------------------------
create table refleksi (
  id           bigint generated always as identity primary key,
  penugasan_id bigint not null references penugasan(id) on delete cascade,
  murid_id     uuid   not null references profil(id) on delete cascade,
  sprint_id    bigint not null references sprint(id) on delete cascade,

  kendala   text,
  solusi    text,
  pelajaran text,
  diubah_pada timestamptz not null default now(),

  unique (penugasan_id, murid_id, sprint_id)
);

create trigger refleksi_diubah before update on refleksi
  for each row execute function set_diubah_pada();

-- ------------------------------------------------------------
-- Evaluasi diri terhadap indikator KKTP
-- ------------------------------------------------------------
create table evaluasi_kktp (
  id                bigint generated always as identity primary key,
  penugasan_id      bigint not null references penugasan(id) on delete cascade,
  murid_id          uuid   not null references profil(id) on delete cascade,
  kktp_indikator_id bigint not null references kktp_indikator(id) on delete cascade,

  tercapai_murid boolean,                  -- penilaian diri
  bukti          text,
  tercapai_guru  boolean,                  -- verifikasi guru
  diubah_pada    timestamptz not null default now(),

  unique (penugasan_id, murid_id, kktp_indikator_id)
);

create trigger evaluasi_diubah before update on evaluasi_kktp
  for each row execute function set_diubah_pada();

-- ------------------------------------------------------------
-- Catatan tutor sebaya
-- ------------------------------------------------------------
create table tutor_sebaya (
  id           bigint generated always as identity primary key,
  penugasan_id bigint not null references penugasan(id) on delete cascade,
  murid_id     uuid   not null references profil(id) on delete cascade,  -- yang membantu
  dibantu_id   uuid   references profil(id) on delete set null,
  nama_dibantu text,                       -- bila bukan pengguna terdaftar
  bagian       text,
  dibuat_pada  timestamptz not null default now()
);

create index tutor_penugasan_idx on tutor_sebaya (penugasan_id, murid_id);
