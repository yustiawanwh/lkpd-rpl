-- ============================================================
-- Migrasi: penilaian review, waktu kumpul, kunci, & pengaturan bobot
-- ============================================================
-- Mendukung revisi:
--   #3 nilai review A–E per tugas (dirata-rata jadi nilai sprint)
--   #4 kunci tugas selesai (hanya guru yang buka)
--   #5 nilai kecepatan (peringkat + penalti keterlambatan) & bobot
--   #6 dashboard (memakai data yang sama; tak perlu kolom baru)
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

-- 1. Nilai review (A–E) & kunci pada progres_tugas ---------------------
alter table progres_tugas
  add column if not exists nilai_huruf  char(1)
    check (nilai_huruf in ('A','B','C','D','E')),
  add column if not exists terkunci     boolean not null default false;

-- 2. Tabel pengaturan global (bobot nilai, dll) -----------------------
create table if not exists pengaturan (
  kunci text primary key,
  nilai jsonb not null,
  diubah_pada timestamptz not null default now()
);

alter table pengaturan enable row level security;

-- Semua yang login boleh membaca pengaturan (mis. murid perlu tahu bobot).
drop policy if exists pengaturan_baca on pengaturan;
create policy pengaturan_baca on pengaturan
  for select using (auth.uid() is not null);

-- Hanya admin yang boleh mengubah.
drop policy if exists pengaturan_ubah on pengaturan;
create policy pengaturan_ubah on pengaturan
  for all using (saya_admin()) with check (saya_admin());

-- Bobot bawaan: 65% review, 20% badge, 15% kecepatan.
insert into pengaturan (kunci, nilai) values
  ('bobot_nilai', '{"review":65,"badge":20,"kecepatan":15,
    "poin_per_badge":10, "penalti_telat_per_jam":2, "penalti_telat_maks":40}'::jsonb)
on conflict (kunci) do nothing;

-- 3. Fungsi: guru memberi nilai huruf + kunci saat menyetujui ---------
-- Memperluas alur review: selain menyetujui, guru menetapkan A–E.
create or replace function nilai_tugas(
  p_progres bigint,
  p_huruf   text,
  p_umpan   text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_pen bigint;
begin
  select penugasan_id into v_pen from progres_tugas where id = p_progres;
  if v_pen is null then raise exception 'Progres tidak ditemukan'; end if;
  if not (saya_guru_penugasan(v_pen) or saya_admin()) then
    raise exception 'Tidak berwenang menilai tugas ini';
  end if;
  if p_huruf not in ('A','B','C','D','E') then
    raise exception 'Nilai harus A–E';
  end if;

  update progres_tugas set
    nilai_huruf    = p_huruf,
    status         = 'selesai',
    disetujui_pada = now(),
    disetujui_oleh = auth.uid(),
    umpan_balik    = coalesce(p_umpan, umpan_balik),
    terkunci       = true
  where id = p_progres;
end;
$$;
grant execute on function nilai_tugas(bigint, text, text) to authenticated;

-- 4. Fungsi: buka kunci (hanya guru/admin) ----------------------------
create or replace function buka_kunci_tugas(p_progres bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_pen bigint;
begin
  select penugasan_id into v_pen from progres_tugas where id = p_progres;
  if v_pen is null then raise exception 'Progres tidak ditemukan'; end if;
  if not (saya_guru_penugasan(v_pen) or saya_admin()) then
    raise exception 'Hanya guru yang bisa membuka kunci';
  end if;
  update progres_tugas set terkunci = false where id = p_progres;
end;
$$;
grant execute on function buka_kunci_tugas(bigint) to authenticated;

-- 4b. Fungsi: murid menyelesaikan & mengunci tugasnya sendiri ----------
-- Dipakai saat murid menekan "Tandai selesai". Setelah ini murid tak bisa
-- mengubahnya lagi (terkunci); hanya guru yang bisa membuka.
create or replace function selesaikan_tugas(p_penugasan bigint, p_tugas bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  -- Pastikan murid ini memang peserta penugasan tsb.
  if not exists (
    select 1 from penugasan pn
    join pendaftaran d on d.kelas_id = pn.kelas_id
    where pn.id = p_penugasan and d.murid_id = v_uid and d.aktif
  ) then
    raise exception 'Bukan peserta penugasan ini';
  end if;

  insert into progres_tugas (penugasan_id, murid_id, tugas_id, status, terkunci, diserahkan_pada)
  values (p_penugasan, v_uid, p_tugas, 'selesai', true, now())
  on conflict (penugasan_id, murid_id, tugas_id) do update set
    status = 'selesai', terkunci = true,
    diserahkan_pada = coalesce(progres_tugas.diserahkan_pada, now());
end;
$$;
grant execute on function selesaikan_tugas(bigint, bigint) to authenticated;

-- 5. Cegah murid mengubah baris yang terkunci -------------------------
-- Kebijakan update murid yang ada diperketat: tak boleh bila terkunci.
-- (Kita tambah kebijakan terpisah; RLS menggabungkan dengan OR, maka
--  kita ganti kebijakan murid lama bila ada.)
drop policy if exists progres_ubah_murid on progres_tugas;
create policy progres_ubah_murid on progres_tugas
  for update
  using (murid_id = (select auth.uid()) and not terkunci)
  with check (murid_id = (select auth.uid()));

-- Catatan: saat guru mengunci (via nilai_tugas, SECURITY DEFINER), update
-- berjalan sebagai pemilik fungsi sehingga tak terhalang kebijakan ini.
-- Murid tetap bisa MEMBACA tugas terkuncinya (kebijakan baca tak berubah).
