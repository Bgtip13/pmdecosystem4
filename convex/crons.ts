import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 04:00 WIB (UTC+7) = 21:00 UTC — data piutang hari itu sudah tersedia sebelum sales mulai
crons.daily("sync piutang harian", { hourUTC: 21 }, internal.piutang.autoSync);

export default crons;
