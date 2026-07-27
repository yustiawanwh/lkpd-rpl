-- ============================================================
-- Migrasi tambahan: manajemen murid oleh guru
-- ============================================================
-- Menambah kemampuan guru mengubah data murid di kelasnya
-- (nama, nomor absen, NIS) TANPA bisa mengubah peran murid.
--
-- Aman dijalankan berulang: memakai drop policy if exists.
-- Jalankan SEKALI di SQL Editor Supabase setelah 5 migrasi awal.
-- ============================================================

-- Fungsi bantu: apakah profil ini milik murid di salah satu kelas
-- yang saya (guru) ampu? SECURITY DEFINER agar tidak memicu RLS
-- pendaftaran/kelas secara berantai.
create or replace function murid_di_kelas_saya(p_murid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from pendaftaran d
    join kelas k on k.id = d.kelas_id
    where d.murid_id = p_murid
      and k.guru_id = auth.uid()
  );
$$;

-- Guru boleh mengubah data murid di kelasnya, TAPI:
--   * hanya bila yang diubah memang berperan 'murid'
--   * peran tidak boleh berubah (tetap 'murid')
-- Ini mencegah guru menaikkan peran murid menjadi guru/admin.
drop policy if exists profil_ubah_murid_guru on profil;
create policy profil_ubah_murid_guru on profil
  for update
  using (
    saya_guru()
    and peran = 'murid'
    and murid_di_kelas_saya(profil.id)
  )
  with check (
    saya_guru()
    and peran = 'murid'
    and murid_di_kelas_saya(profil.id)
  );

-- Catatan: penambahan & pengeluaran murid dari kelas sudah diizinkan
-- oleh kebijakan 'daftar_kelola_guru' (for all) pada tabel pendaftaran,
-- jadi tidak perlu kebijakan baru untuk itu.
