import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ===== FASE 1: BACKFILL STATUS PEKERJAAN =====
// Sekali jalan setelah schema ter-deploy.
// Aturan: SEMUA record lama dianggap CLSD → antrean review mulai dari nol.
//
// Penting: record lama yang masih "pending" (belum dikerjakan) juga diubah
// statusnya jadi "done" supaya TIDAK nyangkut di daftar SPK hari ini.
// Karena doneAt-nya kosong, record itu tidak muncul di Riwayat / ekspor.
//
// Kunjungan yang masih "ongoing" dibiarkan → nanti jadi INPG saat checkout.

const TABLE_V = v.union(
  v.literal("piutang_tasks"),
  v.literal("order_followups"),
  v.literal("visits")
);

export const batch = internalMutation({
  args: { table: TABLE_V, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { table, cursor }): Promise<{
    table: string; patched: number; archived: number; skipped: number;
    isDone: boolean; cursor: string;
  }> => {
    const opts = { cursor: cursor as any, numItems: 200 };
    const res: any =
      table === "piutang_tasks"
        ? await ctx.db.query("piutang_tasks").paginate(opts)
        : table === "order_followups"
        ? await ctx.db.query("order_followups").paginate(opts)
        : await ctx.db.query("visits").paginate(opts);

    const now = Date.now();
    let patched = 0;
    let archived = 0;
    let skipped = 0;

    for (const doc of res.page as any[]) {
      if (doc.workflowStatus) { skipped++; continue; }

      if (table === "visits") {
        if (doc.status !== "done") { skipped++; continue; }   // masih ongoing
        await ctx.db.patch(doc._id, { workflowStatus: "CLSD", updatedAt: now });
        patched++;
        continue;
      }

      // piutang_tasks / order_followups
      const patch: any = { workflowStatus: "CLSD", updatedAt: now };
      if (doc.status === "pending") { patch.status = "done"; archived++; }
      await ctx.db.patch(doc._id, patch);
      patched++;
    }

    return {
      table, patched, archived, skipped,
      isDone: res.isDone as boolean,
      cursor: res.continueCursor as string,
    };
  },
});

// Jalankan: npx convex run backfillWorkflow:run
export const run = internalAction({
  handler: async (ctx): Promise<any[]> => {
    const out: any[] = [];
    for (const table of ["piutang_tasks", "order_followups", "visits"] as const) {
      let cursor: string | null = null;
      let patched = 0;
      let archived = 0;
      let skipped = 0;
      let rounds = 0;

      for (let i = 0; i < 1000; i++) {
        rounds++;
        const r: any = await ctx.runMutation(internal.backfillWorkflow.batch, { table, cursor });
        patched += r.patched;
        archived += r.archived;
        skipped += r.skipped;
        if (r.isDone || r.cursor === cursor) break;
        cursor = r.cursor;
      }
      out.push({ table, patched, archived, skipped, rounds });
    }
    return out;
  },
});
