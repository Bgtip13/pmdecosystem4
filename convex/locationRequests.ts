import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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

    await ctx.db.patch(req.storeId, {
      lat: req.proposedLat,
      lng: req.proposedLng,
      latSource: "approved",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(requestId, { status: "approved", approvedBy: userId, approvedAt: Date.now() });
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

    await ctx.db.patch(requestId, {
      status: "rejected",
      approvedBy: userId,
      approvedAt: Date.now(),
      rejectReason: reason?.trim() || undefined,
    });
    return { ok: true };
  },
});
