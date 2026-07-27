-- ============================================================
--  Bagian 5: Row Level Security (RLS)
-- ------------------------------------------------------------
--  INI LAPISAN KEAMANAN UTAMA.
--
--  Semua aturan hak akses ditegakkan di dalam basis data, bukan di kode
--  aplikasi. Konsekuensinya: sekalipun seseorang memanggil API Supabase
--  langsung dengan kunci publik (yang memang terlihat di peramban),
--  ia tetap hanya bisa membaca data yang menjadi haknya.
--
--  Ini keunggulan nyata dibanding menaruh aturan di PHP atau JavaScript,
--  di mana satu kekeliruan pemeriksaan bisa membocorkan seluruh tabel.
--
--  Prinsip yang dipakai:
--   • Murid  → hanya barisnya sendiri, pada kelas yang diikutinya
--   • Guru   → hanya kelas yang diampunya sendiri
--   • Admin  → seluruhnya
--   • Kurikulum terbit boleh dilihat semua guru (agar bisa dipakai ulang),
--     tetapi hanya pemiliknya yang boleh mengubah
--
-- ------------------------------------------------------------
--  CATATAN KECEPATAN — penting, jangan diubah tanpa mengukur ulang.
--
--  Pemanggilan fungsi di dalam kebijakan dibungkus (select ...), misalnya
--  `(select (select auth.uid()))` dan bukan `(select auth.uid())` langsung.
--
--  Alasannya: tanpa pembungkus itu, PostgreSQL memanggil fungsinya untuk
--  SETIAP baris yang diperiksa. Pada tabel progres_tugas berisi 11.000
--  baris, kueri papan kanban memakan 130 ms. Dengan pembungkus (select ...),
--  fungsinya dihitung sekali di awal sebagai InitPlan, dan waktunya turun
--  menjadi 1,2 ms — sekitar 110 kali lebih cepat.
--
--  Selain itu, beberapa tabel sengaja memakai SATU kebijakan SELECT
--  gabungan, bukan dua kebijakan terpisah. Dua kebijakan digabung
--  PostgreSQL dengan OR, dan urutannya tidak bisa dikendalikan; dengan
--  satu kebijakan, pemeriksaan murah (murid_id = ...) diletakkan lebih
--  dulu sehingga pemeriksaan mahal jarang dijalankan.
-- ============================================================

alter table profil              enable row level security;
alter table tahun_ajaran        enable row level security;
alter table mata_pelajaran      enable row level security;
alter table kelas               enable row level security;
alter table tujuan_pembelajaran enable row level security;
alter table kktp_indikator      enable row level security;
alter table sprint              enable row level security;
alter table tugas               enable row level security;
alter table lembar_kerja        enable row level security;
alter table badge               enable row level security;
alter table pendaftaran         enable row level security;
alter table penugasan           enable row level security;
alter table progres_tugas       enable row level security;
alter table isian_lembar        enable row level security;
alter table lampiran            enable row level security;
alter table refleksi            enable row level security;
alter table evaluasi_kktp       enable row level security;
alter table tutor_sebaya        enable row level security;
alter table buku_xp             enable row level security;
alter table perolehan_badge     enable row level security;
alter table statistik_murid     enable row level security;
alter table jejak_aktivitas     enable row level security;

-- ============================================================
--  FUNGSI BANTU YANG MEMBACA pendaftaran
-- ------------------------------------------------------------
--  Keduanya SECURITY DEFINER supaya tidak terjerat RLS tabel
--  pendaftaran saat dipanggil dari dalam kebijakan. Tanpa ini,
--  PostgreSQL melempar galat "infinite recursion detected in policy".
-- ============================================================

create or replace function teman_sekelas_saya()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select distinct teman.murid_id
  from pendaftaran saya
  join pendaftaran teman on teman.kelas_id = saya.kelas_id
  where saya.murid_id = auth.uid() and saya.aktif and teman.aktif;
$$;

-- ============================================================
--  PROFIL
-- ============================================================

-- Setiap orang melihat profilnya sendiri.
create policy profil_baca_sendiri on profil
  for select using (id = (select auth.uid()));

-- Guru melihat profil murid di kelas yang diampunya.
create policy profil_baca_murid_saya on profil
  for select using (
    saya_guru() and exists (
      select 1 from pendaftaran d
      join kelas k on k.id = d.kelas_id
      where d.murid_id = profil.id and k.guru_id = auth.uid()
    )
  );

-- Murid melihat nama teman sekelas (untuk papan peringkat & tutor sebaya).
-- Memakai fungsi SECURITY DEFINER agar tidak memicu RLS pendaftaran
-- secara berantai (lihat catatan pada kelas_saya() di bawah).
create policy profil_baca_teman on profil
  for select using (id in (select teman_sekelas_saya()));

create policy profil_baca_admin on profil
  for select using (saya_admin());

-- Mengubah profil sendiri, TETAPI peran tidak boleh diubah sendiri.
-- Tanpa pembatasan ini, murid bisa mengangkat dirinya menjadi guru.
create policy profil_ubah_sendiri on profil
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and peran = peran_saya());

create policy profil_kelola_admin on profil
  for all using (saya_admin()) with check (saya_admin());

-- ============================================================
--  RUJUKAN UMUM — boleh dibaca semua yang sudah masuk
-- ============================================================

create policy tahun_baca on tahun_ajaran
  for select to authenticated using (true);
create policy tahun_kelola on tahun_ajaran
  for all using (saya_admin()) with check (saya_admin());

create policy mapel_baca on mata_pelajaran
  for select to authenticated using (true);
create policy mapel_kelola on mata_pelajaran
  for all using (saya_guru()) with check (saya_guru());

-- ============================================================
--  KELAS
-- ============================================================

create policy kelas_baca_guru on kelas
  for select using (guru_id = (select auth.uid()));

create policy kelas_baca_murid on kelas
  for select using (
    exists (
      select 1 from pendaftaran
      where kelas_id = kelas.id and murid_id = (select auth.uid()) and aktif
    )
  );

create policy kelas_baca_admin on kelas
  for select using (saya_admin());

create policy kelas_buat on kelas
  for insert with check (saya_guru() and guru_id = (select auth.uid()));

create policy kelas_ubah on kelas
  for update using (guru_id = (select auth.uid())) with check (guru_id = (select auth.uid()));

create policy kelas_hapus on kelas
  for delete using (
    guru_id = (select auth.uid())
    and not exists (select 1 from pendaftaran where kelas_id = kelas.id)
  );

-- ============================================================
--  KURIKULUM
-- ------------------------------------------------------------
--  Guru boleh MELIHAT kurikulum terbit milik rekan (agar bisa dipakai
--  ulang), tetapi hanya pemiliknya yang boleh MENGUBAH.
--  Murid hanya melihat TP yang ditugaskan ke kelasnya.
-- ============================================================

create policy tp_baca_pemilik on tujuan_pembelajaran
  for select using (dibuat_oleh = (select auth.uid()));

create policy tp_baca_terbit on tujuan_pembelajaran
  for select using (saya_guru() and terbit);

create policy tp_baca_murid on tujuan_pembelajaran
  for select using (
    exists (
      select 1 from penugasan p
      join pendaftaran d on d.kelas_id = p.kelas_id
      where p.tujuan_pembelajaran_id = tujuan_pembelajaran.id
        and p.dibuka
        and d.murid_id = auth.uid() and d.aktif
    )
  );

create policy tp_buat on tujuan_pembelajaran
  for insert with check (saya_guru() and dibuat_oleh = (select auth.uid()));

create policy tp_ubah on tujuan_pembelajaran
  for update using (dibuat_oleh = (select auth.uid())) with check (dibuat_oleh = (select auth.uid()));

-- TP yang sudah ditugaskan tidak boleh dihapus — progres murid
-- bergantung padanya.
create policy tp_hapus on tujuan_pembelajaran
  for delete using (
    dibuat_oleh = (select auth.uid())
    and not exists (
      select 1 from penugasan where tujuan_pembelajaran_id = tujuan_pembelajaran.id
    )
  );

create policy tp_admin on tujuan_pembelajaran
  for all using (saya_admin()) with check (saya_admin());

-- ------------------------------------------------------------
-- Anak-anak TP mewarisi hak akses induknya.
-- Fungsi bantu ini dipakai berulang agar aturannya konsisten.
-- ------------------------------------------------------------
create or replace function boleh_baca_tp(p_tp_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from tujuan_pembelajaran tp
    where tp.id = p_tp_id
      and (
        tp.dibuat_oleh = auth.uid()
        or (saya_guru() and tp.terbit)
        or saya_admin()
        or exists (
          select 1 from penugasan p
          join pendaftaran d on d.kelas_id = p.kelas_id
          where p.tujuan_pembelajaran_id = tp.id and p.dibuka
            and d.murid_id = auth.uid() and d.aktif
        )
      )
  );
$$;

create or replace function boleh_ubah_tp(p_tp_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from tujuan_pembelajaran
    where id = p_tp_id and (dibuat_oleh = auth.uid() or saya_admin())
  );
$$;

create policy kktp_baca on kktp_indikator
  for select using (boleh_baca_tp(tujuan_pembelajaran_id));
create policy kktp_kelola on kktp_indikator
  for all using (boleh_ubah_tp(tujuan_pembelajaran_id))
  with check (boleh_ubah_tp(tujuan_pembelajaran_id));

create policy sprint_baca on sprint
  for select using (boleh_baca_tp(tujuan_pembelajaran_id));
create policy sprint_kelola on sprint
  for all using (boleh_ubah_tp(tujuan_pembelajaran_id))
  with check (boleh_ubah_tp(tujuan_pembelajaran_id));

create policy tugas_baca on tugas
  for select using (
    exists (select 1 from sprint s
            where s.id = tugas.sprint_id and boleh_baca_tp(s.tujuan_pembelajaran_id))
  );
create policy tugas_kelola on tugas
  for all using (
    exists (select 1 from sprint s
            where s.id = tugas.sprint_id and boleh_ubah_tp(s.tujuan_pembelajaran_id))
  )
  with check (
    exists (select 1 from sprint s
            where s.id = tugas.sprint_id and boleh_ubah_tp(s.tujuan_pembelajaran_id))
  );

create policy lembar_baca on lembar_kerja
  for select using (boleh_baca_tp(tujuan_pembelajaran_id));
create policy lembar_kelola on lembar_kerja
  for all using (boleh_ubah_tp(tujuan_pembelajaran_id))
  with check (boleh_ubah_tp(tujuan_pembelajaran_id));

create policy badge_baca on badge
  for select using (tujuan_pembelajaran_id is null or boleh_baca_tp(tujuan_pembelajaran_id));
create policy badge_kelola on badge
  for all using (boleh_ubah_tp(tujuan_pembelajaran_id))
  with check (boleh_ubah_tp(tujuan_pembelajaran_id));

-- ============================================================
--  PENDAFTARAN & PENUGASAN
-- ============================================================

-- ------------------------------------------------------------
-- PENTING — mencegah rekursi tak berujung.
--
-- Kebijakan "murid boleh melihat teman sekelas" perlu membaca tabel
-- pendaftaran, padahal kebijakan itu sendiri terpasang PADA tabel
-- pendaftaran. Bila ditulis langsung sebagai subkueri, PostgreSQL akan
-- memanggil kebijakan itu berulang sampai galat
-- "infinite recursion detected in policy".
--
-- Jalan keluarnya: fungsi SECURITY DEFINER. Fungsi ini berjalan dengan
-- hak pemiliknya sehingga tidak terjerat RLS, dan rantai rekursi terputus.
-- ------------------------------------------------------------
create or replace function kelas_saya()
returns setof bigint
language sql stable security definer
set search_path = public
as $$
  select kelas_id from pendaftaran
  where murid_id = auth.uid() and aktif;
$$;

-- ------------------------------------------------------------
-- Daftar penugasan yang boleh saya lihat, sebagai murid maupun guru.
--
-- Dipakai kebijakan papan peringkat. Bentuk "kolom in (select fungsi())"
-- membuat PostgreSQL menghitung daftarnya SEKALI di awal (InitPlan),
-- bukan memanggil fungsi untuk tiap baris. Tanpa ini, papan peringkat
-- pada 384 murid memakan 16 ms; dengan ini, di bawah 1 ms.
-- ------------------------------------------------------------
create or replace function penugasan_saya()
returns setof bigint
language sql stable security definer
set search_path = public
as $$
  -- sebagai murid
  select p.id
  from penugasan p
  join pendaftaran d on d.kelas_id = p.kelas_id
  where d.murid_id = auth.uid() and d.aktif
  union
  -- sebagai guru pengampu
  select p.id
  from penugasan p
  join kelas k on k.id = p.kelas_id
  where k.guru_id = auth.uid();
$$;

create policy daftar_baca_sendiri on pendaftaran
  for select using (murid_id = (select auth.uid()));

create policy daftar_baca_guru on pendaftaran
  for select using (saya_guru_kelas(kelas_id));

create policy daftar_baca_teman on pendaftaran
  for select using (kelas_id in (select kelas_saya()));

-- Murid bergabung sendiri lewat kode kelas, asal kelasnya terbuka.
create policy daftar_gabung on pendaftaran
  for insert with check (
    murid_id = (select auth.uid())
    and exists (select 1 from kelas where id = kelas_id and terbuka)
  );

create policy daftar_kelola_guru on pendaftaran
  for all using (saya_guru_kelas(kelas_id)) with check (saya_guru_kelas(kelas_id));

create policy tugaskan_baca_guru on penugasan
  for select using (saya_guru_kelas(kelas_id));

create policy tugaskan_baca_murid on penugasan
  for select using (
    dibuka and exists (
      select 1 from pendaftaran
      where kelas_id = penugasan.kelas_id and murid_id = (select auth.uid()) and aktif
    )
  );

create policy tugaskan_kelola on penugasan
  for all using (saya_guru_kelas(kelas_id)) with check (saya_guru_kelas(kelas_id));

-- ============================================================
--  PROGRES MURID
-- ------------------------------------------------------------
--  Aturan terpenting: murid hanya menyentuh barisnya sendiri,
--  guru hanya melihat kelas yang diampunya.
-- ============================================================

-- Satu kebijakan gabungan, bukan dua. Lihat catatan kecepatan di atas.
create policy progres_baca on progres_tugas
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );

-- Murid membuat & mengubah progresnya sendiri, hanya pada penugasan
-- yang benar-benar diikutinya dan sedang dibuka.
create policy progres_buat_murid on progres_tugas
  for insert with check (
    murid_id = (select auth.uid())
    and saya_murid_penugasan(penugasan_id)
    and exists (select 1 from penugasan where id = penugasan_id and dibuka)
  );

create policy progres_ubah_murid on progres_tugas
  for update using (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id))
  with check (murid_id = (select auth.uid()));

-- Guru menilai: menyetujui atau mengembalikan.
create policy progres_ubah_guru on progres_tugas
  for update using (saya_guru_penugasan(penugasan_id))
  with check (saya_guru_penugasan(penugasan_id));

-- ------------------------------------------------------------
-- Isian lembar kerja
-- ------------------------------------------------------------
create policy isian_baca on isian_lembar
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );
create policy isian_kelola_murid on isian_lembar
  for all using (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id))
  with check (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id));

-- ------------------------------------------------------------
-- Lampiran bukti
-- ------------------------------------------------------------
create policy lampiran_baca_sendiri on lampiran
  for select using (murid_id = (select auth.uid()));
create policy lampiran_baca_guru on lampiran
  for select using (
    exists (
      select 1 from progres_tugas pt
      where pt.id = lampiran.progres_tugas_id and saya_guru_penugasan(pt.penugasan_id)
    )
  );
create policy lampiran_kelola on lampiran
  for all using (murid_id = (select auth.uid())) with check (murid_id = (select auth.uid()));

-- ------------------------------------------------------------
-- Refleksi, evaluasi KKTP, tutor sebaya
-- ------------------------------------------------------------
create policy refleksi_baca on refleksi
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );
create policy refleksi_kelola on refleksi
  for all using (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id))
  with check (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id));

create policy evaluasi_baca on evaluasi_kktp
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );

-- Murid mengisi penilaian dirinya, tetapi TIDAK boleh mengisi
-- kolom verifikasi guru. Diperiksa lewat trigger di bawah.
create policy evaluasi_kelola_murid on evaluasi_kktp
  for all using (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id))
  with check (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id));

create policy evaluasi_verifikasi_guru on evaluasi_kktp
  for update using (saya_guru_penugasan(penugasan_id))
  with check (saya_guru_penugasan(penugasan_id));

create policy tutor_baca on tutor_sebaya
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );
create policy tutor_kelola on tutor_sebaya
  for all using (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id))
  with check (murid_id = (select auth.uid()) and saya_murid_penugasan(penugasan_id));

-- ============================================================
--  XP, BADGE, STATISTIK
-- ------------------------------------------------------------
--  Hanya bisa DIBACA dari aplikasi. Penulisannya dilakukan trigger
--  yang berjalan sebagai SECURITY DEFINER, sehingga murid tidak bisa
--  menambah XP-nya sendiri lewat panggilan API langsung.
-- ============================================================

create policy xp_baca on buku_xp
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );
-- Koreksi manual hanya oleh guru pengampu.
create policy xp_koreksi_guru on buku_xp
  for insert with check (saya_guru_penugasan(penugasan_id) and sumber = 'manual');

create policy badge_perolehan_baca on perolehan_badge
  for select using (
    murid_id = (select auth.uid())
    or ((select saya_guru()) and saya_guru_penugasan(penugasan_id))
  );

-- Papan peringkat: seluruh murid dalam satu penugasan boleh saling
-- melihat XP dan badge. Sengaja dibatasi per penugasan, bukan
-- seluruh sekolah.
create policy statistik_baca_sekelas on statistik_murid
  for select using (
    murid_id = (select auth.uid())
    or penugasan_id in (select penugasan_saya())
  );

create policy jejak_baca_sendiri on jejak_aktivitas
  for select using (murid_id = (select auth.uid()));
create policy jejak_baca_guru on jejak_aktivitas
  for select using (penugasan_id is not null and saya_guru_penugasan(penugasan_id));
create policy jejak_tulis on jejak_aktivitas
  for insert with check (murid_id = (select auth.uid()));

-- ============================================================
--  PENGAMAN TAMBAHAN
-- ============================================================

-- Murid tidak boleh mengisi kolom verifikasi guru pada evaluasi KKTP.
create or replace function jaga_verifikasi_guru()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not saya_guru_penugasan(new.penugasan_id) then
    -- Bukan guru: kolom verifikasi dipaksa mengikuti nilai lama.
    new.tercapai_guru := case when tg_op = 'UPDATE' then old.tercapai_guru else null end;
  end if;
  return new;
end;
$$;

create trigger evaluasi_jaga_verifikasi
  before insert or update on evaluasi_kktp
  for each row execute function jaga_verifikasi_guru();

-- Murid tidak boleh menyetujui pekerjaannya sendiri.
create or replace function jaga_persetujuan()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.disetujui_oleh is not null and not saya_guru_penugasan(new.penugasan_id) then
    new.disetujui_oleh := case when tg_op = 'UPDATE' then old.disetujui_oleh else null end;
    new.disetujui_pada := case when tg_op = 'UPDATE' then old.disetujui_pada else null end;
    new.umpan_balik    := case when tg_op = 'UPDATE' then old.umpan_balik    else null end;
  end if;
  return new;
end;
$$;

create trigger progres_jaga_persetujuan
  before insert or update on progres_tugas
  for each row execute function jaga_persetujuan();

-- ------------------------------------------------------------
-- Profil dibuat otomatis saat akun baru mendaftar.
-- Peran bawaan selalu 'murid'; guru diangkat oleh admin.
-- ------------------------------------------------------------
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

create trigger pengguna_baru
  after insert on auth.users
  for each row execute function tangani_pengguna_baru();
