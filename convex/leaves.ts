import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const TYPE = v.union(
  v.literal("sakit"), v.literal("izin"), v.literal("cuti"),
  v.literal("dinas_luar"), v.literal("libur"),
);
const SCOPE = v.union(v.literal("tidak_masuk"), v.literal("tidak_keliling"));

function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// ===== SUPERVISOR: SET / GANTI IZIN (upsert per sales per hari) =====
export const setLeave = mutation({
  args: {
    salesId: v.id("users"),
    day: v.optional(v.string()),
    type: TYPE,
    scope: SCOPE,
    note: v.optional(v.string()),
  },
  handler: async (ctx, { salesId, day, type, scope, note }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const sales = (await ctx.db.get(salesId)) as any;
    if (!sales || sales.role !== "field") throw new Error("Sales lapangan tidak ditemukan.");

    const theDay = day ?? dayKeyWIB();
    const existing = await ctx.db.query("sales_leaves")
      .withIndex("by_user_day", (q) => q.eq("salesId", salesId).eq("day", theDay))
      .first();

    const cleanNote = (note ?? "").trim() || undefined;
    if (existing) {
      await ctx.db.patch(existing._id, { type, scope, note: cleanNote, area: sales.area });
    } else {
      await ctx.db.insert("sales_leaves", {
        salesId,
        area: sales.area,
        day: theDay,
        type,
        scope,
        note: cleanNote,
        createdBy: userId,
        createdAt: Date.now(),
      });
    }

    await logAudit(ctx, {
      actorId: userId,
      action: "leave.set",
      entityType: "sales_leave",
      entityId: String(existing?._id ?? salesId),
      area: sales.area,
      summary: `Izin ${sales.name ?? ""} (${theDay}): ${type} • ${scope === "tidak_masuk" ? "tidak masuk" : "tidak keliling"}.`,
      before: existing ? { type: (existing as any).type, scope: (existing as any).scope } : null,
      after: { type, scope, note: cleanNote ?? null },
    });

    return { ok: true };
  },
});

// ===== SUPERVISOR: HAPUS IZIN =====
export const clearLeave = mutation({
  args: { salesId: v.id("users"), day: v.optional(v.string()) },
  handler: async (ctx, { salesId, day }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const theDay = day ?? dayKeyWIB();
    const existing = await ctx.db.query("sales_leaves")
      .withIndex("by_user_day", (q) => q.eq("salesId", salesId).eq("day", theDay))
      .first();
    if (!existing) return { ok: true, removed: 0 };

    await ctx.db.delete(existing._id);

    const sales = (await ctx.db.get(salesId)) as any;
    await logAudit(ctx, {
      actorId: userId,
      action: "leave.clear",
      entityType: "sales_leave",
      entityId: String(existing._id),
      area: (existing as any).area,
      summary: `Hapus izin ${sales?.name ?? ""} (${theDay}) — kembali dihitung target.`,
      before: { type: (existing as any).type, scope: (existing as any).scope },
    });

    return { ok: true, removed: 1 };
  },
});

// ===== DAFTAR IZIN SATU HARI =====
export const listByDay = query({
  args: { day: v.optional(v.string()), area: v.optional(AREA) },
  handler: async (ctx, { day, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = (await ctx.db.get(userId)) as any;
    const role = me?.role;
    if (role !== "supervisor" && role !== "owner" && role !== "telemarketing" && role !== "field") return [];

    const theDay = day ?? dayKeyWIB();
    let rows = await ctx.db.query("sales_leaves")
      .withIndex("by_day", (q) => q.eq("day", theDay))
      .collect();

    if (role === "field") rows = rows.filter((r) => String(r.salesId) === String(userId));
    else if (role === "telemarketing") rows = rows.filter((r) => r.area === me.area);
    if (area) rows = rows.filter((r) => r.area === area);

    const out: any[] = [];
    for (const r of rows) {
      const u = (await ctx.db.get(r.salesId)) as any;
      out.push({
        _id: r._id,
        salesId: r.salesId,
        name: u?.name ?? "",
        area: r.area,
        day: r.day,
        type: r.type,
        scope: r.scope,
        note: r.note ?? "",
      });
    }
    out.sort((a, b) => (a.area || "").localeCompare(b.area || "") || a.name.localeCompare(b.name));
    return out;
  },
});
