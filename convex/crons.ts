import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ============================================================================
// Zona waktu WIB = UTC+7 → jam WIB dikurangi 7 untuk hourUTC.
// ============================================================================

// ===== SINKRON DATA (bukan notifikasi — tetap jalan tiap hari) =====
// Sinkron piutang 04:00 DIHAPUS sesuai permintaan sebelumnya.
// crons.daily("sync piutang harian", { hourUTC: 21 }, internal.piutang.autoSync);
// Sinkron piutang 08.00 WIB DINONAKTIFKAN: piutang.autoSync tidak pernah ada dan
// piutangSync.ts hanya berisi mutation (belum ada action pengambil sheet).
// Deploy akan gagal bila cron menunjuk fungsi yang tidak ada.
// crons.daily("sync piutang 08.00 WIB", { hourUTC: 1, minuteUTC: 0 }, internal.piutang.autoSync);
crons.daily("sync jadwal 08.05 WIB", { hourUTC: 1, minuteUTC: 5 }, internal.jadwalSync.autoSync);

// ============================================================================
// NOTIFIKASI SISTEM — hanya 5 aturan.
// Semua pengingat lama SUDAH DIHENTIKAN: janji bayar 08.00, FU Toko bulanan
// (15/20/25/akhir bulan), FU Toko menunggu review 16.00, pengingat pengecualian
// SPK 17.00, kunjungan kurang 17.00, dan rekap harian 20.00.
// Aturan "Minggu libur" dijaga di dalam masing-masing action (isSundayWIB).
// ============================================================================

// (3) 12.00 WIB (05.00 UTC) — supervisor & owner: cek riwayat kunjungan & follow-up
crons.daily("notif riwayat 12.00", { hourUTC: 5, minuteUTC: 0 }, internal.reminders.checkRiwayat);

// (2) 15.00 WIB (08.00 UTC) — telemarketing: SPK Admin yang masih OPEN
crons.daily("notif spk admin 15.00", { hourUTC: 8, minuteUTC: 0 }, internal.reminders.checkSpkAdmin);

// (3) 15.00 WIB (08.00 UTC) — supervisor & owner: cek riwayat kunjungan & follow-up
crons.daily("notif riwayat 15.00", { hourUTC: 8, minuteUTC: 1 }, internal.reminders.checkRiwayat);

// (5) 15.00 WIB (08.00 UTC) — sales lapangan: kunjungan masih < 7 toko
crons.daily("notif kunjungan field 15.00", { hourUTC: 8, minuteUTC: 2 }, internal.reminders.checkFieldVisits);

// (3) 17.00 WIB (10.00 UTC) — supervisor & owner: cek riwayat kunjungan & follow-up
crons.daily("notif riwayat 17.00", { hourUTC: 10, minuteUTC: 0 }, internal.reminders.checkRiwayat);

// Notifikasi (1) "piutang selesai disinkron SPV" TIDAK dijadwalkan di sini —
// dikirim langsung dari finishRun sinkron piutang. Lihat convex/piutangSync.ts.

export default crons;
