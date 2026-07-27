-- ============================================================
-- Migrasi tambahan: pengawasan kelas real-time & kendali per-murid
-- ============================================================
-- Menambah:
--   1. Kolom kendali pada pendaftaran: seorang guru bisa MENJEDA atau
--      MENGUNCI layar murid tertentu (bukan serentak).
--   2. Realtime pada tabel yang dipantau, agar papan guru & layar murid
--      ter-update otomatis tanpa refresh.
--
-- Filosofi keamanan:
--   - Hanya guru pengampu kelas (atau admin) yang bisa mengubah kendali.
--   - Murid hanya bisa MEMBACA status kendali dirinya sendiri (agar
--     layarnya tahu harus menampilkan mode jeda/kunci), tidak bisa
--     mengubahnya.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

-- 1. Status kendali per murid ------------------------------------------
do $$ begin
  create type kendali_murid as enum ('aktif', 'dijeda', 'dikunci');
exception when duplicate_object then null; end $$;

alter table pendaftaran
  add column if not exists kendali        kendali_murid not null default 'aktif',
  add column if not exists kendali_pesan  text,
  add column if not exists kendali_oleh   uuid references profil(id) on delete set null,
  add column if not exists kendali_pada   timestamptz,
  -- Denyut terakhir murid (untuk tahu siapa sedang daring). Diperbarui
  -- berkala oleh aplikasi murid.
  add column if not exists denyut_pada    timestamptz,
  add column if not exists tugas_aktif    bigint references tugas(id) on delete set null,
  add column if not exists tugas_mulai    timestamptz;

-- 2. Fungsi aman untuk guru mengubah kendali ---------------------------
-- Guru menetapkan kendali untuk satu murid di kelasnya.
create or replace function set_kendali_murid(
  p_pendaftaran bigint,
  p_kendali     text,
  p_pesan       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kelas bigint;
begin
  -- Ambil kelas dari pendaftaran ini.
  select kelas_id into v_kelas from pendaftaran where id = p_pendaftaran;
  if v_kelas is null then
    raise exception 'Pendaftaran tidak ditemukan';
  end if;

  -- Hanya guru pengampu kelas atau admin.
  if not (saya_guru_kelas(v_kelas) or saya_admin()) then
    raise exception 'Tidak berwenang mengatur kendali murid ini';
  end if;

  if p_kendali not in ('aktif', 'dijeda', 'dikunci') then
    raise exception 'Nilai kendali tidak sah';
  end if;

  update pendaftaran set
    kendali       = p_kendali::kendali_murid,
    kendali_pesan = p_pesan,
    kendali_oleh  = auth.uid(),
    kendali_pada  = now()
  where id = p_pendaftaran;
end;
$$;

grant execute on function set_kendali_murid(bigint, text, text) to authenticated;

-- 3. Denyut murid (menandai sedang daring + tugas yang dikerjakan) ------
-- Murid memperbarui denyutnya sendiri. Aman: hanya baris miliknya.
create or replace function denyut_murid(
  p_penugasan bigint,
  p_tugas     bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kelas bigint;
begin
  -- Cari kelas dari penugasan.
  select kelas_id into v_kelas from penugasan where id = p_penugasan;
  if v_kelas is null then return; end if;

  update pendaftaran set
    denyut_pada = now(),
    tugas_aktif = p_tugas,
    tugas_mulai = case
      when p_tugas is distinct from tugas_aktif then now()
      else tugas_mulai
    end
  where kelas_id = v_kelas and murid_id = auth.uid();
end;
$$;

grant execute on function denyut_murid(bigint, bigint) to authenticated;

-- 4. Realtime ----------------------------------------------------------
-- Tambahkan tabel yang dipantau ke publikasi realtime Supabase.
-- (Aman diulang: cek dulu apakah sudah ada.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'progres_tugas'
  ) then
    alter publication supabase_realtime add table progres_tugas;
  end if;
exception when undefined_object then
  -- Publikasi belum ada (mis. di lingkungan uji lokal); abaikan.
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pendaftaran'
  ) then
    alter publication supabase_realtime add table pendaftaran;
  end if;
exception when undefined_object then null;
end $$;

-- Catatan: RLS tetap berlaku pada aliran realtime. Guru hanya menerima
-- perubahan baris yang boleh ia baca (progres murid di kelasnya), dan
-- murid hanya menerima perubahan miliknya sendiri — termasuk perubahan
-- status kendali dirinya, sehingga layarnya bisa bereaksi seketika.
