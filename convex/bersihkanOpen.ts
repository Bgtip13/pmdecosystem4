import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ===== BERSIHKAN TUGAS SPK ADMIN YANG "OPEN LAGI" PADAHAL SUDAH CLSD =====
// Dijalankan manual dari dashboard Convex: Functions → bersihkanOpen:jalankan → Run function.
//
// BAWAAN = HANYA MELIHAT (dryRun). Tidak ada data yang diubah sampai Anda mengirim {"dryRun": false}.
//
// Yang dibersihkan (status OPEN/pending, lalu ditandai CLSD tanpa isian, TIDAK dihapus):
//   A. Tugas yang pernah disetujui (punya reviewedAt) lalu dibuka kembali jadi OPEN.
//   B. Khusus orderan: tugas OPEN yang kembar dengan tugas lain (toko + tanggal kunjungan sama)
//      yang sudah dikerjakan / INPG / CLSD.
// Tugas yang dibersihkan tidak muncul di Riwayat (doneAt kosong) dan tidak muncul lagi di SPK Admin.
//
// Argumen (semua opsional):
//   dryRun   : false → benar-benar mengubah. Bawaan true.
//   tabel    : "order" | "piutang" | "semua"   (bawaan "semua")
//   sejakHari: hanya tugas bertanggal (day) dalam N hari terakhir (bawaan 60)
export const jalankan = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    tabel: v.optional(v.union(v.literal("order"), v.literal("piutang"), v.literal("semua"))),
    sejakHari: v.optional(v.number()),
  },
  handler: async (ctx, { dryRun, tabel, sejakHari }) => {
    const dry = dryRun !== false;
    const WIB = 7 * 3600 * 1000;
    const hariWib = (ms: number) => new Date(ms + WIB).toISOString().slice(0, 10);
    const sejak = hariWib(Date.now() - (sejakHari ?? 60) * 86400000);
    const now = Date.now();
    const pilih = tabel ?? "semua";

    const out: any = { dryRun: dry, sejak, order: null, piutang: null };

    const tandai = async (r: any, alasan: string) => {
      if (dry) return;
      await ctx.db.patch(r._id, {
        status: "done",
        workflowStatus: "CLSD",
        reviewNote: `Dibersihkan otomatis: ${alasan}`,
        updatedAt: now,
      });
    };

    // ---------- ORDERAN ----------
    if (pilih === "order" || pilih === "semua") {
      const pending: any[] = (await ctx.db.query("order_followups")
        .withIndex("by_status", (q) => q.eq("status", "pending")).take(5000))
        .filter((r: any) => (r.workflowStatus ?? "OPEN") === "OPEN" && r.day >= sejak);

      const sisaPerHari = new Map<string, any[]>();   // cache tugas semua status per tanggal tampil
      const dayRows = async (day: string) => {
        if (!sisaPerHari.has(day)) {
          sisaPerHari.set(day, await ctx.db.query("order_followups")
            .withIndex("by_day_status", (q) => q.eq("day", day)).collect());
        }
        return sisaPerHari.get(day)!;
      };

      const contoh: any[] = [];
      let dibukaUlang = 0, kembar = 0;
      for (const r of pending) {
        let alasan: string | null = null;
        if (r.reviewedAt) { alasan = "pernah disetujui lalu dibuka kembali"; dibukaUlang++; }
        else {
          const sama = (await dayRows(r.day)).some((x: any) =>
            String(x._id) !== String(r._id) &&
            x.area === r.area && x.nameKey === r.nameKey && x.visitDay === r.visitDay &&
            (x.status === "done" || x.workflowStatus === "INPG" || x.workflowStatus === "CLSD"));
          if (sama) { alasan = "kembar dengan tugas yang sudah dikerjakan"; kembar++; }
        }
        if (!alasan) continue;
        if (contoh.length < 20) contoh.push({ toko: r.storeName, area: r.area, tampil: r.day, kunjungan: r.visitDay, alasan });
        await tandai(r, alasan);
      }
      out.order = { diperiksaOpen: pending.length, dibukaUlang, kembar, total: dibukaUlang + kembar, contoh };
    }

    // ---------- PIUTANG ----------
    if (pilih === "piutang" || pilih === "semua") {
      const pending: any[] = (await ctx.db.query("piutang_tasks")
        .withIndex("by_status", (q) => q.eq("status", "pending")).take(5000))
        .filter((r: any) => (r.workflowStatus ?? "OPEN") === "OPEN" && r.day >= sejak && r.reviewedAt);
      const contoh = pending.slice(0, 20).map((r: any) => ({ toko: r.storeName, area: r.area, tampil: r.day, alasan: "pernah disetujui lalu dibuka kembali" }));
      for (const r of pending) await tandai(r, "pernah disetujui lalu dibuka kembali");
      out.piutang = { dibukaUlang: pending.length, total: pending.length, contoh };
    }

    return out;
  },
});
