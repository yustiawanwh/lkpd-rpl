-- ============================================================
-- Migrasi: satu tugas boleh mengaitkan BEBERAPA lembar (kode dipisah koma)
-- ============================================================
-- LATAR:
--   Kolom tugas.lembar_kode kini boleh berisi beberapa kode dipisah koma
--   (mis. "C1,C2,C3"). Sebelumnya fungsi kunci lembar_terkunci() memakai
--   pencocokan sama-persis (upper(lk.kode) = upper(t.lembar_kode)), sehingga
--   untuk daftar berkoma tidak cocok dan penguncian server tidak jalan untuk
--   C2/C3.
--
-- SOLUSI:
--   Pecah lembar_kode berdasarkan koma/titik-koma lalu cocokkan per elemen.
--   Sebuah lembar terkunci bila kode-nya termasuk dalam daftar lembar_kode
--   milik tugas murid yang berstatus terkunci.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

create or replace function lembar_terkunci(p_penugasan bigint, p_lembar bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from progres_tugas pr
    join tugas t         on t.id = pr.tugas_id
    join lembar_kerja lk on lk.id = p_lembar
    -- Pecah daftar kode (koma/titik-koma) dan cocokkan salah satunya.
    join lateral (
      select trim(x) as kode
      from unnest(regexp_split_to_array(coalesce(t.lembar_kode, ''), '[,;]')) as x
    ) kd on upper(kd.kode) = upper(lk.kode)
    where pr.penugasan_id = p_penugasan
      and pr.murid_id = auth.uid()
      and pr.terkunci = true
  );
$$;
