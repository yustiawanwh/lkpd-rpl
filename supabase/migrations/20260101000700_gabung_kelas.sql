-- ============================================================
-- Migrasi tambahan: gabung kelas lewat kode (perbaikan)
-- ============================================================
-- MASALAH yang diperbaiki:
--   Murid yang belum tergabung tidak bisa membaca baris kelas
--   (kebijakan kelas_baca_murid hanya untuk yang SUDAH terdaftar).
--   Akibatnya pencarian kode saat mau bergabung selalu "tidak
--   ditemukan", walau kodenya benar — masalah ayam-dan-telur.
--
-- SOLUSI:
--   Fungsi SECURITY DEFINER yang menerima kode, memvalidasi, lalu
--   mendaftarkan murid dalam satu langkah. Fungsi ini melewati RLS
--   secara internal, TETAPI hanya bertindak untuk kode yang PERSIS
--   cocok dan hanya mendaftarkan si pemanggil sendiri. Jadi murid
--   tetap tidak bisa menjelajah daftar kelas.
--
-- Aman dijalankan berulang. Jalankan di SQL Editor setelah migrasi lain.
-- ============================================================

create or replace function gabung_kelas(p_kode text)
returns table (kelas_id bigint, nama text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_kelas kelas%rowtype;
begin
  -- Harus login.
  if v_uid is null then
    return query select null::bigint, null::text, 'tidak_login'::text;
    return;
  end if;

  -- Cari kelas dengan kode PERSIS (huruf besar, tanpa spasi).
  select * into v_kelas
  from kelas
  where upper(kode_gabung) = upper(trim(p_kode))
  limit 1;

  if not found then
    return query select null::bigint, null::text, 'tidak_ditemukan'::text;
    return;
  end if;

  if not v_kelas.terbuka then
    return query select v_kelas.id, v_kelas.nama, 'ditutup'::text;
    return;
  end if;

  -- Sudah tergabung?
  if exists (
    select 1 from pendaftaran
    where pendaftaran.kelas_id = v_kelas.id and murid_id = v_uid
  ) then
    return query select v_kelas.id, v_kelas.nama, 'sudah_gabung'::text;
    return;
  end if;

  -- Daftarkan si pemanggil sendiri.
  insert into pendaftaran (kelas_id, murid_id)
  values (v_kelas.id, v_uid);

  return query select v_kelas.id, v_kelas.nama, 'berhasil'::text;
end;
$$;

-- Boleh dipanggil oleh pengguna yang sudah login.
grant execute on function gabung_kelas(text) to authenticated;

-- Catatan keamanan: fungsi ini TIDAK mengembalikan data kelas apa pun
-- kecuali nama, dan hanya bila kode benar. Ia tidak bisa dipakai untuk
-- menebak/menjelajah kelas lain karena kode 6 huruf (tanpa I,O,0,1)
-- memiliki ruang tebakan sangat besar dan tiap panggilan hanya menguji
-- satu kode.
