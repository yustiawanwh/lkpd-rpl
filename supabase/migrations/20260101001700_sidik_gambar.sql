-- ============================================================
-- Migrasi: sidik gambar (perceptual hash) untuk penanda kemiripan
-- ============================================================
-- TUJUAN:
--   Menyimpan "sidik jari" gambar (perceptual hash) tiap bukti yang diunggah,
--   agar guru bisa mendeteksi screenshot yang identik/mirip antar murid
--   (indikasi menyalin). Sidik dihitung di peramban saat mengunggah.
--
--   Ini ALAT BANTU guru — hanya menandai yang mencurigakan, tidak menuduh
--   dan tidak memengaruhi nilai.
--
-- Aman dijalankan berulang.
-- ============================================================

alter table lampiran
  add column if not exists sidik text;      -- perceptual hash (hex), boleh null

comment on column lampiran.sidik is
  'Perceptual hash gambar (dihitung di peramban) untuk deteksi kemiripan bukti.';

-- Indeks untuk mempercepat pencarian kecocokan.
create index if not exists lampiran_sidik_idx on lampiran (sidik);
