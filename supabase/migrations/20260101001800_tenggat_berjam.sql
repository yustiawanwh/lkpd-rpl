-- ============================================================
-- Migrasi: tenggat dengan jam spesifik + parameter penalti per hari
-- ============================================================
-- LATAR:
--   Ketepatan waktu kini berbasis tenggat spesifik (tanggal + jam). Kolom
--   tenggat sebelumnya bertipe date (tanpa jam). Diubah ke timestamptz agar
--   guru bisa menetapkan batas jam, mis. "2026-08-05 15:00".
--
--   Nilai date lama otomatis diperlakukan sebagai pukul 23:59 pada hari itu
--   (akhir hari), agar perilaku lama tetap masuk akal.
--
-- Aman dijalankan berulang.
-- ============================================================

do $$
declare
  v_tipe text;
begin
  select data_type into v_tipe
  from information_schema.columns
  where table_name = 'penugasan' and column_name = 'tenggat';

  if v_tipe = 'date' then
    -- Ubah date → timestamptz, dengan default akhir hari (23:59) zona server.
    alter table penugasan
      alter column tenggat type timestamptz
      using (case when tenggat is null then null
                  else (tenggat::timestamp + interval '23 hours 59 minutes')
                       at time zone current_setting('TimeZone') end);
  end if;
end $$;

comment on column penugasan.tenggat is
  'Batas akhir pengumpulan (tanggal + jam). Kosong = tanpa tenggat (dianggap tepat waktu).';
