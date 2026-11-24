import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isOwnerLike } from "./lib/roles";

// Semua query di sini kecil dan bertahap: toko → bulan → brand → barang.
// Role field / telemarketing hanya melihat area sendiri; supervisor & owner melihat semua.
// PPIC tidak punya akses.

async function akses(ctx: any): Promise<{ semuaArea: boolean; area: string } | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const me: any = await ctx.db.get(userId);
  const role = me?.role;
  if (role === "supervisor" || isOwnerLike(role)) return { semuaArea: true, area: "" };
  if (role === "field" || role === "telemarketing") {
    const area = String(me?.area ?? "").toUpperCase();
    return area ? { semuaArea: false, area } : null;
  }
  return null;
}

const tokoBolehDilihat = (a: { semuaArea: boolean; area: string }, tokoKey: string) =>
  a.semuaArea || tokoKey.startsWith(a.area + "||");

// gen yang berlaku per bulan (maks 12 dokumen)
async function genAktif(ctx: any): Promise<Map<string, number>> {
  const metas = await ctx.db.query("produk_meta").collect();
  return new Map<string, number>(metas.map((m: any) => [m.bulan, m.gen]));
}

// Langkah 1 — cari toko. Kosong / < 2 huruf → tidak membaca apa pun.
export const cariToko = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const a = await akses(ctx);
    if (!a) return [];
    const text = q.trim();
    if (text.length < 2) return [];
    const rows = await ctx.db
      .query("produk_toko")
      .withSearchIndex("search_toko", (s) =>
        a.semuaArea ? s.search("toko", text) : s.search("toko", text).eq("area", a.area),
      )
      .take(20);
    return rows.map((r) => ({ tokoKey: r.tokoKey, toko: r.toko, area: r.area }));
  },
});

// Langkah 2 — bulan yang ada transaksinya untuk toko ini (maks 12 dokumen).
export const bulanToko = query({
  args: { tokoKey: v.string() },
  handler: async (ctx, { tokoKey }) => {
    const a = await akses(ctx);
    if (!a || !tokoBolehDilihat(a, tokoKey)) return [];
    const gen = await genAktif(ctx);
    const rows = await ctx.db
      .query("produk_bulan")
      .withIndex("by_toko_bulan", (q) => q.eq("tokoKey", tokoKey))
      .collect();
    return rows
      .filter((r) => gen.get(r.bulan) === r.gen)
      .map((r) => ({ bulan: r.bulan, qty: r.qty, rp: r.rp, jumlahBrand: r.brands.length }))
      .sort((x, y) => x.bulan.localeCompare(y.bulan));
  },
});

// Langkah 3 — brand yang diambil toko ini pada bulan terpilih (1 dokumen).
export const brandToko = query({
  args: { tokoKey: v.string(), bulan: v.string() },
  handler: async (ctx, { tokoKey, bulan }) => {
    const a = await akses(ctx);
    if (!a || !tokoBolehDilihat(a, tokoKey)) return null;
    const gen = await genAktif(ctx);
    const doc = await ctx.db
      .query("produk_bulan")
      .withIndex("by_toko_bulan", (q) => q.eq("tokoKey", tokoKey).eq("bulan", bulan))
      .first();
    if (!doc || gen.get(doc.bulan) !== doc.gen) return null;
    return { qty: doc.qty, rp: doc.rp, brands: doc.brands };
  },
});

// Langkah 4 — rincian barang untuk satu brand.
export const rincianToko = query({
  args: { tokoKey: v.string(), bulan: v.string(), brand: v.string() },
  handler: async (ctx, { tokoKey, bulan, brand }) => {
    const a = await akses(ctx);
    if (!a || !tokoBolehDilihat(a, tokoKey)) return [];
    const gen = await genAktif(ctx);
    const rows = await ctx.db
      .query("produk_rincian")
      .withIndex("by_toko_bulan_brand", (q) => q.eq("tokoKey", tokoKey).eq("bulan", bulan).eq("brand", brand))
      .collect();
    return rows
      .filter((r) => gen.get(r.bulan) === r.gen)
      .map((r) => ({ barang: r.barang, qty: r.qty, rp: r.rp }))
      .sort((x, y) => y.rp - x.rp);
  },
});

// Keterangan "diperbarui pukul …" di layar.
export const statusSync = query({
  args: {},
  handler: async (ctx) => {
    const a = await akses(ctx);
    if (!a) return null;
    const metas = await ctx.db.query("produk_meta").collect();
    if (metas.length === 0) return { updatedAt: null as number | null, bulan: [] as string[] };
    return {
      updatedAt: Math.max(...metas.map((m) => m.syncedAt)) as number | null,
      bulan: metas.map((m) => m.bulan).sort(),
    };
  },
});

// ===== PENCARIAN PER PRODUK: brand → barang → toko =====

// Daftar brand (puluhan–ratusan nama kecil). Disaring di HP saat mengetik, jadi tanpa panggilan per huruf.
export const daftarBrand = query({
  args: {},
  handler: async (ctx) => {
    const a = await akses(ctx);
    if (!a) return [] as string[];
    const rows = await ctx.db.query("produk_brand").collect();
    return rows.map((r) => r.brand).sort((x, y) => x.localeCompare(y));
  },
});

// Barang milik satu brand (semua bulan).
export const barangBrand = query({
  args: { brand: v.string() },
  handler: async (ctx, { brand }) => {
    const a = await akses(ctx);
    if (!a) return [] as string[];
    const rows = await ctx.db
      .query("produk_katalog")
      .withIndex("by_brand", (q) => q.eq("brand", brand))
      .take(500);
    return rows.map((r) => r.barang).sort((x, y) => x.localeCompare(y));
  },
});

// Toko yang mengambil satu barang pada satu bulan, beserta qty & nominal.
export const tokoProduk = query({
  args: { brand: v.string(), barang: v.string(), bulan: v.string() },
  handler: async (ctx, { brand, barang, bulan }) => {
    const a = await akses(ctx);
    if (!a) return { qty: 0, rp: 0, rows: [] as any[], terpotong: false };
    const gen = await genAktif(ctx);
    const rows = await ctx.db
      .query("produk_rincian")
      .withIndex("by_bulan_brand_barang", (q: any) => {
        let r = q.eq("bulan", bulan).eq("brand", brand).eq("barang", barang);
        if (!a.semuaArea) r = r.eq("area", a.area);
        return r;
      })
      .take(501);
    const aktif = rows.filter((r) => gen.get(r.bulan) === r.gen).slice(0, 500);
    const list = aktif
      .map((r) => ({
        tokoKey: r.tokoKey,
        toko: r.toko ?? r.tokoKey.split("||")[1] ?? r.tokoKey,
        area: r.area,
        qty: r.qty,
        rp: r.rp,
      }))
      .sort((x, y) => y.rp - x.rp);
    return {
      qty: list.reduce((s, r) => s + r.qty, 0),
      rp: list.reduce((s, r) => s + r.rp, 0),
      rows: list,
      terpotong: rows.length > 500,
    };
  },
});
