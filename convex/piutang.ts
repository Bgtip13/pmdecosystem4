import { action, internalAction, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

// JAGA: URL ini sama dengan di piutangSync.ts.
const PIUTANG_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=1683363636&single=true&output=csv";

const AREA_V = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));

// Hari ini dalam zona WIB (UTC+7) → YYYY-MM-DD
function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// ===== CRON HARIAN OTOMATIS (04:00 WIB) =====
export const autoSync = internalAction({
  handler: async (ctx) => {
    const res = await fetch(PIUTANG_SHEET_URL);
    if (!res.ok) throw new Error("Gagal menarik Google Sheets (" + res.status + ").");
    const csv = await res.text();
    const day = dayKeyWIB();
    return await (ctx.runMutation as any)("piutangSync:importRows", { csv, day });
  },
});

// ===== SUPERVISOR: tarik manual / tes =====
export const manualSync = action({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.runQuery(api.users.getUserById, { userId });
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");
    const res = await fetch(PIUTANG_SHEET_URL);
    if (!res.ok) throw new Error("Gagal menarik Google Sheets (" + res.status + ").");
    const csv = await res.text();
    const day = dayKeyWIB();
        return await (ctx.runMutation as any)("piutangSync:importRows", { csv, day });
  },
});

// ===== DAFTAR TUGAS BELUM DIKERJAKAN =====
export const listActive = query({
  args: { area: v.optional(AREA_V), day: v.optional(v.string()) },
  handler: async (ctx, { area, day }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") return [];

    const myArea = role === "supervisor" ? (area ?? null) : (me as any)?.area;
    const theDay = day ?? dayKeyWIB();

    let items;
    if (myArea) {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_area_status", (q) => q.eq("area", myArea).eq("status", "pending"))
        .filter((q) => q.eq(q.field("day"), theDay))
        .collect();
    } else {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .filter((q) => q.eq(q.field("day"), theDay))
        .collect();
    }
    items.sort((a: any, b: any) =>
      (b.usia ?? 0) - (a.usia ?? 0) || (a.storeName || "").localeCompare(b.storeName || ""));
    return items;
  },
});

// ===== JUMLAH BELUM DIKERJAKAN (badge pengingat) =====
export const pendingCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { count: 0 };
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") return { count: 0 };
    const area = role === "supervisor" ? null : (me as any)?.area;
    const theDay = dayKeyWIB();
    let items;
    if (area) {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_area_status", (q) => q.eq("area", area).eq("status", "pending"))
        .filter((q) => q.eq(q.field("day"), theDay))
        .collect();
    } else {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .filter((q) => q.eq(q.field("day"), theDay))
        .collect();
    }
    return { count: items.length };
  },
});

// ===== SELESAIKAN TUGAS (hasil follow-up telemarketing) =====
export const completeTask = mutation({
  args: {
    taskId: v.id("piutang_tasks"),
    hasil: v.union(v.literal("janji_bayar"), v.literal("lunas"), v.literal("cicil")),
    promiseDate: v.optional(v.string()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") {
      throw new Error("Khusus telemarketing / supervisor.");
    }
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Data tidak ditemukan.");
    if (role === "telemarketing" && task.area !== (me as any)?.area) {
      throw new Error("Bukan area kamu.");
    }
    if (task.status === "done") throw new Error("Sudah dikerjakan.");
    if ((args.hasil === "lunas" || args.hasil === "cicil") && !args.payMethod) {
      throw new Error("Pilih metode bayar (Tunai/Transfer).");
    }
    if (args.hasil === "janji_bayar" && !args.promiseDate) {
      throw new Error("Pilih tanggal janji bayar.");
    }
    await ctx.db.patch(task._id, {
      status: "done",
      hasil: args.hasil,
      promiseDate: args.promiseDate,
      payMethod: args.payMethod,
      notes: args.notes?.trim() || undefined,
      screenshot: args.screenshot,
      doneBy: userId,
      doneAt: Date.now(),
    });
    return { ok: true };
  },
});

// ===== RIWAYAT TUGAS SELESAI =====
export const listDone = query({
  args: { area: v.optional(AREA_V) },
  handler: async (ctx, { area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") return [];

    const myArea = role === "supervisor" ? (area ?? null) : (me as any)?.area;
    let items;
    if (myArea) {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_area_status", (q) => q.eq("area", myArea).eq("status", "done"))
        .collect();
    } else {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_status", (q) => q.eq("status", "done"))
        .collect();
    }
    const out: any[] = [];
    for (const t of items) {
      const sales = t.doneBy ? await ctx.db.get(t.doneBy) : null;
      out.push({ task: t, salesName: (sales as any)?.name ?? "" });
    }
    out.sort((a, b) => (b.task.doneAt ?? 0) - (a.task.doneAt ?? 0));
    return out.slice(0, 200);
  },
});
// ===== DETAIL TUGAS SELESAI (riwayat SPK telemarketing) =====
export const getTaskDetail = query({
  args: { taskId: v.id("piutang_tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") return null;

    const task = await ctx.db.get(taskId);
    if (!task) return null;
    if (role === "telemarketing" && task.area !== (me as any)?.area) return null;

    const sales = task.doneBy ? await ctx.db.get(task.doneBy) : null;
    const photoUrl = task.screenshot
      ? await ctx.storage.getUrl(task.screenshot)
      : undefined;

    return {
      task,
      salesName: (sales as any)?.name ?? "",
      photoUrl,
    };
  },
});
