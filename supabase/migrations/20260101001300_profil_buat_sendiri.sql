-- ============================================================
-- Migrasi: izinkan pengguna membuat profilnya sendiri (jaring pengaman)
-- ============================================================
-- LATAR:
--   Profil dibuat otomatis oleh trigger `pengguna_baru` saat akun baru
--   terbentuk. Namun bila trigger belum terpasang atau terlambat sepersekian
--   detik, aplikasi bisa gagal memuat profil ("Cannot coerce the result to a
--   single JSON object").
--
-- SOLUSI:
--   Kebijakan INSERT yang mengizinkan pengguna membuat SATU profil dengan
--   id = dirinya sendiri, berperan 'murid'. Aman: pengguna tak bisa membuat
--   profil untuk orang lain, dan tak bisa mengangkat dirinya jadi guru/admin
--   (peran wajib 'murid'). Digunakan aplikasi sebagai cadangan bila trigger
--   belum sempat berjalan.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

drop policy if exists profil_buat_sendiri on profil;
create policy profil_buat_sendiri on profil
  for insert
  with check (
    id = (select auth.uid())
    and peran = 'murid'
  );

-- Pastikan trigger pembuat profil memang ada (buat ulang bila hilang).
create or replace function tangani_pengguna_baru()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profil (id, nama, email, peran)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nama',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    'murid'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists pengguna_baru on auth.users;
create trigger pengguna_baru
  after insert on auth.users
  for each row execute function tangani_pengguna_baru();
