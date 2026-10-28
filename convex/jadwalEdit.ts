import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logAudit } from "./lib/audit";
import { dayKeyWIB, isValidDateKey, minPerDay, noSpkOf, tanggalOf } from "./lib/jadwalRules";

// ==========================================================================
// KELOLA JADWAL DARI APLIKASI (KHUSUS SUPERVISOR)
//
// Latar belakang: sheet JADWAL hanya untuk INPUT. Geser / batalkan / edit
// dilakukan di sini supaya:
//   • tidak ada lagi dua sumber kebenaran (sheet vs app),
//   • sync berikutnya tidak mengembalikan tanggal yang sudah diputuskan,
//   • setiap perubahan punya alasan, pelaku, dan jejak audit.
//
// Aturan yang dijaga:
//   • hanya supervisor,
//   • hanya baris yang belum dikerjakan (PLANNED) yang boleh digeser/dibatalkan,
//   • tidak boleh ke tanggal yang sudah lewat,
//   • 1 toko tetap 1 baris per bulan (tidak boleh dobel saat pindah bulan),
//   • kuota minimal per hari (7 toko; Sabtu 3) — pelanggaran harus disengaja.
// ==========================================================================

async function requireSupervisor(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Belum login.");
  const me: any = await ctx.db.get(userId);
  if (me?.role !== "supervisor") {
    throw new Error("Hanya supervisor yang boleh mengelola jadwal.");
  }
  return { userId, me };
}

// Sisa toko pada satu tanggal untuk satu area (CANCELLED tidak dihitung).
// `exceptId` = baris yang sedang digeser/dibatalkan, tidak ikut dihitung.
async function countDay(ctx: any, dateKey: string, area: string, exceptId?: any) {
  const rows: any[] = await ctx.db.query("visit_schedules")
    .withIndex("by_date_area", (q: any) => q.eq("dateKey", dateKey).eq("area", area))
    .collect();
  return rows.filter(
    (r) => r.status !== "CANCELLED" && String(r._id) !== String(exceptId ?? "")
  ).length;
}

function minimumMessage(dateKey: string, remaining: number) {
  const min = minPerDay(dateKey);
  return (
    `Kalau dikeluarkan, ${tanggalOf(dateKey)} tinggal ${remaining} toko — ` +
    `di bawah minimal ${min} toko/hari. Tekan "Tetap lanjutkan" kalau memang disengaja.`
  );
}

async function notifySales(
  ctx: any,
  args: {
    salesId?: any;
    fromUserId: any;
    fromName: string;
    title: string;
    body: string;
    kind: string;
    link: string;
  }
) {
  if (!args.salesId) return;
  await ctx.db.insert("notifications", {
    userId: args.salesId,
    fromUserId: args.fromUserId,
    fromName: args.fromName,
    title: args.title,
    body: args.body,
    kind: args.kind,
    link: args.link,
    createdAt: Date.now(),
  });
}

// ===== GESER TANGGAL =====
export const moveSchedule = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    toDateKey: v.string(),
    reason: v.optional(v.string()),
    ignoreMinimum: v.optional(v.boolean()),
  },
  handler: async (ctx, { scheduleId, toDateKey, reason, ignoreMinimum }) => {
    const { userId, me } = await requireSupervisor(ctx);

    const s: any = await ctx.db.get(scheduleId);
    if (!s) throw new Error("Jadwal tidak ditemukan.");
    if (s.status === "ONGOING" || s.status === "DONE") {
      throw new Error(
        "Jadwal ini sudah dikerjakan, jadi tanggalnya tidak bisa digeser. " +
        "Kalau perlu kunjungan ulang, tambahkan kunjungan baru."
      );
    }
    if (s.status === "CANCELLED") throw new Error("Jadwal ini sudah dibatalkan.");
    if (s.visitId) throw new Error("Baris ini sudah tertaut kunjungan — tidak bisa digeser.");

    if (!isValidDateKey(toDateKey)) throw new Error("Tanggal tujuan tidak valid.");
    if (toDateKey === s.dateKey) throw new Error("Tanggal tujuan sama dengan tanggal sekarang.");

    const today = dayKeyWIB();
    if (toDateKey < today) throw new Error("Tidak bisa menggeser ke tanggal yang sudah lewat.");

    // 1 toko = 1 baris per bulan. Pindah bulan tidak boleh membuat toko dobel.
    const toMonth = toDateKey.slice(0, 7);
    if (toMonth !== s.monthKey) {
      const clash: any = await ctx.db.query("visit_schedules")
        .withIndex("by_month_store_key", (q) => q.eq("monthKey", toMonth).eq("storeKey", s.storeKey))
        .first();
      if (clash) {
        throw new Error(`Toko ini sudah punya jadwal di ${clash.tanggal} pada bulan tujuan.`);
      }
    }

    // Kuota minimal hari ASAL. Hari yang sudah lewat tidak perlu dijaga.
    const sisaAsal = await countDay(ctx, s.dateKey, s.area, scheduleId);
    if (!ignoreMinimum && s.dateKey >= today && sisaAsal < minPerDay(s.dateKey)) {
      throw new Error(minimumMessage(s.dateKey, sisaAsal));
    }

    const now = Date.now();
    const alasan = (reason ?? "").trim();

    // Nomor SPK dibekukan SEBELUM tanggal berubah, supaya nomornya tidak ikut berganti.
    const noSpk = noSpkOf(s);

    await ctx.db.patch(scheduleId, {
      monthKey: toMonth,
      dateKey: toDateKey,
      tanggal: tanggalOf(toDateKey),
      noSpk,
      dateLocked: true,
      originalDateKey: s.originalDateKey ?? s.dateKey,
      previousDateKey: s.dateKey,
      editedAt: now,
      editedBy: userId,
      editKind: "move",
      editReason: alasan || undefined,
      updatedAt: now,
    });

    const dari = tanggalOf(s.dateKey);
    const ke = tanggalOf(toDateKey);

    await logAudit(ctx, {
      actorId: userId,
      actorName: me?.name ?? "Supervisor",
      actorRole: me?.role ?? "supervisor",
      action: "jadwal.move",
      entityType: "visit_schedule",
      entityId: String(scheduleId),
      area: s.area,
      summary: `Geser jadwal ${s.storeName} (${s.area}) ${dari} → ${ke}` + (alasan ? ` — ${alasan}` : ""),
      before: { dateKey: s.dateKey, tanggal: s.tanggal },
      after: { dateKey: toDateKey, tanggal: tanggalOf(toDateKey) },
      metadata: { noSpk, ignoreMinimum: ignoreMinimum === true },
    });

    await notifySales(ctx, {
      salesId: s.salesId,
      fromUserId: userId,
      fromName: me?.name ?? "Supervisor",
      title: "Jadwal digeser",
      body: `${s.storeName}: ${dari} → ${ke}${alasan ? ` (${alasan})` : ""}`,
      kind: "jadwal_move",
      link: `/jadwal/${scheduleId}`,
    });

    return {
      ok: true,
      from: s.dateKey,
      to: toDateKey,
      sisaAsal,
      minAsal: minPerDay(s.dateKey),
      toDayCount: await countDay(ctx, toDateKey, s.area),
      minTujuan: minPerDay(toDateKey),
    };
  },
});

// ===== BATALKAN JADWAL =====
// Baris TIDAK dihapus: tetap disimpan sebagai CANCELLED + alasan, supaya
// pertanyaan "kenapa toko ini tidak dikunjungi" bisa dijawab. Baris batal
// tidak muncul di daftar SPK, dan sync tidak akan menghidupkannya lagi.
export const cancelSchedule = mutation({
  args: {
    scheduleId: v.id("visit_schedules"),
    reason: v.string(),
    ignoreMinimum: v.optional(v.boolean()),
  },
  handler: async (ctx, { scheduleId, reason, ignoreMinimum }) => {
    const { userId, me } = await requireSupervisor(ctx);

    const alasan = (reason ?? "").trim();
    if (!alasan) throw new Error("Alasan pembatalan wajib diisi.");

    const s: any = await ctx.db.get(scheduleId);
    if (!s) throw new Error("Jadwal tidak ditemukan.");
    if (s.status === "CANCELLED") throw new Error("Jadwal ini sudah dibatalkan.");
    if (s.status === "ONGOING" || s.status === "DONE" || s.visitId) {
      throw new Error("Jadwal ini sudah ada kunjungannya, jadi tidak bisa dibatalkan.");
    }

    const today = dayKeyWIB();
    const sisa = await countDay(ctx, s.dateKey, s.area, scheduleId);
    if (!ignoreMinimum && s.dateKey >= today && sisa < minPerDay(s.dateKey)) {
      throw new Error(minimumMessage(s.dateKey, sisa));
    }

    const now = Date.now();
    await ctx.db.patch(scheduleId, {
      status: "CANCELLED",
      dateLocked: true,
      originalDateKey: s.originalDateKey ?? s.dateKey,
      editedAt: now,
      editedBy: userId,
      editKind: "cancel",
      editReason: alasan,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: userId,
      actorName: me?.name ?? "Supervisor",
      actorRole: me?.role ?? "supervisor",
      action: "jadwal.cancel",
      entityType: "visit_schedule",
      entityId: String(scheduleId),
      area: s.area,
      summary: `Batalkan jadwal ${s.storeName} (${s.area}) ${s.tanggal} — ${alasan}`,
      before: { status: s.status, dateKey: s.dateKey },
      after: { status: "CANCELLED" },
      metadata: { noSpk: noSpkOf(s), ignoreMinimum: ignoreMinimum === true },
    });

    await notifySales(ctx, {
      salesId: s.salesId,
      fromUserId: userId,
      fromName: me?.name ?? "Supervisor",
      title: "Jadwal dibatalkan",
      body: `${s.storeName} (${s.tanggal}) dibatalkan: ${alasan}`,
      kind: "jadwal_cancel",
      link: `/jadwal/${scheduleId}`,
    });

    return { ok: true, sisa, min: minPerDay(s.dateKey) };
  },
});

// ===== PULIHKAN BARIS YANG TERLANJUR DIBATALKAN =====
// Hanya untuk salah tekan: Status kembali PLANNED, tetap terkunci dari sheet.
export const restoreSchedule = mutation({
  args: { scheduleId: v.id("visit_schedules") },
  handler: async (ctx, { scheduleId }) => {
    const { userId, me } = await requireSupervisor(ctx);

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
