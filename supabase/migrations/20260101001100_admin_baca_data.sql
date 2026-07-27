-- ============================================================
-- Migrasi: akses baca admin untuk data murid antar-kelas
-- ============================================================
-- MASALAH:
--   Admin bisa membaca daftar kelas, tetapi BELUM bisa membaca isi
--   pendaftaran/progres/isian/unggahan/badge pada kelas yang bukan
--   miliknya sendiri. Akibatnya: daftar kelas menampilkan "1 murid",
--   tetapi saat dibuka, detailnya kosong ("0 murid") karena baris
--   pendaftaran & profil murid terhalang RLS untuk admin.
--
-- SOLUSI:
--   Tambah kebijakan baca khusus admin (saya_admin()) pada tabel data
--   murid. Admin memang berperan mengawasi seluruh kelas, jadi wajar
--   bisa melihatnya. Kebijakan menulis TIDAK diubah (admin tetap tak
--   mengganggu pekerjaan murid kecuali lewat fungsi yang sudah ada).
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

-- Pendaftaran: admin melihat semua pendaftaran.
drop policy if exists daftar_baca_admin on pendaftaran;
create policy daftar_baca_admin on pendaftaran
  for select using (saya_admin());

-- Progres tugas: admin melihat semua progres.
drop policy if exists progres_baca_admin on progres_tugas;
create policy progres_baca_admin on progres_tugas
  for select using (saya_admin());

-- Isian lembar: admin melihat semua isian.
drop policy if exists isian_baca_admin on isian_lembar;
create policy isian_baca_admin on isian_lembar
  for select using (saya_admin());

-- Lampiran (bukti unggahan): admin melihat semua.
drop policy if exists lampiran_baca_admin on lampiran;
create policy lampiran_baca_admin on lampiran
  for select using (saya_admin());

-- Perolehan badge: admin melihat semua.
drop policy if exists perolehan_baca_admin on perolehan_badge;
create policy perolehan_baca_admin on perolehan_badge
  for select using (saya_admin());

-- Statistik murid: admin melihat semua.
drop policy if exists statistik_baca_admin on statistik_murid;
create policy statistik_baca_admin on statistik_murid
  for select using (saya_admin());
