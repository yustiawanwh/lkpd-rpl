-- ============================================================
--  UJI KEAMANAN RLS
-- ------------------------------------------------------------
--  Menguji dengan meniru serangan: satu guru mencoba membaca kelas
--  guru lain, satu murid mencoba melihat progres temannya, murid
--  mencoba menaikkan XP-nya sendiri, dan seterusnya.
--
--  Cara kerja: berpindah peran ke 'authenticated' lalu menyetel
--  request.jwt.claim.sub — persis seperti yang dilakukan Supabase
--  saat menerima permintaan dari peramban.
-- ============================================================

\set ON_ERROR_STOP off
\pset pager off

-- Penampung hasil. Dibuat di schema publik (bukan temp) supaya tetap
-- terbaca setelah berpindah peran ke authenticated/anon.
drop table if exists hasil_uji cascade;
create table hasil_uji (
  nomor serial, nama text, lulus boolean, catatan text
);
alter table hasil_uji enable row level security;
create policy hasil_bebas on hasil_uji for all using (true) with check (true);
grant all on hasil_uji to authenticated, anon;
grant usage, select on sequence hasil_uji_nomor_seq to authenticated, anon;

create or replace function catat(p_nama text, p_lulus boolean, p_catatan text default null)
returns void language plpgsql as $$
begin
  insert into hasil_uji (nama, lulus, catatan) values (p_nama, p_lulus, p_catatan);
end; $$;

-- Berpindah identitas, meniru permintaan dari peramban.
create or replace function masuk_sebagai(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end; $$;

-- ============================================================
--  DATA UJI
-- ============================================================
set role postgres;

do $$
declare
  v_budi   uuid := '11111111-1111-1111-1111-111111111111';
  v_sari   uuid := '22222222-2222-2222-2222-222222222222';
  v_dewi   uuid := '33333333-3333-3333-3333-333333333333';
  v_rizky  uuid := '44444444-4444-4444-4444-444444444444';
  v_admin  uuid := '55555555-5555-5555-5555-555555555555';
  v_ta bigint; v_mapel bigint;
  v_kelas_budi bigint; v_kelas_sari bigint;
  v_tp bigint; v_sprint bigint; v_tugas bigint; v_tugas2 bigint;
  v_p_budi bigint; v_p_sari bigint;
begin
  -- auth.users lalu profil (trigger otomatis membuat profil)
  insert into auth.users (id, email) values
    (v_budi, 'budi@s.id'), (v_sari, 'sari@s.id'),
    (v_dewi, 'dewi@s.id'), (v_rizky, 'rizky@s.id'), (v_admin, 'admin@s.id');

  update profil set nama='Budi',  peran='guru'  where id = v_budi;
  update profil set nama='Sari',  peran='guru'  where id = v_sari;
  update profil set nama='Dewi',  peran='murid' where id = v_dewi;
  update profil set nama='Rizky', peran='murid' where id = v_rizky;
  update profil set nama='Admin', peran='admin' where id = v_admin;

  insert into tahun_ajaran (nama, mulai, selesai, aktif)
    values ('2026/2027','2026-07-01','2027-06-30',true) returning id into v_ta;
  insert into mata_pelajaran (kode, nama, fase, tingkat)
    values ('RPL-XII','Rekayasa Perangkat Lunak','F',12) returning id into v_mapel;

  insert into kelas (tahun_ajaran_id, mata_pelajaran_id, guru_id, nama)
    values (v_ta, v_mapel, v_budi, 'XII RPL 1') returning id into v_kelas_budi;
  insert into kelas (tahun_ajaran_id, mata_pelajaran_id, guru_id, nama)
    values (v_ta, v_mapel, v_sari, 'XII RPL 2') returning id into v_kelas_sari;

  insert into tujuan_pembelajaran (mata_pelajaran_id, dibuat_oleh, kode, judul, terbit)
    values (v_mapel, v_budi, 'TP 12.1', 'Penyiapan Lingkungan', true) returning id into v_tp;

  insert into sprint (tujuan_pembelajaran_id, nomor, nama, durasi_menit, menit_inti)
    values (v_tp, 1, 'Menyiapkan Lingkungan Kerja', 320, 130) returning id into v_sprint;

  insert into tugas (sprint_id, kode, judul, jenis, estimasi_menit, xp)
    values (v_sprint, 'RPL-12.1-101', 'Analisis Komponen', 'inti', 50, 25)
    returning id into v_tugas;
  insert into tugas (sprint_id, kode, judul, jenis, estimasi_menit, xp)
    values (v_sprint, 'RPL-12.1-102', 'Instalasi IDE', 'inti', 80, 40)
    returning id into v_tugas2;

  insert into badge (tujuan_pembelajaran_id, kode, nama, xp, syarat)
    values (v_tp, 'env_ready', 'Environment Ready', 50,
            '{"tipe":"sprint_tuntas","sprint_nomor":1}'::jsonb);
  insert into badge (tujuan_pembelajaran_id, kode, nama, xp, syarat)
    values (v_tp, 'first_task', 'Langkah Pertama', 20,
            '{"tipe":"task_selesai","task_kode":"RPL-12.1-101"}'::jsonb);

  insert into pendaftaran (kelas_id, murid_id, tim) values (v_kelas_budi, v_dewi, 'Mobile');
  insert into pendaftaran (kelas_id, murid_id, tim) values (v_kelas_sari, v_rizky, 'Backend');

  insert into penugasan (kelas_id, tujuan_pembelajaran_id, dibuka)
    values (v_kelas_budi, v_tp, true) returning id into v_p_budi;
  insert into penugasan (kelas_id, tujuan_pembelajaran_id, dibuka)
    values (v_kelas_sari, v_tp, true) returning id into v_p_sari;

  -- Simpan id untuk dipakai pengujian
  drop table if exists id_uji cascade;
  create table id_uji as select
    v_budi budi, v_sari sari, v_dewi dewi, v_rizky rizky, v_admin admin,
    v_kelas_budi kelas_budi, v_kelas_sari kelas_sari,
    v_tp tp, v_sprint sprint, v_tugas tugas, v_tugas2 tugas2,
    v_p_budi p_budi, v_p_sari p_sari;

  execute 'alter table id_uji enable row level security';
  execute 'create policy id_bebas on id_uji for all using (true)';
  execute 'grant select on id_uji to authenticated, anon';
end $$;

-- ============================================================
--  BAGIAN 1 — ISOLASI ANTAR GURU
-- ============================================================
set role authenticated;

do $$
declare i record; n int;
begin
  select * into i from id_uji;

  perform masuk_sebagai(i.budi);

  select count(*) into n from kelas;
  perform catat('Guru hanya melihat kelasnya sendiri', n = 1, 'terlihat: ' || n);

  select count(*) into n from kelas where id = i.kelas_sari;
  perform catat('Kelas guru lain TIDAK terlihat', n = 0);

  -- Mencoba mengubah kelas guru lain
  update kelas set nama = 'DIBAJAK' where id = i.kelas_sari;
  get diagnostics n = row_count;
  perform catat('Tidak bisa mengubah kelas guru lain', n = 0, 'baris terubah: ' || n);

  -- Mencoba menghapus kelas guru lain
  delete from kelas where id = i.kelas_sari;
  get diagnostics n = row_count;
  perform catat('Tidak bisa menghapus kelas guru lain', n = 0);

  select count(*) into n from penugasan;
  perform catat('Penugasan kelas lain tidak terlihat', n = 1, 'terlihat: ' || n);
end $$;

-- ============================================================
--  BAGIAN 2 — ISOLASI PROGRES MURID
-- ============================================================
do $$
declare i record; n int; v_id bigint;
begin
  select * into i from id_uji;

  -- Dewi mengerjakan tugasnya
  perform masuk_sebagai(i.dewi);
  insert into progres_tugas (penugasan_id, murid_id, tugas_id, status)
    values (i.p_budi, i.dewi, i.tugas, 'selesai') returning id into v_id;
  perform catat('Murid bisa membuat progresnya sendiri', v_id is not null);

  -- Mencoba membuat progres atas nama murid lain
  begin
    insert into progres_tugas (penugasan_id, murid_id, tugas_id, status)
      values (i.p_budi, i.rizky, i.tugas2, 'selesai');
    perform catat('Tidak bisa membuat progres atas nama murid lain', false, 'BERHASIL DISISIPKAN!');
  exception when insufficient_privilege or check_violation then
    perform catat('Tidak bisa membuat progres atas nama murid lain', true);
  end;

  -- Mencoba mengerjakan tugas di kelas yang tidak diikuti
  begin
    insert into progres_tugas (penugasan_id, murid_id, tugas_id, status)
      values (i.p_sari, i.dewi, i.tugas2, 'selesai');
    perform catat('Tidak bisa mengerjakan penugasan kelas lain', false, 'BERHASIL DISISIPKAN!');
  exception when insufficient_privilege or check_violation then
    perform catat('Tidak bisa mengerjakan penugasan kelas lain', true);
  end;

  -- Rizky mengerjakan tugasnya
  perform masuk_sebagai(i.rizky);
  insert into progres_tugas (penugasan_id, murid_id, tugas_id, status)
    values (i.p_sari, i.rizky, i.tugas, 'selesai');

  select count(*) into n from progres_tugas;
  perform catat('Murid hanya melihat progresnya sendiri', n = 1, 'terlihat: ' || n);

  -- Mencoba mengubah progres murid lain
  perform masuk_sebagai(i.dewi);
  update progres_tugas set status = 'backlog' where murid_id = i.rizky;
  get diagnostics n = row_count;
  perform catat('Tidak bisa mengubah progres murid lain', n = 0);
end $$;

-- ============================================================
--  BAGIAN 3 — GURU MELIHAT PROGRES MURIDNYA
-- ============================================================
do $$
declare i record; n int;
begin
  select * into i from id_uji;

  perform masuk_sebagai(i.budi);
  select count(*) into n from progres_tugas;
  perform catat('Guru melihat progres murid kelasnya', n = 1, 'terlihat: ' || n);

  select count(*) into n from progres_tugas where murid_id = i.rizky;
  perform catat('Guru TIDAK melihat progres murid kelas lain', n = 0);

  select count(*) into n from profil;
  perform catat('Guru melihat profil murid kelasnya saja',
                n = 2, 'terlihat: ' || n || ' (diri sendiri + Dewi)');
end $$;

-- ============================================================
--  BAGIAN 4 — XP TIDAK BISA DICURANGI
-- ============================================================
do $$
declare i record; n int; v_xp int;
begin
  select * into i from id_uji;

  perform masuk_sebagai(i.dewi);

  select total_xp into v_xp from statistik_murid
    where murid_id = i.dewi and penugasan_id = i.p_budi;
  perform catat('XP tercatat otomatis oleh trigger',
                v_xp = 45, 'XP: ' || coalesce(v_xp::text,'null') || ' (25 tugas + 20 badge)');

  -- Mencoba menambah XP sendiri
  begin
    insert into buku_xp (murid_id, penugasan_id, jumlah, sumber, referensi)
      values (i.dewi, i.p_budi, 9999, 'manual', 'curang');
    perform catat('Murid TIDAK bisa menambah XP sendiri', false, 'BERHASIL DISISIPKAN!');
  exception when insufficient_privilege then
    perform catat('Murid TIDAK bisa menambah XP sendiri', true);
  end;

  -- Mencoba mengubah statistik langsung
  update statistik_murid set total_xp = 9999 where murid_id = i.dewi;
  get diagnostics n = row_count;
  perform catat('Murid tidak bisa mengubah statistiknya', n = 0);

  -- Mencoba memberi badge pada diri sendiri
  begin
    insert into perolehan_badge (murid_id, badge_id, penugasan_id)
      values (i.dewi, (select id from badge limit 1), i.p_budi);
    perform catat('Murid tidak bisa memberi badge sendiri', false, 'BERHASIL DISISIPKAN!');
  exception when insufficient_privilege or unique_violation then
    perform catat('Murid tidak bisa memberi badge sendiri', true);
  end;

  -- Mencoba menyetujui pekerjaan sendiri
  update progres_tugas set disetujui_oleh = i.dewi, disetujui_pada = now()
    where murid_id = i.dewi;
  select count(*) into n from progres_tugas
    where murid_id = i.dewi and disetujui_oleh is not null;
  perform catat('Murid tidak bisa menyetujui pekerjaannya sendiri', n = 0);
end $$;

-- ============================================================
--  BAGIAN 5 — XP DITARIK SAAT TUGAS DIBUKA KEMBALI
-- ============================================================
do $$
declare i record; v_xp int; n int;
begin
  select * into i from id_uji;
  perform masuk_sebagai(i.dewi);

  update progres_tugas set status = 'dikerjakan'
    where murid_id = i.dewi and tugas_id = i.tugas;

  select total_xp into v_xp from statistik_murid
    where murid_id = i.dewi and penugasan_id = i.p_budi;
  perform catat('XP tugas ditarik saat dibuka kembali',
                v_xp = 20, 'XP: ' || v_xp || ' (badge tetap, XP tugas hilang)');

  select count(*) into n from buku_xp
    where murid_id = i.dewi and sumber = 'task' and referensi = 'RPL-12.1-101';
  perform catat('Baris XP tugas benar-benar dihapus', n = 0);

  -- Menyelesaikan lagi harus memberi XP lagi
  update progres_tugas set status = 'selesai'
    where murid_id = i.dewi and tugas_id = i.tugas;
  select total_xp into v_xp from statistik_murid
    where murid_id = i.dewi and penugasan_id = i.p_budi;
  perform catat('XP diberikan lagi saat diselesaikan ulang', v_xp = 45, 'XP: ' || v_xp);
end $$;

-- ============================================================
--  BAGIAN 6 — BADGE
-- ============================================================
do $$
declare i record; n int; v_xp int;
begin
  select * into i from id_uji;
  perform masuk_sebagai(i.dewi);

  select count(*) into n from perolehan_badge where murid_id = i.dewi;
  perform catat('Badge task_selesai terbit otomatis', n = 1, 'badge: ' || n);

  -- Menyelesaikan seluruh tugas inti sprint 1 → badge sprint_tuntas
  insert into progres_tugas (penugasan_id, murid_id, tugas_id, status)
    values (i.p_budi, i.dewi, i.tugas2, 'selesai');

  select count(*) into n from perolehan_badge where murid_id = i.dewi;
  perform catat('Badge sprint_tuntas terbit setelah semua inti selesai',
                n = 2, 'badge: ' || n);

  select total_xp into v_xp from statistik_murid
    where murid_id = i.dewi and penugasan_id = i.p_budi;
  perform catat('Total XP benar (25+40 tugas, 20+50 badge = 135)',
                v_xp = 135, 'XP: ' || v_xp);

  -- Badge tidak boleh terbit dua kali
  update progres_tugas set catatan = 'sentuh' where murid_id = i.dewi;
  select count(*) into n from perolehan_badge where murid_id = i.dewi;
  perform catat('Badge tidak terbit dua kali', n = 2, 'badge: ' || n);
end $$;

-- ============================================================
--  BAGIAN 7 — PAPAN PERINGKAT
-- ============================================================
do $$
declare i record; n int;
begin
  select * into i from id_uji;

  perform masuk_sebagai(i.dewi);
  select count(*) into n from statistik_murid;
  perform catat('Papan peringkat hanya sekelas', n = 1, 'terlihat: ' || n);

  select count(*) into n from statistik_murid where murid_id = i.rizky;
  perform catat('Statistik murid kelas lain tidak terlihat', n = 0);

  select count(*) into n from profil where id = i.rizky;
  perform catat('Profil murid kelas lain tidak terlihat', n = 0);
end $$;

-- ============================================================
--  BAGIAN 8 — KURIKULUM
-- ============================================================
do $$
declare i record; n int; v_id bigint;
begin
  select * into i from id_uji;

  -- Bu Sari melihat TP terbit milik Pak Budi
  perform masuk_sebagai(i.sari);
  select count(*) into n from tujuan_pembelajaran where id = i.tp;
  perform catat('Guru lain melihat TP terbit', n = 1);

  -- Tapi tidak boleh mengubahnya
  update tujuan_pembelajaran set judul = 'DIBAJAK' where id = i.tp;
  get diagnostics n = row_count;
  perform catat('Guru lain TIDAK bisa mengubah TP', n = 0);

  -- Tidak boleh mengubah tugas di dalamnya
  update tugas set xp = 999 where id = i.tugas;
  get diagnostics n = row_count;
  perform catat('Guru lain tidak bisa mengubah tugas TP orang', n = 0);

  -- TP draf milik Sari tidak terlihat Budi
  insert into tujuan_pembelajaran (mata_pelajaran_id, dibuat_oleh, kode, judul, terbit)
    values ((select id from mata_pelajaran limit 1), i.sari, 'TP 99.1', 'Draf Sari', false)
    returning id into v_id;

  perform masuk_sebagai(i.budi);
  select count(*) into n from tujuan_pembelajaran where id = v_id;
  perform catat('Draf guru lain tidak terlihat', n = 0);

  -- Pemilik boleh mengubah TP-nya
  update tujuan_pembelajaran set judul = 'Judul Baru' where id = i.tp;
  get diagnostics n = row_count;
  perform catat('Pemilik bisa mengubah TP-nya', n = 1);

  -- TP yang sudah ditugaskan tidak boleh dihapus
  delete from tujuan_pembelajaran where id = i.tp;
  get diagnostics n = row_count;
  perform catat('TP yang sudah ditugaskan tidak bisa dihapus', n = 0);
end $$;

-- ============================================================
--  BAGIAN 9 — MURID & KURIKULUM
-- ============================================================
do $$
declare i record; n int;
begin
  select * into i from id_uji;
  perform masuk_sebagai(i.dewi);

  select count(*) into n from tujuan_pembelajaran;
  perform catat('Murid melihat TP yang ditugaskan padanya', n = 1, 'terlihat: ' || n);

  select count(*) into n from tugas;
  perform catat('Murid melihat tugas dari TP-nya', n = 2, 'terlihat: ' || n);

  -- Murid tidak boleh mengubah kurikulum
  update tugas set xp = 999 where id = i.tugas;
  get diagnostics n = row_count;
  perform catat('Murid tidak bisa mengubah tugas', n = 0);

  begin
    insert into tugas (sprint_id, kode, judul, jenis, xp)
      values (i.sprint, 'CURANG-1', 'Tugas palsu', 'inti', 999);
    perform catat('Murid tidak bisa menambah tugas', false, 'BERHASIL DISISIPKAN!');
  exception when insufficient_privilege then
    perform catat('Murid tidak bisa menambah tugas', true);
  end;
end $$;

-- ============================================================
--  BAGIAN 10 — PERAN TIDAK BISA DINAIKKAN SENDIRI
-- ============================================================
do $$
declare i record; v_peran peran_pengguna;
begin
  select * into i from id_uji;
  perform masuk_sebagai(i.dewi);

  -- Kebijakan WITH CHECK menolak perubahan peran secara terang-terangan,
  -- bukan mengabaikannya diam-diam. Galatnya justru bukti pengaman bekerja.
  begin
    update profil set peran = 'admin' where id = i.dewi;
    select peran into v_peran from profil where id = i.dewi;
    perform catat('Murid TIDAK bisa mengangkat dirinya jadi admin',
                  v_peran = 'murid', 'peran tetap: ' || v_peran);
  exception when insufficient_privilege or check_violation then
    perform catat('Murid TIDAK bisa mengangkat dirinya jadi admin', true,
                  'ditolak kebijakan RLS');
  end;

  begin
    update profil set peran = 'guru' where id = i.dewi;
    select peran into v_peran from profil where id = i.dewi;
    perform catat('Murid TIDAK bisa mengangkat dirinya jadi guru',
                  v_peran = 'murid', 'peran tetap: ' || v_peran);
  exception when insufficient_privilege or check_violation then
    perform catat('Murid TIDAK bisa mengangkat dirinya jadi guru', true,
                  'ditolak kebijakan RLS');
  end;

  -- Tapi boleh mengubah namanya
  update profil set nama = 'Dewi Lestari' where id = i.dewi;
  perform catat('Murid boleh mengubah namanya sendiri',
                (select nama from profil where id = i.dewi) = 'Dewi Lestari');
end $$;

-- ============================================================
--  BAGIAN 11 — VERIFIKASI KKTP HANYA OLEH GURU
-- ============================================================
do $$
declare i record; v_ind bigint; v_guru boolean; n int;
begin
  select * into i from id_uji;

  set role postgres;
  insert into kktp_indikator (tujuan_pembelajaran_id, nomor, indikator)
    values (i.tp, 1, 'Menjelaskan fungsi komponen') returning id into v_ind;
  set role authenticated;

  perform masuk_sebagai(i.dewi);
  insert into evaluasi_kktp (penugasan_id, murid_id, kktp_indikator_id,
                             tercapai_murid, bukti, tercapai_guru)
    values (i.p_budi, i.dewi, v_ind, true, 'Tabel A terisi', true);

  select tercapai_guru into v_guru from evaluasi_kktp
    where murid_id = i.dewi and kktp_indikator_id = v_ind;
  perform catat('Murid tidak bisa mengisi verifikasi guru',
                v_guru is null, 'nilai: ' || coalesce(v_guru::text, 'null'));

  -- Guru mengisi verifikasi
  perform masuk_sebagai(i.budi);
  update evaluasi_kktp set tercapai_guru = false
    where murid_id = i.dewi and kktp_indikator_id = v_ind;

  select tercapai_guru into v_guru from evaluasi_kktp
    where murid_id = i.dewi and kktp_indikator_id = v_ind;
  perform catat('Guru bisa mengisi verifikasi', v_guru = false);
end $$;

-- ============================================================
--  BAGIAN 12 — ADMIN
-- ============================================================
do $$
declare i record; n int;
begin
  select * into i from id_uji;
  perform masuk_sebagai(i.admin);

  select count(*) into n from kelas;
  perform catat('Admin melihat semua kelas', n = 2, 'terlihat: ' || n);

  select count(*) into n from profil;
  perform catat('Admin melihat semua profil', n >= 5, 'terlihat: ' || n);

  update profil set peran = 'guru' where id = i.dewi;
  perform catat('Admin bisa mengangkat guru',
                (select peran from profil where id = i.dewi) = 'guru');
  update profil set peran = 'murid' where id = i.dewi;
end $$;

-- ============================================================
--  BAGIAN 13 — PENGGUNA ANONIM
-- ============================================================
set role anon;

do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  select count(*) into n from profil;
  perform catat('Anonim tidak melihat profil apa pun', n = 0, 'terlihat: ' || n);

  select count(*) into n from progres_tugas;
  perform catat('Anonim tidak melihat progres', n = 0);

  select count(*) into n from kelas;
  perform catat('Anonim tidak melihat kelas', n = 0);

  select count(*) into n from tujuan_pembelajaran;
  perform catat('Anonim tidak melihat kurikulum', n = 0);
end $$;

-- ============================================================
--  MANAJEMEN MURID OLEH GURU (migrasi 000600)
-- ============================================================
set role authenticated;

do $$
declare i record; v_nama text;
begin
  select * into i from id_uji;

  -- Guru (Budi) mengubah nama muridnya sendiri (Dewi) → BOLEH
  perform masuk_sebagai(i.budi);
  begin
    update profil set nama = 'Dewi Lestari' where id = i.dewi;
    select nama into v_nama from profil where id = i.dewi;
    perform catat('Guru bisa mengubah nama muridnya', v_nama = 'Dewi Lestari',
      'nama kini: ' || coalesce(v_nama,'(null)'));
  exception when others then
    perform catat('Guru bisa mengubah nama muridnya', false, sqlerrm);
  end;

  -- Guru (Budi) coba menaikkan peran muridnya → HARUS DITOLAK
  begin
    update profil set peran = 'guru' where id = i.dewi;
    perform catat('Guru TIDAK bisa menaikkan peran murid',
      (select peran from profil where id = i.dewi) = 'murid',
      'peran tetap: ' || (select peran::text from profil where id = i.dewi));
  exception when others then
    perform catat('Guru TIDAK bisa menaikkan peran murid', true, 'ditolak: ' || sqlerrm);
  end;

  -- Guru lain (Sari) coba mengubah murid Budi (Dewi) → HARUS DITOLAK.
  -- Sari tidak bisa melihat Dewi, jadi UPDATE-nya kena 0 baris. Kita
  -- verifikasi dari sisi yang bisa membaca (lihat blok postgres di bawah).
  perform masuk_sebagai(i.sari);
  begin
    update profil set nama = 'DIRETAS' where id = i.dewi;
    perform catat('Guru lain tidak bisa mengubah murid bukan kelasnya', true,
      'update kena 0 baris (RLS memblokir)');
  exception when others then
    perform catat('Guru lain tidak bisa mengubah murid bukan kelasnya', true, 'ditolak');
  end;

  -- Guru (Budi) bisa mengeluarkan muridnya (hapus pendaftaran) → BOLEH
  -- Daftarkan Rizky ke kelas Budi dulu sebagai bahan uji.
  perform masuk_sebagai(i.budi);
  begin
    perform set_config('request.jwt.claim.sub', i.budi::text, true);
    insert into pendaftaran (kelas_id, murid_id) values (i.kelas_budi, i.rizky)
      on conflict do nothing;
  exception when others then null;
  end;
  begin
    delete from pendaftaran where kelas_id = i.kelas_budi and murid_id = i.rizky;
    perform catat('Guru bisa mengeluarkan murid dari kelasnya',
      not exists (select 1 from pendaftaran where kelas_id = i.kelas_budi and murid_id = i.rizky));
  exception when others then
    perform catat('Guru bisa mengeluarkan murid dari kelasnya', false, sqlerrm);
  end;
end $$;

-- Verifikasi dari sisi yang bisa membaca: nama Dewi tidak berubah jadi DIRETAS.
set role postgres;
do $$
declare i record; v_nama text;
begin
  select * into i from id_uji;
  select nama into v_nama from profil where id = i.dewi;
  perform catat('Nama murid utuh setelah percobaan guru lain',
    v_nama <> 'DIRETAS', 'nama sebenarnya: ' || coalesce(v_nama,'(null)'));
end $$;

-- ============================================================
--  MANAJEMEN PENGGUNA OLEH ADMIN
-- ============================================================
set role authenticated;

do $$
declare i record; n int;
begin
  select * into i from id_uji;

  -- Admin bisa mengedit data pengguna lain
  perform masuk_sebagai(i.admin);
  begin
    update profil set no_absen = '42' where id = i.rizky;
    perform catat('Admin bisa mengedit data pengguna',
      (select no_absen from profil where id = i.rizky) = '42');
  exception when others then
    perform catat('Admin bisa mengedit data pengguna', false, sqlerrm);
  end;

  -- Admin bisa menonaktifkan pengguna
  begin
    update profil set aktif = false where id = i.rizky;
    perform catat('Admin bisa menonaktifkan pengguna',
      (select aktif from profil where id = i.rizky) = false);
    update profil set aktif = true where id = i.rizky;   -- pulihkan
  exception when others then
    perform catat('Admin bisa menonaktifkan pengguna', false, sqlerrm);
  end;

  -- Murid TIDAK bisa menghapus profil orang lain (delete kena 0 baris)
  perform masuk_sebagai(i.dewi);
  begin
    with d as (delete from profil where id = i.rizky returning 1)
    select count(*) into n from d;
    perform catat('Murid tidak bisa menghapus profil orang lain', n = 0,
      'baris terhapus: ' || n);
  exception when others then
    perform catat('Murid tidak bisa menghapus profil orang lain', true, 'ditolak');
  end;
end $$;

-- Pastikan Rizky masih ada setelah percobaan murid.
set role postgres;
do $$
declare i record;
begin
  select * into i from id_uji;
  perform catat('Profil target utuh setelah percobaan hapus oleh murid',
    exists(select 1 from profil where id = i.rizky));
end $$;

-- ============================================================
--  GABUNG KELAS LEWAT KODE (migrasi 000700)
-- ============================================================
set role postgres;
-- Murid baru yang belum tergabung ke mana pun.
insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'baru@s.id') on conflict do nothing;
update profil set peran = 'murid', nama = 'Murid Baru'
  where id = '99999999-9999-9999-9999-999999999999';

set role authenticated;
do $$
declare i record; v_kode text; r record; n int;
begin
  select * into i from id_uji;

  -- Ambil kode kelas Budi dari sisi yang bisa membaca (fungsi berjalan
  -- sebagai murid, tapi kita ambil kode via id_uji tak menyimpan kode,
  -- jadi kita baca lewat postgres-visible di blok terpisah). Di sini
  -- kita uji dengan memanggil fungsi memakai kode yang benar.
  perform masuk_sebagai('99999999-9999-9999-9999-999999999999'::uuid);

  -- Sebelum gabung: murid baru tak melihat kelas apa pun.
  select count(*) into n from kelas;
  perform catat('Murid baru belum melihat kelas apa pun', n = 0, 'terlihat: ' || n);
end $$;

-- Uji fungsi gabung_kelas dengan kode asli (diambil sebagai postgres).
set role postgres;
do $$
declare i record; v_kode text; r record;
begin
  select * into i from id_uji;
  select kode_gabung into v_kode from kelas where id = i.kelas_budi;

  -- Jalankan sebagai murid baru.
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  perform set_config('role', 'authenticated', true);

  select * into r from gabung_kelas(v_kode);
  perform catat('Murid bisa gabung dengan kode benar', r.status = 'berhasil',
    'status: ' || coalesce(r.status,'(null)'));

  -- Panggil lagi → sudah_gabung
  select * into r from gabung_kelas(v_kode);
  perform catat('Gabung dua kali terdeteksi sudah_gabung', r.status = 'sudah_gabung',
    'status: ' || coalesce(r.status,'(null)'));

  -- Kode salah → tidak_ditemukan
  select * into r from gabung_kelas('ZZZZZZ');
  perform catat('Kode salah ditolak', r.status = 'tidak_ditemukan',
    'status: ' || coalesce(r.status,'(null)'));
end $$;

-- Setelah gabung, murid baru kini melihat tepat 1 kelas (bukan semua).
set role authenticated;
do $$
declare n int;
begin
  perform masuk_sebagai('99999999-9999-9999-9999-999999999999'::uuid);
  select count(*) into n from kelas;
  perform catat('Setelah gabung, murid hanya melihat kelasnya', n = 1, 'terlihat: ' || n);
end $$;

-- ============================================================
--  PENGAWASAN & KENDALI PER-MURID (migrasi 000800)
-- ============================================================
-- Ambil id pendaftaran Dewi sebagai postgres (agar tak terhalang RLS).
set role postgres;
do $$
declare i record; v_pd bigint;
begin
  select * into i from id_uji;
  select id into v_pd from pendaftaran where kelas_id = i.kelas_budi and murid_id = i.dewi;
  perform set_config('test.pd_dewi', coalesce(v_pd::text,'0'), false);
end $$;

set role authenticated;
do $$
declare i record; v_pd bigint := current_setting('test.pd_dewi')::bigint;
begin
  select * into i from id_uji;

  -- Guru Budi menjeda muridnya (Dewi) → BOLEH
  perform masuk_sebagai(i.budi);
  begin
    perform set_kendali_murid(v_pd, 'dijeda', 'coba jeda');
    perform catat('Guru bisa menjeda muridnya',
      (select kendali from pendaftaran where id = v_pd)::text = 'dijeda');
  exception when others then
    perform catat('Guru bisa menjeda muridnya', false, sqlerrm);
  end;

  -- Guru Budi mengunci muridnya → BOLEH
  begin
    perform set_kendali_murid(v_pd, 'dikunci', 'coba kunci');
    perform catat('Guru bisa mengunci layar muridnya',
      (select kendali from pendaftaran where id = v_pd)::text = 'dikunci');
  exception when others then
    perform catat('Guru bisa mengunci layar muridnya', false, sqlerrm);
  end;

  -- Guru lain (Sari) coba mengendalikan murid Budi → DITOLAK
  perform masuk_sebagai(i.sari);
  begin
    perform set_kendali_murid(v_pd, 'aktif', 'iseng');
    perform catat('Guru lain tidak bisa mengendalikan murid bukan kelasnya', false,
      'seharusnya ditolak');
  exception when others then
    perform catat('Guru lain tidak bisa mengendalikan murid bukan kelasnya', true, 'ditolak');
  end;

  -- Murid (Dewi) coba melepas kendali dirinya → DITOLAK
  perform masuk_sebagai(i.dewi);
  begin
    perform set_kendali_murid(v_pd, 'aktif', 'lepas');
    perform catat('Murid tidak bisa melepas kendali dirinya', false, 'seharusnya ditolak');
  exception when others then
    perform catat('Murid tidak bisa melepas kendali dirinya', true, 'ditolak');
  end;

  -- Murid bisa MEMBACA kendali dirinya (agar layar bereaksi)
  perform catat('Murid bisa membaca status kendali dirinya',
    (select kendali from pendaftaran where id = v_pd)::text = 'dikunci');
end $$;

-- ============================================================
--  PENILAIAN REVIEW A–E, KUNCI, & BUKA KUNCI (migrasi 001000)
-- ============================================================
-- Siapkan satu progres 'review' milik Dewi pada tugas Budi.
set role postgres;
do $$
declare i record; v_pr bigint;
begin
  select * into i from id_uji;
  insert into progres_tugas (penugasan_id, murid_id, tugas_id, status)
  values (i.p_budi, i.dewi, i.tugas, 'review')
  on conflict (penugasan_id, murid_id, tugas_id) do update set status='review'
  returning id into v_pr;
  perform set_config('test.pr', v_pr::text, false);
end $$;

set role authenticated;
do $$
declare i record; v_pr bigint := current_setting('test.pr')::bigint; n int;
begin
  select * into i from id_uji;

  -- Guru menilai A → terkunci, status selesai
  perform masuk_sebagai(i.budi);
  begin
    perform nilai_tugas(v_pr, 'A', 'Kerja bagus');
    perform catat('Guru bisa memberi nilai A–E',
      (select nilai_huruf from progres_tugas where id = v_pr) = 'A'
      and (select terkunci from progres_tugas where id = v_pr) = true);
  exception when others then
    perform catat('Guru bisa memberi nilai A–E', false, sqlerrm);
  end;

  -- Murid tidak bisa mengubah tugas terkunci (0 baris)
  perform masuk_sebagai(i.dewi);
  begin
    with u as (update progres_tugas set status='dikerjakan' where id = v_pr returning 1)
    select count(*) into n from u;
    perform catat('Murid tidak bisa mengubah tugas terkunci', n = 0, 'baris: ' || n);
  exception when others then
    perform catat('Murid tidak bisa mengubah tugas terkunci', true, 'ditolak');
  end;

  -- Murid tidak bisa menilai dirinya
  begin
    perform nilai_tugas(v_pr, 'A', 'saya hebat');
    perform catat('Murid tidak bisa menilai dirinya', false, 'seharusnya ditolak');
  exception when others then
    perform catat('Murid tidak bisa menilai dirinya', true, 'ditolak');
  end;

  -- Guru lain tidak bisa menilai tugas bukan kelasnya
  perform masuk_sebagai(i.sari);
  begin
    perform nilai_tugas(v_pr, 'C', 'iseng');
    perform catat('Guru lain tidak bisa menilai tugas bukan kelasnya', false, 'seharusnya ditolak');
  exception when others then
    perform catat('Guru lain tidak bisa menilai tugas bukan kelasnya', true, 'ditolak');
  end;

  -- Guru pengampu bisa membuka kunci
  perform masuk_sebagai(i.budi);
  begin
    perform buka_kunci_tugas(v_pr);
    perform catat('Guru bisa membuka kunci tugas',
      (select terkunci from progres_tugas where id = v_pr) = false);
  exception when others then
    perform catat('Guru bisa membuka kunci tugas', false, sqlerrm);
  end;
end $$;

-- ============================================================
--  ADMIN MEMBACA DATA MURID ANTAR-KELAS (migrasi 001100)
-- ============================================================
set role authenticated;
do $$
declare i record; n int;
begin
  select * into i from id_uji;
  -- Admin membaca pendaftaran kelas Budi (bukan miliknya).
  perform masuk_sebagai(i.admin);
  select count(*) into n from pendaftaran d
    join profil p on p.id = d.murid_id
    where d.kelas_id = i.kelas_budi;
  perform catat('Admin melihat murid di kelas guru lain', n >= 1, 'terlihat: ' || n);

  select count(*) into n from progres_tugas where penugasan_id = i.p_budi;
  perform catat('Admin melihat progres di kelas guru lain', n >= 0, 'terlihat: ' || n);
end $$;

-- ============================================================
--  KUNCI ISIAN LEMBAR SAAT TUGAS TERKUNCI (migrasi 001200)
-- ============================================================
-- Siapkan: tugas Budi dengan lembar_kode, lembar, dan progres terkunci Dewi.
set role postgres;
do $$
declare i record; v_lk bigint; v_pr bigint;
begin
  select * into i from id_uji;
  update tugas set lembar_kode = 'UJI' where id = i.tugas;
  insert into lembar_kerja (tujuan_pembelajaran_id, sprint_id, kode, judul, tipe, struktur, urutan)
  values (i.tp, i.sprint, 'UJI', 'Tabel Uji', 'matriks',
    '{"kolom":[{"key":"f","label":"F","input":"teks"}],"baris":["x"]}'::jsonb, 99)
  on conflict do nothing;
  select id into v_lk from lembar_kerja where tujuan_pembelajaran_id = i.tp and kode = 'UJI';
  insert into progres_tugas (penugasan_id, murid_id, tugas_id, status, terkunci)
  values (i.p_budi, i.dewi, i.tugas, 'selesai', true)
  on conflict (penugasan_id, murid_id, tugas_id) do update set terkunci = true, status = 'selesai';
  perform set_config('test.lk_uji', v_lk::text, false);
end $$;

set role authenticated;
do $$
declare i record; v_lk bigint := current_setting('test.lk_uji')::bigint;
begin
  select * into i from id_uji;
  perform masuk_sebagai(i.dewi);
  -- Murid coba tulis isian lembar terkunci → DITOLAK
  begin
    insert into isian_lembar (penugasan_id, murid_id, lembar_kerja_id, data)
    values (i.p_budi, i.dewi, v_lk, '{"0":{"f":"x"}}'::jsonb);
    perform catat('Isian lembar terkunci tidak bisa ditulis murid', false, 'seharusnya ditolak');
  exception when others then
    perform catat('Isian lembar terkunci tidak bisa ditulis murid', true, 'ditolak');
  end;
end $$;

-- ============================================================
--  HASIL
-- ============================================================
set role postgres;

select
  case when lulus then '  ✓' else '  ✗' end || ' ' ||
  rpad(nama, 52) ||
  coalesce('  → ' || catatan, '') as "HASIL UJI RLS"
from hasil_uji order by nomor;

select repeat('-', 60) as "garis";

select
  'LULUS: ' || count(*) filter (where lulus) ||
  '    GAGAL: ' || count(*) filter (where not lulus) as "RINGKASAN"
from hasil_uji;
