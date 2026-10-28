import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";


// ===== SUMBER DATA: tab "Toko_aktif" di spreadsheet yang sama =====
// (Apps Script versi baru: parameter ?sheet=toko_aktif)
export const TOKO_AKTIF_URL =
  "https://script.google.com/macros/s/AKfycbzV3bAYc6uf-xDa5OHNHXfhxViE6cys4wl-HxQ6eMGJKp6B3ZEZPKlooeXJCuVpDnw/exec?sheet=toko_aktif";

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;

function monthKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 7);
}
function nameKeyOf(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

  // "Rp1.043.429" → 1043429 · "1.900.000" → 1900000 · "2346714.2857142857" → 2346714
function parseMoney(raw: any): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return isFinite(raw) ? Math.round(raw) : undefined;

  let s = String(raw).trim().replace(/[^\d.,-]/g, "");
  if (!s) return undefined;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots && commas) {
    s = s.replace(/\./g, "").replace(/,(\d+)$/, ".$1");
  } else if (commas) {
    if (commas > 1) s = s.replace(/,/g, "");
    else {
      const [a, b] = s.split(",");
      s = a.length <= 3 && b.length === 3 ? a + b : a + "." + b;
    }
  } else if (dots) {
    if (dots > 1) s = s.replace(/\./g, "");
    else {
      const [a, b] = s.split(".");
      s = a.length <= 3 && b.length === 3 ? a + b : a + "." + b;
    }
  }

  const n = parseFloat(s);
  if (isNaN(n)) return undefined;
  if (n > 1e12) return undefined;
  return Math.round(n);
}


const ROW_V = v.object({
  area: v.string(),
  storeName: v.string(),
  storeClass: v.optional(v.string()),
  paymentClass: v.optional(v.string()),
  targetRaw: v.optional(v.string()),
  sourceStatus: v.optional(v.string()),
});

// ===== STATUS SINKRON: MULAI =====
export const startRun = internalMutation({
  args: { requestedBy: v.id("users"), monthKey: v.string(), source: v.string() },
  handler: async (ctx, args) => {
    const requestedAt = Date.now();
    const runId = await ctx.db.insert("active_store_sync_runs", {
      requestedBy: args.requestedBy,
      requestedByRole: "supervisor",
      monthKey: args.monthKey,
      source: args.source,
      requestedAt,
      status: "running",
    });
    return { runId, requestedAt };
  },
});

// ===== STATUS SINKRON: SELESAI =====
export const finishRun = internalMutation({
  args: {
    runId: v.id("active_store_sync_runs"),
    status: v.union(v.literal("success"), v.literal("failed")),
    importedCount: v.optional(v.number()),
    updatedCount: v.optional(v.number()),
    deletedOpenCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    const finishedAt = Date.now();
    await ctx.db.patch(runId, { ...rest, finishedAt });
    return { ok: true, finishedAt };
  },
});

// ===== ISI / PERBARUI DAFTAR DARI SHEET =====
// Aturan:
//  • baris baru                → dibuat OPEN
//  • OPEN yang masih di sheet  → diperbarui (nama, kelas, target, status sheet)
//  • OPEN yang hilang di sheet → dihapus
//  • INPG / CLSD               → TIDAK PERNAH disentuh (tidak dihapus, tidak ditimpa)
export const importRows = internalMutation({
  args: { monthKey: v.string(), rows: v.array(ROW_V) },
  handler: async (ctx, { monthKey, rows }) => {
    const now = Date.now();

    // 1) Rapikan isi sheet: buang baris tidak valid, gabung toko dobel
    //    (kalau toko muncul 2x, baris terbawah dianggap paling baru → menang)
    const fresh = new Map<string, any>();
    let rejected = 0;
    for (const r of rows) {
      const area = String(r.area ?? "").trim().toUpperCase();
      const storeName = String(r.storeName ?? "").trim();
      if (!(AREAS as readonly string[]).includes(area) || !storeName) { rejected++; continue; }
      const nk = nameKeyOf(storeName);
      if (!nk) { rejected++; continue; }
      const storeKey = area + "||" + nk;
      fresh.set(storeKey, {
        area: area as "SOLO" | "DIY" | "SEMARANG",
        storeName,
        storeClass: String(r.storeClass ?? "").trim() || undefined,
        paymentClass: String(r.paymentClass ?? "").trim() || undefined,
        target: parseMoney(String(r.targetRaw ?? "")),
        sourceStatus: String(r.sourceStatus ?? "").trim() || undefined,
      });
    }

    // 2) Baris bulan ini yang sudah ada
    const existing = await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (x) => x.eq("monthKey", monthKey))
      .collect();
    const byKey = new Map<string, any>();
    for (const t of existing) byKey.set(t.storeKey, t);

    let inserted = 0, updated = 0, deletedOpen = 0, skipped = 0;

    // 3) Tambah / perbarui
    for (const [storeKey, f] of fresh) {
      const cur = byKey.get(storeKey);
      if (!cur) {
        await ctx.db.insert("active_store_tasks", {
          monthKey,
          area: f.area,
          storeKey,
          storeName: f.storeName,
          storeClass: f.storeClass,
          paymentClass: f.paymentClass,
          target: f.target,
          sourceStatus: f.sourceStatus,
          workflowStatus: "OPEN",
          createdAt: now,
        });
        inserted++;
        continue;
      }
      if (cur.workflowStatus !== "OPEN") { skipped++; continue; } // INPG/CLSD dilindungi
      await ctx.db.patch(cur._id, {
        storeName: f.storeName,
        storeClass: f.storeClass,
        paymentClass: f.paymentClass,
        target: f.target,
        sourceStatus: f.sourceStatus,
        updatedAt: now,
      });
      updated++;
    }

    // 4) OPEN yang sudah tidak ada di sheet → hapus
    for (const t of existing) {
      if (t.workflowStatus !== "OPEN") continue;
      if (fresh.has(t.storeKey)) continue;
      await ctx.db.delete(t._id);
      deletedOpen++;
    }

    return { inserted, updated, deletedOpen, skipped, rejected, total: fresh.size };
  },
});

// ===== STATUS SINKRON TERAKHIR (bulan ini) =====
export const getLastSyncStatus = query({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, { monthKey }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "owner") return null;

    const mk = monthKey ?? monthKeyWIB();
    const runs = await ctx.db.query("active_store_sync_runs")
      .withIndex("by_month_requested", (x) => x.eq("monthKey", mk))
      .order("desc").take(1);
    const last: any = runs[0] ?? null;

    if (!last) {
      return {
        hasSync: false, monthKey: mk, requestedAt: null, finishedAt: null,
        status: "never", importedCount: 0, updatedCount: 0,
        deletedOpenCount: 0, skippedCount: 0, requestedByName: null, error: null,
      };
    }
    return {
      hasSync: true,
      monthKey: mk,
      requestedAt: last.requestedAt,
      finishedAt: last.finishedAt ?? null,
      status: last.status,
      importedCount: last.importedCount ?? 0,
      updatedCount: last.updatedCount ?? 0,
      deletedOpenCount: last.deletedOpenCount ?? 0,
      skippedCount: last.skippedCount ?? 0,
      requestedByName: ((await ctx.db.get(last.requestedBy)) as any)?.name ?? "",
      error: last.error ?? null,
    };
  },
});

// ===== TOMBOL "SINKRON" FU TOKO (hanya supervisor) =====
export const manualSync = action({
  handler: async (ctx): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.runQuery(api.users.getUserById, { userId });
    if (me?.role !== "supervisor") throw new Error("Hanya supervisor yang bisa sinkron FU Toko.");

    const monthKey = monthKeyWIB();
    const { runId } = await ctx.runMutation(internal.activeStoreSync.startRun, {
      requestedBy: userId,
      monthKey,
      source: "Toko_aktif",
    });

    try {
      const res = await fetch(TOKO_AKTIF_URL);
      if (!res.ok) throw new Error("Gagal menarik sheet Toko_aktif (" + res.status + ").");
      const json: any = await res.json().catch(() => null);
      if (!json || json.ok !== true) {
        throw new Error(String(json?.error ?? "Respons sheet Toko_aktif tidak valid."));
      }

      const header: string[] = Array.isArray(json.header)
        ? json.header.map((h: any) => String(h ?? "").trim().toLowerCase())
        : [];
      const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
      const iArea = find("area");
      const iName = find("pelanggan", "nama toko", "nama");
      const iKelas = find("kelas toko");
      const iByr = find("kelas byr", "kelas bayar");
      const iTarget = find("target");
      const iStatus = find("status");

      // ⚠️ Validasi DULU. Kalau header tidak sesuai → GAGAL TOTAL,
      // daftar lama tidak dihapus sama sekali (mencegah data terhapus tanpa sengaja).
      if (iArea < 0 || iName < 0) {
        throw new Error("Header sheet Toko_aktif tidak sesuai — kolom AREA / PELANGGAN tidak ditemukan.");
      }

      const grid: any[][] = Array.isArray(json.rows) ? json.rows : [];
      const rows = grid.map((r) => ({
        area: String(r?.[iArea] ?? ""),
        storeName: String(r?.[iName] ?? ""),
        storeClass: iKelas >= 0 ? String(r?.[iKelas] ?? "") : "",
        paymentClass: iByr >= 0 ? String(r?.[iByr] ?? "") : "",
        targetRaw: iTarget >= 0 ? String(r?.[iTarget] ?? "") : "",
        sourceStatus: iStatus >= 0 ? String(r?.[iStatus] ?? "") : "",
      }));

      const result: any = await ctx.runMutation(internal.activeStoreSync.importRows, { monthKey, rows });

      await ctx.runMutation(internal.activeStoreSync.finishRun, {
        runId,
        status: "success",
        importedCount: result?.inserted ?? 0,
        updatedCount: result?.updated ?? 0,
        deletedOpenCount: result?.deletedOpen ?? 0,
        skippedCount: (result?.skipped ?? 0) + (result?.rejected ?? 0),
      });

      await ctx.runMutation(internal.audit.writeEvent, {
        actorId: userId,
        actorName: me?.name ?? "",
        actorRole: me?.role ?? "",
        action: "activeStore.sync",
        entityType: "active_store_sync_run",
        entityId: String(runId),
        summary: `Sinkron FU Toko ${monthKey} — ${result?.inserted ?? 0} baru, ${result?.updated ?? 0} diperbarui, ${result?.deletedOpen ?? 0} OPEN dihapus.`,
        metadata: { monthKey, source: "Toko_aktif" },
      });

      return { ok: true, monthKey, ...result };
    } catch (err: any) {
      await ctx.runMutation(internal.activeStoreSync.finishRun, {
        runId,
        status: "failed",
        error: String(err?.message ?? err),
      });
      throw new Error(String(err?.message ?? err));
    }
  },
});
