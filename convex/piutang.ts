import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { logAudit } from "./lib/audit";

// ===== SUMBER DATA: Apps Script JSON (terbukti jalan, tanpa cache Google) =====
const PIUTANG_JSON_URL =
  "https://script.google.com/macros/s/AKfycbzV3bAYc6uf-xDa5OHNHXfhxViE6cys4wl-HxQ6eMGJKp6B3ZEZPKlooeXJCuVpDnw/exec";


const AREA_V = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const HASIL_V = v.union(v.literal("janji_bayar"), v.literal("lunas"), v.literal("cicil"), v.literal("no_respon"));
const WORKFLOW_V = v.union(v.literal("OPEN"), v.literal("INPG"), v.literal("CLSD"));

// Hari ini dalam zona WIB (UTC+7) → YYYY-MM-DD
function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function escCsv(v: any): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Ambil nama pengguna sekali saja per userId (bukan per baris)
async function namesOfUsers(ctx: any, ids: any[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const id of ids) {
    if (!id) continue;
    const key = String(id);
    if (map.has(key)) continue;
    const u = await ctx.db.get(id);
    map.set(key, (u as any)?.name ?? "");
  }
  return map;
}

// ===== CRON HARIAN OTOMATIS (sudah tidak dipakai — sinkron manual) =====
export const autoSync = internalAction({
  handler: async (ctx): Promise<any> => {
    const res = await fetch(PIUTANG_JSON_URL);
    if (!res.ok) throw new Error("Gagal menarik Google Sheets (" + res.status + ").");
    const json: any = await res.json().catch(() => null);
    const rows: any[][] = Array.isArray(json?.rows) ? json.rows : [];
    const csv = rows.map((r) => r.map(escCsv).join(",")).join("\n");
    const day = dayKeyWIB();
    return await ctx.runMutation(internal.piutangSync.importRows, { csv, day });
  },
});

// ===== TARIK MANUAL (supervisor & telemarketing) =====
export const manualSync = action({
  handler: async (ctx): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.runQuery(api.users.getUserById, { userId });
    const role = me?.role;
    if (role !== "supervisor" && role !== "telemarketing") throw new Error("Tidak diizinkan.");

    const { runId } = await ctx.runMutation(internal.piutangSync.startRun, {
      requestedBy: userId,
      requestedByRole: role as "supervisor" | "telemarketing",
    });

    try {
      const res = await fetch(PIUTANG_JSON_URL);
      if (!res.ok) throw new Error("Gagal menarik Google Sheets (" + res.status + ").");
      const json: any = await res.json().catch(() => null);
      if (!json || json.ok !== true) throw new Error(String(json?.error ?? "Respons sheet PIUTANG tidak valid."));

      const header: any[] = Array.isArray(json.header) ? json.header : [];
      const rows: any[][] = Array.isArray(json.rows) ? json.rows : [];
      if (!rows.length) throw new Error("Baris PIUTANG kosong.");

      // Script baru mengirim header terpisah → gabung lagi supaya parser CSV lama tetap jalan
      const grid = header.length ? [header, ...rows] : rows;

      const csv = grid.map((r) => r.map(escCsv).join(",")).join("\n");
      const day = dayKeyWIB();
      const result: any = await ctx.runMutation(internal.piutangSync.importRows, { csv, day });

      await ctx.runMutation(internal.piutangSync.finishRun, {
        runId,
        status: "success",
        importedCount: result?.inserted ?? 0,
        validCount: result?.total ?? 0,
        rejectedCount: Math.max(0, rows.length - (result?.inserted ?? 0)),
      });

      await ctx.runMutation(internal.audit.writeEvent, {
        actorId: userId,
        actorName: me?.name ?? "",
        actorRole: role,
        action: "piutang.sync",
        entityType: "piutang_sync_run",
        entityId: String(runId),
        summary: `Sinkron piutang manual — ${result?.inserted ?? 0} tugas masuk, ${result?.deleted ?? 0} tugas lama diganti.`,
        metadata: { day, area: me?.area ?? null },
      });

      return result;
    } catch (e: any) {
      await ctx.runMutation(internal.piutangSync.finishRun, {
        runId,
        status: "failed",
        error: e?.message ?? "Gagal.",
      });
      throw e;
    }
  },
});

// ===== DAFTAR TUGAS DI ANTREAN SPK ADMIN =====
// Isi daftar:
//   (a) tugas OPEN hari ini (belum dikerjakan), DAN
//   (b) semua tugas INPG (sudah diisi, menunggu review) — termasuk hari sebelumnya.
// (b) wajib ada: begitu petugas menyimpan hasil, status jadi "done" sehingga
// tanpa (b) tugas itu hilang dari layar supervisor sebelum sempat disetujui.
// Yang sudah CLSD pindah permanen ke Riwayat.
export const listActive = query({
  args: { area: v.optional(AREA_V), day: v.optional(v.string()) },
  handler: async (ctx, { area, day }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") return [];

    const myArea = role === "supervisor" ? (area ?? null) : (me as any)?.area;
    const theDay = day ?? dayKeyWIB();

    // (a) belum dikerjakan, hari ini
    const pending = myArea
      ? await ctx.db.query("piutang_tasks")
          .withIndex("by_area_day_status", (q) => q.eq("area", myArea).eq("day", theDay).eq("status", "pending"))
          .collect()
      : await ctx.db.query("piutang_tasks")
          .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending"))
          .collect();

    // (b) sudah diisi petugas, menunggu review — semua hari
const inpgRaw = await ctx.db.query("piutang_tasks")
      .withIndex("by_workflow", (q) => q.eq("workflowStatus", "INPG"))
      .order("desc")
      .take(150);
    const inpg = myArea ? (inpgRaw as any[]).filter((t: any) => t.area === myArea) : inpgRaw;

    const seen = new Set<string>();
    const items = ([...pending, ...inpg] as any[]).filter((t: any) => {
      const id = String(t._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    items.sort((a: any, b: any) =>
      (b.usia ?? 0) - (a.usia ?? 0) || (a.storeName || "").localeCompare(b.storeName || ""));

    // (c) Baris INPG dilengkapi URL bukti + nama petugas, supaya kartu supervisor
    //     tidak kosong (di DB cuma tersimpan storage id).
    const nameCache = new Map<string, string>();
    const out: any[] = [];
    for (const t of items) {
      if (t.workflowStatus !== "INPG") { out.push(t); continue; }

      let doneByName = "";
      if (t.doneBy) {
        const key = String(t.doneBy);
        if (!nameCache.has(key)) nameCache.set(key, ((await ctx.db.get(t.doneBy)) as any)?.name ?? "");
        doneByName = nameCache.get(key) ?? "";
      }
      const photoUrl = t.screenshot ? await ctx.storage.getUrl(t.screenshot) : null;
      out.push({ ...t, photoUrl, doneByName });
    }
    return out;
  },
});

// ===== JUMLAH BELUM DIKERJAKAN (badge pengingat) =====
export const pendingCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { count: 0 };
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") return { count: 0 };
    const area = role === "supervisor" || role === "owner" ? null : (me as any)?.area;
    const theDay = dayKeyWIB();
    let items;
    if (area) {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_area_day_status", (q) => q.eq("area", area).eq("day", theDay).eq("status", "pending"))
        .collect();
    } else {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending"))
        .collect();
    }
    return { count: items.length };
  },
});

// ===== ANTREAN REVIEW SUPERVISOR (semua INPG, lintas hari) =====
export const listInProgress = query({
  args: { area: v.optional(AREA_V) },
  handler: async (ctx, { area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "supervisor" && role !== "owner") return [];

    const rows = await ctx.db.query("piutang_tasks")
      .withIndex("by_workflow", (q) => q.eq("workflowStatus", "INPG"))
      .collect();
    const filtered = (rows as any[]).filter((r) => !area || r.area === area);
    filtered.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    return filtered;
  },
});

// ===== AMBIL TASK (internal, untuk action) =====
export const getTaskInternal = internalQuery({
  args: { taskId: v.id("piutang_tasks") },
  handler: async (ctx, { taskId }) => {
    return await ctx.db.get(taskId);
  },
});

// ===== SIMPAN HASIL KE DATABASE (internal — dipanggil action) =====
export const completeTaskInternal = internalMutation({
  args: {
    taskId: v.id("piutang_tasks"),
    hasil: HASIL_V,
    promiseDate: v.optional(v.string()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    doneBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Data tidak ditemukan.");
    if ((task as any).workflowStatus === "CLSD") {
  throw new Error("Sudah disetujui supervisor (CLSD) — tidak bisa diubah.");
}
    await ctx.db.patch(task._id, {
      status: "done",
      workflowStatus: "INPG",        // masuk antrean review supervisor
      hasil: args.hasil,
      promiseDate: args.hasil === "janji_bayar" ? args.promiseDate : undefined,
      payMethod: args.hasil === "lunas" || args.hasil === "cicil" ? args.payMethod : undefined,
      notes: args.notes?.trim() || undefined,
      screenshot: args.screenshot,
      doneBy: args.doneBy,
      doneAt: Date.now(),
    });
    return { ok: true };
  },
});

// ===== SIMPAN HASIL + TULIS BALIK KE GOOGLE SHEETS =====
export const completeTask = action({
  args: {
    taskId: v.id("piutang_tasks"),
    hasil: HASIL_V,
    promiseDate: v.optional(v.string()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.runQuery(api.users.getUserById, { userId });
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") {
      throw new Error("Khusus telemarketing / supervisor.");
    }
    if ((args.hasil === "lunas" || args.hasil === "cicil") && !args.payMethod) {
      throw new Error("Pilih metode bayar (Tunai/Transfer).");
    }
    if (args.hasil === "janji_bayar" && !args.promiseDate) {
      throw new Error("Pilih tanggal janji bayar.");
    }
    if (!args.screenshot) {
      throw new Error("Screenshot WhatsApp wajib dilampirkan.");
    }

    const task = (await ctx.runQuery(internal.piutang.getTaskInternal, { taskId: args.taskId })) as any;
    if (!task) throw new Error("Data tidak ditemukan.");
    if (role === "telemarketing" && task.area !== (me as any)?.area) {
      throw new Error("Bukan area kamu.");
    }
    if (task.status === "done") {
  throw new Error("Sudah disetujui supervisor (CLSD) — tidak bisa diubah.");
}

    await ctx.runMutation(internal.piutang.completeTaskInternal, {
      taskId: args.taskId,
      hasil: args.hasil,
      promiseDate: args.promiseDate,
      payMethod: args.payMethod,
      notes: args.notes,
      screenshot: args.screenshot,
      doneBy: userId,
    });

    // Tulis balik ke Google Sheets (best-effort)
    let sheetOk = false;
    try {
      const res = await fetch(PIUTANG_JSON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "pmd-2026-rahasia",
          area: task.area,
          storeName: task.storeName,
          tanggal: task.tanggal ?? "",
          hasil: args.hasil,
          promiseDate: args.hasil === "janji_bayar" ? args.promiseDate ?? "" : "",
          payMethod: args.hasil === "lunas" || args.hasil === "cicil" ? args.payMethod ?? "" : "",
          notes: args.notes?.trim() ?? "",
        }),
      });
      const json: any = await res.json().catch(() => null);
      sheetOk = !!json?.ok;
    } catch {
      sheetOk = false;
    }

    return { ok: true, sheetOk };
  },
});

// ===== RIWAYAT (yang sudah CLSD) =====
export const listDone = query({
  args: { area: v.optional(AREA_V), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { area, from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    // ← field boleh membaca riwayat (area sendiri)
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner" && role !== "field") return [];

    const myArea = role === "supervisor" || role === "owner" ? (area ?? null) : (me as any)?.area;
    const hasRange = from !== undefined && to !== undefined;
    const TAKE = 200;


    let items: any[] = [];
    if (myArea) {
      items = hasRange
        ? await ctx.db.query("piutang_tasks")
            .withIndex("by_area_status_done", (q) =>
              q.eq("area", myArea).eq("status", "done").gte("doneAt", from!).lte("doneAt", to!))
            .order("desc").take(TAKE)
        : await ctx.db.query("piutang_tasks")
            .withIndex("by_area_status_done", (q) => q.eq("area", myArea).eq("status", "done"))
            .order("desc").take(TAKE);
    } else {
      items = hasRange
        ? await ctx.db.query("piutang_tasks")
            .withIndex("by_status_done", (q) =>
              q.eq("status", "done").gte("doneAt", from!).lte("doneAt", to!))
            .order("desc").take(TAKE)
        : await ctx.db.query("piutang_tasks")
            .withIndex("by_status_done", (q) => q.eq("status", "done"))
            .order("desc").take(TAKE);
    }

    const names = await namesOfUsers(ctx, items.map((t) => t.doneBy).filter(Boolean));
    const reviewers = await namesOfUsers(ctx, items.map((t: any) => t.reviewedBy).filter(Boolean));
    return items.map((t: any) => ({
      task: t,
      salesName: t.doneBy ? names.get(String(t.doneBy)) ?? "" : "",
      reviewerName: t.reviewedBy ? reviewers.get(String(t.reviewedBy)) ?? "" : "",
    }));
  },
});

// ===== DETAIL TUGAS (dipakai SPK Detail & Riwayat) =====
export const getTaskDetail = query({
  args: { taskId: v.id("piutang_tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner" && role !== "field") return null;

    const task = await ctx.db.get(taskId);
    if (!task) return null;
    if ((role === "telemarketing" || role === "field") && task.area !== (me as any)?.area) return null;


    const sales = task.doneBy ? await ctx.db.get(task.doneBy) : null;
    const reviewer = (task as any).reviewedBy ? await ctx.db.get((task as any).reviewedBy) : null;
    const photoUrl = task.screenshot
      ? await ctx.storage.getUrl(task.screenshot)
      : undefined;

    return {
      task,
      salesName: (sales as any)?.name ?? "",
      reviewerName: (reviewer as any)?.name ?? "",
      photoUrl,
    };
  },
});

// ===== SUPERVISOR: TUTUP / SETUJUI (INPG → CLSD) =====
export const supervisorCloseTask = mutation({
  args: { taskId: v.id("piutang_tasks"), reviewNote: v.optional(v.string()) },
  handler: async (ctx, { taskId, reviewNote }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Data tidak ditemukan.");
    const wf = (task as any).workflowStatus as string | undefined;
    if (wf === "CLSD") throw new Error("Sudah CLSD.");
    if (wf !== "INPG") throw new Error("Belum diisi petugas — belum bisa ditutup.");

    const now = Date.now();
    await ctx.db.patch(task._id, {
      status: "done",             // pindah ke Riwayat
      workflowStatus: "CLSD",
      reviewedBy: userId,
      reviewedAt: now,
      reviewNote: reviewNote?.trim() || undefined,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: userId,
      action: "piutang.close",
      entityType: "piutang_task",
      entityId: task._id,
      area: (task as any).area,
      summary: `Setujui (CLSD) follow-up ${(task as any).storeName} — ${(task as any).hasil ?? "-"}.`,
      before: { workflowStatus: wf ?? null },
      after: { workflowStatus: "CLSD", reviewNote: reviewNote?.trim() || null },
    });

    return { ok: true };
  },
});

// ===== SUPERVISOR: TUTUP BANYAK SEKALIGUS (INPG → CLSD) =====
// Satu transaksi. Item yang bukan INPG DILEWATI (bukan throw),
// supaya satu baris basi tidak menggagalkan seluruh batch.
export const supervisorCloseMany = mutation({
  args: { taskIds: v.array(v.id("piutang_tasks")), reviewNote: v.optional(v.string()) },
  handler: async (ctx, { taskIds, reviewNote }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const ids = [...new Set(taskIds)];
    if (ids.length === 0) throw new Error("Belum ada item yang dipilih.");
    if (ids.length > 20) throw new Error("Maksimal 20 item sekali setujui.");

    let closed = 0;
    const skipped: string[] = [];
    const now = Date.now();

    for (const taskId of ids) {
      const task: any = await ctx.db.get(taskId);
      if (!task) { skipped.push("(data hilang)"); continue; }
      const wf = task.workflowStatus as string | undefined;
      if (wf === "CLSD") continue;                  // sudah beres, tidak dihitung
      if (wf !== "INPG") { skipped.push(task.storeName); continue; }

      await ctx.db.patch(task._id, {
        status: "done",
        workflowStatus: "CLSD",
        reviewedBy: userId,
        reviewedAt: now,
        reviewNote: reviewNote?.trim() || undefined,
        updatedAt: now,
      });

      await logAudit(ctx, {
        actorId: userId,
        action: "piutang.close",
        entityType: "piutang_task",
        entityId: task._id,
        area: task.area,
        summary: `Setujui (CLSD) massal — ${task.storeName} — ${task.hasil ?? "-"}.`,
        before: { workflowStatus: wf ?? null },
        after: { workflowStatus: "CLSD", reviewNote: reviewNote?.trim() || null },
      });

      closed++;
    }

    return { closed, skippedCount: skipped.length, skipped };
  },
});

// ===== SUPERVISOR: UBAH HASIL RIWAYAT (termasuk No Respon) =====
export const supervisorEditTaskResult = mutation({
  args: {
    taskId: v.id("piutang_tasks"),
    hasil: HASIL_V,
    promiseDate: v.optional(v.string()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Data tidak ditemukan.");
    if ((args.hasil === "lunas" || args.hasil === "cicil") && !args.payMethod)
      throw new Error("Pilih metode bayar (Tunai/Transfer).");
    if (args.hasil === "janji_bayar" && !args.promiseDate)
      throw new Error("Pilih tanggal janji bayar.");

    await ctx.db.patch(task._id, {
      status: "done",
      workflowStatus: "INPG",        // tetap di antrean review
      hasil: args.hasil,
      promiseDate: args.hasil === "janji_bayar" ? args.promiseDate : undefined,
      payMethod: args.hasil === "lunas" || args.hasil === "cicil" ? args.payMethod : undefined,
      notes: args.notes?.trim() || undefined,
    });

    await logAudit(ctx, {
      actorId: userId,
      action: "piutang.edit_result",
      entityType: "piutang_task",
      entityId: task._id,
      area: (task as any).area,
      summary: `Ubah hasil follow-up ${(task as any).storeName}: ${(task as any).hasil ?? "-"} → ${args.hasil}.`,
      before: { hasil: (task as any).hasil ?? null, payMethod: (task as any).payMethod ?? null },
      after: { hasil: args.hasil, payMethod: args.payMethod ?? null },
    });

    return { ok: true };
  },
});

// ===== SUPERVISOR: KEMBALIKAN KE "BELUM" =====
export const supervisorReopenTask = mutation({
  args: { taskId: v.id("piutang_tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Data tidak ditemukan.");
    if (task.status !== "done") throw new Error("Tugas ini belum dikerjakan.");

    await ctx.db.patch(task._id, {
      status: "pending",
      workflowStatus: "OPEN",
      day: dayKeyWIB(),
      hasil: undefined,
      promiseDate: undefined,
      payMethod: undefined,
      doneBy: undefined,
      doneAt: undefined,
    });

    await logAudit(ctx, {
      actorId: userId,
      action: "piutang.reopen",
      entityType: "piutang_task",
      entityId: task._id,
      area: (task as any).area,
      summary: `Kembalikan follow-up ${(task as any).storeName} ke "belum".`,
      before: { status: "done", hasil: (task as any).hasil ?? null },
      after: { status: "pending" },
    });

    return { ok: true };
  },
});

// ===== PREVIEW PIUTANG TOKO (SPK Sales / form kunjungan) =====
export const getPiutangPreview = query({
  args: { storeName: v.string(), area: v.optional(AREA_V) },
  handler: async (ctx, { storeName, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "field" && role !== "telemarketing" && role !== "supervisor") return null;

    const name = (storeName || "").trim();
    if (!name) return { found: false, storeName: name };

    const all = (await ctx.db.query("piutang_tasks")
      .withIndex("by_storeName", (q) => q.eq("storeName", name))
      .collect()) as any[];
    let cand = all.filter((t: any) => t.status === "pending");
    if (area) cand = cand.filter((t: any) => t.area === area);

    cand.sort((a: any, b: any) =>
      (b.day || "").localeCompare(a.day || "") ||
      (b.usia ?? 0) - (a.usia ?? 0) ||
      (b.piutang ?? 0) - (a.piutang ?? 0));

    const t = cand[0] ?? all.find((x: any) => (x.doneAt ?? 0) > 0) ?? all[0];
    if (!t) return { found: false, storeName: name };
    return {
      found: true,
      storeName: t.storeName,
      area: t.area,
      piutang: t.piutang ?? 0,
      usia: t.usia ?? null,
      total: t.total ?? 0,
      cicil: t.cicil ?? 0,
      retur: t.retur ?? 0,
      tanggal: t.tanggal,
      day: t.day,
      sudahDifollowUp: t.status === "done",
      workflowStatus: t.workflowStatus ?? null,
    };
  },
});

// ===== EXPORT RIWAYAT FOLLOW-UP (rentang tanggal) =====
export const exportDoneTasks = query({
  args: {
    from: v.number(),
    to: v.number(),
    area: v.optional(AREA_V),
  },
  handler: async (ctx, { from, to, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") return [];

    const myArea = role === "supervisor" || role === "owner" ? (area ?? null) : (me as any)?.area;
    const LIMIT = 2000;
    let items: any[];
    if (myArea) {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_area_status_done", (q) =>
          q.eq("area", myArea).eq("status", "done").gte("doneAt", from).lte("doneAt", to))
        .order("asc").take(LIMIT);
    } else {
      items = await ctx.db.query("piutang_tasks")
        .withIndex("by_status_done", (q) =>
          q.eq("status", "done").gte("doneAt", from).lte("doneAt", to))
        .order("asc").take(LIMIT);
    }

    const names = await namesOfUsers(ctx, items.map((t) => t.doneBy).filter(Boolean));
    return items.map((t: any) => ({
      doneAt: t.doneAt ?? 0,
      area: t.area,
      toko: t.storeName,
      total: t.total ?? 0,
      piutang: t.piutang ?? 0,
      cicil: t.cicil ?? 0,
      retur: t.retur ?? 0,
      usia: t.usia ?? null,
      hasil: t.hasil ?? "",
      janjiBayar: t.promiseDate ?? "",
      metode: t.payMethod ?? "",
      catatan: t.notes ?? "",
      sales: t.doneBy ? names.get(String(t.doneBy)) ?? "" : "",
      status: t.workflowStatus ?? "CLSD",
    }));
  },
});

// ===== BERANDA: rekap follow-up piutang HARI INI per area =====
export const todayByArea = query({
  args: { day: v.optional(v.string()) },
  handler: async (ctx, { day }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") return [];

    const theDay = day ?? dayKeyWIB();
    const myArea = role === "telemarketing" ? (me as any)?.area : null;

    const rows = await ctx.db.query("piutang_tasks")
      .withIndex("by_day", (q) => q.eq("day", theDay))
      .collect();

    const map = new Map<string, { area: string; pending: number; done: number; open: number; inpg: number; closed: number }>();
    for (const r of rows as any[]) {
      const area = String(r.area ?? "");
      if (!area) continue;
      if (myArea && area !== myArea) continue;
      const cur = map.get(area) ?? { area, pending: 0, done: 0, open: 0, inpg: 0, closed: 0 };
      const wf = (r.workflowStatus ?? "OPEN") as string;
      if (wf === "CLSD") { cur.closed++; cur.done++; }
      else if (wf === "INPG") { cur.inpg++; cur.pending++; }
      else { cur.open++; cur.pending++; }
      map.set(area, cur);
    }

    return Array.from(map.values());
  },
});
