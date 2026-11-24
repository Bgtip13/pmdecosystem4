import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { logAudit } from "./lib/audit";
import { isOwnerLike } from "./lib/roles";
import { parseMoney } from "./lib/money";

// Variabel lingkungan Convex (tipe node tidak dipasang di proyek ini).
declare const process: { env: Record<string, string | undefined> };

// ===== PIUTANG SEMUA AREA =====
// Sumber data:
//   • Jika env PIUTANG_ALL_URL diisi (Convex dashboard → Settings → Environment Variables),
//     dipakai URL itu — mis. Apps Script yang mengirim tab ALL_PIUTANG.
//     Format yang diterima: JSON {header:[...], rows:[[...]]} ATAU CSV.
//   • Jika kosong, dipakai sheet PIUTANG yang sama dengan sinkron harian (sudah memuat
//     SOLO, DIY, SEMARANG), sehingga kartu langsung berfungsi.
// Kolom dikenali dari header (huruf besar/kecil bebas): area, pelanggan|nama toko|nama,
// tanggal|tgl, total, piutang, cicil, retur, usia|umur.

const DEFAULT_URL =
  "https://script.google.com/macros/s/AKfycbzV3bAYc6uf-xDa5OHNHXfhxViE6cys4wl-HxQ6eMGJKp6B3ZEZPKlooeXJCuVpDnw/exec";

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;
type Area = (typeof AREAS)[number];
const CHUNK = 400;

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

type Parsed = {
  area: Area; storeName: string; tanggal?: string;
  total?: number; piutang?: number; cicil?: number; retur?: number; usia?: number;
};

function parseGrid(grid: any[][]): Parsed[] {
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => String(h ?? "").trim().toLowerCase());
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iArea = find(["area"]);
  const iName = find(["pelanggan", "nama toko", "nama"]);
  const iTgl = find(["tanggal", "tgl"]);
  const iTotal = find(["total"]);
  const iPiutang = find(["piutang"]);
  const iCicil = find(["cicil"]);
  const iRetur = find(["retur"]);
  const iUsia = find(["usia", "umur"]);
  if (iArea < 0 || iName < 0) throw new Error("Kolom 'area' dan 'pelanggan' tidak ditemukan di sumber data.");

  const out: Parsed[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < grid.length; i++) {
    const c = grid[i];
    const get = (ix: number) => (ix >= 0 ? String(c[ix] ?? "").trim() : "");
    const areaRaw = get(iArea).toUpperCase();
    const storeName = get(iName);
    if (!(AREAS as readonly string[]).includes(areaRaw) || !storeName) continue;
    const row: Parsed = {
      area: areaRaw as Area,
      storeName,
      tanggal: get(iTgl) || undefined,
      total: parseMoney(get(iTotal)),
      piutang: parseMoney(get(iPiutang)),
      cicil: parseMoney(get(iCicil)),
      retur: parseMoney(get(iRetur)),
      usia: parseInt(get(iUsia), 10) || undefined,
    };
    const key = [row.area, storeName.toLowerCase(), row.tanggal ?? "", row.total ?? "", row.piutang ?? "", row.cicil ?? "", row.retur ?? "", row.usia ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function fetchRows(url: string): Promise<Parsed[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gagal menarik sumber piutang (" + res.status + ").");
  const text = await res.text();
  let grid: any[][];
  try {
    const json: any = JSON.parse(text);
    if (json && json.ok === false) throw new Error(String(json.error ?? "Respons sumber piutang tidak valid."));
    const header: any[] = Array.isArray(json?.header) ? json.header : [];
    const rows: any[][] = Array.isArray(json?.rows) ? json.rows : [];
    grid = header.length ? [header, ...rows] : rows;
  } catch (e: any) {
    if (e instanceof SyntaxError) grid = parseCsv(text);   // bukan JSON → anggap CSV
    else throw e;
  }
  return parseGrid(grid);
}

// ---- tulis snapshot (dipecah supaya tidak melewati batas tulis satu mutation) ----
export const clearChunk = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("piutang_all").take(CHUNK * 5);
    for (const r of rows) await ctx.db.delete(r._id);
    return { deleted: rows.length, more: rows.length === CHUNK * 5 };
  },
});

export const insertChunk = internalMutation({
  args: {
    rows: v.array(v.object({
      area: v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG")),
      storeName: v.string(),
      tanggal: v.optional(v.string()),
      total: v.optional(v.number()),
      piutang: v.optional(v.number()),
      cicil: v.optional(v.number()),
      retur: v.optional(v.number()),
      usia: v.optional(v.number()),
    })),
    syncedAt: v.number(),
  },
  handler: async (ctx, { rows, syncedAt }) => {
    for (const r of rows) await ctx.db.insert("piutang_all", { ...r, syncedAt });
    return rows.length;
  },
});

export const writeMeta = internalMutation({
  args: { syncedAt: v.number(), syncedBy: v.id("users"), source: v.string(), rowCount: v.number() },
  handler: async (ctx, args) => {
    const old = await ctx.db.query("piutang_all_meta").collect();
    for (const o of old) await ctx.db.delete(o._id);
    await ctx.db.insert("piutang_all_meta", args);
    const me: any = await ctx.db.get(args.syncedBy);
    await logAudit(ctx, {
      actorId: args.syncedBy,
      action: "piutang.sync_all",
      entityType: "piutang_all",
      entityId: "snapshot",
      area: me?.area ?? undefined,
      summary: `Sinkron piutang semua area — ${args.rowCount} tagihan (${args.source}).`,
    });
  },
});

// ===== SINKRON (supervisor) =====
export const sync = action({
  args: {},
  handler: async (ctx): Promise<{ rows: number; source: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.runQuery(api.users.getUserById, { userId });
    if (me?.role !== "supervisor") throw new Error("Hanya supervisor yang boleh menyinkronkan piutang semua area.");

    const custom = process.env.PIUTANG_ALL_URL;
    const url = custom && custom.trim() ? custom.trim() : DEFAULT_URL;
    const source = custom && custom.trim() ? "ALL_PIUTANG" : "Sheet PIUTANG";

    const rows = await fetchRows(url);
    if (!rows.length) throw new Error("Sumber piutang tidak berisi baris yang valid.");

    // Hapus snapshot lama hanya setelah data baru berhasil dibaca & valid.
    for (let guard = 0; guard < 50; guard++) {
      const r: any = await ctx.runMutation(internal.piutangAll.clearChunk, {});
      if (!r.more) break;
    }
    const syncedAt = Date.now();
    for (let i = 0; i < rows.length; i += CHUNK) {
      await ctx.runMutation(internal.piutangAll.insertChunk, { rows: rows.slice(i, i + CHUNK), syncedAt });
    }
    await ctx.runMutation(internal.piutangAll.writeMeta, { syncedAt, syncedBy: userId, source, rowCount: rows.length });
    return { rows: rows.length, source };
  },
});

// ===== AKSES =====
async function viewerOk(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const me: any = await ctx.db.get(userId);
  const role = me?.role;
  if (role !== "supervisor" && !isOwnerLike(role)) return null;
  return me;
}

const AGING = [
  { key: "0-30", label: "0–30 hari", max: 30 },
  { key: "31-60", label: "31–60 hari", max: 60 },
  { key: "61-90", label: "61–90 hari", max: 90 },
  { key: ">90", label: ">90 hari", max: Infinity },
] as const;

// ===== RINGKASAN UNTUK KARTU BERANDA =====
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewerOk(ctx);
    if (!me) return null;
    const meta: any = await ctx.db.query("piutang_all_meta").first();
    const rows: any[] = await ctx.db.query("piutang_all").collect();

    const byArea = new Map<string, { area: string; piutang: number; tagihan: number; pelanggan: Set<string> }>();
    for (const a of AREAS) byArea.set(a, { area: a, piutang: 0, tagihan: 0, pelanggan: new Set() });
    const aging = AGING.map((a) => ({ key: a.key as string, label: a.label as string, piutang: 0, tagihan: 0 }));
    let total = 0;
    const all = new Set<string>();

    for (const r of rows) {
      const amt = r.piutang ?? 0;
      const cur = byArea.get(r.area)!;
      cur.piutang += amt; cur.tagihan++; cur.pelanggan.add(r.storeName.toLowerCase());
      all.add(r.area + "|" + r.storeName.toLowerCase());
      total += amt;
      const usia = r.usia ?? 0;
      const b = aging[AGING.findIndex((a) => usia <= a.max)];
      b.piutang += amt; b.tagihan++;
    }

    return {
      hasData: rows.length > 0,
      syncedAt: meta?.syncedAt ?? null,
      source: meta?.source ?? null,
      total,
      tagihan: rows.length,
      pelanggan: all.size,
      areas: Array.from(byArea.values()).map((a) => ({
        area: a.area, piutang: a.piutang, tagihan: a.tagihan, pelanggan: a.pelanggan.size,
      })),
      aging,
    };
  },
});

// ===== DAFTAR PER PELANGGAN (halaman /piutang-semua) =====
export const list = query({
  args: {
    area: v.optional(v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { area, search }) => {
    const me = await viewerOk(ctx);
    if (!me) return [];
    const base = area
      ? ctx.db.query("piutang_all").withIndex("by_area", (q) => q.eq("area", area))
      : ctx.db.query("piutang_all");
    const rows: any[] = await base.collect();
    const needle = (search ?? "").trim().toLowerCase();

    const map = new Map<string, any>();
    for (const r of rows) {
      if (needle && !r.storeName.toLowerCase().includes(needle)) continue;
      const k = r.area + "|" + r.storeName.toLowerCase();
      const cur = map.get(k) ?? { key: k, area: r.area, storeName: r.storeName, piutang: 0, total: 0, cicil: 0, retur: 0, tagihan: 0, usiaMax: 0 };
      cur.piutang += r.piutang ?? 0;
      cur.total += r.total ?? 0;
      cur.cicil += r.cicil ?? 0;
      cur.retur += r.retur ?? 0;
      cur.tagihan++;
      cur.usiaMax = Math.max(cur.usiaMax, r.usia ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.piutang - a.piutang).slice(0, 500);
  },
});
