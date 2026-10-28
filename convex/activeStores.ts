import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";

const AREA_V = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const WF_V = v.union(v.literal("OPEN"), v.literal("INPG"), v.literal("CLSD"));
const RESULT_V = v.union(
  v.literal("order_masuk"), v.literal("plan_order"), v.literal("belum_order"),
  v.literal("tidak_potensi"), v.literal("history_jelek"), v.literal("no_respon"),
  v.literal("tutup_permanen"), v.literal("toko_ganti_nama"), v.literal("kalah_harga"),
  v.literal("kebutuhan_pribadi"), v.literal("pengambilan_retail"),
  // deprecated — data lama
  v.literal("belum_ambil"), v.literal("stok_cukup"), v.literal("ganti_nama"),
);



// "YYYY-MM" dalam WIB — periode kerja FU Toko
function monthKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

// ===== PENJAGA HAK AKSES =====
async function guardReader(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const me: any = await ctx.db.get(userId);
  const role = me?.role;
  if (role !== "supervisor" && role !== "owner" && role !== "telemarketing") return null;
  return { userId, me, role: role as string };
}

async function guardWorker(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Belum login.");
  const me: any = await ctx.db.get(userId);
  const role = me?.role;
  if (role !== "telemarketing" && role !== "supervisor") throw new Error("Tidak diizinkan.");
  return { userId, me, role: role as string };
}

// ===== DAFTAR TUGAS FU TOKO (satu bulan) =====
export const list = query({
  args: {
    monthKey: v.optional(v.string()),
    area: v.optional(AREA_V),
    wf: v.optional(v.union(v.literal("ALL"), WF_V)),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { monthKey, area, wf, q }) => {
    const auth = await guardReader(ctx);
    if (!auth) return null;
    const { me, role } = auth;

    const mk = monthKey ?? monthKeyWIB();
    let rows = await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (x) => x.eq("monthKey", mk))
      .collect();

    if (role === "telemarketing") rows = rows.filter((r) => r.area === me.area);
    else if (area) rows = rows.filter((r) => r.area === area);
    if (wf && wf !== "ALL") rows = rows.filter((r) => r.workflowStatus === wf);

    const needle = (q ?? "").trim().toLowerCase();
    if (needle) rows = rows.filter((r) => r.storeName.toLowerCase().includes(needle));

    rows.sort((a, b) =>
      a.area.localeCompare(b.area) ||
      a.storeName.localeCompare(b.storeName));

    const ids = new Set<string>();
    for (const r of rows) {
      if (r.calledBy) ids.add(String(r.calledBy));
      if (r.doneBy) ids.add(String(r.doneBy));
      if (r.reviewedBy) ids.add(String(r.reviewedBy));
    }
    const nameMap = new Map<string, string>();
    for (const id of ids) {
      const u: any = await ctx.db.get(id as any);
      nameMap.set(id, u?.name ?? "");
    }

    return {
      monthKey: mk,
      items: rows.map((r) => ({
        ...r,
        calledByName: r.calledBy ? nameMap.get(String(r.calledBy)) ?? "" : "",
        doneByName: r.doneBy ? nameMap.get(String(r.doneBy)) ?? "" : "",
        reviewerName: r.reviewedBy ? nameMap.get(String(r.reviewedBy)) ?? "" : "",
      })),
    };
  },
});

// ===== SISA BULAN LALU (OPEN/INPG yang belum CLSD) =====
export const listLeftover = query({
  handler: async (ctx) => {
    const auth = await guardReader(ctx);
    if (!auth) return null;
    const { me, role } = auth;
    if (role === "telemarketing") return { monthKey: monthKeyWIB(), items: [] };

    const mk = monthKeyWIB();
    const open = await ctx.db.query("active_store_tasks")
      .withIndex("by_workflow", (x) => x.eq("workflowStatus", "OPEN"))
      .collect();
    const inpg = await ctx.db.query("active_store_tasks")
      .withIndex("by_workflow", (x) => x.eq("workflowStatus", "INPG"))
      .collect();

    const rows = [...open, ...inpg].filter((r) => r.monthKey < mk);
    rows.sort((a, b) => b.monthKey.localeCompare(a.monthKey) ||
      a.area.localeCompare(b.area) || a.storeName.localeCompare(b.storeName));

    return { monthKey: mk, items: rows };
  },
});

// ===== HITUNGAN KARTU (OPEN / INPG / CLSD) per area + total =====
export const counts = query({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, { monthKey }) => {
    const auth = await guardReader(ctx);
    if (!auth) return null;
    const { me, role } = auth;

    const mk = monthKey ?? monthKeyWIB();
    let rows = await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (x) => x.eq("monthKey", mk))
      .collect();
    if (role === "telemarketing") rows = rows.filter((r) => r.area === me.area);

    const blank = () => ({ open: 0, inpg: 0, closed: 0, all: 0 });
    const total = blank();
    const map = new Map<string, any>();

    for (const r of rows) {
      const a = map.get(r.area) ?? { area: r.area, ...blank() };
      total.all++;
      if (r.workflowStatus === "CLSD") { total.closed++; a.closed++; }
      else if (r.workflowStatus === "INPG") { total.inpg++; a.inpg++; }
      else { total.open++; a.open++; }
      map.set(r.area, a);
    }

    const areas = Array.from(map.values()).sort((x: any, y: any) => x.area.localeCompare(y.area));
    return { monthKey: mk, total, areas };
  },
});

// ===== DETAIL SATU TOKO =====
export const getTask = query({
  args: { taskId: v.id("active_store_tasks") },
  handler: async (ctx, { taskId }) => {
    const auth = await guardReader(ctx);
    if (!auth) return null;
    const { me, role } = auth;

    const task = await ctx.db.get(taskId);
    if (!task) return null;
    if (role === "telemarketing" && task.area !== me.area) return null;

    const chatProofUrl = task.chatProof ? await ctx.storage.getUrl(task.chatProof as any) : null;
    const nameOf = async (id: any) => (id ? ((await ctx.db.get(id)) as any)?.name ?? "" : "");

    return {
      task,
      chatProofUrl,
      calledByName: await nameOf(task.calledBy),
      doneByName: await nameOf(task.doneBy),
      reviewerName: await nameOf(task.reviewedBy),
    };
  },
});

// ===== TAHAP 1: KLIK "CALL" =====
// Menandai toko sedang dihubungi. Status TIDAK berubah (tetap OPEN).
export const markCall = mutation({
  args: { taskId: v.id("active_store_tasks") },
  handler: async (ctx, { taskId }) => {
    const { userId, me, role } = await guardWorker(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Data toko tidak ditemukan.");
    if (role === "telemarketing" && task.area !== me.area) throw new Error("Bukan area kamu.");
    if (task.workflowStatus === "CLSD") throw new Error("Sudah CLSD — tidak bisa diubah.");

    const now = Date.now();
    const callCount = (task.callCount ?? 0) + 1;
    await ctx.db.patch(taskId, { calledAt: now, calledBy: userId, callCount, updatedAt: now });

    // ← BARU: jejak audit — tanpa ini "siapa menelepon kapan" tak terlihat di audit trail
    await logAudit(ctx, {
      actorId: userId,
      action: "activeStore.markCall",
      entityType: "active_store_task",
      entityId: String(taskId),
      area: task.area,
      summary: `FU Toko ${task.storeName} (${task.area}) ditandai ditelepon (panggilan ke-${callCount}).`,
      before: { callCount: task.callCount ?? 0, calledAt: task.calledAt ?? null },
      after: { callCount, calledAt: now },
    });

    return { ok: true, calledAt: now, callCount };
  },
});

// ===== TAHAP 2: SIMPAN HASIL =====
export const saveResult = mutation({
  args: {
    taskId: v.id("active_store_tasks"),
    identification: v.string(),
    chatProof: v.string(),
    result: RESULT_V,
    plannedOrderDate: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, me, role } = await guardWorker(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Data toko tidak ditemukan.");
    if (role === "telemarketing" && task.area !== me.area) throw new Error("Bukan area kamu.");
    if (task.workflowStatus === "CLSD") throw new Error("Sudah CLSD — tidak bisa diedit lagi.");

    if (!task.calledAt) throw new Error("Tekan tombol Call dulu sebelum menyimpan hasil.");

    const identification = (args.identification ?? "").trim();
    if (identification.length < 3) throw new Error("Identifikasi wajib diisi (minimal 3 karakter).");
    if (!args.chatProof) throw new Error("Bukti chat WhatsApp wajib diunggah.");

    let plannedOrderDate = (args.plannedOrderDate ?? "").trim();
    if (args.result === "plan_order") {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(plannedOrderDate)) {
        throw new Error("Tanggal rencana order wajib format DD-MM-YYYY.");
      }
    } else {
      plannedOrderDate = "";
    }

    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      identification,
      chatProof: args.chatProof,
      result: args.result,
      plannedOrderDate: plannedOrderDate || undefined,
      note: (args.note ?? "").trim() || undefined,
      workflowStatus: "INPG",
      doneBy: userId,
      doneAt: now,
      reviewedBy: undefined,
      reviewedAt: undefined,
      reviewNote: undefined,
      updatedAt: now,
    } as any);

    await logAudit(ctx, {
      actorId: userId,
      action: "activeStore.saveResult",
      entityType: "active_store_task",
      entityId: String(args.taskId),
      area: task.area,
      summary: `FU Toko ${task.storeName} (${task.area}) → INPG • hasil ${args.result}.`,
      before: { workflowStatus: task.workflowStatus },
      after: { workflowStatus: "INPG", result: args.result },
    });

    return { ok: true };
  },
});

// ===== SUPERVISOR: SETUJUI (INPG → CLSD) =====
export const supervisorClose = mutation({
  args: { taskId: v.id("active_store_tasks"), reviewNote: v.optional(v.string()) },
  handler: async (ctx, { taskId, reviewNote }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor") throw new Error("Hanya supervisor.");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Data toko tidak ditemukan.");
    if (task.workflowStatus === "CLSD") return { ok: true, alreadyClosed: true };

    const now = Date.now();
    await ctx.db.patch(taskId, {
      workflowStatus: "CLSD",
      reviewedBy: userId,
      reviewedAt: now,
      reviewNote: (reviewNote ?? "").trim() || undefined,
      updatedAt: now,
    } as any);

    await logAudit(ctx, {
      actorId: userId,
      action: "activeStore.close",
      entityType: "active_store_task",
      entityId: String(taskId),
      area: task.area,
      summary: `FU Toko ${task.storeName} (${task.area}) → CLSD.`,
      before: { workflowStatus: task.workflowStatus },
      after: { workflowStatus: "CLSD", reviewNote: (reviewNote ?? "").trim() || null },
    });

    return { ok: true };
  },
});

// ===== SUPERVISOR: SETUJUI BANYAK SEKALIGUS (INPG → CLSD) =====
export const supervisorCloseMany = mutation({
  args: { taskIds: v.array(v.id("active_store_tasks")), reviewNote: v.optional(v.string()) },
  handler: async (ctx, { taskIds, reviewNote }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor") throw new Error("Hanya supervisor.");

    const ids = [...new Set(taskIds)];
    if (ids.length === 0) throw new Error("Belum ada item yang dipilih.");
    if (ids.length > 20) throw new Error("Maksimal 20 toko sekali setujui.");

    let closed = 0;
    const skipped: string[] = [];
    const now = Date.now();

    for (const taskId of ids) {
      const task: any = await ctx.db.get(taskId);
      if (!task) { skipped.push("(data hilang)"); continue; }
      if (task.workflowStatus === "CLSD") continue;

      await ctx.db.patch(taskId, {
        workflowStatus: "CLSD",
        reviewedBy: userId,
        reviewedAt: now,
        reviewNote: (reviewNote ?? "").trim() || undefined,
        updatedAt: now,
      } as any);

      await logAudit(ctx, {
        actorId: userId,
        action: "activeStore.close",
        entityType: "active_store_task",
        entityId: String(taskId),
        area: task.area,
        summary: `FU Toko ${task.storeName} (${task.area}) → CLSD (massal).`,
        before: { workflowStatus: task.workflowStatus },
        after: { workflowStatus: "CLSD", reviewNote: (reviewNote ?? "").trim() || null },
      });

      closed++;
    }

    return { closed, skippedCount: skipped.length, skipped };
  },
});

// ===== SUPERVISOR: BUKA KEMBALI (INPG/CLSD → OPEN) =====
// Identifikasi & bukti chat TIDAK dihapus — tinggal dirapikan petugas.
export const supervisorReopen = mutation({
  args: { taskId: v.id("active_store_tasks"), reason: v.optional(v.string()) },
  handler: async (ctx, { taskId, reason }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor") throw new Error("Hanya supervisor.");

    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Data toko tidak ditemukan.");
    if (task.workflowStatus === "OPEN") return { ok: true };

    const now = Date.now();
    const cleanReason = (reason ?? "").trim();

    await ctx.db.patch(taskId, {
      workflowStatus: "OPEN",
      reviewedBy: undefined,
      reviewedAt: undefined,
      reviewNote: cleanReason || undefined,
      updatedAt: now,
    } as any);

    await logAudit(ctx, {
      actorId: userId,
      action: "activeStore.reopen",
      entityType: "active_store_task",
      entityId: String(taskId),
      area: task.area,
      summary: `FU Toko ${task.storeName} (${task.area}) dibuka kembali → OPEN${cleanReason ? ` • alasan: ${cleanReason}` : ""}.`,
      before: { workflowStatus: task.workflowStatus },
      after: { workflowStatus: "OPEN", reason: cleanReason || null },
    });

    // ← BARU: beri tahu petugas yang mengerjakan supaya dia memperbaiki
    const target = task.doneBy ?? task.calledBy;
    if (target) {
      await ctx.db.insert("notifications", {
        userId: target,
        fromUserId: userId,
        fromName: "Supervisor",
        title: `FU Toko perlu diperbaiki`,
        body: `${task.storeName} (${task.area}) dibuka kembali${cleanReason ? `: ${cleanReason}` : " oleh supervisor."}`,
        kind: "active_store_reopen",
        link: `/toko-aktif/${taskId}`,
        createdAt: now,
      });
    }

    return { ok: true };
  },
});

// ===== RIWAYAT AUDIT SATU TOKO (untuk layar detail) =====
export const getAuditTrail = query({
  args: { taskId: v.id("active_store_tasks"), limit: v.optional(v.number()) },
  handler: async (ctx, { taskId, limit }) => {
    const auth = await guardReader(ctx);
    if (!auth) return null;

    const rows = await ctx.db.query("audit_events")
      .withIndex("by_entity_created", (q) =>
        q.eq("entityType", "active_store_task").eq("entityId", String(taskId)))
      .order("desc")
      .take(Math.min(limit ?? 30, 100));

    return rows.map((r: any) => ({
      _id: r._id,
      action: r.action,
      actorName: r.actorName ?? "",
      summary: r.summary ?? "",
      createdAt: r.createdAt,
    }));
  },
});
