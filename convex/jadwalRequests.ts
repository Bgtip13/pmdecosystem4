import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { dayKeyWIB, isValidDateKey } from "./lib/jadwalRules";
import { logAudit } from "./lib/audit";
import { notifySupervisors, notifyUser, performCancel, performMove } from "./lib/jadwalOps";

// ==========================================================================
// PENGAJUAN PERUBAHAN JADWAL DARI SALES
//
// Sales TIDAK bisa menggeser / menghapus baris jadwal sendiri. Yang mereka
// lakukan adalah MENGAJUKAN, lalu supervisor/owner memutuskan:
//   • "move"   → geser tanggal (tanggal tujuan wajib)
//   • "cancel" → hapus toko dari jadwal hari itu (baris tetap tersimpan
//                sebagai CANCELLED + alasan, jadi masih bisa ditelusuri)
//
// Persetujuan memakai performMove / performCancel di lib/jadwalOps — aturan
// kuota minimal, 1 toko 1x/bulan, dan audit sama persis dengan aksi langsung
// supervisor. Jadi tidak ada dua versi aturan.
// ==========================================================================

const STATUS_V = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));

async function meOrThrow(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Belum login.");
  const me: any = await ctx.db.get(userId);
  if (!me) throw new Error("Akun tidak ditemukan.");
  return me;
}

function isManager(me: any) {
  return me?.role === "supervisor" || me?.role === "owner";
}

async function pendingOfSchedule(ctx: any, scheduleId: any) {
  const rows: any[] = await ctx.db.query("jadwal_requests")
    .withIndex("by_schedule", (q: any) => q.eq("scheduleId", scheduleId))
    .collect();
  return rows.filter((r) => r.status === "pending");
}

// Baris jadwal yang boleh diajukan oleh sales ini.
async function baseSchedule(ctx: any, scheduleId: any, me: any) {
  const s: any = await ctx.db.get(scheduleId);
  if (!s) throw new Error("Jadwal tidak ditemukan.");

  const mine = s.salesId
    ? String(s.salesId) === String(me._id)
    : me.area && s.area === me.area;
  if (!mine) throw new Error("Jadwal ini bukan milikmu.");

  if (s.status === "CANCELLED") throw new Error("Jadwal ini sudah dihapus dari daftar.");
  if (s.status === "ONGOING") throw new Error("Kunjungan sudah berjalan — selesaikan dulu lewat SPK.");
  if (s.status === "DONE") throw new Error("Jadwal ini sudah selesai dikunjungi.");
  if (s.visitId) throw new Error("Baris ini sudah punya kunjungan, jadi tidak bisa diubah.");
  return s;
}

async function ensureNoPending(ctx: any, scheduleId: any) {
  const pending = await pendingOfSchedule(ctx, scheduleId);
  if (pending.length) {
    throw new Error("Masih ada pengajuan yang menunggu persetujuan supervisor untuk toko ini.");
  }
}

// ===== AJUKAN GESER TANGGAL =====
export const requestMove = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    toDateKey: v.string(),
    reason: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { scheduleId, toDateKey, reason, note }) => {
    const me = await meOrThrow(ctx);
    if (me.role !== "field") {
      throw new Error("Pengajuan hanya untuk sales lapangan. Supervisor bisa langsung menggeser jadwal.");
    }

    const s: any = await baseSchedule(ctx, scheduleId, me);
    await ensureNoPending(ctx, scheduleId);

    if (!isValidDateKey(toDateKey)) throw new Error("Tanggal tujuan tidak valid.");
    const today = dayKeyWIB();
    if (toDateKey < today) throw new Error("Tidak bisa mengajukan tanggal yang sudah lewat.");
    if (toDateKey === s.dateKey) throw new Error("Tanggal tujuan sama dengan tanggal sekarang.");

    // 1 toko = 1 baris per bulan (validasi awal; diperiksa ulang saat disetujui).
    const toMonth = toDateKey.slice(0, 7);
    if (toMonth !== s.monthKey) {
      const clash: any = await ctx.db.query("visit_schedules")
        .withIndex("by_month_store_key", (q: any) => q.eq("monthKey", toMonth).eq("storeKey", s.storeKey))
        .first();
      if (clash) throw new Error(`Toko ini sudah punya jadwal di ${clash.tanggal} pada bulan tujuan.`);
    }

    const now = Date.now();
    const alasan = (reason ?? "").trim();
    const requestId = await ctx.db.insert("jadwal_requests", {
      scheduleId,
      kind: "move",
      area: s.area,
      salesId: s.salesId ?? me._id,
      requestedBy: me._id,
      requestedByName: me.name ?? "Sales",
      requestedByRole: me.role,
      storeName: s.storeName,
      noSpk: s.noSpk ?? undefined,
      fromDateKey: s.dateKey,
      toDateKey,
      reason: alasan,
      note: (note ?? "").trim() || undefined,
      status: "pending",
      createdAt: now,
    });

    await notifySupervisors(ctx, {
      fromUserId: me._id,
      fromName: me.name ?? "Sales",
      title: "Pengajuan geser jadwal",
      body: `${s.storeName} (${s.area}): ${s.tanggal} → ${toDateKey}` + (alasan ? ` — ${alasan}` : ""),
      kind: "jadwal_request_move",
      link: `/spv-approval?tab=jadwal`,
    });

    await logAudit(ctx, {
      actorId: me._id,
      actorName: me.name ?? "Sales",
      actorRole: me.role,
      action: "jadwal.request.move",
      entityType: "visit_schedule",
      entityId: String(scheduleId),
      area: s.area,
      summary: `Ajukan geser ${s.storeName} (${s.area}) ${s.tanggal} → ${toDateKey}` + (alasan ? ` — ${alasan}` : ""),
      before: { dateKey: s.dateKey },
      after: { dateKey: toDateKey },
      metadata: { requestId },
    });

    return { ok: true, requestId };
  },
});

// ===== AJUKAN HAPUS / BATALKAN JADWAL =====
export const requestCancel = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    reason: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { scheduleId, reason, note }) => {
    const me = await meOrThrow(ctx);
    if (me.role !== "field") {
      throw new Error("Pengajuan hanya untuk sales lapangan. Supervisor bisa langsung menghapus jadwal.");
    }

    const s: any = await baseSchedule(ctx, scheduleId, me);
    await ensureNoPending(ctx, scheduleId);

    const alasan = (reason ?? "").trim();
    if (!alasan) throw new Error("Alasan wajib dipilih supaya supervisor paham.");

    const now = Date.now();
    const requestId = await ctx.db.insert("jadwal_requests", {
      scheduleId,
      kind: "cancel",
      area: s.area,
      salesId: s.salesId ?? me._id,
      requestedBy: me._id,
      requestedByName: me.name ?? "Sales",
      requestedByRole: me.role,
      storeName: s.storeName,
      noSpk: s.noSpk ?? undefined,
      fromDateKey: s.dateKey,
      reason: alasan,
      note: (note ?? "").trim() || undefined,
      status: "pending",
      createdAt: now,
    });

    await notifySupervisors(ctx, {
      fromUserId: me._id,
      fromName: me.name ?? "Sales",
      title: "Pengajuan hapus jadwal",
      body: `${s.storeName} (${s.area}) ${s.tanggal} — ${alasan}`,
      kind: "jadwal_request_cancel",
      link: `/spv-approval?tab=jadwal`,
    });

    await logAudit(ctx, {
      actorId: me._id,
      actorName: me.name ?? "Sales",
      actorRole: me.role,
      action: "jadwal.request.cancel",
      entityType: "visit_schedule",
      entityId: String(scheduleId),
      area: s.area,
      summary: `Ajukan hapus ${s.storeName} (${s.area}) ${s.tanggal} — ${alasan}`,
      before: { status: s.status },
      after: { status: "CANCELLED (diajukan)" },
      metadata: { requestId },
    });

    return { ok: true, requestId };
  },
});

// ===== TARIK PENGAJUAN (sales berubah pikiran) =====
export const withdraw = mutation({
  args: { requestId: v.id("jadwal_requests") },
  handler: async (ctx, { requestId }) => {
    const me = await meOrThrow(ctx);
    const r: any = await ctx.db.get(requestId);
    if (!r) throw new Error("Pengajuan tidak ditemukan.");
    if (String(r.requestedBy) !== String(me._id) && !isManager(me)) {
      throw new Error("Pengajuan ini bukan milikmu.");
    }
    if (r.status !== "pending") throw new Error("Pengajuan ini sudah diproses.");

    await ctx.db.patch(requestId, { status: "rejected", reviewedAt: Date.now(), reviewNote: "Ditarik oleh pengaju" });
    return { ok: true };
  },
});

// ===== PUTUSKAN (supervisor / owner) =====
export const decide = mutation({
  args: {
    requestId: v.id("jadwal_requests"),
    approve: v.boolean(),
    reviewNote: v.optional(v.string()),
    ignoreMinimum: v.optional(v.boolean()),
  },
  handler: async (ctx, { requestId, approve, reviewNote, ignoreMinimum }) => {
    const me = await meOrThrow(ctx);
    if (!isManager(me)) throw new Error("Hanya supervisor yang boleh menyetujui pengajuan jadwal.");

    const r: any = await ctx.db.get(requestId);
    if (!r) throw new Error("Pengajuan tidak ditemukan.");
    if (r.status !== "pending") throw new Error("Pengajuan ini sudah diproses.");

    const actor = { userId: me._id, name: me.name ?? "Supervisor", role: me.role ?? "supervisor" };
    const catatan = (reviewNote ?? "").trim();
    const now = Date.now();

    if (approve) {
      if (r.kind === "move") {
        if (!r.toDateKey) throw new Error("Tanggal tujuan pengajuan kosong.");
        await performMove(ctx, actor, {
          scheduleId: r.scheduleId,
          toDateKey: r.toDateKey,
          reason: r.reason ? `Diajukan sales: ${r.reason}` : "Disetujui supervisor",
          ignoreMinimum,
          viaApprovalOf: requestId,
        });
      } else {
        await performCancel(ctx, actor, {
          scheduleId: r.scheduleId,
          reason: r.reason || "Disetujui supervisor",
          ignoreMinimum,
          viaApprovalOf: requestId,
        });
      }
    }

    await ctx.db.patch(requestId, {
      status: approve ? "approved" : "rejected",
      reviewedBy: me._id,
      reviewedByName: me.name ?? "Supervisor",
      reviewedAt: now,
      reviewNote: catatan || undefined,
      updatedAt: now,
    });

    await notifyUser(ctx, {
      toUserId: r.requestedBy,
      fromUserId: me._id,
      fromName: me.name ?? "Supervisor",
      title: approve ? "Pengajuan jadwal disetujui" : "Pengajuan jadwal ditolak",
      body:
        `${r.storeName}: ${r.kind === "move" ? `geser ke ${r.toDateKey}` : "hapus dari jadwal"} — ` +
        (approve ? "disetujui" : "ditolak") +
        (catatan ? ` (${catatan})` : ""),
      kind: approve ? "jadwal_request_approved" : "jadwal_request_rejected",
      link: `/jadwal/${r.scheduleId}`,
    });

    await logAudit(ctx, {
      actorId: me._id,
      actorName: me.name ?? "Supervisor",
      actorRole: me.role ?? "supervisor",
      action: approve ? "jadwal.request.approve" : "jadwal.request.reject",
      entityType: "jadwal_request",
      entityId: String(requestId),
      area: r.area,
      summary:
        `${approve ? "Setujui" : "Tolak"} pengajuan ${r.kind === "move" ? "geser" : "hapus"} ` +
        `${r.storeName} (${r.area}) oleh ${r.requestedByName}` + (catatan ? ` — ${catatan}` : ""),
      metadata: { scheduleId: String(r.scheduleId), kind: r.kind, ignoreMinimum: ignoreMinimum === true },
    });

    return { ok: true, status: approve ? "approved" : "rejected" };
  },
});

// ===== DAFTAR PENGAJUAN =====
// Supervisor/owner melihat semua. Sales hanya melihat pengajuannya sendiri.
export const list = query({
  args: {
    status: v.optional(STATUS_V),
    scheduleId: v.optional(v.id("visit_schedules")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, scheduleId, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me: any = await ctx.db.get(userId);
    if (!me) return [];

    const take = Math.min(limit ?? 60, 120);

    let rows: any[];
    if (scheduleId) {
      rows = await ctx.db.query("jadwal_requests")
        .withIndex("by_schedule", (q: any) => q.eq("scheduleId", scheduleId))
        .order("desc")
        .take(take);
      if (!isManager(me)) rows = rows.filter((r) => String(r.requestedBy) === String(userId));
    } else if (isManager(me)) {
      rows = status
        ? await ctx.db.query("jadwal_requests")
            .withIndex("by_status_created", (q: any) => q.eq("status", status))
            .order("desc")
            .take(take)
        : await ctx.db.query("jadwal_requests").order("desc").take(take);
    } else {
      rows = await ctx.db.query("jadwal_requests")
        .withIndex("by_requested_created", (q: any) => q.eq("requestedBy", userId))
        .order("desc")
        .take(take);
      if (status) rows = rows.filter((r) => r.status === status);
    }

    if (scheduleId && status) rows = rows.filter((r) => r.status === status);

    const out: any[] = [];
    for (const r of rows) {
      const s: any = await ctx.db.get(r.scheduleId);
      out.push({
        _id: r._id,
        kind: r.kind,
        status: r.status,
        area: r.area,
        scheduleId: r.scheduleId,
        storeName: r.storeName,
        noSpk: r.noSpk ?? null,
        fromDateKey: r.fromDateKey,
        toDateKey: r.toDateKey ?? null,
        reason: r.reason ?? "",
        note: r.note ?? null,
        requestedBy: r.requestedBy,
        requestedByName: r.requestedByName ?? "-",
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt ?? null,
        reviewedByName: r.reviewedByName ?? null,
        reviewNote: r.reviewNote ?? null,
        // Kondisi baris saat ini, supaya supervisor tahu pengajuan masih relevan.
        scheduleStatus: s?.status ?? null,
        scheduleDateKey: s?.dateKey ?? null,
      });
    }
    return out;
  },
});

// ===== Jumlah yang menunggu (badge menu & banner) =====
export const pendingCount = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const me: any = await ctx.db.get(userId);
    if (!me) return 0;

    if (isManager(me)) {
      const rows: any[] = await ctx.db.query("jadwal_requests")
        .withIndex("by_status_created", (q: any) => q.eq("status", "pending"))
        .take(200);
      return rows.length;
    }

    const mine: any[] = await ctx.db.query("jadwal_requests")
      .withIndex("by_requested_created", (q: any) => q.eq("requestedBy", userId))
      .order("desc")
      .take(50);
    return mine.filter((r) => r.status === "pending").length;
  },
});
