import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const RADIUS_M = 200;

const MET_WITH = v.union(
  v.literal("owner"), v.literal("karyawan"), v.literal("pic"),
  v.literal("keluarga"), v.literal("toko_tutup")
);
const NO_ORDER_REASON = v.union(
  v.literal("stok_cukup"), v.literal("baru_order"), v.literal("kalah_harga"),
  v.literal("harga_dipelajari"), v.literal("owner_tidak_ada"), v.literal("piutang")
);
const ORDER_ITEM = v.object({ product: v.string(), qty: v.optional(v.number()) });

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ===== CHECK-IN =====
export const startVisit = mutation({
  args: { storeId: v.id("stores"), lat: v.number(), lng: v.number() },
  handler: async (ctx, { storeId, lat, lng }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User tidak ditemukan.");

    const store = await ctx.db.get(storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");
    if (store.status !== "active") throw new Error("Toko tidak aktif.");

    const ongoing = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .filter((q) => q.eq(q.field("status"), "ongoing"))
      .first();
    if (ongoing) throw new Error("Kamu masih punya kunjungan berjalan. Check-out dulu.");

    if (store.lat !== undefined && store.lng !== undefined) {
      const d = haversine(lat, lng, store.lat, store.lng);
      if (d > RADIUS_M) {
        throw new Error("Kamu berada " + Math.round(d) + " m dari toko (maks " + RADIUS_M + " m). Mendekatlah ke toko.");
      }
    }

    const visitId = await ctx.db.insert("visits", {
      salesId: userId, storeId, area: store.area,
      checkinAt: Date.now(), checkinLat: lat, checkinLng: lng, status: "ongoing",
    });
    return { visitId };
  },
});

// ===== KUNJUNGAN AKTIF =====
export const getMyOngoing = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const visit = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .filter((q) => q.eq(q.field("status"), "ongoing"))
      .first();
    if (!visit) return null;
    const store = await ctx.db.get(visit.storeId);
    return { visit, store };
  },
});

export const getVisit = query({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => ctx.db.get(visitId),
});

// ===== CHECK-OUT + SPK + FOTO =====
export const finishVisit = mutation({
  args: {
    visitId: v.id("visits"),
    lat: v.number(), lng: v.number(),
    metWith: v.optional(MET_WITH),
    paid: v.optional(v.boolean()),
    paidAmount: v.optional(v.number()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    promiseDate: v.optional(v.string()),
    ordered: v.optional(v.boolean()),
    orderItems: v.optional(v.array(ORDER_ITEM)),
    noOrderReason: v.optional(NO_ORDER_REASON),
    productTrend: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoStock: v.optional(v.array(v.string())),
    photoSelfie: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const visit = await ctx.db.get(args.visitId);
    if (!visit || visit.salesId !== userId) throw new Error("Kunjungan tidak ditemukan.");
    if (visit.status !== "ongoing") throw new Error("Kunjungan sudah selesai.");

    const now = Date.now();
    const dur = now - visit.checkinAt;
    const MIN5 = 5 * 60 * 1000;
    if (args.metWith !== "toko_tutup" && dur < MIN5) {
      throw new Error("Kunjungan minimal 5 menit. Tunggu " + Math.ceil((MIN5 - dur) / 60000) + " menit lagi.");
    }

    await ctx.db.patch(visit._id, {
      status: "done", checkoutAt: now, checkoutLat: args.lat, checkoutLng: args.lng,
      durationMin: Math.round(dur / 60000),
      metWith: args.metWith, paid: args.paid, paidAmount: args.paidAmount,
      payMethod: args.payMethod, promiseDate: args.promiseDate,
      ordered: args.ordered, orderItems: args.orderItems, noOrderReason: args.noOrderReason,
      productTrend: args.productTrend, notes: args.notes,
      photoStock: args.photoStock, photoSelfie: args.photoSelfie, updatedAt: now,
    });
    return { ok: true };
  },
});

// ===== HAPUS SEMUA KUNJUNGAN (bersihkan data tes) =====
export const deleteAllVisits = mutation({
  handler: async (ctx) => {
    const items = await ctx.db.query("visits").take(200);
    for (const v of items) await ctx.db.delete(v._id);
    return items.length;
  },
});

// ===== RIWAYAT (dengan thumbnail selfie) =====
export const listHistory = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    if (!me) return [];

    const done = await ctx.db.query("visits")
      .filter((q) => q.eq(q.field("status"), "done"))
      .filter((q) => q.gte(q.field("checkoutAt"), from))
      .filter((q) => q.lte(q.field("checkoutAt"), to))
      .collect();

    const rows: any[] = [];
    for (const v of done) {
      const sales = await ctx.db.get(v.salesId);
      if ((me as any).role === "field" && v.salesId !== userId) continue;
      if ((me as any).role === "telemarketing") {
        if ((sales as any)?.role !== "field") continue;
        if ((sales as any)?.area !== (me as any).area) continue;
      }
      const store = await ctx.db.get(v.storeId);
      let selfieUrl: string | null = null;
      if (v.photoSelfie) selfieUrl = await ctx.storage.getUrl(v.photoSelfie as any);
      rows.push({ visit: v, store: store ?? null, salesName: (sales as any)?.name ?? "", photoSelfieUrl: selfieUrl });
    }
    rows.sort((a, b) => b.visit.checkoutAt - a.visit.checkoutAt);
    return rows.slice(0, 200);
  },
});

// ===== DETAIL KUNJUNGAN + URL FOTO =====
export const getVisitDetail = query({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
    const visit = await ctx.db.get(visitId);
    if (!visit) return null;
    const store = await ctx.db.get(visit.storeId);
    const sales = await ctx.db.get(visit.salesId);
    const photoStockUrls: (string | null)[] = [];
    for (const sid of visit.photoStock ?? []) photoStockUrls.push(await ctx.storage.getUrl(sid as any));
    const photoSelfieUrl = visit.photoSelfie ? await ctx.storage.getUrl(visit.photoSelfie as any) : null;
    return {
      visit,
      store: store ?? null,
      salesName: (sales as any)?.name ?? "",
      photoStockUrls,
      photoSelfieUrl,
    };
  },
});
// ===== LIVE MONITOR (SPV): status real-time semua sales =====
export const listLiveSales = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") return [];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();

    const allUsers = await ctx.db.query("users").collect();
    const sales = allUsers
      .filter((u: any) => u.role === "field")
      .sort((a: any, b: any) =>
        (a.area || "").localeCompare(b.area || "") ||
        (a.name || "").localeCompare(b.name || ""));

    const out: any[] = [];
    for (const s of sales) {
      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id))
        .filter((q) => q.gte(q.field("checkinAt"), startMs))
        .collect();

      const ongoing = today.find((v) => v.status === "ongoing") ?? null;
      const done = today.filter((v) => v.status === "done");

      let todayDoneMs = 0;
      let lastDoneAt: number | null = null;
      for (const v of done) {
        if (v.checkoutAt && v.checkinAt) todayDoneMs += v.checkoutAt - v.checkinAt;
        if (v.checkoutAt && (!lastDoneAt || v.checkoutAt > lastDoneAt)) lastDoneAt = v.checkoutAt;
      }

      let store = null;
      if (ongoing) store = await ctx.db.get(ongoing.storeId);

      out.push({
        sales: { _id: s._id, name: (s as any).name ?? "", area: (s as any).area ?? "" },
        state: ongoing ? "visit" : "free",
        storeName: store?.name ?? null,
        checkinAt: ongoing ? ongoing.checkinAt : null,
        todayDoneCount: done.length,
        todayDoneMs,
        lastDoneAt,
      });
    }
    return out;
  },
});
// ===== RINGKASAN HARI INI (dashboard Beranda) =====
export const todaySummary = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "field") return null;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();

    const mine = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .filter((q) => q.gte(q.field("checkinAt"), startMs))
      .collect();

    const done = mine.filter((v) => v.status === "done");
    let durMs = 0;
    for (const v of done) {
      if (v.checkoutAt && v.checkinAt) durMs += v.checkoutAt - v.checkinAt;
    }
    return {
      doneCount: done.length,
      durMs,
      ongoing: mine.some((v) => v.status === "ongoing"),
    };
  },
});
// ===== RIWAYAT KUNJUNGAN SALES LAPANGAN (telemarketing: area sendiri; supervisor: semua) =====
export const listSalesHistory = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    area: v.optional(v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"))),
  },
  handler: async (ctx, { from, to, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") return [];

    const myArea = role === "supervisor" ? (area ?? null) : (me as any)?.area;

    // Sales lapangan di area tsb
    const allUsers = await ctx.db.query("users").collect();
    const sales = allUsers.filter(
      (u: any) => u.role === "field" && (!myArea || u.area === myArea)
    );
    const salesIds = sales.map((u) => u._id);
    if (salesIds.length === 0) return [];

    const byUser: any = {};
    for (const u of sales) byUser[u._id] = u;

    // Ambil kunjungan selesai tiap sales
    const rows: any[] = [];
    for (const sid of salesIds) {
      const mine = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", sid))
        .filter((q) => q.eq(q.field("status"), "done"))
        .collect();
      rows.push(...mine);
    }

    const filtered = rows.filter((v: any) => {
      const at = v.checkoutAt ?? 0;
      if (from && at < from) return false;
      if (to && at > to) return false;
      return true;
    });
    filtered.sort((a: any, b: any) => (b.checkoutAt ?? 0) - (a.checkoutAt ?? 0));

    const out: any[] = [];
    for (const v of filtered.slice(0, 100)) {
      const st = (await ctx.db.get(v.storeId)) as any;
      const photoSelfieUrl = v.photoSelfie
        ? await ctx.storage.getUrl(v.photoSelfie)
        : undefined;
      out.push({
        visit: {
          ...v,
          durationMin: v.checkinAt && v.checkoutAt
            ? Math.round((v.checkoutAt - v.checkinAt) / 60000)
            : 0,
        },
        store: st ?? null,
        salesName: (byUser[v.salesId] as any)?.name ?? "",
        photoSelfieUrl,
      });
    }
    return out;
  },
});
