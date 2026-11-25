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
// Sumber data: tab ALL_PIUTANG di Google Sheet yang sama, lewat Apps Script
// (parameter ?sheet=ALL_PIUTANG, pola yang sama dengan ?sheet=toko_aktif).
// Respons yang diterima: JSON {ok, header:[...], rows:[[...]]} atau CSV.
// URL bisa diganti lewat variabel lingkungan Convex PIUTANG_ALL_URL (opsional).
// Kolom dikenali dari header (huruf besar/kecil bebas) — lihat HEADER_* di bawah.

const DEFAULT_URL =
  "https://script.google.com/macros/s/AKfycbzV3bAYc6uf-xDa5OHNHXfhxViE6cys4wl-HxQ6eMGJKp6B3ZEZPKlooeXJCuVpDnw/exec?sheet=ALL_PIUTANG";

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

const HEADER_AREA = ["area", "wilayah"];
const HEADER_NAME = ["pelanggan", "nama pelanggan", "nama toko", "toko", "nama", "customer"];
const HEADER_TGL = ["tanggal", "tgl", "tanggal tagihan", "tgl tagihan", "tgl faktur", "tanggal faktur"];
const HEADER_TOTAL = ["total", "total tagihan", "nilai tagihan", "nilai faktur"];
const HEADER_PIUTANG = ["piutang", "sisa piutang", "sisa tagihan", "sisa", "saldo", "outstanding"];
const HEADER_CICIL = ["cicil", "cicilan", "bayar", "pembayaran", "terbayar"];
const HEADER_RETUR = ["retur"];
const HEADER_USIA = ["usia", "umur", "usia piutang", "umur piutang", "aging", "hari"];

type ParseResult = { rows: Parsed[]; skipped: number; header: string[]; sampleAreas: string[] };

function parseGrid(grid: any[][]): ParseResult {
  if (grid.length < 2) return { rows: [], skipped: 0, header: [], sampleAreas: [] };
  const header = grid[0].map((h) => String(h ?? "").trim().toLowerCase());
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iArea = find(HEADER_AREA);
  const iName = find(HEADER_NAME);
  const iTgl = find(HEADER_TGL);
  const iTotal = find(HEADER_TOTAL);
  const iPiutang = find(HEADER_PIUTANG);
  const iCicil = find(HEADER_CICIL);
  const iRetur = find(HEADER_RETUR);
  const iUsia = find(HEADER_USIA);
  if (iArea < 0 || iName < 0) {
    throw new Error(
      `Header tab ALL_PIUTANG tidak sesuai — kolom AREA / PELANGGAN tidak ditemukan. Header terbaca: ${header.filter(Boolean).join(", ") || "(kosong)"}.`
    );
  }
  if (iPiutang < 0) {
    throw new Error(
      `Kolom PIUTANG tidak ditemukan di tab ALL_PIUTANG. Header terbaca: ${header.filter(Boolean).join(", ")}.`
    );
  }

  const out: Parsed[] = [];
  let skipped = 0;
  const sampleAreas = new Set<string>();
  for (let i = 1; i < grid.length; i++) {
    const c = grid[i] ?? [];
    const txt = (ix: number) => (ix >= 0 ? String(c[ix] ?? "").trim() : "");
    const areaRaw = txt(iArea).toUpperCase();
    const storeName = txt(iName);
    if (!areaRaw && !storeName) continue;                       // baris kosong
    if (!(AREAS as readonly string[]).includes(areaRaw) || !storeName) {
      skipped++;
      if (areaRaw && sampleAreas.size < 5) sampleAreas.add(areaRaw);
      continue;
    }
    out.push({
      area: areaRaw as Area,
      storeName,
      tanggal: txt(iTgl) || undefined,
      total: iTotal >= 0 ? parseMoney(c[iTotal]) : undefined,
      piutang: parseMoney(c[iPiutang]),
      cicil: iCicil >= 0 ? parseMoney(c[iCicil]) : undefined,
      retur: iRetur >= 0 ? parseMoney(c[iRetur]) : undefined,
      usia: iUsia >= 0 ? parseInt(txt(iUsia), 10) || undefined : undefined,
    });
  }
  return { rows: out, skipped, header, sampleAreas: Array.from(sampleAreas) };
}

async function fetchRows(url: string): Promise<ParseResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gagal menarik tab ALL_PIUTANG (" + res.status + ").");
  const text = await res.text();
  let grid: any[][];
  try {
    const json: any = JSON.parse(text);
    if (json && json.ok === false) throw new Error(String(json.error ?? "Respons tab ALL_PIUTANG tidak valid."));
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
    const source = "ALL_PIUTANG";

    const parsed = await fetchRows(url);
    const rows = parsed.rows;
    if (!rows.length) {
      throw new Error(
        parsed.skipped > 0
          ? `Tab ALL_PIUTANG terbaca tetapi ${parsed.skipped} baris dilewati — area harus SOLO / DIY / SEMARANG${parsed.sampleAreas.length ? ` (nilai yang ditemukan: ${parsed.sampleAreas.join(", ")})` : ""}.`
          : "Tab ALL_PIUTANG tidak berisi baris data."
      );
    }

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
