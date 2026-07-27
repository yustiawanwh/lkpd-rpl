-- ============================================================
--  Brantas LMS — Skema Supabase
--  Bagian 1: tipe data, fungsi bantu, struktur akademik
-- ============================================================
--  Dijalankan lewat Supabase SQL Editor atau `supabase db push`.
--
--  Catatan penting soal keamanan:
--  Seluruh aturan hak akses ditegakkan di lapisan basis data lewat
--  Row Level Security (RLS), bukan di kode aplikasi. Artinya, sekalipun
--  ada celah di kode JavaScript atau seseorang memanggil API langsung
--  dengan kunci publik, ia tetap tidak bisa membaca data kelas lain.
-- ============================================================

-- ------------------------------------------------------------
-- Tipe enum
-- ------------------------------------------------------------
create type peran_pengguna as enum ('murid', 'guru', 'admin');
create type jenis_tugas    as enum ('inti', 'tantangan', 'tutor');
create type status_tugas   as enum ('backlog', 'dikerjakan', 'review', 'selesai');
create type tipe_lembar    as enum ('matriks', 'daftar', 'formulir', 'referensi');
create type sumber_xp      as enum ('task', 'badge', 'manual');
create type sifat_kerja    as enum ('mandiri', 'kelompok');

-- ============================================================
--  PROFIL PENGGUNA
-- ------------------------------------------------------------
--  Supabase menyimpan akun di auth.users (dikelola sistem).
--  Tabel ini menyimpan data tambahan: nama, peran, nomor absen.
--  Dihubungkan satu-ke-satu lewat id yang sama.
-- ============================================================
create table profil (
  id          uuid primary key references auth.users(id) on delete cascade,
  nama        text not null,
  email       text,
  peran       peran_pengguna not null default 'murid',
  nis         text,
  no_absen    text,
  avatar      text,
  aktif       boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);

create index profil_peran_idx on profil (peran) where aktif;

-- ------------------------------------------------------------
-- Fungsi bantu untuk RLS
-- ------------------------------------------------------------
-- Ditandai STABLE + SECURITY DEFINER supaya:
--  1. hasilnya di-cache dalam satu kueri (cepat)
--  2. bisa membaca tabel profil tanpa terjerat RLS-nya sendiri
--     (kalau tidak, fungsi ini akan memanggil dirinya berulang)
-- ------------------------------------------------------------

create or replace function peran_saya()
returns peran_pengguna
language sql stable security definer
set search_path = public
as $$
  select peran from profil where id = auth.uid();
$$;

create or replace function saya_guru()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select peran in ('guru','admin') and aktif from profil where id = auth.uid()),
    false
  );
$$;

create or replace function saya_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select peran = 'admin' and aktif from profil where id = auth.uid()),
    false
  );
$$;

-- ============================================================
--  STRUKTUR AKADEMIK
-- ============================================================

create table tahun_ajaran (
  id       bigint generated always as identity primary key,
  nama     text not null unique,          -- "2026/2027"
  mulai    date not null,
  selesai  date not null,
  aktif    boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

create index tahun_ajaran_aktif_idx on tahun_ajaran (aktif) where aktif;

create table mata_pelajaran (
  id          bigint generated always as identity primary key,
  kode        text not null unique,        -- "RPL-XII"
  nama        text not null,
  konsentrasi text,
  fase        text,                        -- "E", "F"
  tingkat     smallint check (tingkat between 1 and 13),
  dibuat_pada timestamptz not null default now()
);

create table kelas (
  id                bigint generated always as identity primary key,
  tahun_ajaran_id   bigint not null references tahun_ajaran(id) on delete cascade,
  mata_pelajaran_id bigint not null references mata_pelajaran(id) on delete cascade,
  guru_id           uuid   not null references profil(id) on delete cascade,
  nama              text   not null,       -- "XII RPL 1"
  kode_gabung       text   not null unique,
  terbuka           boolean not null default true,
  dibuat_pada       timestamptz not null default now()
);

create index kelas_guru_idx  on kelas (guru_id);
create index kelas_tahun_idx on kelas (tahun_ajaran_id);

-- ------------------------------------------------------------
-- Kode gabung kelas
-- ------------------------------------------------------------
-- Huruf yang mudah tertukar (I, O, 0, 1) sengaja dibuang supaya murid
-- tidak salah ketik saat kode didiktekan di depan kelas.
-- ------------------------------------------------------------
create or replace function buat_kode_gabung()
returns text
language plpgsql
as $$
declare
  abjad text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  kode  text;
  i     int;
begin
  loop
    kode := '';
    for i in 1..6 loop
      kode := kode || substr(abjad, floor(random() * length(abjad) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from kelas where kode_gabung = kode);
  end loop;
  return kode;
end;
$$;

create or replace function isi_kode_gabung()
returns trigger
language plpgsql
as $$
begin
  if new.kode_gabung is null or new.kode_gabung = '' then
    new.kode_gabung := buat_kode_gabung();
  end if;
  return new;
end;
$$;

create trigger kelas_kode_gabung
  before insert on kelas
  for each row execute function isi_kode_gabung();

-- ------------------------------------------------------------
-- Penanda waktu perubahan
-- ------------------------------------------------------------
create or replace function set_diubah_pada()
returns trigger
language plpgsql
as $$
begin
  new.diubah_pada := now();
  return new;
end;
$$;

create trigger profil_diubah before update on profil
  for each row execute function set_diubah_pada();
