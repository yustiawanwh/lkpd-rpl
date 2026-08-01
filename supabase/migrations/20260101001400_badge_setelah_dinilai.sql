-- ============================================================
-- Migrasi: badge diberikan setelah DINILAI guru (bukan sekadar selesai)
-- ============================================================
-- PERMINTAAN:
--   Badge (dan komponen badge pada nilai) baru diberikan bila tugas inti
--   sebuah sprint sudah DINILAI guru (punya nilai_huruf), bukan hanya
--   ditandai 'selesai' oleh murid. Sebelum dinilai: badge 0, nilai 0.
--
-- PERUBAHAN:
--   1. syarat_badge_terpenuhi: untuk tipe 'sprint_tuntas' dan
--      'semua_inti_tuntas', hitung tugas yang sudah DINILAI
--      (status 'selesai' DAN nilai_huruf tidak kosong).
--   2. Trigger badge juga dipicu saat nilai_huruf berubah (bukan hanya
--      status), agar badge langsung dievaluasi begitu guru menilai.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
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
      -- Satu tugas tertentu: kini harus sudah DINILAI guru.
      return exists (
        select 1 from progres_tugas pt
        join tugas t on t.id = pt.tugas_id
        where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
          and pt.status = 'selesai' and pt.nilai_huruf is not null
          and t.kode = p_syarat->>'task_kode'
      );

    when 'sprint_tuntas' then
      select count(*) into v_total
      from tugas t join sprint s on s.id = t.sprint_id
      where s.tujuan_pembelajaran_id = v_tp
        and s.nomor = (p_syarat->>'sprint_nomor')::int
        and t.jenis = 'inti';

      if v_total = 0 then return false; end if;

      -- Hanya hitung tugas inti yang sudah DINILAI guru.
      select count(*) into v_selesai
      from progres_tugas pt
      join tugas t on t.id = pt.tugas_id
      join sprint s on s.id = t.sprint_id
      where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
        and pt.status = 'selesai' and pt.nilai_huruf is not null
        and s.tujuan_pembelajaran_id = v_tp
        and s.nomor = (p_syarat->>'sprint_nomor')::int
        and t.jenis = 'inti';

      return v_selesai = v_total;

    when 'semua_inti_tuntas' then
      select count(*) into v_total
      from tugas t join sprint s on s.id = t.sprint_id
      where s.tujuan_pembelajaran_id = v_tp and t.jenis = 'inti';

      if v_total = 0 then return false; end if;

      -- Hanya hitung tugas inti yang sudah DINILAI guru.
      select count(*) into v_selesai
      from progres_tugas pt
      join tugas t on t.id = pt.tugas_id
      join sprint s on s.id = t.sprint_id
      where pt.murid_id = p_murid and pt.penugasan_id = p_penugasan
        and pt.status = 'selesai' and pt.nilai_huruf is not null
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
      -- Kini menghitung tugas yang sudah DINILAI guru.
      select count(*) into v_selesai
      from progres_tugas
      where murid_id = p_murid and penugasan_id = p_penugasan
        and status = 'selesai' and nilai_huruf is not null;

      return v_selesai >= coalesce((p_syarat->>'jumlah')::int, 1);

    else
      return false;
  end case;
end;
$$;

-- Trigger badge juga dipicu saat nilai_huruf berubah (guru menilai),
-- bukan hanya saat status berubah.
drop trigger if exists progres_sesudah on progres_tugas;
create trigger progres_sesudah
  after insert or update of status, nilai_huruf on progres_tugas
  for each row execute function sesudah_progres_berubah();
