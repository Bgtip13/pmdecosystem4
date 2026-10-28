import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";

const RADIUS_M = 200;

// Pengaman Database I/O: batas baris sekali baca + toleransi jam untuk rentang
const ROLE_TAKE = 300;
const BUF_MS = 12 * 3600 * 1000;

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

// Awal hari pukul 00:00 WIB (UTC+7)
function todayStartWib(): number {
  const WIB = 7 * 3600 * 1000;
  return Math.floor((Date.now() + WIB) / 86400000) * 86400000 - WIB;
}

// Hari ini di WIB → YYYY-MM-DD
function dayKeyWib(now = Date.now()): string {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
// ===== SPK JADWAL: sinkronkan badge saat toko dikerjakan lewat SPK SALES =====
// Satu toko bisa punya baris di visit_schedules (SPK Jadwal). Kalau tokonya
// dikunjungi lewat alur SPK Sales, baris jadwal itu HARUS ikut berubah —
// kalau tidak, badge-nya tetap "Belum" walau sudah dikerjakan.
function jadwalNameKey(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function syncJadwalRow(
  ctx: any,
  v: { _id: any; storeId: any; checkinAt: number },
  status: "ONGOING" | "DONE"
) {
  const store: any = await ctx.db.get(v.storeId);
  if (!store) return;

  // Bulan kunjungan (WIB) + bulan sebelumnya (jadwal bisa dibuat sebelum bulan berganti)
  const base = new Date(v.checkinAt + 7 * 3600 * 1000);
  const mk = base.toISOString().slice(0, 7);
  const prev = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1))
    .toISOString().slice(0, 7);
  const storeKey = store.area + "||" + jadwalNameKey(store.name);

  // HEMAT: 1 pembacaan berindeks; bulan sebelumnya hanya dicoba kalau kosong
  let row: any = null;
  for (const m of [mk, prev]) {
    row = await ctx.db.query("visit_schedules")
      .withIndex("by_month_store_key", (q: any) => q.eq("monthKey", m).eq("storeKey", storeKey))
      .first();
    if (row) break;
  }
  if (!row) return;                        // toko ini memang tidak ada di jadwal
  if (row.status === "CANCELLED") return;  // dibatalkan supervisor → jangan dihidupkan lagi

  const bolehLink = !row.visitId || String(row.visitId) === String(v._id);
  await ctx.db.patch(row._id, {
    status,
    ...(bolehLink ? { visitId: v._id } : {}),          // kartu jadwal jadi tahu jam check-in/out
    ...(row.storeId ? {} : { storeId: v.storeId }),    // baris nyangkut → sekalian ditautkan
    updatedAt: Date.now(),
  });
}


// ===== CHECK-IN =====
export const startVisit = mutation({
  args: { storeId: v.id("stores"), lat: v.number(), lng: v.number(), mock: v.optional(v.boolean()) },
  handler: async (ctx, { storeId, lat, lng, mock }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User tidak ditemukan.");

    const store = await ctx.db.get(storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");
    if (store.status !== "active") throw new Error("Toko tidak aktif.");

    // HEMAT: dulu memindai SEMUA kunjungan sales ini. Kunjungan berjalan
    // selalu yang terbaru → cukup lihat 5 teratas.
    const recent = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .order("desc")
      .take(5);
    const ongoing = recent.find((x) => x.status === "ongoing") ?? null;
    if (ongoing) throw new Error("Kamu masih punya kunjungan berjalan. Check-out dulu.");

    if (store.lat !== undefined && store.lng !== undefined) {
      const d = haversine(lat, lng, store.lat, store.lng);
      if (d > RADIUS_M) {
        throw new Error("Kamu berada " + Math.round(d) + " m dari toko (maks " + RADIUS_M + " m). Mendekatlah ke toko.");
      }
    }

    const now = Date.now();
    const visitId = await ctx.db.insert("visits", {
      salesId: userId, storeId, area: store.area,
      checkinAt: now, checkinLat: lat, checkinLng: lng, status: "ongoing",
      isMock: mock === true,
    } as any);

    // ← Opsional: toko berjadwal langsung tampil "Berjalan" saat dikerjakan dari SPK Sales
    await syncJadwalRow(ctx, { _id: visitId, storeId, checkinAt: now }, "ONGOING");

    return { visitId };
  },
});

// ===== KUNJUNGAN AKTIF =====
export const getMyOngoing = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    // HEMAT: kunjungan berjalan selalu yang TERBARU (query ini jalan di tiap layar)
    const recent = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .order("desc")
      .take(5);
    const visit = recent.find((x) => x.status === "ongoing") ?? null;
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
// FASE 1: setelah check-out, kunjungan masuk status INPG (menunggu review
// supervisor). Sales masih boleh mengoreksi hasilnya selama INPG.
export const finishVisit = mutation({
  args: {
    visitId: v.id("visits"),
    lat: v.number(), lng: v.number(),
    mock: v.optional(v.boolean()),
    metWith: v.optional(MET_WITH),
    paid: v.optional(v.boolean()),
    noDebt: v.optional(v.boolean()),
    paidAmount: v.optional(v.number()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    promiseDate: v.optional(v.string()),
    ordered: v.optional(v.boolean()),
    orderItems: v.optional(v.array(ORDER_ITEM)),
    noOrderReason: v.optional(NO_ORDER_REASON),
    productTrend: v.optional(v.string()),
    productSearched: v.optional(v.string()),
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
      workflowStatus: "INPG",     // ← FASE 1: menunggu review supervisor
      isMock: (visit as any).isMock === true || args.mock === true,
      metWith: args.metWith,
      noDebt: args.noDebt,
      paid: args.noDebt ? true : args.paid,
      paidAmount: args.paidAmount,
      payMethod: args.payMethod, promiseDate: args.promiseDate,
      ordered: args.ordered, orderItems: args.orderItems, noOrderReason: args.noOrderReason,
      productTrend: args.productTrend, productSearched: args.productSearched, notes: args.notes,
      photoStock: args.photoStock, photoSelfie: args.photoSelfie, updatedAt: now,
    } as any);

    // ← BARU: toko yang sama dikerjakan lewat SPK Sales → badge SPK Jadwal jadi Selesai
    await syncJadwalRow(
      ctx,
      { _id: visit._id, storeId: visit.storeId, checkinAt: visit.checkinAt },
      "DONE"
    );

    return { ok: true };

  },
});

// ===== EDIT HASIL KUNJUNGAN (sales pemilik & supervisor) =====
// FASE 1: hanya bisa saat status INPG. Setelah supervisor CLSD → terkunci.
export const editVisitResult = mutation({
  args: {
    visitId: v.id("visits"),
    metWith: v.optional(MET_WITH),
    paid: v.optional(v.boolean()),
    noDebt: v.optional(v.boolean()),
    paidAmount: v.optional(v.number()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    promiseDate: v.optional(v.string()),
    ordered: v.optional(v.boolean()),
    orderItems: v.optional(v.array(ORDER_ITEM)),
    noOrderReason: v.optional(NO_ORDER_REASON),
    productTrend: v.optional(v.string()),
    productSearched: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoStock: v.optional(v.array(v.string())),
    photoSelfie: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = (await ctx.db.get(userId)) as any;
    const role = me?.role;

    const visit = await ctx.db.get(args.visitId);
    if (!visit) throw new Error("Kunjungan tidak ditemukan.");
    if (role !== "supervisor" && visit.salesId !== userId) throw new Error("Bukan kunjungan kamu.");
    if (visit.status !== "done") throw new Error("Kunjungan belum check-out.");

    const wf = (visit as any).workflowStatus as string | undefined;
    if (wf === "CLSD") throw new Error("Sudah disetujui supervisor (CLSD) — tidak bisa diubah lagi.");
    if (wf !== "INPG") throw new Error("Kunjungan ini belum bisa diedit.");

    const now = Date.now();
    await ctx.db.patch(visit._id, {
      metWith: args.metWith,
      noDebt: args.noDebt,
      paid: args.noDebt ? true : args.paid,
      paidAmount: args.paidAmount,
      payMethod: args.payMethod,
      promiseDate: args.promiseDate,
      ordered: args.ordered,
      orderItems: args.orderItems,
      noOrderReason: args.noOrderReason,
      productTrend: args.productTrend,
      productSearched: args.productSearched,
      notes: args.notes,
      ...(args.photoStock !== undefined ? { photoStock: args.photoStock } : {}),
      ...(args.photoSelfie !== undefined ? { photoSelfie: args.photoSelfie } : {}),
      updatedAt: now,
    } as any);

    const store = await ctx.db.get(visit.storeId);
    await logAudit(ctx, {
      actorId: userId,
      action: "visit.edit_result",
      entityType: "visit",
      entityId: visit._id,
      area: (visit as any).area,
      summary: `Edit hasil kunjungan ${(store as any)?.name ?? ""} oleh ${me?.name ?? ""}.`,
      before: { metWith: (visit as any).metWith ?? null, ordered: (visit as any).ordered ?? null, paid: (visit as any).paid ?? null },
      after: { metWith: args.metWith ?? null, ordered: args.ordered ?? null, paid: args.paid ?? null },
    });

    return { ok: true };
  },
});

// ===== SUPERVISOR: SETUJUI KUNJUNGAN (INPG → CLSD) =====
// Setelah CLSD, sales tidak bisa mengedit lagi dan kunjungan TIDAK bisa dibuka kembali.
export const supervisorCloseVisit = mutation({
  args: { visitId: v.id("visits"), reviewNote: v.optional(v.string()) },
  handler: async (ctx, { visitId, reviewNote }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const visit = await ctx.db.get(visitId);
    if (!visit) throw new Error("Kunjungan tidak ditemukan.");
    if (visit.status !== "done") throw new Error("Kunjungan belum check-out.");

    const wf = (visit as any).workflowStatus as string | undefined;
    if (wf === "CLSD") throw new Error("Sudah CLSD.");
    if (wf !== "INPG") throw new Error("Kunjungan ini belum siap direview.");

    const now = Date.now();
    await ctx.db.patch(visit._id, {
      workflowStatus: "CLSD",
      closedBySupervisor: true,
      reviewedBy: userId,
      reviewedAt: now,
      reviewNote: reviewNote?.trim() || undefined,
      updatedAt: now,
    } as any);

    const store = await ctx.db.get(visit.storeId);
    await logAudit(ctx, {
      actorId: userId,
      action: "visit.close",
      entityType: "visit",
      entityId: visit._id,
      area: (visit as any).area,
      summary: `Setujui (CLSD) kunjungan ${(store as any)?.name ?? ""}.`,
      before: { workflowStatus: wf ?? null },
      after: { workflowStatus: "CLSD", reviewNote: reviewNote?.trim() || null },
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

// ===== RIWAYAT (tanpa URL foto — hemat I/O) =====
export const listHistory = query({
  args: {
    from: v.number(),
    to: v.number(),
    salesId: v.optional(v.id("users")),
  },
  handler: async (ctx, { from, to, salesId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = (await ctx.db.get(userId)) as any;
    if (!me) return [];

     const done = await ctx.db.query("visits")
      .withIndex("by_status_checkout", (q) =>
        q.eq("status", "done").gte("checkoutAt", from).lte("checkoutAt", to))
      .take(400);

    const allUsers = await ctx.db.query("users").collect();
    const byUser = new Map<string, any>();
    for (const u of allUsers) byUser.set(String(u._id), u);

    const visible = done.filter((v: any) => {
      const sales = byUser.get(String(v.salesId));
      if (sales?.role === "supervisor" && me.role !== "supervisor") return false;
      if (salesId && v.salesId !== salesId) return false;
      if (me.role === "field" && v.salesId !== userId) return false;
      if (me.role === "telemarketing") {
        if (sales?.role !== "field") return false;
        if (sales?.area !== me.area) return false;
      }
      return true;
    });
    visible.sort((a: any, b: any) => (b.checkoutAt ?? 0) - (a.checkoutAt ?? 0));
    const page = visible.slice(0, 200);

    const storeIds = Array.from(new Set(page.map((v: any) => String(v.storeId))));
    const stores = new Map<string, any>();
    for (const sid of storeIds) stores.set(sid, await ctx.db.get(sid as any));

    const rows: any[] = [];
    for (const v of page) {
      rows.push({
        visit: v,
        store: stores.get(String(v.storeId)) ?? null,
        salesName: byUser.get(String(v.salesId))?.name ?? "",
        reviewerName: (v as any).reviewedBy ? byUser.get(String((v as any).reviewedBy))?.name ?? "" : "",
        hasSelfie: !!v.photoSelfie,
      });
    }
    return rows;
  },
});



// ===== DETAIL KUNJUNGAN + URL FOTO =====
export const getVisitDetail = query({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const visit = await ctx.db.get(visitId);
    if (!visit) return null;
    const store = await ctx.db.get(visit.storeId);
    const sales = (await ctx.db.get(visit.salesId)) as any;
    const viewer = (await ctx.db.get(userId)) as any;
    const reviewer = (visit as any).reviewedBy ? ((await ctx.db.get((visit as any).reviewedBy)) as any) : null;

    if (sales?.role === "supervisor" && viewer?.role !== "supervisor") return null;

    const photoStockUrls: (string | null)[] = [];
    for (const sid of visit.photoStock ?? []) photoStockUrls.push(await ctx.storage.getUrl(sid as any));
    const photoSelfieUrl = visit.photoSelfie ? await ctx.storage.getUrl(visit.photoSelfie as any) : null;
    return {
      visit,
      store: store ?? null,
      salesName: sales?.name ?? "",
      reviewerName: reviewer?.name ?? "",
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
    const callerRole = (me as any)?.role;
    if (callerRole !== "supervisor" && callerRole !== "owner") return [];

    const startMs = todayStartWib();

    // Izin hari ini (kunci: salesId)
    const leaves = await ctx.db.query("sales_leaves")
      .withIndex("by_day", (q) => q.eq("day", dayKeyWib()))
      .collect();
    const leaveMap = new Map<string, any>();
    for (const lv of leaves) leaveMap.set(String(lv.salesId), lv);

    const allUsers = await ctx.db.query("users").collect();
    const sales = allUsers
      .filter((u: any) => u.role === "field")
      .sort((a: any, b: any) =>
        (a.area || "").localeCompare(b.area || "") ||
        (a.name || "").localeCompare(b.name || ""));

    const out: any[] = [];
    for (const s of sales) {
      // HEMAT: rentang hari-INi dipindah KE DALAM index [salesId, checkinAt].
      // Dulu: baca SELURUH riwayat kunjungan sales ini, lalu buang di memori.
      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id).gte("checkinAt", startMs))
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

      const leave = leaveMap.get(String(s._id)) ?? null;

      out.push({
        sales: { _id: s._id, name: (s as any).name ?? "", area: (s as any).area ?? "" },
        state: ongoing ? "visit" : "free",
        storeName: store?.name ?? null,
        checkinAt: ongoing ? ongoing.checkinAt : null,
        todayDoneCount: done.length,
        todayDoneMs,
        lastDoneAt,
        orderedCount: done.filter((v) => v.ordered === true).length,
        notOrderedCount: done.filter((v) => v.metWith !== "toko_tutup" && v.ordered !== true).length,
        closedCount: done.filter((v) => v.metWith === "toko_tutup").length,
        leave: leave ? { type: leave.type, scope: leave.scope, note: leave.note ?? "" } : null,
        excused: !!leave,
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

    const startMs = todayStartWib();

    // HEMAT: rentang di dalam index (dulu baca semua riwayat lalu buang)
    const mine = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId).gte("checkinAt", startMs))
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

    const allUsers = await ctx.db.query("users").collect();
    const sales = allUsers.filter(
      (u: any) => u.role === "field" && (!myArea || u.area === myArea)
    );
    const salesIds = sales.map((u) => u._id);
    if (salesIds.length === 0) return [];

    const byUser: any = {};
    for (const u of sales) byUser[u._id] = u;

    const rows: any[] = [];
    for (const sid of salesIds) {
      // HEMAT: dulu baca SEMUA kunjungan sales ini lalu buang yang di luar rentang.
      // Sekarang rentang jadi bagian dari index; kalau tanpa rentang → dibatasi.
      const base = ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => {
          const eq = q.eq("salesId", sid);
          if (from && to) return eq.gte("checkinAt", from - BUF_MS).lte("checkinAt", to + BUF_MS);
          if (from) return eq.gte("checkinAt", from - BUF_MS);
          if (to) return eq.lte("checkinAt", to + BUF_MS);
          return eq;
        })
        .order("desc");
      const mine = await base.take(ROLE_TAKE);
      rows.push(...mine);
    }

    const filtered = rows.filter((v: any) => {
      if (v.status !== "done") return false;
      const at = v.checkoutAt ?? 0;
      if (from && at < from) return false;
      if (to && at > to) return false;
      return true;
    });
    filtered.sort((a: any, b: any) => (b.checkoutAt ?? 0) - (a.checkoutAt ?? 0));

    const out: any[] = [];
    const storeCache = new Map<string, any>();
    for (const v of filtered.slice(0, 100)) {
      const key = String(v.storeId);
      if (!storeCache.has(key)) storeCache.set(key, (await ctx.db.get(v.storeId)) as any);
      const st = storeCache.get(key);
      const reviewer = v.reviewedBy ? ((await ctx.db.get(v.reviewedBy)) as any) : null;
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
        reviewerName: reviewer?.name ?? "",
        photoSelfieUrl,
      });
    }
    return out;
  },
});

export const deleteVisitBySupervisor = mutation({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
    const callerId = await getAuthUserId(ctx);
    if (callerId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(callerId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");
    const visit = await ctx.db.get(visitId);
    if (!visit) throw new Error("Kunjungan tidak ditemukan.");

    // ← BARU: kalau kunjungan ini berasal dari jadwal, kembalikan baris jadwalnya
    const mk = new Date((visit as any).checkinAt + 7 * 3600 * 1000).toISOString().slice(0, 7);
    const rows = await ctx.db.query("visit_schedules")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect();
    const linked = (rows as any[]).find(
      (r) => r.visitId && String(r.visitId) === String(visitId)
    );
    if (linked) {
      if (linked.isAdHoc) {
        await ctx.db.delete(linked._id);   // kunjungan luar jadwal → barisnya dihapus saja
      } else {
        await ctx.db.patch(linked._id, {
          status: "PLANNED",
          visitId: undefined,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(visitId);
    return { ok: true };
  },
});

// ===== EXPORT RIWAYAT KUNJUNGAN (rentang tanggal) =====
export const exportVisits = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "supervisor" && role !== "owner" && role !== "telemarketing" && role !== "field") return [];

    // HEMAT: pakai index [status, checkoutAt] + batas 2000 (dulu scan seluruh tabel)
    const done = await ctx.db.query("visits")
      .withIndex("by_status_checkout", (q) =>
        q.eq("status", "done").gte("checkoutAt", from).lte("checkoutAt", to))
      .order("asc")
      .take(2000);

    const out: any[] = [];
    const storeCache = new Map<string, any>();
    for (const v of done) {
      const sales = await ctx.db.get(v.salesId);
      if ((sales as any)?.role === "supervisor" && role !== "supervisor") continue;
      if (role === "field" && v.salesId !== userId) continue;
      if (role === "telemarketing") {
        if ((sales as any)?.role !== "field") continue;
        if ((sales as any)?.area !== (me as any).area) continue;
      }
      const key = String(v.storeId);
      if (!storeCache.has(key)) storeCache.set(key, (await ctx.db.get(v.storeId)) as any);
      const st = storeCache.get(key);
      out.push({
        tanggal: v.checkoutAt ?? 0,
        sales: (sales as any)?.name ?? "",
        area: st?.area ?? "",
        toko: st?.name ?? "",
        bertemu: v.metWith ?? "",
        bayar: v.paid === true ? "Ya" : (v as any).noDebt === true ? "Tidak ada piutang" : v.promiseDate ? "Janji bayar" : "",
        nominal: v.paidAmount ?? null,
        metode: v.payMethod ?? "",
        janjiBayar: v.promiseDate ?? "",
        order: v.ordered === true ? "Ya" : v.ordered === false ? "Tidak" : "",
        alasan: v.noOrderReason ?? "",
        trend: v.productTrend ?? "",
        keterangan: v.notes ?? "",
        durasiMenit: v.durationMin ?? 0,
        status: (v as any).workflowStatus ?? "",
      });
    }
    out.sort((a: any, b: any) => a.tanggal - b.tanggal);
    return out;
  },
});

// ============================================================
// KUNJUNGAN MANUAL / MIGRASI (khusus supervisor)
// ============================================================

// Daftar sales lapangan untuk dipilih (khusus supervisor)
export const listFieldSales = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") return [];
    const all = await ctx.db.query("users").collect();
    return all
      .filter((u: any) => u.role === "field")
      .sort((a: any, b: any) =>
        (a.area || "").localeCompare(b.area || "") ||
        (a.name || "").localeCompare(b.name || ""))
      .map((u: any) => ({ _id: u._id, name: u.name ?? "", area: u.area ?? "" }));
  },
});

// Tambah kunjungan manual untuk sales (khusus supervisor)
// dayMs = jam 00:00 (zona lokal HP) pada tanggal kunjungan.
export const supervisorAddManualVisit = mutation({
  args: {
    salesId: v.id("users"),
    storeId: v.id("stores"),
    dayMs: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { salesId, storeId, dayMs, notes }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const sales = await ctx.db.get(salesId);
    if (!sales || (sales as any).role !== "field") throw new Error("Sales tidak ditemukan.");
    const store = await ctx.db.get(storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");

    // Cegah duplikat: sales + toko + hari yang sama sudah tercatat
    // HEMAT: rentang tanggal jadi bagian index [salesId, checkinAt]
    const dayEndMs = dayMs + 86400000;
    const dup = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) =>
        q.eq("salesId", salesId).gte("checkinAt", dayMs).lt("checkinAt", dayEndMs))
      .filter((q) => q.eq(q.field("storeId"), storeId))
      .first();
    if (dup) throw new Error("Kunjungan sales & toko ini di tanggal itu sudah ada.");

    const note = (notes ?? "").trim();
    const checkinAt = dayMs + 9 * 3600 * 1000;       // pukul 09:00
    const checkoutAt = checkinAt + 15 * 60 * 1000;   // durasi 15 menit

    const visitId = await ctx.db.insert("visits", {
      salesId,
      storeId,
      area: (store as any).area,
      checkinAt,
      checkinLat: (store as any).lat ?? 0,
      checkinLng: (store as any).lng ?? 0,
      checkoutAt,
      checkoutLat: (store as any).lat ?? 0,
      checkoutLng: (store as any).lng ?? 0,
      durationMin: 15,
      status: "done",
      workflowStatus: "CLSD",   // ← FASE 1: input manual = langsung dianggap disetujui
      isMock: true,
      source: "manual",
      manualNote: note || undefined,
      notes: note || undefined,
      createdBy: userId,
      updatedAt: Date.now(),
    } as any);
    return { visitId };
  },
});
