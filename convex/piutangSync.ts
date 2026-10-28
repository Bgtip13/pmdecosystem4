import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
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

// Identitas SATU TAGIHAN — dipakai supaya pelanggan dengan beberapa piutang
// tetap punya beberapa tugas, tapi tagihan yang sudah dikerjakan tidak diduplikasi.
// Utamakan tanggal tagihan; kalau sheet tidak punya tanggal, pakai isi barisnya.
const invKey = (r: {
  area: string; storeName: string; tanggal?: string;
  total?: number; piutang?: number; cicil?: number; retur?: number; usia?: number;
}) => {
  const base = keyStore(r.area, r.storeName);
  if (r.tanggal) return `${base}|${r.tanggal}`;
  return [base, r.total ?? "", r.piutang ?? "", r.cicil ?? "", r.retur ?? "", r.usia ?? ""].join("|");
};

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

    // Tagihan yang sudah dikerjakan / menunggu review / disetujui → jangan diganggu.
    // Dulu kuncinya per TOKO, jadi 1 tagihan INPG membuat semua tagihan pelanggan
    // itu ikut terlewat. Sekarang per TAGIHAN, jadi tagihan lain tetap masuk.
    const protectedKeys = new Set<string>();
    for (const r of rows as any[]) {
      if (r.workflowStatus === "INPG" || r.workflowStatus === "CLSD" || r.status === "done") {
        protectedKeys.add(invKey(r));
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
    // Dulu: `seen` per TOKO → pelanggan dengan 5 piutang cuma dapat 1 tugas.
    // Sekarang: buang hanya baris yang BENAR-BENAR identik di dalam 1 file,
    // supaya tiap tagihan pelanggan jadi 1 tugas (digabung jadi 1 kartu di UI).
    const seenRow = new Set<string>();
    for (let i = 1; i < grid.length; i++) {
      const c = grid[i];
      const get = (ix: number) => (ix >= 0 ? clean(c[ix] ?? "") : "");
      const areaRaw = get(iArea).toUpperCase().trim();
      const storeName = get(iName);
      if (!(AREAS as readonly string[]).includes(areaRaw) || !storeName) continue;
      const area = areaRaw as "SOLO" | "DIY" | "SEMARANG";

      const row = {
        area,
        storeName,
        tanggal: get(iTgl) || undefined,
        total: parseMoney(get(iTotal)),
        piutang: parseMoney(get(iPiutang)),
        cicil: parseMoney(get(iCicil)),
        retur: parseMoney(get(iRetur)),
        usia: parseInt(get(iUsia), 10) || undefined,
      };

      // baris persis sama di file yang sama → cukup satu tugas
      const rowKey = [
        keyStore(area, storeName), row.tanggal ?? "", row.total ?? "",
        row.piutang ?? "", row.cicil ?? "", row.retur ?? "", row.usia ?? "",
      ].join("|");
      if (seenRow.has(rowKey)) continue;

      // tagihan ini sudah dikerjakan / menunggu review → jangan diduplikasi
      if (protectedKeys.has(invKey(row))) continue;
      seenRow.add(rowKey);

      await ctx.db.insert("piutang_tasks", {
        ...row,
        day,
        status: "pending",
        workflowStatus: "OPEN",
        createdAt: Date.now(),
      });
      inserted++;
    }

    return { inserted, deleted, total: seenRow.size, skippedInProgress: protectedKeys.size };
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

// ============================================================================
// NOTIFIKASI (1): piutang selesai disinkron oleh SPV → HANYA sales telemarketing.
// Sekali per hari per orang (dijaga reminder_deliveries), dan dilewati hari Minggu.
// ============================================================================
function isSundayWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).getUTCDay() === 0;
}

async function notifySyncDone(ctx: any, runId: any, imported: number, now: number) {
  if (isSundayWIB(now)) return; // ATURAN 4 — Minggu tidak ada notifikasi sistem

  const run: any = await ctx.db.get(runId);
  if (!run || run.requestedByRole !== "supervisor") return; // hanya hasil sinkron SPV

  const day = dayKeyWIB(now);
  const users = await ctx.db.query("users").collect();
  const tele = users.filter((u: any) => u.role === "telemarketing");
  if (tele.length === 0) return;

  const title = "Piutang sudah disinkron SPV";
  const body =
    `Data piutang hari ini sudah diperbarui${imported > 0 ? ` (${imported} tugas baru)` : ""}. ` +
    "Buka SPK Admin untuk mengerjakan hasilnya.";

  const notified: any[] = [];
  for (const t of tele) {
    const dedupeKey = `notif:sync-done:${day}:${t._id}`;
    const dup = await ctx.db.query("reminder_deliveries")
      .withIndex("by_dedupe", (q: any) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (dup) continue;

    await ctx.db.insert("notifications", {
      userId: t._id,
      fromName: "Sistem PMD",
      title,
      body,
      kind: "piutang_sync",
      link: "/spk",
      createdAt: now,
    });
    await ctx.db.insert("reminder_deliveries", {
      dedupeKey,
      day,
      kind: "piutang_sync",
      recipientId: t._id,
      status: "sent",
      createdAt: now,
      sentAt: now,
    });
    notified.push(t._id);
  }

  if (notified.length > 0) {
    await ctx.scheduler.runAfter(0, internal.reminders.pushToUsers, {
      userIds: notified,
      title,
      body,
      kind: "piutang_sync",
      link: "/spk",
    });
  }
}

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

    // Hanya sinkron yang BERHASIL: beri tahu sales telemarketing.
    // Dibungkus try/catch supaya kegagalan notifikasi tidak menggagalkan pencatatan run.
    if (rest.status === "success") {
      try {
        await notifySyncDone(ctx, runId, rest.importedCount ?? 0, finishedAt);
      } catch {}
    }

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