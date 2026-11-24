import { dayKeyWIB, isValidDateKey, minPerDay, noSpkOf, tanggalOf } from "./jadwalRules";
import { logAudit } from "./audit";

// ==========================================================================
// OPERASI JADWAL YANG DIPAKAI BERSAMA
//
// Satu tempat untuk geser & batalkan, supaya:
//   • aksi langsung supervisor (jadwalEdit) dan
//   • persetujuan pengajuan sales (jadwalRequests)
// memakai aturan yang PERSIS sama — tidak ada dua versi aturan.
// ==========================================================================

export type JadwalActor = { userId: any; name: string; role: string };

// Sisa toko pada satu tanggal untuk satu area (CANCELLED tidak dihitung).
// `exceptId` = baris yang sedang digeser/dibatalkan, tidak ikut dihitung.
export async function countDay(ctx: any, dateKey: string, area: string, exceptId?: any) {
  const rows: any[] = await ctx.db.query("visit_schedules")
    .withIndex("by_date_area", (q: any) => q.eq("dateKey", dateKey).eq("area", area))
    .collect();
  return rows.filter(
    (r) => r.status !== "CANCELLED" && String(r._id) !== String(exceptId ?? "")
  ).length;
}

export function minimumMessage(dateKey: string, remaining: number) {
  const min = minPerDay(dateKey);
  return (
    `Kalau dikeluarkan, ${tanggalOf(dateKey)} tinggal ${remaining} toko — ` +
    `di bawah minimal ${min} toko/hari. Tekan "Tetap lanjutkan" kalau memang disengaja.`
  );
}

export async function notifyUser(
  ctx: any,
  args: {
    toUserId?: any;
    fromUserId: any;
    fromName: string;
    title: string;
    body: string;
    kind: string;
    link: string;
  }
) {
  if (!args.toUserId) return;
  await ctx.db.insert("notifications", {
    userId: args.toUserId,
    fromUserId: args.fromUserId,
    fromName: args.fromName,
    title: args.title,
    body: args.body,
    kind: args.kind,
    link: args.link,
    createdAt: Date.now(),
  });
}

// Kirim notifikasi ke semua supervisor (dipakai saat sales mengajukan perubahan).
export async function notifySupervisors(
  ctx: any,
  args: {
    fromUserId: any;
    fromName: string;
    title: string;
    body: string;
    kind: string;
    link: string;
  }
) {
  const all: any[] = await ctx.db.query("users").collect();
  const now = Date.now();
  for (const u of all) {
    if (u.role !== "supervisor") continue;
    await ctx.db.insert("notifications", {
      userId: u._id,
      fromUserId: args.fromUserId,
      fromName: args.fromName,
      title: args.title,
      body: args.body,
      kind: args.kind,
      link: args.link,
      createdAt: now,
    });
  }
}

// ===== GESER TANGGAL =====
export async function performMove(
  ctx: any,
  actor: JadwalActor,
  args: {
    scheduleId: any;
    toDateKey: string;
    reason?: string;
    ignoreMinimum?: boolean;
    viaApprovalOf?: any;
  }
) {
  const { scheduleId, toDateKey, reason, ignoreMinimum } = args;

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
      .withIndex("by_month_store_key", (q: any) => q.eq("monthKey", toMonth).eq("storeKey", s.storeKey))
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
    editedBy: actor.userId,
    editKind: "move",
    editReason: alasan || undefined,
    updatedAt: now,
  } as any);

  const dari = tanggalOf(s.dateKey);
  const ke = tanggalOf(toDateKey);

  await logAudit(ctx, {
    actorId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
    action: args.viaApprovalOf ? "jadwal.move.approved" : "jadwal.move",
    entityType: "visit_schedule",
    entityId: String(scheduleId),
    area: s.area,
    summary:
      `Geser jadwal ${s.storeName} (${s.area}) ${dari} → ${ke}` +
      (alasan ? ` — ${alasan}` : "") +
      (args.viaApprovalOf ? " (disetujui dari pengajuan sales)" : ""),
    before: { dateKey: s.dateKey, tanggal: s.tanggal },
    after: { dateKey: toDateKey, tanggal: tanggalOf(toDateKey) },
    metadata: { noSpk, ignoreMinimum: ignoreMinimum === true, requestId: args.viaApprovalOf ?? null },
  });

  await notifyUser(ctx, {
    toUserId: s.salesId,
    fromUserId: actor.userId,
    fromName: actor.name,
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
}

// ===== BATALKAN JADWAL =====
// Baris TIDAK dihapus: tetap disimpan sebagai CANCELLED + alasan, supaya
// pertanyaan "kenapa toko ini tidak dikunjungi" bisa dijawab. Baris batal
// tidak muncul di daftar SPK, dan sync tidak akan menghidupkannya lagi.
export async function performCancel(
  ctx: any,
  actor: JadwalActor,
  args: {
    scheduleId: any;
    reason: string;
    ignoreMinimum?: boolean;
    viaApprovalOf?: any;
  }
) {
  const { scheduleId, reason, ignoreMinimum } = args;

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
    editedBy: actor.userId,
    editKind: "cancel",
    editReason: alasan,
    updatedAt: now,
  } as any);

  await logAudit(ctx, {
    actorId: actor.userId,
    actorName: actor.name,
    actorRole: actor.role,
    action: args.viaApprovalOf ? "jadwal.cancel.approved" : "jadwal.cancel",
    entityType: "visit_schedule",
    entityId: String(scheduleId),
    area: s.area,
    summary:
      `Batalkan jadwal ${s.storeName} (${s.area}) ${s.tanggal} — ${alasan}` +
      (args.viaApprovalOf ? " (disetujui dari pengajuan sales)" : ""),
    before: { status: s.status, dateKey: s.dateKey },
    after: { status: "CANCELLED" },
    metadata: { noSpk: noSpkOf(s), ignoreMinimum: ignoreMinimum === true, requestId: args.viaApprovalOf ?? null },
  });

  await notifyUser(ctx, {
    toUserId: s.salesId,
    fromUserId: actor.userId,
    fromName: actor.name,
    title: "Jadwal dibatalkan",
    body: `${s.storeName} (${s.tanggal}) dibatalkan: ${alasan}`,
    kind: "jadwal_cancel",
    link: `/jadwal/${scheduleId}`,
  });

  return { ok: true, sisa, min: minPerDay(s.dateKey) };
}
