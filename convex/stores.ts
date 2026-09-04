import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));

export const bulkImport = mutation({
  args: {
    stores: v.array(v.object({
      name: v.string(),
      address: v.string(),
      phone: v.optional(v.string()),
      pic: v.optional(v.string()),
      area: AREA,
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    })),
  },
  handler: async (ctx, { stores }) => {
    let added = 0;
    let skipped = 0;
    for (const s of stores) {
      if (!s.name) { skipped++; continue; }
      const dup = await ctx.db.query("stores")
        .withIndex("by_area", (q) => q.eq("area", s.area))
        .filter((q) => q.eq(q.field("name"), s.name))
        .first();
      if (dup) { skipped++; continue; }
      await ctx.db.insert("stores", {
        name: s.name,
        address: s.address ?? "",
        phone: s.phone ?? "",
        pic: s.pic ?? "",
        area: s.area,
        lat: s.lat,
        lng: s.lng,
        latSource: s.lat !== undefined ? "supervisor" : "unverified",
        status: "active",
        createdAt: Date.now(),
      });
      added++;
    }
    return { added, skipped };
  },
});

// Dipakai nanti di Home: list toko per area (supervisor: semua)
export const listStores = query({
  args: { area: v.optional(AREA) },
  handler: async (ctx, { area }) => {
    let q = ctx.db.query("stores").withIndex("by_status", (qq) => qq.eq("status", "active"));
    if (area) q = q.filter((qq) => qq.eq(qq.field("area"), area));
    const rows = await q.collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getStore = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => ctx.db.get(storeId),
});
// ===== DAFTARKAN TOKO BARU (sales di lokasi) =====
export const addStore = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.string(),
    lat: v.number(),
    lng: v.number(),
    area: v.optional(v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const user = await ctx.db.get(userId);
    const role = (user as any)?.role;
    if (role !== "field" && role !== "supervisor") throw new Error("Tidak diizinkan mendaftarkan toko.");

    let area: any = (user as any)?.area;
    if (role === "supervisor") {
      if (!args.area) throw new Error("Pilih area toko.");
      area = args.area;
    }
    if (!area) throw new Error("Area tidak diketahui.");

    const name = args.name.trim();
    if (!name) throw new Error("Nama toko wajib diisi.");
    if (!args.address.trim()) throw new Error("Alamat wajib diisi.");

    // Cek duplikat via no HP
    const phone = (args.phone || "").trim();
    if (phone) {
      const byPhone = await ctx.db.query("stores")
        .filter((q) => q.eq(q.field("phone"), phone))
        .first();
      if (byPhone) throw new Error("No HP sudah terdaftar untuk: " + byPhone.name);
    }

    // Cek duplikat via nama (di area yang sama)
    const byName = await ctx.db.query("stores")
      .withIndex("by_area", (q) => q.eq("area", area))
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (byName) throw new Error("Nama toko sudah terdaftar di area ini: " + byName.name);

    const id = await ctx.db.insert("stores", {
      name,
      address: args.address.trim(),
      phone: phone || undefined,
      pic: undefined,
      area,
      lat: args.lat,
      lng: args.lng,
      latSource: "sales_registered",
      status: "active",
      createdBy: userId,
      createdAt: Date.now(),
    });
    return { storeId: id };
  },
});
// ===== KELOLA TOKO (SPV) =====
export const listManageStores = query({
  args: {
    q: v.optional(v.string()),
    area: v.optional(v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"))),
  },
  handler: async (ctx, { q, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") return [];

    const keyword = (q ?? "").trim().toLowerCase();
    let items;
    if (area) {
      items = await ctx.db.query("stores").withIndex("by_area", (qq) => qq.eq("area", area)).collect();
    } else {
      items = await ctx.db.query("stores").collect();
    }
    const filtered = items.filter((s: any) => {
      if (!keyword) return true;
      return (s.name || "").toLowerCase().includes(keyword)
        || (s.address || "").toLowerCase().includes(keyword)
        || (s.phone || "").toLowerCase().includes(keyword);
    });
    filtered.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    return filtered.slice(0, 100);
  },
});

export const updateStore = mutation({
  args: {
    storeId: v.id("stores"),
    name: v.string(),
    phone: v.optional(v.string()),
    pic: v.optional(v.string()),
    address: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    area: v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG")),
    status: v.union(v.literal("active"), v.literal("disabled")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const store = await ctx.db.get(args.storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");

    const name = args.name.trim();
    if (!name) throw new Error("Nama toko wajib diisi.");
    if (!args.address.trim()) throw new Error("Alamat wajib diisi.");

    const phone = (args.phone ?? "").trim();
    if (phone) {
      const dup = await ctx.db.query("stores")
        .withIndex("by_area", (q) => q.eq("area", args.area))
        .filter((q) => q.eq(q.field("phone"), phone))
        .first();
      if (dup && dup._id !== args.storeId) throw new Error("No HP sudah dipakai: " + dup.name);
    }

    const dupName = await ctx.db.query("stores")
      .withIndex("by_area", (q) => q.eq("area", args.area))
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (dupName && dupName._id !== args.storeId) throw new Error("Nama sudah ada di area ini: " + dupName.name);

    const patch: any = {
      name,
      address: args.address.trim(),
      phone: phone || undefined,
      pic: (args.pic ?? "").trim() || undefined,
      area: args.area,
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.lat !== undefined && args.lng !== undefined) {
      patch.lat = args.lat;
      patch.lng = args.lng;
      patch.latSource = "supervisor";
    }
    await ctx.db.patch(args.storeId, patch);
    return { ok: true };
  },
});

