import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";   // ← BARU

// ===== SALES: USUL PERBARUI LOKASI =====
export const requestLocationUpdate = mutation({
  args: { storeId: v.id("stores"), lat: v.number(), lng: v.number() },
  handler: async (ctx, { storeId, lat, lng }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const user = await ctx.db.get(userId);
    const role = (user as any)?.role;
    if (role !== "field" && role !== "supervisor") throw new Error("Tidak diizinkan.");

    const store = await ctx.db.get(storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");

    const all = await ctx.db.query("store_location_requests")
      .withIndex("by_store", (q) => q.eq("storeId", storeId))
      .collect();
    const pending = all.find((r) => r.status === "pending");
    if (pending) throw new Error("Masih ada permintaan menunggu persetujuan untuk toko ini.");

    await ctx.db.insert("store_location_requests", {
      storeId,
      requestedBy: userId,
      area: store.area,
      proposedLat: lat,
      proposedLng: lng,
      oldLat: store.lat,
      oldLng: store.lng,
      status: "pending",
      createdAt: Date.now(),
    });

    // ===== Beri tahu semua supervisor → muncul di layar Notifikasi =====
    const fromName = (user as any)?.name ?? "Sales";
    const supers = (await ctx.db.query("users").collect()).filter(
      (u: any) => u.role === "supervisor" && String(u._id) !== String(userId)
    );
    if (supers.length > 0) {
      const t = Date.now();
      for (const s of supers) {
        await ctx.db.insert("notifications", {
          userId: s._id,
          fromUserId: userId,
          fromName,
          title: "📍 Usulan perbarui lokasi",
          body: `${fromName} mengusulkan koordinat baru untuk toko ${store.name}. Buka Menu SPV → Persetujuan Lokasi.`,
          kind: "approval_lokasi",
          link: "/spv-approval",
          createdAt: t,
        });
      }
    }

    // ← BARU: catat pengajuan ke audit trail
    await logAudit(ctx, {
      actorId: userId,
      action: "location.request",
      entityType: "store",
      entityId: storeId,
      area: store.area,
      summary: `Mengusulkan perbarui lokasi ${store.name}.`,
      before: { lat: store.lat ?? null, lng: store.lng ?? null },
      after: { lat, lng },
    });

    return { ok: true };
  },
});

// ===== STATUS PERMINTAAN TERAKHIR (untuk badge di detail toko) =====
export const getStoreRequestStatus = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const all = await ctx.db.query("store_location_requests")
      .withIndex("by_store", (q) => q.eq("storeId", storeId))
      .collect();
    all.sort((a, b) => b.createdAt - a.createdAt);
    return all[0] ?? null;
  },
});

// ===== SPV: DAFTAR PERMINTAAN MENUNGGU =====
export const listPendingRequests = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") return [];

    const items = await ctx.db.query("store_location_requests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const out: any[] = [];
    for (const r of items) {
      const store = await ctx.db.get(r.storeId);
      const sales = await ctx.db.get(r.requestedBy);
      out.push({ request: r, store: store ?? null, salesName: (sales as any)?.name ?? "" });
    }
    out.sort((a, b) => b.request.createdAt - a.request.createdAt);
    return out;
  },
});

// ===== SPV: SETUJUI =====
export const approveRequest = mutation({
  args: { requestId: v.id("store_location_requests") },
  handler: async (ctx, { requestId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Hanya supervisor.");

    const req = await ctx.db.get(requestId);
    if (!req || req.status !== "pending") throw new Error("Permintaan tidak ditemukan.");

    const store = await ctx.db.get(req.storeId);
    const storeName = (store as any)?.name ?? "toko";

    await ctx.db.patch(req.storeId, {
      lat: req.proposedLat,
      lng: req.proposedLng,
      latSource: "approved",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(requestId, { status: "approved", approvedBy: userId, approvedAt: Date.now() });

    // Kabari sales yang mengusulkan
    await ctx.db.insert("notifications", {
      userId: req.requestedBy,
      fromUserId: userId,
      fromName: (me as any)?.name ?? "Supervisor",
      title: "✅ Koordinat toko disetujui",
      body: `Usulan lokasi untuk ${storeName} disetujui. Koordinat toko sudah diperbarui.`,
      kind: "approval_result",
      link: `/store/${req.storeId}`,
      createdAt: Date.now(),
    });

    // ← BARU: catat persetujuan ke audit trail
    await logAudit(ctx, {
      actorId: userId,
      action: "location.approve",
      entityType: "store_location_request",
      entityId: requestId,
      area: (req as any).area,
      summary: `Menyetujui perbarui lokasi ${storeName}.`,
      before: { lat: (req as any).oldLat ?? null, lng: (req as any).oldLng ?? null },
      after: { lat: req.proposedLat, lng: req.proposedLng },
    });

    return { ok: true };
  },
});

// ===== SPV: TOLAK =====
export const rejectRequest = mutation({
  args: { requestId: v.id("store_location_requests"), reason: v.optional(v.string()) },
  handler: async (ctx, { requestId, reason }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Hanya supervisor.");

    const req = await ctx.db.get(requestId);
    if (!req || req.status !== "pending") throw new Error("Permintaan tidak ditemukan.");

    const store = await ctx.db.get(req.storeId);
    const storeName = (store as any)?.name ?? "toko";
    const cleanReason = reason?.trim() || "";

    await ctx.db.patch(requestId, {
      status: "rejected",
      approvedBy: userId,
      approvedAt: Date.now(),
      rejectReason: cleanReason || undefined,
    });

    // Kabari sales yang mengusulkan
    await ctx.db.insert("notifications", {
      userId: req.requestedBy,
      fromUserId: userId,
      fromName: (me as any)?.name ?? "Supervisor",
      title: "❌ Usulan koordinat ditolak",
      body: `Usulan lokasi untuk ${storeName} ditolak${cleanReason ? `: ${cleanReason}` : "."}`,
      kind: "approval_result",
      link: `/store/${req.storeId}`,
      createdAt: Date.now(),
    });

    // ← BARU: catat penolakan ke audit trail
    await logAudit(ctx, {
      actorId: userId,
      action: "location.reject",
      entityType: "store_location_request",
      entityId: requestId,
      area: (req as any).area,
      summary: `Menolak usulan lokasi ${storeName}${cleanReason ? ` — alasan: ${cleanReason}` : "."}`,
      before: { status: "pending" },
      after: { status: "rejected", reason: cleanReason || null },
    });

    return { ok: true };
  },
});
