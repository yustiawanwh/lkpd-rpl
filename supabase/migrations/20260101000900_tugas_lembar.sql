-- ============================================================
-- Migrasi tambahan: kaitkan tugas dengan lembar kerjanya
-- ============================================================
-- MASALAH:
--   Sebuah tugas berbunyi "Lengkapi Tabel A", tetapi tabelnya hanya ada
--   di menu "Lembar Kerja" yang terpisah — tidak muncul di dalam tiket
--   tugas. Murid membaca perintah mengisi tabel tanpa ada tabel untuk
--   diisi di tempat yang sama.
--
-- SOLUSI:
--   Tambah kolom lembar_kode pada tugas: daftar kode lembar (mis. "A"
--   atau "A,B") yang harus diisi untuk tugas itu. Aplikasi lalu
--   menampilkan tabel tersebut langsung di dalam tiket.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

alter table tugas
  add column if not exists lembar_kode text;

-- Isi otomatis untuk data contoh (TP 12.1): cocokkan tugas ke tabel
-- berdasarkan penyebutan pada judul/deskripsi. Aman diulang; hanya
-- mengisi yang masih kosong.
do $$
declare
  r record;
  v_kode text;
begin
  for r in
    select id, coalesce(judul,'') || ' ' || coalesce(deskripsi,'') as teks
    from tugas
    where lembar_kode is null
  loop
    v_kode := null;

    -- Cari pola "Tabel X" pada teks tugas (huruf + angka opsional).
    -- Ambil yang pertama disebut.
    select (regexp_match(r.teks, 'Tabel\s+([A-G][0-9]?)', 'i'))[1] into v_kode;

    if v_kode is not null then
      update tugas set lembar_kode = upper(v_kode) where id = r.id;
    end if;
  end loop;
end $$;

-- Catatan: kolom ini opsional. Tugas tanpa lembar_kode tetap berjalan
-- normal (tiketnya tidak menampilkan tabel). Guru bisa mengisi/mengubah
-- lewat panel penyunting LKPD.
