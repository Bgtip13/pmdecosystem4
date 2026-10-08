import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";

const AREA_V = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const HASIL_V = v.union(
  v.literal("order_masuk"), v.literal("order_tambah"),
  v.literal("tidak_order"), v.literal("no_respon")
);

const WIB = 7 * 3600 * 1000;
const DAY = 86400000;

// Hari libur nasional, format "YYYY-MM-DD" (WIB). Isi kalau ada libur.
// Contoh: const HARI_LIBUR: string[] = ["2026-12-25", "2027-01-01"];
const HARI_LIBUR: string[] = [];

function keyOfWib(ms: number) {
  return new Date(ms + WIB).toISOString().slice(0, 10);
}
function dayKeyWIB(now = Date.now()) {
  return keyOfWib(now);
}
function todayStartWib() {
  return Math.floor((Date.now() + WIB) / DAY) * DAY - WIB;
}
function isLibur(ms: number) {
  const dow = new Date(ms + WIB).getUTCDay(); // 0 = Minggu
  return dow === 0 || HARI_LIBUR.includes(keyOfWib(ms));
}
function nextWorkingDay(ms: number) {
  let t = ms + DAY;
  for (let i = 0; i < 21; i++) {
    if (!isLibur(t)) return t;
    t += DAY;
  }
  return t;
}
// Hari kerja terakhir SEBELUM hari ini (H-1 kerja; Senin → Sabtu)
function prevWorkingDayStart() {
  let t = todayStartWib() - DAY;
  for (let i = 0; i < 21; i++) {
    if (!isLibur(t)) break;
    t -= DAY;
  }
  return t;
}
function nameKeyOf(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ===== GENERATOR =====
// Sumber: kunjungan sales H-1 saja (hari kerja terakhir sebelum hari ini).
//   Senin  → kunjungan Sabtu
//   Selasa → kunjungan Senin
async function generateFor(ctx: any) {
  const sourceStart = prevWorkingDayStart();
  const sourceEnd = sourceStart + DAY;
  const sourceDayKey = keyOfWib(sourceStart);
  const targetKey = keyOfWib(nextWorkingDay(sourceStart));

  const users = await ctx.db.query("users").collect();
  const sales = users.filter((u: any) => u.role === "field");
  if (sales.length === 0) return { added: 0, skipped: 0, day: targetKey, source: sourceDayKey };

  let added = 0;
  let skipped = 0;

  for (const s of sales) {
    const visits = await ctx.db.query("visits")
      .withIndex("by_sales_checkin", (q: any) =>
        q.eq("salesId", s._id).gte("checkinAt", sourceStart).lt("checkinAt", sourceEnd))
      .filter((q: any) => q.eq(q.field("status"), "done"))
      .collect();

    const byStore: Record<string, any[]> = {};
    for (const vis of visits) {
      if (!byStore[vis.storeId]) byStore[vis.storeId] = [];
      byStore[vis.storeId].push(vis);
    }

    for (const storeId of Object.keys(byStore)) {
      const list = byStore[storeId];
      list.sort((a: any, b: any) => (a.checkoutAt ?? 0) - (b.checkoutAt ?? 0));
      const last = list[list.length - 1];

      const store = await ctx.db.get(storeId as any);
      if (!store) continue;
      if ((store as any).status !== "active") { skipped++; continue; }

      const dedupeKey = `order:${storeId}@${sourceDayKey}`;
      const dup = await ctx.db.query("order_followups")
        .withIndex("by_dedupe", (q: any) => q.eq("dedupeKey", dedupeKey))
        .first();
      if (dup) { skipped++; continue; }

      await ctx.db.insert("order_followups", {
        area: (store as any).area,
        storeId: storeId as any,
        storeName: (store as any).name ?? "",
        nameKey: nameKeyOf((store as any).name ?? ""),
        day: targetKey,
        visitId: last._id,
        visitDay: sourceDayKey,
        visitCount: list.length,
        visitedAt: last.checkoutAt ?? last.checkinAt,
        salesName: (s as any).name ?? "",
        ordered: last.ordered,
        orderItems: last.orderItems,
        visitReason: last.noOrderReason ?? undefined,
        visitNotes: last.notes ?? undefined,
        visitMetWith: last.metWith ?? undefined,
        status: "pending",
        workflowStatus: "OPEN",
        dedupeKey,
        createdAt: Date.now(),
      } as any);
      added++;
    }
  }
  return { added, skipped, day: targetKey, source: sourceDayKey };
}

// Dipanggil layar SPK Admin saat dibuka / saat supervisor klik "Tarik Data".
export const ensureToday = mutation({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") {
      return { added: 0, skipped: 0, day: dayKeyWIB(), source: "" };
    }
    return await generateFor(ctx);
  },
});

// Versi internal — tinggal dipanggil cron harian kalau nanti mau otomatis.
export const generateDaily = internalMutation({
  handler: async (ctx) => generateFor(ctx),
});

// ===== DAFTAR TUGAS DI ANTREAN SPK ADMIN =====
// Isi daftar:
//   (a) tugas OPEN hari ini (belum dikerjakan), DAN
//   (b) semua tugas INPG (sudah diisi, menunggu review) — termasuk hari sebelumnya.
// (b) wajib ada: begitu petugas menyimpan hasil, status jadi "done" sehingga
// tanpa (b) tugas itu hilang dari layar supervisor sebelum sempat disetujui.
// Yang sudah CLSD pindah ke Riwayat.
export const listActive = query({
  args: { area: v.optional(AREA_V), day: v.optional(v.string()) },
  handler: async (ctx, { area, day }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") return [];

    const myArea = role === "telemarketing" ? (me as any)?.area : (area ?? null);
    const theDay = day ?? dayKeyWIB();

    // (a) belum dikerjakan, hari ini
    const pending = myArea
      ? await ctx.db.query("order_followups")
          .withIndex("by_area_status", (q) => q.eq("area", myArea).eq("status", "pending"))
          .filter((q) => q.eq(q.field("day"), theDay))
          .collect()
      : await ctx.db.query("order_followups")
          .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending"))
          .collect();

    // (b) sudah diisi petugas, menunggu review — semua hari
    const inpgRaw = await ctx.db.query("order_followups")
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
      (a.storeName || "").localeCompare(b.storeName || "") ||
      (b.visitedAt ?? 0) - (a.visitedAt ?? 0));

    // (c) Baris INPG dilengkapi URL bukti + nama petugas — biar kartu tidak kosong
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

// ===== JUMLAH BELUM DIKERJAKAN (badge) =====
export const pendingCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { count: 0 };
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") return { count: 0 };
    const area = role === "telemarketing" ? (me as any)?.area : null;
    const theDay = dayKeyWIB();
    let items;
    if (area) {
      items = await ctx.db.query("order_followups")
        .withIndex("by_area_status", (q) => q.eq("area", area).eq("status", "pending"))
        .filter((q) => q.eq(q.field("day"), theDay))
        .collect();
    } else {
      items = await ctx.db.query("order_followups")
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

    const rows = await ctx.db.query("order_followups")
      .withIndex("by_workflow", (q) => q.eq("workflowStatus", "INPG"))
      .collect();
    const filtered = (rows as any[]).filter((r) => !area || r.area === area);
    filtered.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    return filtered;
  },
});

// ===== RIWAYAT ORDERAN SELESAI / CLSD (dengan bukti chat) =====
export const listDone = query({
  args: { area: v.optional(AREA_V), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { area, from, to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner" && role !== "field") return [];

    // ← field ikut dibatasi area sendiri (kalau tidak, dia lihat semua area)
    const myArea = (role === "telemarketing" || role === "field") ? (me as any)?.area : (area ?? null);
    const hasRange = from !== undefined && to !== undefined;
    const TAKE = 200;


    let items: any[] = [];
    if (myArea) {
      items = hasRange
        ? await ctx.db.query("order_followups")
            .withIndex("by_area_status_done", (q) =>
              q.eq("area", myArea).eq("status", "done").gte("doneAt", from!).lte("doneAt", to!))
            .order("desc").take(TAKE)
        : await ctx.db.query("order_followups")
            .withIndex("by_area_status_done", (q) => q.eq("area", myArea).eq("status", "done"))
            .order("desc").take(TAKE);
    } else {
      items = hasRange
        ? await ctx.db.query("order_followups")
            .withIndex("by_status_done", (q) =>
              q.eq("status", "done").gte("doneAt", from!).lte("doneAt", to!))
            .order("desc").take(TAKE)
        : await ctx.db.query("order_followups")
            .withIndex("by_status_done", (q) => q.eq("status", "done"))
            .order("desc").take(TAKE);
    }

    // Nama pengguna & URL bukti diambil sekali untuk nilai yang sama
    const names = new Map<string, string>();
    const urls = new Map<string, string | null>();
    for (const t of items) {
      const uid = t.doneBy ? String(t.doneBy) : "";
      if (uid && !names.has(uid)) {
        const u = await ctx.db.get(t.doneBy!);
        names.set(uid, (u as any)?.name ?? "");
      }
      const riv = (t as any).reviewedBy ? String((t as any).reviewedBy) : "";
      if (riv && !names.has(riv)) {
        const u = await ctx.db.get((t as any).reviewedBy);
        names.set(riv, (u as any)?.name ?? "");
      }
      const sid = t.screenshot ? String(t.screenshot) : "";
      if (sid && !urls.has(sid)) {
        urls.set(sid, await ctx.storage.getUrl(t.screenshot!));
      }
    }

    return items.map((t: any) => ({
      task: t,
      salesName: names.get(t.doneBy ? String(t.doneBy) : "") ?? "",
      reviewerName: t.reviewedBy ? names.get(String(t.reviewedBy)) ?? "" : "",
      screenshotUrl: t.screenshot ? urls.get(String(t.screenshot)) ?? null : null,
    }));
  },
});

// ===== SIMPAN HASIL (bukti chat WhatsApp wajib) =====
export const completeTask = mutation({
  args: {
    taskId: v.id("order_followups"),
    hasil: HASIL_V,
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor") throw new Error("Khusus telemarketing / supervisor.");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Data tidak ditemukan.");
    if (role === "telemarketing" && task.area !== (me as any)?.area) throw new Error("Bukan area kamu.");
 if ((task as any).workflowStatus === "CLSD") {
  throw new Error("Sudah disetujui supervisor (CLSD) — tidak bisa diubah.");
}
    if (!args.screenshot) throw new Error("Screenshot WhatsApp wajib dilampirkan.");

    await ctx.db.patch(task._id, {
      status: "done",
      workflowStatus: "INPG",        // masuk antrean review supervisor
      hasil: args.hasil,
      notes: args.notes?.trim() || undefined,
      screenshot: args.screenshot,
      doneBy: userId,
      doneAt: Date.now(),
    });
    return { ok: true };
  },
});

// ===== SUPERVISOR: TUTUP / SETUJUI (INPG → CLSD) =====
export const supervisorCloseTask = mutation({
  args: { taskId: v.id("order_followups"), reviewNote: v.optional(v.string()) },
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
      action: "order.close",
      entityType: "order_followup",
      entityId: task._id,
      area: (task as any).area,
      summary: `Setujui (CLSD) follow-up orderan ${(task as any).storeName} — ${(task as any).hasil ?? "-"}.`,
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
  args: { taskIds: v.array(v.id("order_followups")), reviewNote: v.optional(v.string()) },
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
        action: "order.close",
        entityType: "order_followup",
        entityId: task._id,
        area: task.area,
        summary: `Setujui (CLSD) massal — orderan ${task.storeName} — ${task.hasil ?? "-"}.`,
        before: { workflowStatus: wf ?? null },
        after: { workflowStatus: "CLSD", reviewNote: reviewNote?.trim() || null },
      });

      closed++;
    }

    return { closed, skippedCount: skipped.length, skipped };
  },
});


// ===== SUPERVISOR: KEMBALIKAN KE BELUM =====
export const supervisorReopen = mutation({
  args: { taskId: v.id("order_followups") },
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
      notes: undefined,
      screenshot: undefined,
      doneBy: undefined,
      doneAt: undefined,
    });
    return { ok: true };
  },
});

// ===== SUPERVISOR: EDIT HASIL =====
export const supervisorEditResult = mutation({
  args: {
    taskId: v.id("order_followups"),
    hasil: HASIL_V,
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),   // ← BARU: bukti WA boleh diganti saat edit
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Data tidak ditemukan.");

    await ctx.db.patch(task._id, {
      status: "done",
      workflowStatus: "INPG",        // tetap di antrean review
      hasil: args.hasil,
      notes: args.notes?.trim() || undefined,
      // bukti WA: hanya ditimpa kalau supervisor mengunggah yang baru
      ...(args.screenshot ? { screenshot: args.screenshot } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// ===== DETAIL 1 TUGAS (untuk halaman /spk-detail-order/:id) =====
export const getTaskDetail = query({
  args: { taskId: v.id("order_followups") },
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
    const photoUrl = task.screenshot ? await ctx.storage.getUrl(task.screenshot) : null;

    return {
      task,
      salesName: (sales as any)?.name ?? "",
      reviewerName: (reviewer as any)?.name ?? "",
      photoUrl,
    };
  },
});

// ===== BERANDA: rekap follow-up orderan HARI INI per area =====
function fuDayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export const todayByArea = query({
  args: { day: v.optional(v.string()) },
  handler: async (ctx, { day }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    const role = (me as any)?.role;
    if (role !== "telemarketing" && role !== "supervisor" && role !== "owner") return [];

    const theDay = day ?? fuDayKeyWIB();
    const myArea = role === "telemarketing" ? (me as any)?.area : null;

    const rows = await ctx.db.query("order_followups")
      .withIndex("by_day_status", (q) => q.eq("day", theDay))
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
