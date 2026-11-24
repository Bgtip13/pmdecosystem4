import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { parseMoney } from "./lib/money";

// ===== SUMBER DATA: spreadsheet penjualan produk, satu tab per bulan =====
// Nama tab: Januari, Februari, … Desember (tahun = tahun berjalan, WIB).
// Sheet harus dibagikan "Anyone with the link → Viewer".
// Kolom dikenali dari JUDUL kolom (Area, Kabupaten, Kecamatan, Kategori, Brand,
// Nama Barang, Pelanggan, Qty, Penjualan). Kalau judul tidak ketemu, dipakai urutan
// bawaan: Area | Kabupaten | Kecamatan | Kategori | Brand | Nama Barang | Pelanggan | Qty | Penjualan.
export const PRODUK_SHEET_ID = "1yumKCH7XRdxCx0qc_JeIMNw1JaOvt1nbS3fNRym0BRk";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const BATCH = 300; // dokumen per mutation — jauh di bawah batas Convex

// ---------- util ----------
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

const teks = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// Sidik jari sederhana (FNV-1a) — kalau isi CSV sama dengan sinkron sebelumnya, tidak ada yang ditulis ulang.
function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ":" + s.length;
}

function wibNow() {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

async function getCsv(tab: string): Promise<string | null> {
  const url =
    `https://docs.google.com/spreadsheets/d/${PRODUK_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  for (let coba = 0; coba < 2; coba++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      // coba sekali lagi
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

type Agg = {
  tokoKey: string; toko: string; area: string;
  brands: Map<string, { qty: number; rp: number; items: Map<string, { qty: number; rp: number }> }>;
};

// Baca satu tab bulan → agregat per toko → brand → barang.
function aggregate(csv: string) {
  const grid = parseCsv(csv);
  if (grid.length < 2) return null;

  const header = grid[0].map((h) => norm(h));
  const find = (names: string[], fallback: number) => {
    const i = header.findIndex((h) => names.includes(h));
    return i === -1 ? fallback : i;
  };
  const cArea = find(["area"], 0);
  const cBrand = find(["brand", "merk"], 4);
  const cBarang = find(["namabarang", "barang", "nama"], 5);
  const cToko = find(["pelanggan", "toko", "namatoko"], 6);
  const cQty = find(["qty", "kuantitas", "jumlah"], 7);
  const cRp = find(["penjualan", "total", "nominal"], 8);

  const tokos = new Map<string, Agg>();
  for (const r of grid.slice(1)) {
    const toko = teks(r[cToko]);
    if (!toko) continue;
    const area = teks(r[cArea]).toUpperCase() || "LAIN";
    const brand = teks(r[cBrand]) || "TANPA BRAND";
    const barang = teks(r[cBarang]) || "(tanpa nama)";
    const qty = parseMoney(r[cQty]) ?? 0;
    const rp = parseMoney(r[cRp]) ?? 0;

    const tokoKey = `${area}||${nameKey(toko)}`;
    let t = tokos.get(tokoKey);
    if (!t) { t = { tokoKey, toko, area, brands: new Map() }; tokos.set(tokoKey, t); }
    let b = t.brands.get(brand);
    if (!b) { b = { qty: 0, rp: 0, items: new Map() }; t.brands.set(brand, b); }
    b.qty += qty; b.rp += rp;
    const it = b.items.get(barang);
    if (it) { it.qty += qty; it.rp += rp; } else b.items.set(barang, { qty, rp });
  }
  return tokos.size > 0 ? [...tokos.values()] : null;
}

// ---------- mutation penulis (kecil & berbatch) ----------
const RINCIAN_V = v.object({
  tokoKey: v.string(), area: v.string(), bulan: v.string(), brand: v.string(),
  barang: v.string(), toko: v.optional(v.string()), qty: v.number(), rp: v.number(), gen: v.number(),
});
const BULAN_V = v.object({
  tokoKey: v.string(), area: v.string(), bulan: v.string(), qty: v.number(), rp: v.number(),
  brands: v.array(v.object({ brand: v.string(), qty: v.number(), rp: v.number() })),
  gen: v.number(),
});

export const insertRincian = internalMutation({
  args: { rows: v.array(RINCIAN_V) },
  handler: async (ctx, { rows }) => {
    for (const r of rows) await ctx.db.insert("produk_rincian", r);
  },
});

export const insertBulan = internalMutation({
  args: { rows: v.array(BULAN_V) },
  handler: async (ctx, { rows }) => {
    for (const r of rows) await ctx.db.insert("produk_bulan", r);
  },
});

export const upsertToko = internalMutation({
  args: { rows: v.array(v.object({ tokoKey: v.string(), toko: v.string(), area: v.string() })) },
  handler: async (ctx, { rows }) => {
    for (const r of rows) {
      const ada = await ctx.db.query("produk_toko").withIndex("by_key", (q) => q.eq("tokoKey", r.tokoKey)).first();
      if (!ada) await ctx.db.insert("produk_toko", r);
    }
  },
});

export const upsertKatalog = internalMutation({
  args: {
    brands: v.array(v.string()),
    pairs: v.array(v.object({ brand: v.string(), barang: v.string() })),
  },
  handler: async (ctx, { brands, pairs }) => {
    for (const b of brands) {
      const ada = await ctx.db.query("produk_brand").withIndex("by_brand", (q) => q.eq("brand", b)).first();
      if (!ada) await ctx.db.insert("produk_brand", { brand: b });
    }
    for (const p of pairs) {
      const ada = await ctx.db.query("produk_katalog")
        .withIndex("by_brand", (q) => q.eq("brand", p.brand).eq("barang", p.barang)).first();
      if (!ada) await ctx.db.insert("produk_katalog", p);
    }
  },
});

export const getMeta = internalQuery({
  args: { bulan: v.string() },
  handler: async (ctx, { bulan }) =>
    await ctx.db.query("produk_meta").withIndex("by_bulan", (q) => q.eq("bulan", bulan)).first(),
});

// Titik "ganti data" — setelah ini, data gen baru langsung terlihat oleh semua HP.
export const commitMeta = internalMutation({
  args: { bulan: v.string(), gen: v.number(), hash: v.string(), rincianCount: v.number(), tokoCount: v.number() },
  handler: async (ctx, a) => {
    const ada = await ctx.db.query("produk_meta").withIndex("by_bulan", (q) => q.eq("bulan", a.bulan)).first();
    const doc = { ...a, syncedAt: Date.now() };
    if (ada) await ctx.db.replace(ada._id, doc);
    else await ctx.db.insert("produk_meta", doc);
  },
});

// Hapus data gen lama untuk satu bulan, sedikit demi sedikit.
export const purgeOld = internalMutation({
  args: { bulan: v.string(), gen: v.number() },
  handler: async (ctx, { bulan, gen }) => {
    const r = await ctx.db.query("produk_rincian")
      .withIndex("by_bulan_gen", (q) => q.eq("bulan", bulan).lt("gen", gen)).take(BATCH);
    for (const d of r) await ctx.db.delete(d._id);
    const b = await ctx.db.query("produk_bulan")
      .withIndex("by_bulan_gen", (q) => q.eq("bulan", bulan).lt("gen", gen)).take(BATCH);
    for (const d of b) await ctx.db.delete(d._id);
    return { more: r.length === BATCH || b.length === BATCH };
  },
});

// ---------- inti sinkron ----------
async function syncBulan(ctx: any, idx: number, tahun: number, force: boolean, fingerprintPalsu: string | null) {
  const nama = NAMA_BULAN[idx];
  const bulan = `${tahun}-${String(idx + 1).padStart(2, "0")}`;

  const csv = await getCsv(nama);
  if (!csv) return { bulan: nama, status: "gagal dibaca" };
  // Google diam-diam mengembalikan tab PERTAMA kalau nama tab tidak ada → anggap tab belum dibuat.
  if (fingerprintPalsu && csv === fingerprintPalsu) return { bulan: nama, status: "tab tidak ada" };

  const hash = hashText(csv);
  const meta: any = await ctx.runQuery(internal.produkSync.getMeta, { bulan });
  if (!force && meta && meta.hash === hash) return { bulan: nama, status: "tidak berubah" };

  const tokos = aggregate(csv);
  if (!tokos) return { bulan: nama, status: "tab kosong" };

  const gen = Date.now();
  const rincian: any[] = [];
  const bulanDocs: any[] = [];
  for (const t of tokos) {
    let qty = 0, rp = 0;
    const brands: { brand: string; qty: number; rp: number }[] = [];
    for (const [brand, b] of t.brands) {
      qty += b.qty; rp += b.rp;
      brands.push({ brand, qty: b.qty, rp: b.rp });
      for (const [barang, it] of b.items) {
        rincian.push({ tokoKey: t.tokoKey, area: t.area, bulan, brand, barang, toko: t.toko, qty: it.qty, rp: it.rp, gen });
      }
    }
    brands.sort((a, b) => b.rp - a.rp);
    bulanDocs.push({ tokoKey: t.tokoKey, area: t.area, bulan, qty, rp, brands, gen });
  }

  for (let i = 0; i < rincian.length; i += BATCH)
    await ctx.runMutation(internal.produkSync.insertRincian, { rows: rincian.slice(i, i + BATCH) });
  for (let i = 0; i < bulanDocs.length; i += BATCH)
    await ctx.runMutation(internal.produkSync.insertBulan, { rows: bulanDocs.slice(i, i + BATCH) });
  const tokoRows = tokos.map((t) => ({ tokoKey: t.tokoKey, toko: t.toko, area: t.area }));
  for (let i = 0; i < tokoRows.length; i += BATCH)
    await ctx.runMutation(internal.produkSync.upsertToko, { rows: tokoRows.slice(i, i + BATCH) });
  const brandSet = new Set<string>();
  const pairs: { brand: string; barang: string }[] = [];
  const seen = new Set<string>();
  for (const r of rincian) {
    brandSet.add(r.brand);
    const k = r.brand + "||" + r.barang;
    if (!seen.has(k)) { seen.add(k); pairs.push({ brand: r.brand, barang: r.barang }); }
  }
  const brandList = [...brandSet];
  await ctx.runMutation(internal.produkSync.upsertKatalog, { brands: brandList, pairs: [] });
  for (let i = 0; i < pairs.length; i += BATCH)
    await ctx.runMutation(internal.produkSync.upsertKatalog, { brands: [], pairs: pairs.slice(i, i + BATCH) });

  await ctx.runMutation(internal.produkSync.commitMeta, {
    bulan, gen, hash, rincianCount: rincian.length, tokoCount: tokos.length,
  });
  for (let n = 0; n < 200; n++) {
    const r: any = await ctx.runMutation(internal.produkSync.purgeOld, { bulan, gen });
    if (!r.more) break;
  }
  return { bulan: nama, status: "diperbarui", baris: rincian.length, toko: tokos.length };
}

async function jalankan(ctx: any, semua: boolean, force: boolean) {
  const now = wibNow();
  const tahun = now.getUTCFullYear();
  const bulanIni = now.getUTCMonth();
  // Otomatis: bulan berjalan + bulan sebelumnya. "semua": Januari sampai bulan berjalan.
  const dari = semua ? 0 : Math.max(0, bulanIni - 1);
  const palsu = await getCsv("__tab_tidak_ada__");
  const hasil: any[] = [];
  for (let i = dari; i <= bulanIni; i++) hasil.push(await syncBulan(ctx, i, tahun, force, palsu));
  return { ok: true, hasil };
}

// Cron: dipanggil server, HP tidak ikut bekerja.
export const autoSync = internalAction({
  handler: async (ctx): Promise<any> => jalankan(ctx, false, false),
});

// Tombol "Sinkron" di layar (supervisor / owner).
export const manualSync = action({
  args: { semua: v.optional(v.boolean()) },
  handler: async (ctx, { semua }): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.runQuery(api.users.getUserById, { userId });
    if (me?.role !== "supervisor" && me?.role !== "owner") {
      throw new Error("Hanya supervisor / owner yang bisa menyinkron.");
    }
    return jalankan(ctx, !!semua, !!semua);
  },
});
