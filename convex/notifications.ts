import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== KIRIM (khusus supervisor; ke semua user atau user tertentu) =====
export const send = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    target: v.union(v.literal("all"), v.literal("users")),
    userIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, { title, body, target, userIds }) => {
    const senderId = await getAuthUserId(ctx);
    if (senderId === null) throw new Error("Belum login.");
    const sender = await ctx.db.get(senderId);
    if ((sender as any)?.role !== "supervisor")
      throw new Error("Hanya supervisor yang boleh mengirim notifikasi.");

    const cleanTitle = (title || "").trim();
    const cleanBody = (body || "").trim();
    if (!cleanTitle || !cleanBody) throw new Error("Judul & isi wajib diisi.");

    let recipients: any[] = [];
    if (target === "all") {
      const all = await ctx.db.query("users").collect();
      recipients = all.filter((u: any) => u.role === "field" || u.role === "telemarketing" || u.role === "supervisor");
    } else {
      const ids = Array.from(new Set((userIds ?? []).map((x: any) => x)));
      if (ids.length === 0) throw new Error("Pilih minimal 1 penerima.");
      if (ids.length > 50) throw new Error("Maksimal 50 penerima per kiriman.");
      for (const uid of ids) {
        const u = await ctx.db.get(uid);
        if (u) recipients.push(u);
      }
    }
    if (recipients.length === 0) throw new Error("Tidak ada penerima valid.");

    const now = Date.now();
    const fromName = (sender as any)?.name ?? "Supervisor";
    for (const r of recipients) {
      await ctx.db.insert("notifications", {
        userId: r._id,
        fromUserId: senderId,
        fromName,
        title: cleanTitle,
        body: cleanBody,
        kind: "manual", // ← BARU
        createdAt: now,
      });
    }
    return { ok: true, count: recipients.length };
  },
});

// ===== DIPAKAI SERVER / CRON: notifikasi sistem (tanpa pengirim) ← BARU =====
export const insertSystem = internalMutation({
  args: {
    title: v.string(),
    body: v.string(),
    kind: v.string(),
    link: v.optional(v.string()),
    recipients: v.array(v.id("users")),
  },
  handler: async (ctx, { title, body, kind, link, recipients }) => {
    const t = Date.now();
    let created = 0;
    for (const uid of recipients) {
      // Anti-dobel: kind sama & belum 12 jam untuk user ini → lewati
      const last = await ctx.db
        .query("notifications")
        .withIndex("by_user_created", (q) => q.eq("userId", uid))
        .order("desc")
        .first();
      if (last && (last as any).kind === kind && t - last.createdAt < 12 * 3600 * 1000) continue;

      await ctx.db.insert("notifications", {
        userId: uid,
        fromName: "Sistem PMD",
        title,
        body,
        kind,
        link,
        createdAt: t,
      });
      created++;
    }
    return { created };
  },
});

// ===== DAFTAR MILIKKU (terbaru dulu) =====
export const listMine = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return ctx.db.query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50)
      .then((rows: any[]) =>
        rows.map((n) => ({
          _id: n._id,
          fromName: n.fromName,
          title: n.title,
          body: n.body,
          kind: (n as any).kind ?? null,   // ← BARU
          link: (n as any).link ?? null,   // ← BARU
          createdAt: n.createdAt,
          readAt: n.readAt ?? null,
        }))
      );
  },
});

// ===== JUMLAH BELUM DIBACA =====
export const unreadCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const mine = await ctx.db.query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    return mine.filter((n: any) => !n.readAt).length;
  },
});

// ===== TANDAI SUDAH DIBACA =====
export const markRead = mutation({
  args: { notifId: v.id("notifications") },
  handler: async (ctx, { notifId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const n = await ctx.db.get(notifId);
    if (!n || n.userId !== userId) throw new Error("Notifikasi tidak ditemukan.");
    if (!n.readAt) await ctx.db.patch(notifId, { readAt: Date.now() });
    return { ok: true };
  },
});

// ===== HAPUS SATU (penerima sendiri) =====
export const remove = mutation({
  args: { notifId: v.id("notifications") },
  handler: async (ctx, { notifId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const n = await ctx.db.get(notifId);
    if (!n || n.userId !== userId) throw new Error("Notifikasi tidak ditemukan.");
    await ctx.db.delete(notifId);
    return { ok: true };
  },
});
