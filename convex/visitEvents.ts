import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";
import { isOwnerLike } from "./lib/roles";

// ============================================================================
// EVENT TARGET KUNJUNGAN
// Supervisor membuat event untuk tanggal tertentu dan menentukan target kunjungan
// hari itu. Dipakai penilaian bulanan (penilaian.ts) dan kartu target di Beranda sales.
//
// Aturan target per hari untuk satu sales:
//   • Ada event yang berlaku (area kosong = semua area, atau sama dengan area sales)
//     → target = nilai terkecil di antara event yang berlaku (paling meringankan).
//   • Tidak ada event → 7 toko, Minggu 0 (libur).
// Target 0 berarti hari itu tidak ada kewajiban kunjungan dan tidak dinilai.
// ============================================================================

export const DEFAULT_TARGET_HARIAN = 7;
const AREA_V = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayKeyWIB = (now = Date.now()) => new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);

async function meOf(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return (await ctx.db.get(userId)) as any;
}

// Daftar event pada satu tanggal. Supervisor/HR/owner melihat semua;
// sales & telemarketing hanya event yang berlaku untuk areanya.
export const listByDay = query({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const me = await meOf(ctx);
    if (!me) return [];
    const rows: any[] = await ctx.db.query("visit_events").withIndex("by_day", (q) => q.eq("day", day)).collect();
    const manager = me.role === "supervisor" || me.role === "hr" || isOwnerLike(me.role);
    const visible = manager ? rows : rows.filter((e) => !e.area || e.area === me.area);
    const out: any[] = [];
    for (const e of visible) {
      const by: any = await ctx.db.get(e.createdBy);
      out.push({
        _id: e._id, day: e.day, title: e.title, target: e.target,
        area: e.area ?? null, note: e.note ?? null,
        createdByName: by?.name ?? "", createdAt: e.createdAt,
      });
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  },
});

// Target kunjungan HARI INI untuk sales yang sedang login (Beranda sales).
export const myToday = query({
  args: {},
  handler: async (ctx) => {
    const me = await meOf(ctx);
    if (!me) return null;
    const day = dayKeyWIB();
    const rows: any[] = await ctx.db.query("visit_events").withIndex("by_day", (q) => q.eq("day", day)).collect();
    const mine = rows.filter((e) => !e.area || e.area === me.area);
    if (mine.length === 0) return { day, target: DEFAULT_TARGET_HARIAN, fromEvent: false, titles: [] as string[] };
    return {
      day,
      target: Math.min(...mine.map((e) => e.target)),
      fromEvent: true,
      titles: mine.map((e) => e.title),
    };
  },
});

export const create = mutation({
  args: {
    day: v.string(),
    title: v.string(),
    target: v.number(),
    area: v.optional(AREA_V),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { day, title, target, area, note }) => {
    const me = await meOf(ctx);
    if (!me) throw new Error("Belum login.");
    if (me.role !== "supervisor") throw new Error("Hanya supervisor yang boleh membuat event.");
    if (!DAY_RE.test(day)) throw new Error("Format tanggal tidak valid.");
    const t = title.trim();
    if (!t) throw new Error("Judul event wajib diisi.");
    if (t.length > 80) throw new Error("Judul event maksimal 80 karakter.");
    if (!Number.isInteger(target) || target < 0 || target > 50) {
      throw new Error("Target kunjungan harus bilangan bulat 0–50.");
    }

    const existing: any[] = await ctx.db.query("visit_events").withIndex("by_day", (q) => q.eq("day", day)).collect();
    if (existing.some((e) => e.title.toLowerCase() === t.toLowerCase() && (e.area ?? "") === (area ?? ""))) {
      throw new Error("Event dengan judul dan area yang sama sudah ada di tanggal ini.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("visit_events", {
      day, title: t, target, area, note: (note ?? "").trim() || undefined, createdBy: me._id, createdAt: now,
    } as any);

    await logAudit(ctx, {
      actorId: me._id,
      action: "visitEvent.create",
      entityType: "visit_event",
      entityId: String(id),
      area: area ?? undefined,
      summary: `Event “${t}” ${day}: target kunjungan ${target} toko (${area ?? "semua area"}).`,
      after: { day, title: t, target, area: area ?? null },
    });
    return { ok: true, id };
  },
});

export const remove = mutation({
  args: { eventId: v.id("visit_events") },
  handler: async (ctx, { eventId }) => {
    const me = await meOf(ctx);
    if (!me) throw new Error("Belum login.");
    if (me.role !== "supervisor") throw new Error("Hanya supervisor yang boleh menghapus event.");
    const ev: any = await ctx.db.get(eventId);
    if (!ev) return { ok: true };
    await ctx.db.delete(eventId);
    await logAudit(ctx, {
      actorId: me._id,
      action: "visitEvent.remove",
      entityType: "visit_event",
      entityId: String(eventId),
      area: ev.area ?? undefined,
      summary: `Event “${ev.title}” ${ev.day} dihapus (target kembali ke bawaan).`,
      before: { day: ev.day, title: ev.title, target: ev.target, area: ev.area ?? null },
    });
    return { ok: true };
  },
});
