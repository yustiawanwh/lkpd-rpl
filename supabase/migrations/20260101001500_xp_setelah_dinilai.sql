-- ============================================================
-- Migrasi: XP tugas diberikan setelah DINILAI guru (konsisten dgn badge)
-- ============================================================
-- MASALAH:
--   Sebelumnya XP tugas dicatat begitu murid menandai 'selesai', padahal
--   badge kini baru diberikan setelah guru menilai. Akibatnya murid yang
--   hanya menandai selesai (belum dinilai) sudah mendapat XP dan naik ke
--   puncak papan peringkat — padahal semestinya XP-nya masih 0.
--
-- PERBAIKAN:
--   XP tugas hanya dicatat bila tugas SUDAH DINILAI (status 'selesai' DAN
--   nilai_huruf terisi). Bila nilai dicabut atau tugas dibuka kembali, XP
--   ditarik. Trigger juga dipicu saat nilai_huruf berubah.
--
--   Statistik "tugas_selesai" (untuk tampilan) juga dihitung dari tugas
--   yang sudah dinilai, agar konsisten.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

-- 1. XP hanya untuk tugas yang sudah dinilai --------------------------
create or replace function xp_saat_status_berubah()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_tugas tugas%rowtype;
  v_dinilai_baru boolean;
  v_dinilai_lama boolean;
begin
  select * into v_tugas from tugas where id = new.tugas_id;

  -- "Dinilai" = berstatus selesai DAN sudah punya nilai huruf dari guru.
  v_dinilai_baru := (new.status = 'selesai' and new.nilai_huruf is not null);
  v_dinilai_lama := (tg_op = 'UPDATE'
                     and old.status = 'selesai' and old.nilai_huruf is not null);

  -- Baru menjadi "dinilai" → catat XP.
  if v_dinilai_baru and not v_dinilai_lama then
    if v_tugas.xp > 0 then
      insert into buku_xp (murid_id, penugasan_id, jumlah, sumber, referensi, keterangan)
      values (new.murid_id, new.penugasan_id, v_tugas.xp, 'task', v_tugas.kode,
              v_tugas.judul || ' dinilai')
      on conflict (murid_id, penugasan_id, sumber, referensi) do nothing;
    end if;
    new.xp_diberikan := v_tugas.xp;

  -- Tidak lagi "dinilai" (nilai dicabut / tugas dibuka kembali) → tarik XP.
  elsif v_dinilai_lama and not v_dinilai_baru then
    delete from buku_xp
    where murid_id = new.murid_id
      and penugasan_id = new.penugasan_id
      and sumber = 'task'
      and referensi = v_tugas.kode;
    new.xp_diberikan := 0;
  end if;

  return new;
end;
$$;

-- Trigger dipicu oleh perubahan status ATAU nilai_huruf.
drop trigger if exists progres_xp on progres_tugas;
create trigger progres_xp
  before insert or update of status, nilai_huruf on progres_tugas
  for each row execute function xp_saat_status_berubah();

-- 2. Statistik: "tugas_selesai" dihitung dari yang sudah dinilai ------
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

  -- Hanya hitung tugas yang sudah DINILAI guru.
  select
    coalesce(count(*) filter (where t.jenis = 'inti'), 0),
    coalesce(count(*) filter (where t.jenis = 'tantangan'), 0)
  into v_inti, v_tantangan
  from progres_tugas pt
  join tugas t on t.id = pt.tugas_id
  where pt.murid_id = p_murid
    and pt.penugasan_id = p_penugasan
    and pt.status = 'selesai'
    and pt.nilai_huruf is not null;

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

-- 3. Perbaiki data yang sudah terlanjur: tarik XP tugas yang belum dinilai
delete from buku_xp b
where b.sumber = 'task'
  and not exists (
    select 1 from progres_tugas pt
    join tugas t on t.id = pt.tugas_id
    where pt.murid_id = b.murid_id
      and pt.penugasan_id = b.penugasan_id
      and t.kode = b.referensi
      and pt.status = 'selesai'
      and pt.nilai_huruf is not null
  );

-- Hitung ulang statistik semua murid yang terpengaruh.
do $$
declare r record;
begin
  for r in (select distinct murid_id, penugasan_id from statistik_murid) loop
    perform hitung_statistik(r.murid_id, r.penugasan_id);
  end loop;
end $$;
