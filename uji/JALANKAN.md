# Menjalankan uji keamanan RLS secara lokal

Berkas di folder ini dipakai untuk menguji aturan RLS tanpa perlu
menyentuh proyek Supabase yang sesungguhnya.

## Kebutuhan

PostgreSQL 15 atau lebih baru (Supabase memakai PostgreSQL 15/16).

## Langkah

```bash
createdb lms_uji

# 1. Meniru lingkungan Supabase (schema auth, fungsi auth.uid, peran)
psql -d lms_uji -f uji/tiruan_supabase.sql

# 2. Jalankan seluruh migrasi
for f in supabase/migrations/*.sql; do psql -d lms_uji -f "$f"; done

# 3. Beri hak tabel seperti bawaan Supabase
psql -d lms_uji -f uji/beri_hak.sql

# 4. Jalankan uji keamanan
psql -d lms_uji -f uji/uji_rls.sql
```

Hasil yang diharapkan: **LULUS: 50 GAGAL: 0**

## Apa yang diuji

Pengujian ini meniru serangan sungguhan, bukan sekadar memastikan
kueri berjalan:

- Guru mencoba membaca & mengubah kelas guru lain
- Murid mencoba membuat progres atas nama teman
- Murid mencoba mengerjakan penugasan kelas yang tidak diikutinya
- Murid mencoba menambah XP-nya sendiri
- Murid mencoba memberi badge pada dirinya sendiri
- Murid mencoba menyetujui pekerjaannya sendiri
- Murid mencoba mengangkat dirinya menjadi guru/admin
- Murid mencoba mengisi kolom verifikasi guru
- Pengguna anonim mencoba membaca seluruh tabel

Seluruhnya harus ditolak basis data.

## Catatan

Berkas `tiruan_supabase.sql` dan `beri_hak.sql` **hanya untuk pengujian
lokal**. Jangan dijalankan di proyek Supabase — di sana schema `auth`
dan hak tabelnya sudah disediakan sistem.
