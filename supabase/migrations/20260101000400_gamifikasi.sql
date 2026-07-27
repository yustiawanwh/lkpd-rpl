-- ============================================================
--  Bagian 4: Gamifikasi — XP, badge, statistik
-- ------------------------------------------------------------
--  XP dicatat sebagai buku besar (ledger), bukan satu kolom total.
--  Setiap perubahan punya jejak asalnya, dan totalnya selalu bisa
--  dihitung ulang. Kunci unik membuat XP mustahil tercatat dua kali,
--  bahkan bila dua permintaan datang bersamaan.
--
--  Berbeda dari versi Laravel, di sini pemberian XP dan pembaruan
--  statistik ditangani TRIGGER di dalam basis data. Konsekuensinya:
--  aturannya tetap berlaku meski dipanggil dari mana pun — aplikasi
--  web, panel admin Supabase, atau skrip impor.
-- ============================================================

create table buku_xp (
  id           bigint generated always as identity primary key,
  murid_id     uuid   not null references profil(id) on delete cascade,
  penugasan_id bigint not null references penugasan(id) on delete cascade,

  jumlah     integer not null,             -- boleh negatif untuk koreksi
  sumber     sumber_xp not null,
  referensi  text,                         -- kode tugas / kode badge
  keterangan text,
  dibuat_pada timestamptz not null default now(),

  -- Pengaman utama: satu sumber hanya boleh memberi XP sekali.
  unique (murid_id, penugasan_id, sumber, referensi)
);

create index buku_xp_murid_idx on buku_xp (murid_id, penugasan_id);

create table perolehan_badge (
  id           bigint generated always as identity primary key,
  murid_id     uuid   not null references profil(id) on delete cascade,
  badge_id     bigint not null references badge(id) on delete cascade,
  penugasan_id bigint not null references penugasan(id) on delete cascade,
  diraih_pada  timestamptz not null default now(),

  unique (murid_id, badge_id, penugasan_id)
);

create index perolehan_murid_idx on perolehan_badge (murid_id, penugasan_id);

-- ------------------------------------------------------------
-- Ringkasan statistik — cache untuk papan peringkat.
-- Selalu dihitung ulang dari sumber aslinya, tidak ditambah-kurangi
-- bertahap, sehingga selisih akibat kegagalan di tengah jalan
-- terkoreksi sendiri.
-- ------------------------------------------------------------
create table statistik_murid (
  id           bigint generated always as identity primary key,
  murid_id     uuid   not null references profil(id) on delete cascade,
  penugasan_id bigint not null references penugasan(id) on delete cascade,

  total_xp          integer  not null default 0,
  jumlah_badge      smallint not null default 0,
  tugas_selesai     smallint not null default 0,
  tantangan_selesai smallint not null default 0,
  total_detik       integer  not null default 0,
  aktivitas_terakhir timestamptz,

  unique (murid_id, penugasan_id)
);

-- Papan peringkat: urut XP dalam satu penugasan
create index statistik_peringkat_idx on statistik_murid (penugasan_id, total_xp desc);

create table jejak_aktivitas (
  id           bigint generated always as identity primary key,
  murid_id     uuid   not null references profil(id) on delete cascade,
  penugasan_id bigint references penugasan(id) on delete cascade,
  aksi         text not null,
  keterangan   text,
  meta         jsonb,
  dibuat_pada  timestamptz not null default now()
);

create index jejak_murid_idx on jejak_aktivitas (murid_id, dibuat_pada desc);

-- ============================================================
--  PANGKAT
-- ============================================================
create or replace function pangkat_untuk(p_xp integer)
returns text
language sql immutable
as $$
  select case
    when p_xp >= 1400 then 'Tech Lead'
    when p_xp >= 1000 then 'Senior Developer'
    when p_xp >=  700 then 'Developer'
    when p_xp >=  450 then 'Associate Developer'
    when p_xp >=  250 then 'Junior Developer II'
    when p_xp >=  100 then 'Junior Developer I'
    else 'Intern'
  end;
$$;

create or replace function ambang_berikutnya(p_xp integer)
returns integer
language sql immutable
as $$
  select coalesce(
    (select a from unnest(array[100,250,450,700,1000,1400]) a where a > p_xp order by a limit 1),
    1400
  );
$$;

-- ============================================================
--  HITUNG ULANG STATISTIK
-- ============================================================
create or replace function hitung_statistik(p_murid uuid, p_penugasan bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_xp        integer;
  v_badge     smallint;
  v_inti      smallint;
  v_tantangan smallint;
  v_detik     integer;
begin
  select coalesce(sum(jumlah), 0) into v_xp
  from buku_xp where murid_id = p_murid and penugasan_id = p_penugasan;

  select count(*) into v_badge
  from perolehan_badge where murid_id = p_murid and penugasan_id = p_penugasan;

  select
    coalesce(count(*) filter (where t.jenis = 'inti'), 0),
    coalesce(count(*) filter (where t.jenis = 'tantangan'), 0)
  into v_inti, v_tantangan
  from progres_tugas pt
  join tugas t on t.id = pt.tugas_id
  where pt.murid_id = p_murid
    and pt.penugasan_id = p_penugasan
    and pt.status = 'selesai';

  select coalesce(sum(detik_terpakai), 0) into v_detik
  from progres_tugas where murid_id = p_murid and penugasan_id = p_penugasan;

  insert into statistik_murid (
    murid_id, penugasan_id, total_xp, jumlah_badge,
    tugas_selesai, tantangan_selesai, total_detik, aktivitas_terakhir
  )
  values (
    p_murid, p_penugasan, greatest(v_xp, 0), v_badge,
    v_inti, v_tantangan, v_detik, now()
  )
  on conflict (murid_id, penugasan_id) do update set
    total_xp           = greatest(excluded.total_xp, 0),
    jumlah_badge       = excluded.jumlah_badge,
    tugas_selesai      = excluded.tugas_selesai,
    tantangan_selesai  = excluded.tantangan_selesai,
    total_detik        = excluded.total_detik,
    aktivitas_terakhir = now();
end;
$$;

-- ============================================================
--  XP OTOMATIS SAAT STATUS TUGAS BERUBAH
-- ------------------------------------------------------------
--  Masuk 'selesai'  → catat XP
--  Keluar 'selesai' → hapus barisnya (bukan dicatat negatif), supaya
--                     tugas yang sama bisa memberi XP lagi bila kelak
--                     diselesaikan ulang.
-- ============================================================
create or replace function xp_saat_status_berubah()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_tugas tugas%rowtype;
begin
  select * into v_tugas from tugas where id = new.tugas_id;

  -- Baru selesai
  if new.status = 'selesai'
     and (tg_op = 'INSERT' or old.status is distinct from 'selesai') then

    if v_tugas.xp > 0 then
      insert into buku_xp (murid_id, penugasan_id, jumlah, sumber, referensi, keterangan)
      values (new.murid_id, new.penugasan_id, v_tugas.xp, 'task', v_tugas.kode,
              v_tugas.judul || ' selesai')
      on conflict (murid_id, penugasan_id, sumber, referensi) do nothing;
    end if;

    new.xp_diberikan := v_tugas.xp;

  -- Dibuka kembali
  elsif tg_op = 'UPDATE'
        and old.status = 'selesai'
        and new.status is distinct from 'selesai' then

    delete from buku_xp
    where murid_id = new.murid_id
      and penugasan_id = new.penugasan_id
      and sumber = 'task'
      and referensi = v_tugas.kode;

    new.xp_diberikan   := 0;
    new.disetujui_pada := null;
    new.disetujui_oleh := null;
  end if;

  return new;
end;
$$;

create trigger progres_xp
  before insert or update of status on progres_tugas
  for each row execute function xp_saat_status_berubah();

-- ============================================================
--  PENILAIAN BADGE
-- ------------------------------------------------------------
--  Syarat dibaca dari kolom jsonb, sehingga badge baru bisa dibuat
--  lewat panel tanpa mengubah kode. Tujuh tipe syarat dikenali.
-- ============================================================
create or replace function syarat_badge_terpenuhi(
  p_syarat jsonb, p_murid uuid, p_penugasan bigint
)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_tipe   text := p_syarat->>'tipe';
  v_tp     bigint;
  v_total  int;
  v_selesai int;
begin
  if v_tipe is null then return false; end if;

  select tujuan_pembelajaran_id into v_tp from penugasan where id = p_penugasan;

  case v_tipe

    when 'task_selesai' then
      return exists (
        select 1 from progres_tugas pt
        join tugas t on t.id = pt.tugas_id
        where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
          and pt.status = 'selesai' and t.kode = p_syarat->>'task_kode'
      );

    when 'sprint_tuntas' then
      select count(*) into v_total
      from tugas t join sprint s on s.id = t.sprint_id
      where s.tujuan_pembelajaran_id = v_tp
        and s.nomor = (p_syarat->>'sprint_nomor')::int
        and t.jenis = 'inti';

      if v_total = 0 then return false; end if;

      select count(*) into v_selesai
      from progres_tugas pt
      join tugas t on t.id = pt.tugas_id
      join sprint s on s.id = t.sprint_id
      where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
        and pt.status = 'selesai'
        and s.tujuan_pembelajaran_id = v_tp
        and s.nomor = (p_syarat->>'sprint_nomor')::int
        and t.jenis = 'inti';

      return v_selesai = v_total;

    when 'semua_inti_tuntas' then
      select count(*) into v_total
      from tugas t join sprint s on s.id = t.sprint_id
      where s.tujuan_pembelajaran_id = v_tp and t.jenis = 'inti';

      if v_total = 0 then return false; end if;

      select count(*) into v_selesai
      from progres_tugas pt
      join tugas t on t.id = pt.tugas_id
      join sprint s on s.id = t.sprint_id
      where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
        and pt.status = 'selesai'
        and s.tujuan_pembelajaran_id = v_tp and t.jenis = 'inti';

      return v_selesai = v_total;

    when 'level_tantangan' then
      return exists (
        select 1 from progres_tugas pt
        join tugas t on t.id = pt.tugas_id
        join sprint s on s.id = t.sprint_id
        where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
          and pt.status = 'selesai'
          and s.tujuan_pembelajaran_id = v_tp
          and t.jenis = 'tantangan'
          and t.level = (p_syarat->>'level')::int
      );

    when 'tepat_estimasi' then
      -- Hanya tugas yang benar-benar dicatat waktunya yang dihitung,
      -- supaya murid yang tak pernah menekan timer tidak otomatis lolos.
      select count(*) into v_selesai
      from progres_tugas pt
      join tugas t on t.id = pt.tugas_id
      where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
        and pt.status = 'selesai'
        and pt.detik_terpakai > 0
        and t.estimasi_menit > 0
        and pt.detik_terpakai <= t.estimasi_menit * 60;

      return v_selesai >= coalesce((p_syarat->>'jumlah')::int, 3);

    when 'jadi_tutor' then
      return exists (
        select 1 from tutor_sebaya
        where murid_id = p_murid and penugasan_id = p_penugasan
          and coalesce(bagian, '') <> ''
          and (dibantu_id is not null or coalesce(nama_dibantu, '') <> '')
      );

    when 'jumlah_tugas' then
      select count(*) into v_selesai
      from progres_tugas
      where murid_id = p_murid and penugasan_id = p_penugasan and status = 'selesai';

      return v_selesai >= coalesce((p_syarat->>'jumlah')::int, 1);

    else
      return false;
  end case;
end;
$$;

-- Menilai seluruh badge untuk satu murid, memberikan yang terpenuhi.
create or replace function nilai_badge(p_murid uuid, p_penugasan bigint)
returns setof badge
language plpgsql security definer
set search_path = public
as $$
declare
  v_tp bigint;
  b    badge%rowtype;
begin
  select tujuan_pembelajaran_id into v_tp from penugasan where id = p_penugasan;

  for b in
    select * from badge
    where tujuan_pembelajaran_id = v_tp
      and not exists (
        select 1 from perolehan_badge
        where murid_id = p_murid and badge_id = badge.id and penugasan_id = p_penugasan
      )
  loop
    if b.syarat is not null and syarat_badge_terpenuhi(b.syarat, p_murid, p_penugasan) then

      insert into perolehan_badge (murid_id, badge_id, penugasan_id)
      values (p_murid, b.id, p_penugasan)
      on conflict do nothing;

      if b.xp > 0 then
        insert into buku_xp (murid_id, penugasan_id, jumlah, sumber, referensi, keterangan)
        values (p_murid, p_penugasan, b.xp, 'badge', b.kode, 'Badge ' || b.nama)
        on conflict (murid_id, penugasan_id, sumber, referensi) do nothing;
      end if;

      return next b;
    end if;
  end loop;

  perform hitung_statistik(p_murid, p_penugasan);
end;
$$;

-- Setelah progres berubah, nilai badge & perbarui statistik.
create or replace function sesudah_progres_berubah()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform nilai_badge(new.murid_id, new.penugasan_id);
  return null;
end;
$$;

create trigger progres_sesudah
  after insert or update of status on progres_tugas
  for each row execute function sesudah_progres_berubah();

-- Perubahan waktu saja tidak perlu menilai badge ulang, cukup statistik.
create or replace function sesudah_waktu_berubah()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform hitung_statistik(new.murid_id, new.penugasan_id);
  return null;
end;
$$;

create trigger progres_waktu
  after update of detik_terpakai on progres_tugas
  for each row
  when (old.detik_terpakai is distinct from new.detik_terpakai)
  execute function sesudah_waktu_berubah();

-- Catatan tutor sebaya juga bisa memicu badge.
create trigger tutor_badge
  after insert or update on tutor_sebaya
  for each row execute function sesudah_progres_berubah();
