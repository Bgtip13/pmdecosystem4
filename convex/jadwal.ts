import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// ==========================================================================
// Modul ini = SISI BACA + AKSI LAPANGAN (check-in).
// Penarik sheet JADWAL ada di modul terpisah: "jadwalSync".
// ==========================================================================

const AREA_V = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));

// Sama dengan SPK lama: di luar radius ini check-in DITOLAK,
// sales harus mengajukan "Reset longlat" (disetujui supervisor).
const RADIUS_M = 200;

// Sistem baru mulai 1 Oktober; September tetap memakai alur lama.
const START_DATE_KEY = "2026-10-01";

function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Batas bulan (WIB) dari "YYYY-MM-DD"
function monthRangeMs(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1) - 7 * 3600 * 1000; // 00:00 WIB tgl 1
  const end = Date.UTC(y, m, 1) - 7 * 3600 * 1000;       // 00:00 WIB tgl 1 bulan berikutnya
  return { start, end };
}

function noSpkOf(s: any) {
  const d = String(s?.dateKey ?? "").replace(/-/g, "");
  const urut = s?.urutan != null ? String(s.urutan).padStart(2, "0") : "00";
  return `SPK-${d}-${s?.area ?? "?"}-${urut}`;
}

// Radius check yang dipakai bersama checkIn & adHocCheckIn.
// Mengembalikan jarak (meter) atau null kalau toko belum punya koordinat.
function cekRadius(lat: number, lng: number, store: any): number | null {
  if (store?.lat == null || store?.lng == null) return null;
  const jarakM = Math.round(haversine(lat, lng, store.lat, store.lng));
  if (jarakM > RADIUS_M) {
    throw new Error(
      `Kamu ${jarakM} m dari toko (batas ${RADIUS_M} m). ` +
      `Tekan "Reset longlat" untuk mengajukan koordinat baru ke supervisor.`
    );
  }
  return jarakM;
}

// ==========================================================================
// NAMA TERNORMALISASI + PENGHUBUNG NAMA TOKO SHEET ↔ MASTER TOKO (Kelola Toko)
// Sheet JADWAL hanya memuat NAMA. Kalau namanya tidak sama persis dengan
// master toko, baris jadwal jadi "belum terhubung" dan SPK-nya tidak bisa diisi.
// Di bawah ini: pencocokan otomatis (harus TUNGGAL & area sama) + sambung manual.
// ==========================================================================
function nameKeyOf(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normStoreName(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Cari toko master yang cocok. Sengaja TIDAK menebak kalau kandidat > 1.
async function resolveStoreByName(ctx: any, area: string, storeName: string) {
  const nk = normStoreName(storeName);
  if (!nk) return { status: "none" as const };

  const search = async (term: string) =>
    (await ctx.db.query("stores")
      .withSearchIndex("by_name", (s: any) => s.search("name", term).eq("status", "active"))
      .take(20)) as any[];

  // 1) nama penuh, 2) kalau kosong pakai kata terpanjang
  let hits = await search(storeName);
  if (!hits.length) {
    const longest = nk.split(" ").sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 3) hits = await search(longest);
  }

  const sameArea = hits.filter((h) => h.area === area);
  const exact = sameArea.filter((h) => normStoreName(h.name) === nk);
  const pool = exact.length ? exact : sameArea;

  if (pool.length === 1) return { status: "one" as const, store: pool[0] };
  if (pool.length > 1) return { status: "many" as const, count: pool.length };
  return { status: "none" as const };
}

// ===== DAFTAR SPK SATU HARI =====
// Sales lapangan: otomatis hanya baris miliknya.
// Supervisor/owner: boleh pilih tanggal, sales, atau area.
export const listDay = query({
  args: {
    dateKey: v.optional(v.string()),
    salesId: v.optional(v.id("users")),
    area: v.optional(AREA_V),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const me: any = await ctx.db.get(userId);
    const role = me?.role;
    const isField = role === "field";
    const dk = args.dateKey ?? dayKeyWIB();

    let rows: any[] = [];
    if (isField) {
      rows = await ctx.db.query("visit_schedules")
        .withIndex("by_date_sales", (q) => q.eq("dateKey", dk).eq("salesId", userId))
        .collect();
    } else if (args.salesId) {
      rows = await ctx.db.query("visit_schedules")
        .withIndex("by_date_sales", (q) => q.eq("dateKey", dk).eq("salesId", args.salesId))
        .collect();
    } else if (args.area) {
      const area = args.area;
      rows = await ctx.db.query("visit_schedules")
        .withIndex("by_date_area", (q) => q.eq("dateKey", dk).eq("area", area))
        .collect();
    } else {
      rows = await ctx.db.query("visit_schedules")
        .withIndex("by_date", (q) => q.eq("dateKey", dk))
        .collect();
    }

    const out: any[] = [];
    let done = 0;
    let ongoing = 0;
    let planned = 0;
    let unlinked = 0;

    for (const r of rows) {
      // ← BARU: baris yang dibatalkan tidak pernah ditampilkan di SPK Jadwal.
      //   (sync juga sudah menghapusnya; ini jaring pengaman kalau belum sempat sync)
      if (String(r.status) === "CANCELLED") continue;

      let status = String(r.status);
      let checkinAt: number | null = null;
      let checkoutAt: number | null = null;

      if (r.visitId) {
        const vv: any = await ctx.db.get(r.visitId);
        if (vv) {
          checkinAt = vv.checkinAt ?? null;
          checkoutAt = vv.checkoutAt ?? null;
          // merapikan sendiri: kunjungan sudah selesai tapi baris masih ONGOING
          if (vv.status === "done" && status === "ONGOING") status = "DONE";
        } else if (status === "ONGOING") {
          // kunjungannya sudah dihapus → tampilkan Belum (perbaikan ditulis di checkIn)
          status = "PLANNED";
        }
      } else if (status === "ONGOING") {
        status = "PLANNED";
      }

      if (status === "DONE") done++;
      else if (status === "ONGOING") ongoing++;
      else if (status === "PLANNED") planned++;
      if (!r.storeId) unlinked++;

      out.push({
        _id: r._id,
        dateKey: r.dateKey,
        tanggal: r.tanggal,
        area: r.area,
        storeName: r.storeName,
        status,
        urutan: r.urutan ?? null,
        target: r.target ?? null,
        act: r.act ?? null,
        isAdHoc: r.isAdHoc === true,
        storeMissing: !r.storeId,
        checkinAt,
        checkoutAt,
        noSpk: noSpkOf(r),
      });
    }

    const rank: any = { ONGOING: 0, PLANNED: 1, DONE: 2 };
    out.sort((a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      (a.urutan ?? 999) - (b.urutan ?? 999) ||
      a.storeName.localeCompare(b.storeName));

    return {
      dateKey: dk,
      isField,
      total: out.length,
      done,
      ongoing,
      planned,
      unlinked,
      rows: out,
    };
  },
});


// ===== KARTU SPK SATU TOKO =====
export const getCard = query({
  args: { scheduleId: v.id("visit_schedules") },
  handler: async (ctx, { scheduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const me: any = await ctx.db.get(userId);
    const role = me?.role;

    const s: any = await ctx.db.get(scheduleId);
    if (!s) return null;
    if (role === "field" && s.salesId && String(s.salesId) !== String(userId)) return null;

    // ---- Toko master ----
    // Kalau baris belum tertaut ke master toko, cari padanannya SEKALI di sini
    // (baca saja — query tidak boleh menulis). Penulisan permanen terjadi di
    // checkIn / linkStore / linkMissing.
    let storeIdNow: any = s.storeId ?? null;
    let autoMatched = false;
    let store: any = storeIdNow ? await ctx.db.get(storeIdNow) : null;
    if (!store) {
      const res: any = await resolveStoreByName(ctx, s.area, s.storeName);
      if (res.status === "one") {
        store = res.store;
        storeIdNow = res.store._id;
        autoMatched = true;
      }
    }

    // Rapikan sendiri (READ-ONLY — query tidak boleh menulis):
    //  - kunjungan sudah selesai tapi baris masih ONGOING  → DONE
    //  - kunjungannya sudah dihapus tapi baris masih ONGOING → Belum
    let statusNow = String(s.status);
    if (s.visitId) {
      const vv: any = await ctx.db.get(s.visitId);
      if (vv && vv.status === "done" && statusNow === "ONGOING") statusNow = "DONE";
      if (!vv && statusNow === "ONGOING") statusNow = "PLANNED";
    } else if (statusNow === "ONGOING") {
      statusNow = "PLANNED";
    }

    // ---- Piutang & umur dari tab PIUTANG (sumber resmi, sama dengan SPK Admin) ----
    // Kunci: AREA + NAMA TOKO PERSIS. Tidak ketemu → null (tampil "-"), tidak ditebak.
    let piutang: number | null = null;
    let usia: number | null = null;
    let piutangDay: string | null = null;
    {
      const hits = await ctx.db.query("piutang_tasks")
        .withIndex("by_storeName", (q) => q.eq("storeName", s.storeName))
        .collect();
      const same = (hits as any[]).filter((h) => h.area === s.area);
      const latestDay = same.reduce((a: string, h: any) => (h.day > a ? h.day : a), "");
      if (latestDay) {
        const dayRows = same.filter((h) => h.day === latestDay);
        let best: any = null;
        // kalau toko muncul lebih dari sekali di satu hari → ambil usia terbesar
        for (const h of dayRows) if (!best || (h.usia ?? 0) > (best.usia ?? 0)) best = h;
        if (best) {
          piutang = best.piutang ?? best.total ?? null;
          usia = best.usia ?? null;
          piutangDay = best.day ?? null;
        }
      }
    }

    // ---- Penjaga 1 toko = 1x/bulan (kecuali kunjungan terakhir "toko tutup") ----
    let visitCount = 0;
    let lockedThisMonth = false;
    let canRevisit = false;
    let lastVisit: any = null;
    if (storeIdNow) {
      const { start, end } = monthRangeMs(s.dateKey);
      const vs = await ctx.db.query("visits")
        .withIndex("by_store_checkin", (q) => q.eq("storeId", storeIdNow).gte("checkinAt", start))
        .collect();
      const inMonth = (vs as any[]).filter((v) => v.status === "done" && v.checkinAt < end);
      visitCount = inMonth.length;
      lockedThisMonth = inMonth.some((v) => (v.metWith ?? "") !== "toko_tutup");
      canRevisit = !lockedThisMonth && visitCount > 0;
      if (inMonth.length) {
        const newest = inMonth.reduce((a, v) => (v.checkinAt > a.checkinAt ? v : a), inMonth[0]);
        lastVisit = {
          metWith: newest.metWith ?? null,
          checkinAt: newest.checkinAt,
          checkoutAt: newest.checkoutAt ?? null,
        };
      }
    }

    return {
      // ← storeMissing + storeId yang sudah dipakai kartu ini, biar layar tahu
      //   apakah perlu menawarkan "Hubungkan ke Toko".
      schedule: {
        ...s,
        storeId: storeIdNow ?? undefined,
        status: statusNow,
        noSpk: noSpkOf(s),
        storeMissing: !storeIdNow,
        autoMatched,
      },
      store: store
        ? {
            _id: store._id,
            name: store.name,
            address: store.address,
            area: store.area,
            lat: store.lat ?? null,
            lng: store.lng ?? null,
          }
        : null,
      piutang,
      usia,
      piutangDay,
      visitCount,
      lockedThisMonth,
      canRevisit,
      lastVisit,
      isField: role === "field",
    };
  },
});

// ===== CHECK-IN DARI JADWAL =====
// Radius GPS: DITOLAK di luar 200 m (sama seperti SPK lama).
export const checkIn = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    lat: v.number(),
    lng: v.number(),
    mock: v.optional(v.boolean()),
  },
  handler: async (ctx, { scheduleId, lat, lng, mock }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");

    const me: any = await ctx.db.get(userId);

    const s: any = await ctx.db.get(scheduleId);
    if (!s) throw new Error("Jadwal tidak ditemukan.");

    // ← Penyembuh: baris nyangkut "Berjalan" padahal kunjungannya sudah dihapus.
    // Ini mutation, jadi boleh menulis.
    if (s.status === "ONGOING") {
      const v = s.visitId ? await ctx.db.get(s.visitId) : null;
      if (!v) {
        await ctx.db.patch(scheduleId, { status: "PLANNED", visitId: undefined, updatedAt: Date.now() });
        s.status = "PLANNED";
        s.visitId = undefined;
      }
    }

    if (s.dateKey < START_DATE_KEY) throw new Error("Jadwal sebelum 1 Oktober belum aktif.");
    if (s.salesId && String(s.salesId) !== String(userId) && me?.role !== "supervisor") {
      throw new Error("Jadwal ini bukan milikmu.");
    }

    // ← BARU: belum tertaut? cari padanannya di master toko lalu SIMPAN.
    //   Jadi nama sheet yang beda tipis tidak lagi memblokir check-in.
    if (!s.storeId) {
      const res: any = await resolveStoreByName(ctx, s.area, s.storeName);
      if (res.status === "one") {
        await ctx.db.patch(scheduleId, { storeId: res.store._id, updatedAt: Date.now() });
        s.storeId = res.store._id;
      } else {
        throw new Error(
          res.status === "many"
            ? "Nama toko ini punya beberapa kemungkinan di Kelola Toko. Minta supervisor memilih yang benar (SPK Jadwal → kartu merah → Hubungkan ke Toko)."
            : "Nama toko ini belum ada di Kelola Toko. Minta supervisor mendaftarkan tokonya dulu, atau daftarkan lewat tombol + (Toko Baru)."
        );
      }
    }

    if (s.status === "DONE") throw new Error("Kunjungan ini sudah selesai.");
    if (s.status === "CANCELLED") throw new Error("Jadwal ini sudah dibatalkan.");

    const store: any = await ctx.db.get(s.storeId);
    if (!store || store.status !== "active") throw new Error("Toko tidak aktif.");

    // ← Radius diperiksa SEBELUM kunjungan dibuat: di luar 200 m ditolak,
    //   jadi tidak ada kunjungan hampa dan status jadwal tidak ikut berubah.
    const jarakM = cekRadius(lat, lng, store);

    const ongoing = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .filter((q) => q.eq(q.field("status"), "ongoing"))
      .first();
    if (ongoing) throw new Error("Kamu masih punya kunjungan berjalan. Check-out dulu.");

    // Penjaga: 1 toko = 1x per bulan
    const { start, end } = monthRangeMs(s.dateKey);
    const vs = await ctx.db.query("visits")
      .withIndex("by_store_checkin", (q) => q.eq("storeId", s.storeId).gte("checkinAt", start))
      .collect();
    const inMonth = (vs as any[]).filter((v) => v.status === "done" && v.checkinAt < end);
    if (inMonth.some((v) => (v.metWith ?? "") !== "toko_tutup")) {
      throw new Error("Toko ini sudah dikunjungi bulan ini (aturan 1 toko 1x per bulan).");
    }

    const now = Date.now();
    const visitId = await ctx.db.insert("visits", {
      salesId: userId,
      storeId: s.storeId,
      area: store.area,
      checkinAt: now,
      checkinLat: lat,
      checkinLng: lng,
      status: "ongoing",
      isMock: mock === true,
      source: "jadwal",
    } as any);

    await ctx.db.patch(scheduleId, { status: "ONGOING", visitId, updatedAt: now });

    return { visitId, jarakM, diLuarRadius: false };
  },
});

// ===== SUPERVISOR/OWNER: SAMBUNGKAN SATU BARIS JADWAL KE MASTER TOKO =====
export const linkStore = mutation({
  args: { scheduleId: v.id("visit_schedules"), storeId: v.id("stores") },
  handler: async (ctx, { scheduleId, storeId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "owner") {
      throw new Error("Hanya supervisor yang bisa menyambungkan nama toko.");
    }

    const s: any = await ctx.db.get(scheduleId);
    if (!s) throw new Error("Jadwal tidak ditemukan.");

    const store: any = await ctx.db.get(storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");
    if (store.status !== "active") throw new Error("Toko itu berstatus nonaktif.");
    if (store.area !== s.area) {
      throw new Error("Area tidak sama: jadwal " + s.area + ", toko " + store.area + ". Perbaiki dulu di Kelola Toko.");
    }
    if (s.visitId && s.storeId && String(s.storeId) !== String(storeId)) {
      throw new Error("Baris ini sudah punya kunjungan — jangan diubah lagi.");
    }

    await ctx.db.patch(scheduleId, { storeId, updatedAt: Date.now() });
    return { ok: true, storeName: store.name };
  },
});

// ===== SUPERVISOR/OWNER: HUBUNGKAN OTOMATIS SEBULAN (sekali tekan) =====
// Hanya menyambung kalau kandidatnya TUNGGAL. Yang ambigu/tidak ada → dilaporkan.
export const linkMissing = mutation({
  args: { monthKey: v.optional(v.string()), max: v.optional(v.number()) },
  handler: async (ctx, { monthKey, max }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "owner") {
      throw new Error("Hanya supervisor yang bisa menyambungkan nama toko.");
    }

    const mk = monthKey ?? dayKeyWIB().slice(0, 7);
    const rows: any[] = await ctx.db.query("visit_schedules")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect();

    const belum = rows.filter((r) => !r.storeId);
    const batch = belum.slice(0, Math.min(max ?? 200, 400));

    let linked = 0, ambiguous = 0, notFound = 0;
    for (const r of batch) {
      const res: any = await resolveStoreByName(ctx, r.area, r.storeName);
      if (res.status === "one") {
        await ctx.db.patch(r._id, { storeId: res.store._id, updatedAt: Date.now() });
        linked++;
      } else if (res.status === "many") ambiguous++;
      else notFound++;
    }

    return {
      monthKey: mk,
      belumTerhubung: belum.length,
      diproses: batch.length,
      linked, ambiguous, notFound,
      sisa: belum.length - linked,
    };
  },
});

// ===== TANDAI BARIS JADWAL SELESAI =====
// Dipanggil aplikasi SESUDAH `api.visits.finishVisit` berhasil (kalau nanti dipakai).
// Selebihnya status sudah dirapikan otomatis saat dibaca (lihat getCard & listDay).
export const markDone = mutation({
  args: { scheduleId: v.id("visit_schedules") },
  handler: async (ctx, { scheduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");

    const s: any = await ctx.db.get(scheduleId);
    if (!s) throw new Error("Jadwal tidak ditemukan.");

    await ctx.db.patch(scheduleId, { status: "DONE", updatedAt: Date.now() });
    return { ok: true };
  },
});

// ==========================================================================
// FASE 3 lanjutan: KUNJUNGAN LUAR JADWAL (sales menambah toko di luar jadwal)
// Penjaga 1 toko = 1x/bulan tetap berlaku, sama seperti check-in dari jadwal.
// ==========================================================================

// ===== CARI TOKO UNTUK KUNJUNGAN LUAR JADWAL =====
// Sekaligus menandai toko yang sudah dikunjungi bulan ini (supaya tidak ditembak).
export const searchStores = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { q, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const me: any = await ctx.db.get(userId);
    const myArea = me?.role === "field" ? me.area : undefined;
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];

    const take = Math.min(limit ?? 20, 30);

    let found: any[] = await ctx.db.query("stores")
      .withSearchIndex("by_name", (s) => s.search("name", needle).eq("status", "active"))
      .take(take);

    if (myArea) found = found.filter((s) => s.area === myArea);

    const today = dayKeyWIB();
    const { start, end } = monthRangeMs(today);

    const out: any[] = [];
    for (const s of found) {
      const vs = await ctx.db.query("visits")
        .withIndex("by_store_checkin", (x) => x.eq("storeId", s._id).gte("checkinAt", start))
        .collect();
      const inMonth = (vs as any[]).filter((v) => v.status === "done" && v.checkinAt < end);
      out.push({
        _id: s._id,
        name: s.name,
        area: s.area,
        address: s.address,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        kunjunganBulanIni: inMonth.length,
        sudahDikunjungi: inMonth.some((v) => (v.metWith ?? "") !== "toko_tutup"),
      });
    }
    return out;
  },
});

// ===== CHECK-IN KUNJUNGAN LUAR JADWAL =====
// Radius GPS juga DITOLAK di luar 200 m, sama seperti check-in dari jadwal.
export const adHocCheckIn = mutation({
  args: {
    storeId: v.id("stores"),
    lat: v.number(),
    lng: v.number(),
    mock: v.optional(v.boolean()),
  },
  handler: async (ctx, { storeId, lat, lng, mock }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");

    const me: any = await ctx.db.get(userId);
    const actorRole = (me as any)?.role;
    if (actorRole !== "field" && actorRole !== "supervisor") {
      throw new Error("Hanya sales lapangan & supervisor yang bisa menambah kunjungan.");
    }

    const store: any = await ctx.db.get(storeId);
    if (!store) throw new Error("Toko tidak ditemukan.");
    if (store.status !== "active") throw new Error("Toko tidak aktif.");
    if (me.area && store.area !== me.area) {
      throw new Error("Toko ini di luar area kamu (" + store.area + ").");
    }

    // ← Radius diperiksa lebih dulu, sebelum apa pun ditulis
    const jarakM = cekRadius(lat, lng, store);

    const today = dayKeyWIB();
    if (today < START_DATE_KEY) throw new Error("Kunjungan baru aktif mulai 1 Oktober.");

    const [yy, mm, dd] = today.split("-");
    const monthKey = today.slice(0, 7);

    const ongoing = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q) => q.eq("salesId", userId))
      .filter((q) => q.eq(q.field("status"), "ongoing"))
      .first();
    if (ongoing) throw new Error("Kamu masih punya kunjungan berjalan. Check-out dulu.");

    // Penjaga 1x/bulan
    const { start, end } = monthRangeMs(today);
    const vs = await ctx.db.query("visits")
      .withIndex("by_store_checkin", (q) => q.eq("storeId", storeId).gte("checkinAt", start))
      .collect();
    const inMonth = (vs as any[]).filter((v) => v.status === "done" && v.checkinAt < end);
    if (inMonth.some((v) => (v.metWith ?? "") !== "toko_tutup")) {
      throw new Error("Toko ini sudah dikunjungi bulan ini (aturan 1 toko 1x per bulan).");
    }

    // Sudah ada baris jadwal bulan ini? (satu toko = satu baris per bulan)
    const nk = nameKeyOf(store.name);
    const storeKey = store.area + "||" + nk;

    const sudah = await ctx.db.query("visit_schedules")
      .withIndex("by_month_store_key", (q) => q.eq("monthKey", monthKey).eq("storeKey", storeKey))
      .first();

    if (sudah) {
      // Pengecualian: baris lama boleh dipakai ulang HANYA kalau kunjungan
      // sebelumnya berakhir "toko tutup".
      let bolehUlang = false;
      if (sudah.visitId) {
        const pv: any = await ctx.db.get(sudah.visitId);
        bolehUlang = pv?.status === "done" && pv?.metWith === "toko_tutup";
      }
      if (!bolehUlang) {
        throw new Error("Toko ini sudah ada di jadwal bulan ini (" + sudah.tanggal + ").");
      }
    }

    const now = Date.now();
    const visitId = await ctx.db.insert("visits", {
      salesId: userId,
      storeId,
      area: store.area,
      checkinAt: now,
      checkinLat: lat,
      checkinLng: lng,
      status: "ongoing",
      isMock: mock === true,
      source: "luar_jadwal",
    } as any);

    let scheduleId: any;
    if (sudah) {
      // pakai ulang baris lama → tetap 1 baris per toko per bulan
      await ctx.db.patch(sudah._id, {
        dateKey: today,
        tanggal: `${dd}-${mm}-${yy}`,
        isAdHoc: true,
        status: "ONGOING",
        visitId,
        updatedAt: now,
      });
      scheduleId = sudah._id;
    } else {
      scheduleId = await ctx.db.insert("visit_schedules", {
        monthKey,
        dateKey: today,
        tanggal: `${dd}-${mm}-${yy}`,
        area: store.area,
        storeKey,
        storeName: store.name,
        nameKey: nk,
        salesId: userId,
        storeId,
        status: "ONGOING",
        isAdHoc: true,
        visitId,
        createdAt: now,
      });
    }

    return { visitId, scheduleId, jarakM, diLuarRadius: false };
  },
});

// ==========================================================================
// FASE 3 lanjutan: LAPORAN BULANAN JADWAL (supervisor & owner)
// Terlewat = baris PLANNED yang tanggalnya sudah lewat.
// ==========================================================================

const STATUS_LABEL: any = {
  PLANNED: "Belum",
  ONGOING: "Berjalan",
  DONE: "Selesai",
  CANCELLED: "Dibatalkan",
  TERLAMBAT: "Terlewat",
};

// ===== RINGKASAN BULAN (ringan, aman di-subscribe) =====
export const monthReport = query({
  args: { monthKey: v.optional(v.string()), area: v.optional(AREA_V) },
  handler: async (ctx, { monthKey, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    const role = me?.role;
    if (role !== "supervisor" && role !== "owner") return null;

    const mk = monthKey ?? dayKeyWIB().slice(0, 7);
    const today = dayKeyWIB();

    let rows: any[] = await ctx.db.query("visit_schedules")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect();
    if (area) rows = rows.filter((r) => r.area === area);

    // baca kunjungan & nama sales sekaligus (paralel, bukan satu-satu)
    const visitIds = rows.map((r) => r.visitId).filter(Boolean);
    const visitDocs = await Promise.all(visitIds.map((id: any) => ctx.db.get(id)));
    const vmap = new Map<string, any>();
    visitIds.forEach((id: any, i: number) => vmap.set(String(id), visitDocs[i]));

    const salesIds = Array.from(new Set(rows.map((r) => r.salesId).filter(Boolean).map(String)));
    const salesDocs = await Promise.all(salesIds.map((id) => ctx.db.get(id as any)));
    const smap = new Map<string, any>();
    salesIds.forEach((id, i) => smap.set(id, salesDocs[i]));

    const counts = {
      total: 0, done: 0, ongoing: 0, planned: 0, cancelled: 0, terlewat: 0, adHoc: 0,
      belumTerhubung: 0, terlewatTerkunci: 0,
    };
    const perSalesMap = new Map<string, any>();
    const terlewat: any[] = [];
    const belumTerhubung: any[] = [];

    for (const r of rows) {
      let status = String(r.status);
      const vv = r.visitId ? vmap.get(String(r.visitId)) : null;
      if (vv && vv.status === "done" && status === "ONGOING") status = "DONE";
      if (!vv && status === "ONGOING") status = "PLANNED";

      const salesKey = String(r.salesId ?? "belum");
      const sName = r.salesId ? (smap.get(String(r.salesId))?.name ?? "-") : "Belum dipetakan";
      const g = perSalesMap.get(salesKey) ?? {
        salesId: r.salesId ?? null,
        name: sName,
        area: r.area,
        total: 0, done: 0, planned: 0, terlewat: 0, adHoc: 0,
        belumTerhubung: 0, terlewatTerkunci: 0,
      };

      counts.total++;
      g.total++;
      if (r.isAdHoc) { counts.adHoc++; g.adHoc++; }

      // ← BARU: nama toko belum tertaut ke master toko → check-in diblokir
      const terkunci = !r.storeId;
      if (terkunci) { counts.belumTerhubung++; g.belumTerhubung++; }

      if (status === "DONE") { counts.done++; g.done++; }
      else if (status === "ONGOING") { counts.ongoing++; }
      else if (status === "PLANNED") {
        counts.planned++;
        g.planned++;
        if (r.dateKey < today) {
          counts.terlewat++;
          g.terlewat++;
          // Terlewat KARENA nama belum terhubung → dipisah, bukan salah sales
          if (terkunci) { counts.terlewatTerkunci++; g.terlewatTerkunci++; }
          if (terkunci && belumTerhubung.length < 150) {
            belumTerhubung.push({
              _id: r._id,
              dateKey: r.dateKey,
              tanggal: r.tanggal,
              storeName: r.storeName,
              area: r.area,
              salesName: sName,
            });
          }
          if (terlewat.length < 150) {
            terlewat.push({
              _id: r._id,
              dateKey: r.dateKey,
              tanggal: r.tanggal,
              storeName: r.storeName,
              area: r.area,
              salesName: sName,
            });
          }
        }
      } else if (status === "CANCELLED") {
        counts.cancelled++;
      }

      perSalesMap.set(salesKey, g);
    }

    const perSales = Array.from(perSalesMap.values())
      .sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.name).localeCompare(String(b.name)));
    terlewat.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.storeName.localeCompare(b.storeName));
    belumTerhubung.sort((a, b) => a.area.localeCompare(b.area) || a.dateKey.localeCompare(b.dateKey));

    return { monthKey: mk, today, counts, perSales, terlewat, belumTerhubung };
  },
});

// ===== EKSPOR BULAN (dipanggil sekali saat tombol Excel ditekan) =====
export const exportMonth = query({
  args: { monthKey: v.string(), area: v.optional(AREA_V) },
  handler: async (ctx, { monthKey, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "owner") return [];

    let rows: any[] = await ctx.db.query("visit_schedules")
      .withIndex("by_month", (q) => q.eq("monthKey", monthKey))
      .collect();
    if (area) rows = rows.filter((r) => r.area === area);

    const visitIds = rows.map((r) => r.visitId).filter(Boolean);
    const visitDocs = await Promise.all(visitIds.map((id: any) => ctx.db.get(id)));
    const vmap = new Map<string, any>();
    visitIds.forEach((id: any, i: number) => vmap.set(String(id), visitDocs[i]));

    const salesIds = Array.from(new Set(rows.map((r) => r.salesId).filter(Boolean).map(String)));
    const salesDocs = await Promise.all(salesIds.map((id) => ctx.db.get(id as any)));
    const smap = new Map<string, any>();
    salesIds.forEach((id, i) => smap.set(id, salesDocs[i]));

    const today = dayKeyWIB();

    const out = rows.map((r) => {
      let status = String(r.status);
      const vv = r.visitId ? vmap.get(String(r.visitId)) : null;
      if (vv && vv.status === "done" && status === "ONGOING") status = "DONE";
      if (status === "PLANNED" && r.dateKey < today) status = "TERLAMBAT";

      return {
        dateKey: r.dateKey,
        tanggal: r.tanggal,
        area: r.area,
        sales: r.salesId ? (smap.get(String(r.salesId))?.name ?? "-") : "Belum dipetakan",
        storeName: r.storeName,
        status,
        statusLabel: STATUS_LABEL[status] ?? status,
        isAdHoc: r.isAdHoc === true,
        noSpk: noSpkOf(r),
        target: r.target ?? null,
        act: r.act ?? null,
        checkinAt: vv?.checkinAt ?? null,
        checkoutAt: vv?.checkoutAt ?? null,
        metWith: vv?.metWith ?? null,
        catatan: r.catatan ?? null,
        // ← BARU: apakah nama toko sudah tertaut ke master Kelola Toko
        terhubung: r.storeId ? "Ya" : "Tidak",
      };
    });

    out.sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      a.sales.localeCompare(b.sales) ||
      a.storeName.localeCompare(b.storeName));

    return out;
  },
});
