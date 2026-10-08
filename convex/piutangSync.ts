import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseMoney } from "./lib/money";


// Sumber data LIVE lewat Apps Script (tanpa cache Google publish).
export const PIUTANG_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzV3bAYc6uf-xDa5OHNHXfhxViE6cys4wl-HxQ6eMGJKp6B3ZEZPKlooeXJCuVpDnw/exec?fmt=csv";

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;

// Hari ini dalam zona WIB (UTC+7) → YYYY-MM-DD
function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Parser CSV benar (tahan koma & kutip di dalam sel)
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

// Kunci tanding nama toko (dipakai supaya "Toko A" == " toko a ")
const keyStore = (area: string, storeName: string) =>
  `${area}||${String(storeName ?? "").trim().toLowerCase()}`;

// ===== IMPORT DARI SHEETS =====
// Aturan:
//   1. Sinkron hanya menyetel ulang tugas yang BELUM dikerjakan (OPEN).
//   2. Baris yang sudah DIKERJAKAN (status "done", apa pun workflowStatus-nya),
//      INPG (menunggu review), atau CLSD TIDAK dihapus dan TIDAK diduplikasi.
//      → tanpa aturan ini, sync membuat baris OPEN baru yang selalu kosong.
//   3. Sheet kosong = daftar tugas hari itu kosong (riwayat tetap aman).
export const importRows = internalMutation({
  args: { csv: v.string(), day: v.string() },
  handler: async (ctx, { csv, day }): Promise<any> => {
    const grid = parseCsv(csv);

    // 1) Ambil semua baris tugas hari itu
    const rows = await ctx.db.query("piutang_tasks")
      .withIndex("by_day", (q) => q.eq("day", day))
      .collect();

    // Toko yang sudah dikerjakan / menunggu review / disetujui → jangan diganggu
    const protectedKeys = new Set<string>();
    for (const r of rows as any[]) {
      if (r.workflowStatus === "INPG" || r.workflowStatus === "CLSD" || r.status === "done") {
        protectedKeys.add(keyStore(r.area, r.storeName));
      }
    }

    // 2) Hapus sisa tugas hari itu yang belum dikerjakan
    //    (OPEN / data lama tanpa workflowStatus). Riwayat tetap utuh.
    let deleted = 0;
    for (const r of rows as any[]) {
      if (r.workflowStatus === "INPG" || r.workflowStatus === "CLSD") continue;
      if (r.status === "done") continue;                      // jangan sentuh riwayat
      await ctx.db.delete(r._id);
      deleted++;
    }

    // 3) Isi ulang persis dari CSV
    if (grid.length < 2) {
      return { inserted: 0, deleted, total: 0, skippedInProgress: protectedKeys.size };
    }

    const clean = (c: string) => c.trim();
    const header = grid[0].map((h) => clean(h).toLowerCase());
    const find = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iArea = find(["area"]);
    const iName = find(["pelanggan", "nama toko", "nama"]);
    const iTgl = find(["tanggal", "tgl"]);
    const iTotal = find(["total"]);
    const iPiutang = find(["piutang"]);
    const iCicil = find(["cicil"]);
    const iRetur = find(["retur"]);            // ← BARU: kolom Retur dari sheet
    const iUsia = find(["usia", "umur"]);
    if (iArea < 0 || iName < 0) {
      return { inserted: 0, deleted, total: 0, skippedInProgress: protectedKeys.size };
    }

    let inserted = 0;
    const seen = new Set<string>(); // toko dobel dalam 1 file → 1 tugas
    for (let i = 1; i < grid.length; i++) {
      const c = grid[i];
      const get = (ix: number) => (ix >= 0 ? clean(c[ix] ?? "") : "");
      const areaRaw = get(iArea).toUpperCase().trim();
      const storeName = get(iName);
      if (!(AREAS as readonly string[]).includes(areaRaw) || !storeName) continue;
      const area = areaRaw as "SOLO" | "DIY" | "SEMARANG";
      const key = keyStore(area, storeName);
      if (seen.has(key)) continue;
      if (protectedKeys.has(key)) continue;   // sudah dikerjakan / menunggu review
      seen.add(key);

      await ctx.db.insert("piutang_tasks", {
        area,
        storeName,
        tanggal: get(iTgl) || undefined,
        total: parseMoney(get(iTotal)),
        piutang: parseMoney(get(iPiutang)),
        cicil: parseMoney(get(iCicil)),
        retur: parseMoney(get(iRetur)),        // ← BARU: nominal apa adanya dari sheet
        usia: parseInt(get(iUsia), 10) || undefined,
        day,
        status: "pending",
        workflowStatus: "OPEN",
        createdAt: Date.now(),
      });
      inserted++;
    }

    return { inserted, deleted, total: seen.size, skippedInProgress: protectedKeys.size };
  },
});

// ===== STATUS SINKRON: MULAI SATU RUN =====
export const startRun = internalMutation({
  args: {
    requestedBy: v.id("users"),
    requestedByRole: v.union(v.literal("supervisor"), v.literal("telemarketing")),
  },
  handler: async (ctx, args) => {
    const requestedAt = Date.now();
    const runId = await ctx.db.insert("piutang_sync_runs", {
      requestedBy: args.requestedBy,
      requestedByRole: args.requestedByRole,
      requestedAt,
      status: "running",
      source: "manual",
    });
    return { runId, requestedAt };
  },
});

// ===== STATUS SINKRON: SELESAIKAN RUN =====
export const finishRun = internalMutation({
  args: {
    runId: v.id("piutang_sync_runs"),
    status: v.union(v.literal("success"), v.literal("failed")),
    importedCount: v.optional(v.number()),
    validCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    const finishedAt = Date.now();
    await ctx.db.patch(runId, { ...rest, finishedAt });
    return { ok: true, finishedAt };
  },
});

// ===== STATUS SINKRON TERAKHIR (acuan: SUPERVISOR yang menekan sinkron) =====
export const getLastSyncStatus = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "telemarketing") return null;

    const runs = await ctx.db.query("piutang_sync_runs")
      .withIndex("by_role_requested", (q) => q.eq("requestedByRole", "supervisor"))
      .order("desc").take(1);
    const last: any = runs[0] ?? null;

    if (!last) {
      return {
        hasSync: false, requestedAt: null, finishedAt: null, status: "never",
        importedCount: 0, validCount: 0, rejectedCount: 0,
        requestedByName: null, error: null,
      };
    }
    return {
      hasSync: true,
      requestedAt: last.requestedAt,
      finishedAt: last.finishedAt ?? null,
      status: last.status,
      importedCount: last.importedCount ?? 0,
      validCount: last.validCount ?? 0,
      rejectedCount: last.rejectedCount ?? 0,
      requestedByName: ((await ctx.db.get(last.requestedBy)) as any)?.name ?? "",
      error: last.error ?? null,
    };
  },
});
