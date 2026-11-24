import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";

// ============================================================================
// FEED AKTIVITAS (khusus supervisor) — dibangun di atas tabel audit_events.
// Semua perubahan (tambah / ubah / hapus / unduh / login / logout) dari semua akun
// tercatat di audit_events; modul ini hanya membaca & menandai "sudah dilihat".
// ============================================================================

// Aksi yang boleh dicatat langsung dari klien (web). Aksi data dicatat server-side.
const CLIENT_ACTIONS = ["auth.login", "auth.logout", "export.download"];

async function requireSupervisor(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const me: any = await ctx.db.get(userId);
  if (me?.role !== "supervisor") return null;
  return { userId, me };
}

// ===== Catat login / logout / unduh dari web =====
export const record = mutation({
  args: {
    action: v.string(),
    summary: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { action, summary, metadata }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false };
    if (!CLIENT_ACTIONS.includes(action)) throw new Error("Jenis aktivitas tidak dikenal.");

    // Anti-dobel: login/logout yang sama dari akun yang sama < 20 detik → abaikan
    if (action !== "export.download") {
      const last = await ctx.db.query("audit_events")
        .withIndex("by_actor_created", (q) => q.eq("actorId", userId))
        .order("desc")
        .first();
      if (last && (last as any).action === action && Date.now() - (last as any).createdAt < 20000) {
        return { ok: true, dedup: true };
      }
    }

    const me: any = await ctx.db.get(userId);
    await logAudit(ctx, {
      actorId: userId,
      action,
      entityType: action.startsWith("auth.") ? "session" : "export",
      entityId: String(userId),
      area: me?.area ?? undefined,
      summary: String(summary || "").slice(0, 240),
      metadata,
    });
    return { ok: true };
  },
});

// ===== Daftar aktivitas terbaru (semua akun) =====
export const feed = query({
  args: { from: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { from, limit }) => {
    const sup = await requireSupervisor(ctx);
    if (!sup) return { items: [], hasMore: false, seenAt: 0 };
    const TAKE = Math.min(limit ?? 150, 400);
    const rows = await ctx.db.query("audit_events")
      .withIndex("by_created", (q) => q.gte("createdAt", from ?? 0))
      .order("desc")
      .take(TAKE + 1);
    const seen = await ctx.db.query("activity_seen")
      .withIndex("by_user", (q) => q.eq("userId", sup.userId))
      .first();
    return {
      items: rows.slice(0, TAKE).map((r: any) => ({
        _id: r._id,
        actorId: r.actorId ?? null,
        actorName: r.actorName,
        actorRole: r.actorRole ?? null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        area: r.area ?? null,
        summary: r.summary,
        before: r.before ?? null,
        after: r.after ?? null,
        metadata: r.metadata ?? null,
        createdAt: r.createdAt,
      })),
      hasMore: rows.length > TAKE,
      seenAt: (seen as any)?.seenAt ?? 0,
    };
  },
});

// ===== Jumlah aktivitas baru (aksi akun lain sejak terakhir dilihat) =====
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const sup = await requireSupervisor(ctx);
    if (!sup) return 0;
    const seen = await ctx.db.query("activity_seen")
      .withIndex("by_user", (q) => q.eq("userId", sup.userId))
      .first();
    const since = (seen as any)?.seenAt ?? Date.now() - 24 * 3600 * 1000;
    const rows = await ctx.db.query("audit_events")
      .withIndex("by_created", (q) => q.gt("createdAt", since))
      .order("desc")
      .take(100);
    return rows.filter((r: any) => String(r.actorId ?? "") !== String(sup.userId)).length;
  },
});

// ===== Tandai semua aktivitas sudah dilihat =====
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const sup = await requireSupervisor(ctx);
    if (!sup) return { ok: false };
    const existing = await ctx.db.query("activity_seen")
      .withIndex("by_user", (q) => q.eq("userId", sup.userId))
      .first();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { seenAt: now });
    else await ctx.db.insert("activity_seen", { userId: sup.userId, seenAt: now });
    return { ok: true };
  },
});

// ===== Statistik 7 hari (untuk grafik dashboard & halaman aktivitas) =====
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const sup = await requireSupervisor(ctx);
    if (!sup) return null;
    const now = Date.now();
    const OFFSET = 7 * 3600 * 1000; // WIB
    const dayKey = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 10);
    const weekAgo = now - 7 * 86400000;
    const rows: any[] = await ctx.db.query("audit_events")
      .withIndex("by_created", (q) => q.gte("createdAt", weekAgo))
      .order("desc")
      .take(1500);

    const today = dayKey(now);
    const byDay: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const actors: Record<string, { name: string; role: string | null; count: number; last: number }> = {};
    const todayHours: { hour: number; action: string; actorName: string; summary: string }[] = [];
    let todayCount = 0;
    let logins = 0;
    for (const r of rows) {
      const dk = dayKey(r.createdAt);
      byDay[dk] = (byDay[dk] ?? 0) + 1;
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      const k = String(r.actorId ?? r.actorName);
      const a = actors[k] ?? (actors[k] = { name: r.actorName, role: r.actorRole ?? null, count: 0, last: 0 });
      a.count++;
      a.last = Math.max(a.last, r.createdAt);
      if (dk === today) {
        todayCount++;
        const d = new Date(r.createdAt + OFFSET);
        todayHours.push({
          hour: d.getUTCHours() + d.getUTCMinutes() / 60,
          action: r.action,
          actorName: r.actorName,
          summary: r.summary,
        });
        if (r.action === "auth.login") logins++;
      }
    }
    const days: { key: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = dayKey(now - i * 86400000);
      days.push({ key: k, count: byDay[k] ?? 0 });
    }
    return {
      todayCount,
      logins,
      days,
      byAction,
      todayHours: todayHours.slice(0, 120),
      topActors: Object.values(actors).sort((a, b) => b.count - a.count).slice(0, 6),
      capped: rows.length >= 1500,
    };
  },
});
