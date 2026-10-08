import { action, internalAction, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { parseMoney } from "./lib/money";


// ===== SUMBER DATA: tab "JADWAL" di spreadsheet yang sama =====
export const JADWAL_URL =
  "https://script.google.com/macros/s/AKfycbzV3bAYc6uf-xDa5OHNHXfhxViE6cys4wl-HxQ6eMGJKp6B3ZEZPKlooeXJCuVpDnw/exec?sheet=jadwal";

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;

// Sistem baru mulai 1 Oktober; September tetap memakai alur lama.
const START_DATE_KEY = "2026-10-01";

// Maksimal baris "Dibatalkan" lama yang dibersihkan sekali sync (sisanya menyusul sync berikutnya)
const PURGE_MAX = 300;

const pad2 = (n: number) => String(n).padStart(2, "0");

function nameKeyOf(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ===== PENCOCOKAN LONGGAR: nama sheet ≠ nama master, tapi jelas toko yang sama =====
// Dipakai HANYA kalau pencocokan persis gagal. Kandidat diambil dari daftar toko
// yang SUDAH dibaca di importRows → tanpa tambahan I/O sama sekali.
// Sengaja konservatif: minimal 2 kata, dan pemenangnya harus TUNGGAL.
function looseCandidates(nk: string, areaStores: any[]) {
  const tok = nk.split(" ").filter(Boolean);
  if (tok.length < 2) return [];                 // 1 kata ("indomaret") → jangan menebak
  const set = new Set(tok);

  const scored: { s: any; score: number }[] = [];
  for (const s of areaStores) {
    const mk = nameKeyOf(s.name);
    if (!mk) continue;
    const mtok = mk.split(" ").filter(Boolean);
    if (!mtok.length) continue;

    const mset = new Set(mtok);
    const subset = tok.every((t) => mset.has(t));       // "wn petshop" ⊂ "wn petshop solo"
    const superset = mtok.every((t) => set.has(t));     // nama master lebih pendek
    const prefix = mk.startsWith(nk + " ") || nk.startsWith(mk + " ");
    if (!subset && !superset && !prefix) continue;

    scored.push({ s, score: Math.min(tok.length, mtok.length) });
  }

  scored.sort((a, b) => b.score - a.score || String(a.s.name).localeCompare(String(b.s.name)));
  return scored;
}

// Terima "02-10-2026", "02/10/2026", atau "2026-10-02" (termasuk yang bertimestamp).
function parseTanggal(raw: any): { dateKey: string; tanggal: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let d = 0, m = 0, y = 0;
  let mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);        // 02-10-2026
  if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else {
    mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);          // 2026-10-02
    if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  }
  if (!d || !m || !y || m > 12 || d > 31) return null;
  return { dateKey: `${y}-${pad2(m)}-${pad2(d)}`, tanggal: `${pad2(d)}-${pad2(m)}-${pad2(y)}` };
}

// ===== BENTUK BARIS DARI APPS SCRIPT (semua string, biar validasinya sederhana) =====
const ROW_V = v.object({
  area: v.string(),
  tanggal: v.string(),
  storeName: v.string(),
  no: v.string(),
  targetRaw: v.string(),
  actRaw: v.string(),
  catatan: v.string(),
});

// ===== TARIK TAB JADWAL (dipakai cron & tombol manual) =====
async function pullJadwal(): Promise<any[]> {
  const res = await fetch(JADWAL_URL);
  if (!res.ok) throw new Error("Gagal menarik sheet JADWAL (" + res.status + ").");
  const json: any = await res.json().catch(() => null);
  if (!json || json.ok !== true) {
    throw new Error(String(json?.error ?? "Respons sheet JADWAL tidak valid."));
  }

  const header: string[] = Array.isArray(json.header)
    ? json.header.map((h: any) => String(h ?? "").trim().toLowerCase())
    : [];
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h));

  const iArea = find("area");
  const iTgl = find("tanggal");
  const iName = find("nama toko", "nama", "pelanggan");
  const iNo = find("no");
  const iTarget = find("target");
  const iAct = find("act", "omset");
  const iNote = find("catatan", "keterangan");

  // ⚠️ Validasi DULU. Kalau header tidak sesuai → GAGAL TOTAL,
  // jadwal yang sudah ada TIDAK dihapus sama sekali.
  if (iArea < 0 || iTgl < 0 || iName < 0) {
    throw new Error("Header sheet JADWAL tidak sesuai — kolom AREA / TANGGAL / NAMA TOKO tidak ditemukan.");
  }

  const grid: any[][] = Array.isArray(json.rows) ? json.rows : [];
  return grid.map((r) => ({
    area: String(r?.[iArea] ?? ""),
    tanggal: String(r?.[iTgl] ?? ""),
    storeName: String(r?.[iName] ?? ""),
    no: iNo >= 0 ? String(r?.[iNo] ?? "") : "",
    targetRaw: iTarget >= 0 ? String(r?.[iTarget] ?? "") : "",
    actRaw: iAct >= 0 ? String(r?.[iAct] ?? "") : "",
    catatan: iNote >= 0 ? String(r?.[iNote] ?? "") : "",
  }));
}

// ===== STATUS SINKRON: MULAI =====
export const startRun = internalMutation({
  args: {
    requestedBy: v.optional(v.id("users")),
    requestedByRole: v.optional(v.string()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const requestedAt = Date.now();
    const runId = await ctx.db.insert("visit_schedule_sync_runs", {
      requestedBy: args.requestedBy,
      requestedByRole: args.requestedByRole,
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
    runId: v.id("visit_schedule_sync_runs"),
    status: v.union(v.literal("success"), v.literal("failed")),
    insertedCount: v.optional(v.number()),
    updatedCount: v.optional(v.number()),
    cancelledCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    unlinkedCount: v.optional(v.number()),
    unlinkedNames: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    const finishedAt = Date.now();
    await ctx.db.patch(runId, { ...rest, finishedAt });
    return { ok: true, finishedAt };
  },
});

// ===== ISI / PERBARUI JADWAL DARI SHEET =====
// Aturan:
//  • 1 toko = 1 baris per BULAN (dobel → ditolak, bukan ditebak)
//  • baris baru                       → dibuat PLANNED
//  • PLANNED yang masih ada di sheet  → diperbarui (tanggal, target, act, storeId)
//  • PLANNED yang hilang di sheet     → DIHAPUS (dulu ditandai CANCELLED,
//                                       tapi barisnya tetap nongol "Dibatalkan" di HP
//                                       dan malah mengunci toko itu sebulan)
//  • baris yang punya kunjungan       → CANCELLED (tidak dihapus, jejak kerja aman)
//  • ONGOING / DONE / CANCELLED       → TIDAK PERNAH disentuh
//  • isAdHoc (dibuat dari app)        → TIDAK PERNAH dibatalkan sync
//  • tanggal < 01-10-2026             → ditolak (September pakai sistem lama)
export const importRows = internalMutation({
  args: { rows: v.array(ROW_V) },
  handler: async (ctx, { rows }) => {
    const now = Date.now();

    // 1) Peta sales lapangan per area (area → salesId)
    const users = await ctx.db.query("users").collect();
    const salesByArea = new Map<string, any>();
    for (const u of users as any[]) {
      if (u.role === "field" && u.area && !salesByArea.has(u.area)) salesByArea.set(u.area, u._id);
    }

    // 2) Peta toko master: "AREA||nama ternormalisasi" → dokumen
    //    + daftar per area (toko aktif) untuk pencocokan longgar
    const stores = await ctx.db.query("stores").collect();
    const storeByKey = new Map<string, any>();
    const storesByArea = new Map<string, any[]>();
    for (const s of stores as any[]) {
      storeByKey.set(s.area + "||" + nameKeyOf(s.name), s);
      if (s.status === "active") {
        const arr = storesByArea.get(s.area);
        if (arr) arr.push(s); else storesByArea.set(s.area, [s]);
      }
    }

    // 3) Rapikan baris sheet
    const fresh = new Map<string, any>();
    const unlinked = new Set<string>();
    const looseHint = new Map<string, string[]>();
    let looseLinked = 0;
    let rejected = 0;

    for (const r of rows) {
      const area = String(r.area ?? "").trim().toUpperCase();
      const storeName = String(r.storeName ?? "").trim();
      const t = parseTanggal(r.tanggal);

      if (!(AREAS as readonly string[]).includes(area) || !storeName || !t) { rejected++; continue; }
      if (t.dateKey < START_DATE_KEY) { rejected++; continue; }

      const nk = nameKeyOf(storeName);
      if (!nk) { rejected++; continue; }

      const monthKey = t.dateKey.slice(0, 7);
      const storeKey = area + "||" + nk;
      const key = monthKey + "||" + storeKey;

      if (fresh.has(key)) { rejected++; continue; } // dobel dalam 1 bulan → ditolak

      // 1) persis dulu; 2) kalau gagal, coba longgar (in-memory, tanpa I/O baru)
      let store = storeByKey.get(storeKey);
      if (!store) {
        const cand = looseCandidates(nk, storesByArea.get(area) ?? []);
        const pemenangTunggal = cand.length === 1 || (cand.length > 1 && cand[0].score > cand[1].score);
        if (pemenangTunggal) {
          store = cand[0].s;
          looseLinked++;
        } else if (cand.length > 1) {
          // ambigu → jangan menebak, tapi usulkan ke supervisor
          looseHint.set(area + " — " + storeName, cand.slice(0, 3).map((c) => c.s.name));
        }
      }

      fresh.set(key, {
        monthKey,
        dateKey: t.dateKey,
        tanggal: t.tanggal,
        area,
        storeKey,
        storeName,
        nameKey: nk,
        salesId: salesByArea.get(area) ?? undefined,
        storeId: store?._id,
        urutan: parseMoney(r.no),
        target: parseMoney(r.targetRaw),
        act: parseMoney(r.actRaw),
        catatan: String(r.catatan ?? "").trim() || undefined,
      });
      if (!store) unlinked.add(area + " — " + storeName);
    }

    // 4) Baris yang sudah ada untuk bulan-bulan yang muncul di sheet
    const months = Array.from(new Set(Array.from(fresh.values()).map((f) => f.monthKey)));
    const existing: any[] = [];
    for (const mk of months) {
      const found = await ctx.db.query("visit_schedules")
        .withIndex("by_month", (x) => x.eq("monthKey", mk))
        .collect();
      existing.push(...found);
    }
    const byKey = new Map<string, any>();
    for (const e of existing) byKey.set(e.monthKey + "||" + e.storeKey, e);

    let inserted = 0, updated = 0, cancelled = 0, purged = 0;

    // 5) Tambah / perbarui — TULIS HANYA KALAU ADA PERUBAHAN
    for (const [key, f] of fresh) {
      const cur = byKey.get(key);
      if (!cur) {
        await ctx.db.insert("visit_schedules", {
          monthKey: f.monthKey,
          dateKey: f.dateKey,
          tanggal: f.tanggal,
          area: f.area,
          storeKey: f.storeKey,
          storeName: f.storeName,
          nameKey: f.nameKey,
          salesId: f.salesId,
          storeId: f.storeId,
          urutan: f.urutan,
          target: f.target,
          act: f.act,
          catatan: f.catatan,
          status: "PLANNED",
          createdAt: now,
        });
        inserted++;
        continue;
      }

      if (cur.status !== "PLANNED") continue; // jejak kunjungan tidak boleh hilang

      const changed =
        cur.dateKey !== f.dateKey ||
        cur.storeName !== f.storeName ||
        (cur.storeId ?? null) !== (f.storeId ?? null) ||
        (cur.salesId ?? null) !== (f.salesId ?? null) ||
        (cur.urutan ?? null) !== (f.urutan ?? null) ||
        (cur.target ?? null) !== (f.target ?? null) ||
        (cur.act ?? null) !== (f.act ?? null) ||
        (cur.catatan ?? null) !== (f.catatan ?? null) ||
        (cur.nameKey !== f.nameKey) ||
        (cur.area !== f.area);

      if (!changed) continue;

      await ctx.db.patch(cur._id, {
        dateKey: f.dateKey,
        tanggal: f.tanggal,
        storeName: f.storeName,
        storeId: f.storeId,
        salesId: f.salesId,
        urutan: f.urutan,
        target: f.target,
        act: f.act,
        catatan: f.catatan,
        updatedAt: now,
      });
      updated++;
    }

    // 6) PLANNED yang sudah tidak ada di sheet → HAPUS
    //    Baris yang MASIH punya kunjungan tidak dihapus (dipertahankan sebagai jejak).
    for (const e of existing) {
      if (e.status !== "PLANNED") continue;
      if (e.isAdHoc) continue;                                        // jangan sentuh kunjungan dari app
      if (fresh.has(e.monthKey + "||" + e.storeKey)) continue;
      if (e.visitId) {
        // masih tertaut kunjungan → simpan sebagai jejak, jangan dihapus
        await ctx.db.patch(e._id, { status: "CANCELLED", updatedAt: now });
        cancelled++;
        continue;
      }
      await ctx.db.delete(e._id);
      cancelled++;
    }

    // 6b) Bersihkan sisa baris "Dibatalkan" dari sync sebelum perubahan ini.
    //     Cukup sekali tekan Tarik Jadwal → daftar di HP langsung bersih.
    //     Cakupannya hanya bulan yang ada di sheet, dan dibatasi PURGE_MAX
    //     supaya satu sync tidak pernah jadi terlalu berat.
    for (const e of existing) {
      if (purged >= PURGE_MAX) break;
      if (e.status !== "CANCELLED") continue;
      if (e.isAdHoc || e.visitId) continue;                           // jangan buang jejak kerja
      await ctx.db.delete(e._id);
      purged++;
    }

    // Daftar yang masih belum terhubung — sekalian usulan nama master yang mirip
    const unlinkedNames = Array.from(unlinked).slice(0, 50).map((n) => {
      const hint = looseHint.get(n);
      return hint ? `${n}  (mirip: ${hint.join(" / ")})` : n;
    });

    return {
      inserted, updated, cancelled, rejected,
      unlinkedCount: unlinked.size,
      unlinkedNames,
      looseLinked,          // ← berapa yang tersambung lewat pencocokan longgar
      purged,               // ← baris "Dibatalkan" lama yang ikut dibersihkan
      total: fresh.size,
    };
  },
});

// ===== CRON 08.00 WIB (01.00 UTC) — dijalankan server, HP tidak ikut kerja =====
export const autoSync = internalAction({
  handler: async (ctx): Promise<any> => {
    const { runId } = await ctx.runMutation(internal.jadwalSync.startRun, {
      source: "JADWAL",
    });
    try {
      const rows = await pullJadwal();
      const result: any = await ctx.runMutation(internal.jadwalSync.importRows, { rows });
      await ctx.runMutation(internal.jadwalSync.finishRun, {
        runId,
        status: "success",
        insertedCount: result?.inserted ?? 0,
        updatedCount: result?.updated ?? 0,
        cancelledCount: (result?.cancelled ?? 0) + (result?.purged ?? 0),
        rejectedCount: result?.rejected ?? 0,
        unlinkedCount: result?.unlinkedCount ?? 0,
        unlinkedNames: result?.unlinkedNames ?? [],
      });
      return { ok: true, ...result };
    } catch (err: any) {
      await ctx.runMutation(internal.jadwalSync.finishRun, {
        runId,
        status: "failed",
        error: String(err?.message ?? err),
      });
      throw new Error(String(err?.message ?? err));
    }
  },
});

// ===== TOMBOL "TARIK JADWAL" (supervisor) =====
export const manualSync = action({
  handler: async (ctx): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.runQuery(api.users.getUserById, { userId });
    if (me?.role !== "supervisor") throw new Error("Hanya supervisor yang bisa menarik jadwal.");

    const { runId } = await ctx.runMutation(internal.jadwalSync.startRun, {
      requestedBy: userId,
      requestedByRole: me?.role,
      source: "JADWAL",
    });

    try {
      const rows = await pullJadwal();
      const result: any = await ctx.runMutation(internal.jadwalSync.importRows, { rows });

      await ctx.runMutation(internal.jadwalSync.finishRun, {
        runId,
        status: "success",
        insertedCount: result?.inserted ?? 0,
        updatedCount: result?.updated ?? 0,
        cancelledCount: (result?.cancelled ?? 0) + (result?.purged ?? 0),
        rejectedCount: result?.rejected ?? 0,
        unlinkedCount: result?.unlinkedCount ?? 0,
        unlinkedNames: result?.unlinkedNames ?? [],
      });

      await ctx.runMutation(internal.audit.writeEvent, {
        actorId: userId,
        actorName: me?.name ?? "",
        actorRole: me?.role ?? "",
        action: "jadwal.sync",
        entityType: "visit_schedule_sync_run",
        entityId: String(runId),
        summary: `Sinkron JADWAL — ${result?.inserted ?? 0} baru, ${result?.updated ?? 0} diperbarui, ${result?.cancelled ?? 0} dibatalkan/dihapus, ${result?.purged ?? 0} batal lama dibersihkan, ${result?.looseLinked ?? 0} nama mirip disambungkan, ${result?.unlinkedCount ?? 0} nama belum terhubung.`,
        metadata: { source: "JADWAL" },
      });

      return { ok: true, ...result };
    } catch (err: any) {
      await ctx.runMutation(internal.jadwalSync.finishRun, {
        runId,
        status: "failed",
        error: String(err?.message ?? err),
      });
      throw new Error(String(err?.message ?? err));
    }
  },
});

// ===== STATUS SINKRON TERAKHIR (untuk badge "per … 08.00" & daftar belum terhubung) =====
export const getLastSyncStatus = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "owner") return null;

    const runs = await ctx.db.query("visit_schedule_sync_runs")
      .withIndex("by_requested")
      .order("desc")
      .take(1);
    const last: any = runs[0] ?? null;

    if (!last) {
      return {
        hasSync: false, requestedAt: null, finishedAt: null, status: "never",
        insertedCount: 0, updatedCount: 0, cancelledCount: 0,
        rejectedCount: 0, unlinkedCount: 0, unlinkedNames: [], error: null,
      };
    }
    return {
      hasSync: true,
      requestedAt: last.requestedAt,
      finishedAt: last.finishedAt ?? null,
      status: last.status,
      insertedCount: last.insertedCount ?? 0,
      updatedCount: last.updatedCount ?? 0,
      cancelledCount: last.cancelledCount ?? 0,
      rejectedCount: last.rejectedCount ?? 0,
      unlinkedCount: last.unlinkedCount ?? 0,
      unlinkedNames: last.unlinkedNames ?? [],
      error: last.error ?? null,
    };
  },
});
