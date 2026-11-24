# Catatan Perubahan — PMD Ecosystem 4.0 (gabungan rombak web + perbaikan)

## A. Rombak tampilan WEB (APK tidak berubah)
- Desain baru: token, kit UI, grafik SVG, shell (rail ikon + header + lonceng) — `src/components/desktop/*`
- Layar baru/dirombak: Login, Beranda (semua peran), Notifikasi, Log Aktivitas (`/audit`),
  Menu Supervisor, Kelola Akun, Akun, Laporan.
- Layar lama (SPK, Jadwal, Riwayat, Penilaian, Persetujuan, FU Toko, detail) ikut palet/kartu/font baru.

## B. Notifikasi & log aktivitas supervisor
- Backend: `convex/activity.ts` (feed, unreadCount, markSeen, stats, record), tabel `activity_seen`,
  `notifications.markAllRead`, dan `logAudit` di mutation: toko, kunjungan, jadwal, akun, notifikasi,
  SPK order, piutang, laporan ekspedisi.
- Web mencatat login/logout dan setiap unduhan CSV.

## C. Perbaikan bug (dari pmdecosystem4-perbaikan.zip)
- Penanda "sudah order" kini juga memakai data Produk (`convex/lib/fuTokoAct.ts`) + tampilan di FU Toko.
- Setujui banyak kunjungan sekaligus (`visits.supervisorCloseMany`, bulk di Riwayat Kunjungan).
- Filter hasil di Riwayat Follow-up (janji bayar, lunas, cicil, no respon, order, tidak order).
- Shortcut Cek Ekspedisi & Portal Aplikasi PMD di Beranda (HP & web).
- KOREKSI saat penggabungan: teks `({data.produkQty ?? 0} pcs)` di toko-aktif/[id].tsx dan [id].web.tsx
  berada di dalam template literal tanpa `$` sehingga tampil mentah — sudah diperbaiki.

## D. Kartu piutang semua area (dibangun ulang dari backend yang ada)
File aslinya (`PiutangCard`, `usePiutang`, rute `/piutang-semua`) tidak pernah ada di zip mana pun, jadi dibuat baru:
- Backend: `convex/piutangAll.ts` + tabel `piutang_all` dan `piutang_all_meta` (skema). Snapshot diganti utuh tiap sinkron.
- Beranda HP & web: kartu total piutang, per area, dan umur piutang (0–30 / 31–60 / 61–90 / >90 hari).
- Halaman `/piutang-semua` (HP: `piutang-semua.tsx`, web: `piutang-semua.web.tsx` dengan filter area, cari, unduh CSV).
- Akses lihat: supervisor + owner/HR/akunting. Sinkron: supervisor saja.
- SUMBER DATA: bawaan memakai sheet PIUTANG yang sama dengan sinkron harian (sudah memuat 3 area).
  Untuk memakai tab ALL_PIUTANG, isi variabel lingkungan Convex `PIUTANG_ALL_URL` dengan URL
  yang mengirim JSON `{header, rows}` atau CSV dengan kolom: area, pelanggan, tanggal, total, piutang, cicil, retur, usia.

## E. Login/logout APK kini tercatat di log aktivitas
`src/lib/sessionLog.ts`, `app/index.tsx` (login, sekali per sesi aplikasi), `app/akun.tsx` (logout).

## F. Perbaikan kecil
- `laporan-ekspedisi.tsx`: warna `C.status.danger.fgSoft` tidak ada (chip transparan) → `C.chip.danger.bg`.

## G. Masih layar mobile dalam bingkai sempit di web
Kelola Toko, Izin, FU Toko (daftar), Laporan PCP / PCP Mingguan / DAP / Produk, Chat.

## Setelah ekstrak
1. `npm install` 2. `npx convex dev` (menerapkan skema + fungsi baru) 3. `npx expo start --web`
