-- ============================================================
-- Migrasi: kunci isian lembar bila tugasnya terkunci
-- ============================================================
-- MASALAH:
--   Saat murid menandai tugas selesai, tugas & tabel di dalam tiket
--   terkunci. TETAPI halaman "Lembar Kerja" terpisah masih menulis ke
--   tabel isian_lembar tanpa memeriksa kunci, sehingga murid bisa
--   mengedit tabel yang seharusnya sudah terkunci lewat jalur itu.
--
-- SOLUSI:
--   Fungsi bantu lembar_terkunci(penugasan, lembar) mengecek apakah ada
--   tugas milik murid ini yang lembar_kode-nya menunjuk lembar tsb dan
--   berstatus terkunci. Kebijakan tulis isian_lembar diperketat: murid
--   hanya boleh menulis bila lembarnya TIDAK terkunci.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

-- Apakah lembar (untuk penugasan tertentu) terkunci bagi murid pemanggil?
create or replace function lembar_terkunci(p_penugasan bigint, p_lembar bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from progres_tugas pr
    join tugas t         on t.id = pr.tugas_id
    join lembar_kerja lk on upper(lk.kode) = upper(t.lembar_kode)
    where pr.penugasan_id = p_penugasan
      and pr.murid_id = auth.uid()
      and pr.terkunci = true
      and lk.id = p_lembar
  );
$$;

-- Perketat kebijakan tulis murid: tolak bila lembarnya terkunci.
drop policy if exists isian_kelola_murid on isian_lembar;
create policy isian_kelola_murid on isian_lembar
  for all
  using (
    murid_id = (select auth.uid())
    and saya_murid_penugasan(penugasan_id)
  )
  with check (
    murid_id = (select auth.uid())
    and saya_murid_penugasan(penugasan_id)
    and not lembar_terkunci(penugasan_id, lembar_kerja_id)
  );

-- Catatan: murid tetap bisa MEMBACA isian yang terkunci (kebijakan baca
-- tak berubah), sehingga tabel masih tampil sebagai baca-saja. Yang
-- diblokir hanya penulisan.
