import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Catatan: sinkron piutang 04:00 DIHAPUS sesuai permintaan —
// piutang hanya ditarik saat tombol "Sinkron" ditekan.
// crons.daily("sync piutang harian", { hourUTC: 21 }, internal.piutang.autoSync);


// 08.00 WIB = 01.00 UTC — jadwal ditarik lebih dulu, baru piutang
crons.daily("sync piutang 08.00 WIB", { hourUTC: 1, minuteUTC: 0 }, internal.piutang.autoSync);
crons.daily("sync jadwal 08.05 WIB", { hourUTC: 1, minuteUTC: 5 }, internal.jadwalSync.autoSync);

// 08:00 WIB (01:00 UTC) — janji bayar jatuh tempo
crons.daily("janji bayar 08.00", { hourUTC: 1, minuteUTC: 0 }, internal.reminders.checkPromiseDue);

// 09:00 WIB (02:00 UTC) — FU Toko: pengingat tgl 15/20/25 & akhir bulan
crons.daily("FU toko bulanan", { hourUTC: 2, minuteUTC: 0 }, internal.activeStoreReminders.sendMonthly);

// 16:00 WIB (09:00 UTC) — FU Toko menunggu review supervisor
crons.daily("FU toko menunggu review", { hourUTC: 9, minuteUTC: 0 }, internal.activeStoreReminders.checkPendingReview);


// 15:00 WIB (08:00 UTC) — SPK Admin belum beres (per orang + ringkasan supervisor)
crons.daily("spk admin 15.00", { hourUTC: 8, minuteUTC: 0 }, internal.reminders.checkSpkAdmin);

// 17:00 WIB (10:00 UTC) — pengingat pengecualian SPK (ke supervisor)
crons.daily("pengingat pengecualian SPK", { hourUTC: 10 }, internal.spkReminders.sendDaily);

// 17:00 WIB (10:00 UTC) — kunjungan kurang, LANGSUNG ke salesnya
crons.daily("kunjungan kurang 17.00", { hourUTC: 10, minuteUTC: 5 }, internal.reminders.checkFieldVisits);

// 20:00 WIB (13:00 UTC) — rekap harian
crons.daily("rekap harian 20.00", { hourUTC: 13, minuteUTC: 0 }, internal.reminders.dailyRecap);

export default crons;
