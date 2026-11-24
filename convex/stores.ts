import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAudit } from "./lib/audit";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const ROLE_ALLOW_VIEW = ["supervisor", "owner", "hr", "akunting", "field", "telemarketing"];
// Batas baris sekali baca untuk layar Kelola Toko (pengaman Database I/O)
const MANAGE_TAKE = 150;


// Batas atas baris yang dibaca sekaligus (pengaman Database I/O)
const MAX_ROWS = 400;
// Batas baris untuk unduhan CSV master toko (bukan tampilan layar)
const EXPORT_CAP = 2000;

// Field yang dipakai daftar ringkas SPK Sales (payload kecil)
const RINGKAS = (s: any) => ({
  _id: s._id,
  name: s.name,
  address: s.address,
  area: s.area,
  lat: s.lat,
  lng: s.lng,
});

// ===== IMPOR DATA (khusus SUPERVISOR) =====
// mode "tambah" : toko baru ditambah; nama + area yang sudah ada DILEWATI (tanpa duplikat).
// mode "ganti"  : data toko yang ada di file DIPERBARUI & diaktifkan, toko baru ditambah.
//                 Toko lama yang tidak ada di file dinonaktifkan lewat finishImportReplace
//                 (bukan dihapus, supaya riwayat kunjungan/jadwal/FU tetap utuh).
const keyOf = (area: any, name: any) => `${String(area ?? "")}|${String(name ?? "").trim().toLowerCase()}`;

async function assertSupervisor(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Belum login.");
  const me = await ctx.db.get(userId);
  if ((me as any)?.role !== "supervisor") throw new Error("Import toko hanya untuk supervisor.");
  return { userId, me };
}

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
    mode: v.optional(v.union(v.literal("tambah"), v.literal("ganti"))),
    batchId: v.optional(v.string()),
  },
  handler: async (ctx, { stores, mode, batchId }) => {
    await assertSupervisor(ctx);
    const ganti = mode === "ganti";
    if (ganti && !batchId) throw new Error("batchId wajib untuk mode ganti.");

    // HEMAT: sekali baca → dipetakan di memori (nama+area → dokumen).
    const all = await ctx.db.query("stores").collect();
    const existing = new Map<string, any>();
    for (const r of all as any[]) existing.set(keyOf(r.area, r.name), r);

    let added = 0;
    let skipped = 0;
    let updated = 0;
    for (const s of stores) {
      const name = String(s.name ?? "").trim();
      if (!name) { skipped++; continue; }
      const key = keyOf(s.area, name);
      const ada = existing.get(key);

      if (ada) {
        if (!ganti) { skipped++; continue; }
        await ctx.db.patch(ada._id, {
          address: s.address || ada.address || "",
          ...(s.phone !== undefined ? { phone: s.phone } : {}),
          ...(s.pic !== undefined ? { pic: s.pic } : {}),
          ...(s.lat !== undefined && s.lng !== undefined
            ? { lat: s.lat, lng: s.lng, latSource: "supervisor" as const }
            : {}),
          status: "active",
          importBatch: batchId,
          updatedAt: Date.now(),
        } as any);
        updated++;
        continue;
      }

      const id = await ctx.db.insert("stores", {
        name,
        address: s.address ?? "",
        phone: s.phone ?? "",
        pic: s.pic ?? "",
        area: s.area,
        lat: s.lat,
        lng: s.lng,
        latSource: s.lat !== undefined ? "supervisor" : "unverified",
        status: "active",
        ...(ganti ? { importBatch: batchId } : {}),
        createdAt: Date.now(),
      } as any);
      existing.set(key, { _id: id, name, area: s.area }); // cegah duplikat di dalam file yang sama
      added++;
    }
    return { added, skipped, updated };
  },
});

// Pratinjau SEBELUM impor: berapa toko baru, berapa yang sudah ada, dan (mode ganti)
// berapa toko aktif yang akan dinonaktifkan karena tidak ada di file.
export const previewImport = query({
  args: {
    rows: v.array(v.object({ name: v.string(), area: AREA })),
  },
  handler: async (ctx, { rows }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") return null;

    const all = await ctx.db.query("stores").collect();
    const known = new Map<string, any>();
    for (const r of all as any[]) known.set(keyOf(r.area, r.name), r);

    const inFile = new Set<string>();
    let baru = 0, sama = 0, dobelDiFile = 0;
    for (const r of rows) {
      const name = r.name.trim();
      if (!name) continue;
      const k = keyOf(r.area, name);
      if (inFile.has(k)) { dobelDiFile++; continue; }
      inFile.add(k);
      if (known.has(k)) sama++; else baru++;
    }
    let akanDinonaktifkan = 0;
    for (const [k, r] of known) if (r.status === "active" && !inFile.has(k)) akanDinonaktifkan++;
    return { baru, sama, dobelDiFile, akanDinonaktifkan, totalToko: all.length };
  },
});

// Langkah akhir mode "ganti": nonaktifkan toko aktif yang TIDAK tersentuh impor ini.
export const finishImportReplace = mutation({
  args: { batchId: v.string() },
  handler: async (ctx, { batchId }) => {
    const { userId } = await assertSupervisor(ctx);
    const aktif = await ctx.db.query("stores").withIndex("by_status", (q: any) => q.eq("status", "active")).collect();
    let disabled = 0;
    for (const r of aktif as any[]) {
      if (r.importBatch === batchId) continue;
      await ctx.db.patch(r._id, { status: "disabled", updatedAt: Date.now() } as any);
      disabled++;
    }
    await logAudit(ctx, {
      actorId: userId,
      action: "store.import_replace",
      entityType: "store",
      entityId: batchId,
      summary: `Impor toko mode ganti semua: ${disabled} toko lama dinonaktifkan.`,
      after: { disabled, batchId },
    });
    return { disabled };
  },
});

// Dipakai layar lain (Kelola Toko, modal kunjungan manual).
// ⚠️ Untuk daftar toko di SPK Sales, pakai listStoresPage / searchStores (jauh lebih ringan).
export const listStores = query({
  args: { area: v.optional(AREA) },
  handler: async (ctx, { area }) => {
    // HEMAT: dulu collect() TANPA batas (seluruh tabel, dokumen penuh) → 275 MB.
    const rows = area
      ? await ctx.db.query("stores")
          .withIndex("by_area_status_name", (q) => q.eq("area", area as any))
          .take(MAX_ROWS)
      : await ctx.db.query("stores")
          .withIndex("by_status_name", (q) => q.eq("status", "active"))
          .take(MAX_ROWS);
    return rows.sort((a: any, b: any) => a.name.localeCompare(b.name));
  },
});

// ===== SPK SALES: daftar bertahap (30, 60, 90, ...) — urut nama, payload ringkas =====
export const listStoresPage = query({
  args: {
    area: v.optional(AREA),
    take: v.optional(v.number()),
  },
  handler: async (ctx, { area, take }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const n = Math.min(Math.max(Math.floor(take ?? 30), 1), 600);

    const rows = area
      ? await ctx.db.query("stores")
          .withIndex("by_area_status_name", (q) => q.eq("area", area as any).eq("status", "active"))
          .take(n)
      : await ctx.db.query("stores")
          .withIndex("by_status_name", (q) => q.eq("status", "active"))
          .take(n);

    return rows.map(RINGKAS);
  },
});

// ===== SPK SALES: pencarian nama toko di SERVER (search index, bukan scan) =====
export const searchStores = query({
  args: {
    q: v.string(),
    area: v.optional(AREA),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { q, area, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const keyword = (q ?? "").trim();
    if (keyword.length < 2) return [];
    const n = Math.min(Math.max(Math.floor(limit ?? 30), 1), 50);

    const rows = await ctx.db
      .query("stores")
      .withSearchIndex("by_name", (s) => {
        const base: any = s.search("name", keyword).eq("status", "active");
        return area ? base.eq("area", area as any) : base;
      })
      .take(n);

    return rows.map(RINGKAS);
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

    const phone = (args.phone || "").trim();
    if (phone) {
      // HEMAT: pakai index by_phone — dulu scan SELURUH tabel tiap toko didaftarkan
      const byPhone = await ctx.db.query("stores")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .first();
      if (byPhone) throw new Error("No HP sudah terdaftar untuk: " + byPhone.name);
    }

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
    await logAudit(ctx, {
      actorId: userId, action: "store.create", entityType: "store", entityId: String(id),
      area, summary: `Menambah toko baru: ${args.name}`, after: { name: args.name, area },
    });
    return { storeId: id };
  },
});

// ===== KELOLA TOKO (lihat: supervisor/owner/field/telemarketing — ubah: supervisor) =====
export const listManageStores = query({
  args: {
    q: v.optional(v.string()),
    area: v.optional(v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"))),
  },
  handler: async (ctx, { q, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (!ROLE_ALLOW_VIEW.includes(role)) return [];

    const keyword = (q ?? "").trim();

    // Field & telemarketing hanya melihat toko area sendiri (read-only)
    let effArea = area;
    if (role === "field" || role === "telemarketing") {
      effArea = (me as any)?.area;
      if (!effArea) return [];
    }

    const byName = (rows: any[]) =>
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    // 1) Kata kunci berupa angka → cari No HP pakai index by_phone (prefix), bukan scan
    if (keyword.length >= 3 && /^[0-9+\-\s()]+$/.test(keyword)) {
      const rows = await ctx.db.query("stores")
        .withIndex("by_phone", (x) => x.gte("phone", keyword).lt("phone", keyword + "\uffff"))
        .take(MANAGE_TAKE);
      return byName(effArea ? rows.filter((r: any) => r.area === effArea) : rows);
    }

    // 2) Kata kunci teks → search index by_name (bukan collect + filter di memori)
    if (keyword.length >= 2) {
      const rows = await ctx.db.query("stores")
        .withSearchIndex("by_name", (s: any) => {
          const base = s.search("name", keyword);
          return effArea ? base.eq("area", effArea) : base;
        })
        .take(MANAGE_TAKE);
      return byName(rows);
    }

    // 3) Tanpa kata kunci → dibatasi take(), urut nama (aktif + nonaktif)
    if (effArea) {
      return byName(await ctx.db.query("stores")
        .withIndex("by_area", (x) => x.eq("area", effArea))
        .take(MANAGE_TAKE));
    }
    const active = await ctx.db.query("stores")
      .withIndex("by_status", (x) => x.eq("status", "active")).take(MANAGE_TAKE);
    const disabled = await ctx.db.query("stores")
      .withIndex("by_status", (x) => x.eq("status", "disabled")).take(MANAGE_TAKE);
    return byName([...active, ...disabled]).slice(0, MANAGE_TAKE);
  },
});


// ===== EKSPOR MASTER TOKO (CSV) — KHUSUS SUPERVISOR =====
// Layar Kelola Toko hanya membaca 150 baris (MANAGE_TAKE) supaya ringan.
// Untuk unduhan, seluruh master dibaca bertahap sampai EXPORT_CAP,
// lalu difilter dengan aturan yang sama seperti layar (area, status, kata kunci).
export const listStoresForExport = query({
  args: {
    q: v.optional(v.string()),
    area: v.optional(AREA),
    status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, { q, area, status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { rows: [], truncated: false, total: 0 };
    const me = await ctx.db.get(userId);
    // Ekspor data toko hanya untuk supervisor (sama seperti import).
    if ((me as any)?.role !== "supervisor") return { rows: [], truncated: false, total: 0 };

    const effArea = area;

    // Convex hanya mengizinkan SATU query terpaginasinya per fungsi, jadi jangan
    // loop paginate(). Baca sekali dengan batas EXPORT_CAP + 1 baris: kalau
    // kelebihan satu baris, berarti datanya terpotong.
    const base = effArea
      ? ctx.db.query("stores").withIndex("by_area", (x) => x.eq("area", effArea as any))
      : ctx.db.query("stores");
    const raw = (await base.take(EXPORT_CAP + 1)) as any[];
    const truncated = raw.length > EXPORT_CAP;
    if (truncated) raw.length = EXPORT_CAP;

    const keyword = (q ?? "").trim().toLowerCase();
    const rows = raw
      .filter((s: any) => (status ? s.status === status : true))
      .filter(
        (s: any) =>
          !keyword ||
          [s.name, s.address, s.phone, s.pic].some((f: any) =>
            String(f ?? "").toLowerCase().includes(keyword)
          )
      )
      .sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
      .slice(0, EXPORT_CAP)
      .map((s: any) => ({
        _id: String(s._id),
        name: s.name ?? "",
        area: s.area ?? "",
        address: s.address ?? "",
        phone: s.phone ?? "",
        pic: s.pic ?? "",
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        status: s.status ?? "active",
        latSource: s.latSource ?? "",
        createdAt: s.createdAt ?? 0,
        updatedAt: s.updatedAt ?? 0,
      }));

    return { rows, truncated, total: raw.length };
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
      // HEMAT: index by_phone
      const dup = await ctx.db.query("stores")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
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
    await logAudit(ctx, {
      actorId: userId, action: "store.update", entityType: "store", entityId: String(args.storeId),
      area: args.area, summary: `Mengubah data toko: ${name}`,
      before: { name: (store as any).name, status: (store as any).status, area: (store as any).area },
      after: { name, status: args.status, area: args.area },
    });
    return { ok: true };
  },
});
