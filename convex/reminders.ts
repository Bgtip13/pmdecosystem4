import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ============================================================================
// NOTIFIKASI SISTEM — HANYA 5 ATURAN
//   1. Piutang selesai disinkron SPV      → sales telemarketing   (piutangSync.ts)
//   2. 15.00 SPK Admin masih OPEN         → sales telemarketing
//   3. 12.00 / 15.00 / 17.00 cek riwayat  → supervisor & owner
//   4. Minggu: SEMUA notifikasi sistem dimatikan
//   5. 15.00 kunjungan < 7 toko           → sales lapangan
//
// Semua pengingat lain DIHENTIKAN: janji bayar 08.00, FU Toko bulanan,
// FU Toko menunggu review, pengingat pengecualian SPK 17.00, kunjungan 17.00,
// dan rekap harian 20.00.
// ============================================================================

const WIB = 7 * 3600 * 1000;
const MIN_VISITS = 7;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const clampPush = (s: string) => (s.length > 120 ? s.slice(0, 117) + "…" : s);

function wibNow(now = Date.now()) {
  const d = new Date(now + WIB);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), dow: d.getUTCDay() };
}

// ATURAN 4 — Minggu (getUTCDay() === 0) tidak ada notifikasi sistem sama sekali.
function isSundayWIB(now = Date.now()) {
  return new Date(now + WIB).getUTCDay() === 0;
}

function pickNames(names: string[], max = 2) {
  const clean = Array.from(new Set(names.filter((n) => !!n && n.trim() !== "")));
  return { shown: clean.slice(0, max), more: Math.max(0, clean.length - max) };
}

// ===== PENYUSUN PESAN (aturan 2) — hanya tugas yang MASIH OPEN =====
function buildAdminOpenMessage({ piu, ord, names }: { piu: number; ord: number; names: string[] }) {
  const total = piu + ord;
  if (total === 0) return null; // semua sudah dikerjakan → jangan diganggu
  const title = total === 1 ? "SPK Admin: 1 tugas belum selesai" : `SPK Admin: ${total} tugas belum selesai`;
  const parts: string[] = [];
  if (piu > 0) parts.push(`${piu} follow-up piutang`);
  if (ord > 0) parts.push(`${ord} orderan`);
  const { shown, more } = pickNames(names);
  const tail = shown.length ? ` Belum dikerjakan: ${shown.join(", ")}${more > 0 ? ` +${more} lagi` : ""}.` : "";
  return {
    title,
    body: `Masih OPEN: ${parts.join(" + ")}.${tail}`,
    pushBody: clampPush(`${parts.join(" + ")} masih OPEN${shown.length ? ` — ${shown[0]}` : ""}.`),
  };
}

// ===== PENYUSUN PESAN (aturan 5) — target kunjungan sales lapangan =====
function buildFieldVisitMessage({ done, target, storeName }: { done: number; target: number; storeName?: string }) {
  const less = Math.max(0, target - done);
  if (less === 0) return null; // target tercapai → jangan kirim
  const title = done === 0 ? "Belum ada kunjungan hari ini" : `Kunjungan ${done}/${target} hari ini`;
  const body = done === 0
    ? `Target ${target} toko/hari. Belum ada check-in sama sekali — mulai dari toko terdekat.`
    : `Baru ${done} dari ${target} kunjungan • kurang ${less} toko lagi${storeName ? ` • terakhir di ${storeName}` : ""}.`;
  return { title, body, pushBody: `Baru ${done}/${target} kunjungan — kurang ${less} lagi.` };
}

// ===== PENYUSUN PESAN (aturan 3) — supervisor & owner cek riwayat =====
function buildRiwayatMessage(
  slot: number,
  d: any
): { title: string; body: string; pushBody: string } {
  const when = slot <= 12 ? "Siang ini" : slot <= 15 ? "Sore ini" : "Menjelang tutup";
  const visits = d?.visits ?? { done: 0, inpg: 0 };
  const admin = d?.admin ?? { open: 0, inpg: 0 };
  const title = `Cek riwayat kunjungan & follow-up (${slot}.00)`;
  const body =
    `${when}: ${visits.done} kunjungan sales selesai • ${visits.inpg} SPK sales menunggu review • ` +
    `${admin.open} SPK admin masih OPEN • ${admin.inpg} menunggu review. Buka Riwayat untuk menelusuri detailnya.`;
  return { title, body, pushBody: clampPush(`${visits.done} kunjungan • ${admin.open} SPK admin OPEN • cek riwayat.`) };
}

// ===== KIRIM PUSH (best-effort; notifikasi in-app sudah tersimpan) =====
async function sendPush(payloads: any[]) {
  for (let i = 0; i < payloads.length; i += 100) {
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloads.slice(i, i + 100)),
      });
    } catch {
      // diabaikan — yang penting notifikasi in-app sudah masuk
    }
  }
}

// ===== PUSH UNTUK DAFTAR USER (dipakai aturan 1 dari piutangSync.finishRun) =====
export const pushToUsers = internalAction({
  args: {
    userIds: v.array(v.id("users")),
    title: v.string(),
    body: v.string(),
    kind: v.string(),
    link: v.optional(v.string()),
  },
  handler: async (ctx, { userIds, title, body, kind, link }): Promise<any> => {
    if (isSundayWIB()) return { skipped: true, reason: "Minggu" };
    const tokens: string[] = await ctx.runQuery(internal.reminderData.getPushTokens, { userIds });
    const pushBody = clampPush(body);
    await sendPush(tokens.map((tk) => ({ to: tk, title, body: pushBody, sound: "default", data: { kind, link } })));
    return { sent: tokens.length };
  },
});

// ============================================================================
// (2) 15.00 WIB — SPK Admin belum selesai → HANYA ke sales telemarketing,
//     dan hanya menyebut tugas yang statusnya MASIH OPEN.
// ============================================================================
export const checkSpkAdmin = internalAction({
  handler: async (ctx): Promise<any> => {
    if (isSundayWIB()) return { skipped: true, reason: "Minggu" };

    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const pushes: any[] = [];
    let sent = 0;

    for (const row of d.teleRows) {
      if (row.onLeave) continue;                                 // sedang izin → jangan diganggu
      const open = (row.piuOpen ?? 0) + (row.ordOpen ?? 0);
      if (open === 0) continue;                                  // semua sudah dikerjakan

      const msg = buildAdminOpenMessage({ piu: row.piuOpen ?? 0, ord: row.ordOpen ?? 0, names: row.names ?? [] });
      if (!msg) continue;

      const res: any = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId,
        title: msg.title,
        body: msg.body,
        kind: "spk_admin",
        link: "/spk",
        day: d.day,
        dedupeKey: `notif:spkadmin:${d.day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "spk_admin", link: "/spk" } });
        }
      }
    }

    await sendPush(pushes);
    return { day: d.day, sent };
  },
});

// ============================================================================
// (5) 15.00 WIB — sales lapangan yang kunjungannya masih di bawah 7 toko.
// ============================================================================
export const checkFieldVisits = internalAction({
  handler: async (ctx): Promise<any> => {
    if (isSundayWIB()) return { skipped: true, reason: "Minggu" };

    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const pushes: any[] = [];
    let sent = 0;

    for (const row of d.fieldRows) {
      if (row.onLeave) continue;                                  // izin → tidak diingatkan
      const msg = buildFieldVisitMessage({ done: row.done ?? 0, target: MIN_VISITS, storeName: row.lastStore });
      if (!msg) continue;

      const res: any = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId,
        title: msg.title,
        body: msg.body,
        kind: "field_visits",
        link: "/spk",
        day: d.day,
        dedupeKey: `notif:visits:${d.day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "field_visits", link: "/spk" } });
        }
      }
    }

    await sendPush(pushes);
    return { day: d.day, sent };
  },
});

// ============================================================================
// (3) 12.00 / 15.00 / 17.00 WIB — supervisor & owner: cek riwayat kunjungan
//     dan follow-up (SPK sales & SPK admin). Satu cron memanggil action ini
//     tiga kali sehari; jam WIB dipakai sebagai penanda sesi (12 / 15 / 17).
// ============================================================================
export const checkRiwayat = internalAction({
  handler: async (ctx): Promise<any> => {
    if (isSundayWIB()) return { skipped: true, reason: "Minggu" };

    const { day, hour } = wibNow();
    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const msg = buildRiwayatMessage(hour, d);

    const pushes: any[] = [];
    let sent = 0;

    const recipients: any[] = [...(d.supRows ?? []), ...(d.ownerRows ?? [])];
    for (const row of recipients) {
      const res: any = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId,
        title: msg.title,
        body: msg.body,
        kind: "riwayat_cek",
        link: "/riwayat",
        day,
        dedupeKey: `notif:riwayat:${hour}:${day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "riwayat_cek", link: "/riwayat" } });
        }
      }
    }

    await sendPush(pushes);
    return { day, slot: hour, sent };
  },
});
