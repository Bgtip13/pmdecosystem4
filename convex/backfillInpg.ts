import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ===== BACKFILL DATA LAMA =====
// Data yang disimpan SEBELUM patch INPG punya workflowStatus kosong.
//   status "done"    → INPG  (menunggu review, tinggal disetujui supervisor)
//   status "pending" → OPEN  (belum dikerjakan)
// Jalankan dulu dengan dryRun: true untuk lihat jumlahnya.
export const run = internalMutation({
  args: { since: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { since, dryRun }) => {
    const from = since ?? 0;
    const out = { piutangInpg: 0, piutangOpen: 0, orderInpg: 0, orderOpen: 0 };

    // --- piutang ---
    const piuDone = await ctx.db.query("piutang_tasks")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .collect();
    for (const r of piuDone as any[]) {
      if (r.workflowStatus) continue;
      if ((r.doneAt ?? r.createdAt ?? 0) < from) continue;
      out.piutangInpg++;
      if (!dryRun) await ctx.db.patch(r._id, { workflowStatus: "INPG" });
    }

    const piuOpen = await ctx.db.query("piutang_tasks")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const r of piuOpen as any[]) {
      if (r.workflowStatus) continue;
      if ((r.createdAt ?? 0) < from) continue;
      out.piutangOpen++;
      if (!dryRun) await ctx.db.patch(r._id, { workflowStatus: "OPEN" });
    }

    // --- follow-up orderan ---
    const ordDone = await ctx.db.query("order_followups")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .collect();
    for (const r of ordDone as any[]) {
      if (r.workflowStatus) continue;
      if ((r.doneAt ?? r.createdAt ?? 0) < from) continue;
      out.orderInpg++;
      if (!dryRun) await ctx.db.patch(r._id, { workflowStatus: "INPG" });
    }

    const ordOpen = await ctx.db.query("order_followups")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const r of ordOpen as any[]) {
      if (r.workflowStatus) continue;
      if ((r.createdAt ?? 0) < from) continue;
      out.orderOpen++;
      if (!dryRun) await ctx.db.patch(r._id, { workflowStatus: "OPEN" });
    }

    return { dryRun: !!dryRun, since: from, ...out };
  },
});
