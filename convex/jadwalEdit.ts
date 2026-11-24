import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";
import { dayKeyWIB } from "./lib/jadwalRules";
import { performCancel, performMove } from "./lib/jadwalOps";

// ==========================================================================
// KELOLA JADWAL DARI APLIKASI (SUPERVISOR & OWNER)
//
// Latar belakang: sheet JADWAL hanya untuk INPUT. Geser / batalkan / edit
// dilakukan di sini supaya:
//   • tidak ada lagi dua sumber kebenaran (sheet vs app),
//   • sync berikutnya tidak mengembalikan tanggal yang sudah diputuskan,
//   • setiap perubahan punya alasan, pelaku, dan jejak audit.
//
// Sales tidak memakai fungsi ini — sales MENGAJUKAN lewat jadwalRequests,
// lalu supervisor menyetujui. Aturan geser/batal ada di lib/jadwalOps supaya
// kedua jalur memakai aturan yang sama.
// ==========================================================================

async function requireManager(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Belum login.");
  const me: any = await ctx.db.get(userId);
  if (me?.role !== "supervisor" && me?.role !== "owner") {
    throw new Error("Hanya supervisor yang boleh mengelola jadwal.");
  }
  return { userId, me, actor: { userId, name: me?.name ?? "Supervisor", role: me?.role ?? "supervisor" } };
}

// ===== GESER TANGGAL =====
export const moveSchedule = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    toDateKey: v.string(),
    reason: v.optional(v.string()),
    ignoreMinimum: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireManager(ctx);
    return await performMove(ctx, actor, args);
  },
});

// ===== BATALKAN / HAPUS DARI JADWAL =====
export const cancelSchedule = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    reason: v.string(),
    ignoreMinimum: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireManager(ctx);
    return await performCancel(ctx, actor, args);
  },
});

// ===== PULIHKAN BARIS YANG TERLANJUR DIBATALKAN =====
// Hanya untuk salah tekan: Status kembali PLANNED, tetap terkunci dari sheet.
export const restoreSchedule = mutation({
  args: { scheduleId: v.id("visit_schedules") },
  handler: async (ctx, { scheduleId }) => {
    const { userId, me } = await requireManager(ctx);

    const s: any = await ctx.db.get(scheduleId);
    if (!s) throw new Error("Jadwal tidak ditemukan.");
    if (s.status !== "CANCELLED") throw new Error("Hanya jadwal yang dibatalkan bisa dipulihkan.");
    if (s.visitId) throw new Error("Baris ini sudah punya kunjungan.");

    const today = dayKeyWIB();
    if (s.dateKey < today) throw new Error("Tanggalnya sudah lewat — geser dulu ke tanggal baru.");

    await ctx.db.patch(scheduleId, {
      status: "PLANNED",
      dateLocked: true,
      editedAt: Date.now(),
      editedBy: userId,
      editKind: "move",
      editReason: "Dipulihkan supervisor",
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      actorId: userId,
      actorName: me?.name ?? "Supervisor",
      actorRole: me?.role ?? "supervisor",
      action: "jadwal.restore",
      entityType: "visit_schedule",
      entityId: String(scheduleId),
      area: s.area,
      summary: `Pulihkan jadwal ${s.storeName} (${s.area}) ${s.tanggal}`,
      before: { status: "CANCELLED" },
      after: { status: "PLANNED" },
    });

    return { ok: true };
  },
});
