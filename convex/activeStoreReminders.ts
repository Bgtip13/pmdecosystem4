import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const WIB = 7 * 3600 * 1000;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function monthKeyWIB(now = Date.now()) {
  return new Date(now + WIB).toISOString().slice(0, 7);   // YYYY-MM
}
function dayKeyWIB(now = Date.now()) {
  return new Date(now + WIB).toISOString().slice(0, 10);  // YYYY-MM-DD
}

// Hari pengingat: tanggal 15, 20, 25, atau hari terakhir bulan (zona WIB)
function isReminderDay(now = Date.now()) {
  const n = new Date(now + WIB);
  const y = n.getUTCFullYear();
  const m = n.getUTCMonth();
  const today = n.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return today === 15 || today === 20 || today === 25 || today === lastDay;
}

async function sendPush(payloads: any[]) {
  for (let i = 0; i < payloads.length; i += 100) {
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloads.slice(i, i + 100)),
      });
    } catch {
      // diamkan — notifikasi in-app sudah tersimpan
    }
  }
}

// ===== BACA: rekap FU Toko bulan ini per area + token penerima (target akhir bulan) =====
export const collectActiveStorePending = internalQuery({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, { monthKey }) => {
    const mk = monthKey ?? monthKeyWIB();

    const rows = (await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect()) as any[];

    const byArea = new Map<string, { open: number; inpg: number; clsd: number; total: number }>();
    for (const r of rows) {
      const a = String(r.area ?? "-");
      const c = byArea.get(a) ?? { open: 0, inpg: 0, clsd: 0, total: 0 };
      if (r.workflowStatus === "OPEN") c.open++;
      else if (r.workflowStatus === "INPG") c.inpg++;
      else if (r.workflowStatus === "CLSD") c.clsd++;
      c.total++;
      byArea.set(a, c);
    }

    const users = await ctx.db.query("users").collect();
    const tokensFor = async (uid: any) => {
      const t = await ctx.db.query("push_tokens")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      return t.map((x) => x.token);
    };

    const sups: any[] = [];
    for (const u of users.filter((x: any) => x.role === "supervisor")) {
      sups.push({
        userId: u._id,
        name: (u as any).name ?? "",
        areas: (u as any).area ? [(u as any).area] : Array.from(byArea.keys()),
        tokens: await tokensFor(u._id),
      });
    }

    const tele: any[] = [];
    for (const u of users.filter((x: any) => x.role === "telemarketing" && (x as any).area)) {
      tele.push({
        userId: u._id,
        name: (u as any).name ?? "",
        area: (u as any).area,
        counts: byArea.get((u as any).area) ?? null,
        tokens: await tokensFor(u._id),
      });
    }

    return {
      monthKey: mk,
      day: dayKeyWIB(),
      byArea: Array.from(byArea.entries()).map(([area, c]) => ({ area, ...c })),
      sups,
      tele,
    };
  },
});

// ===== AKSI: target akhir bulan (dipanggil cron harian, hanya jalan di hari-H) =====
export const sendMonthly = internalAction({
  handler: async (ctx): Promise<any> => {
    if (!isReminderDay()) return { skipped: true, reason: "bukan hari pengingat" };

    const d: any = await ctx.runQuery(internal.activeStoreReminders.collectActiveStorePending, {});
    const day = d.day;
    const mk = d.monthKey;
    const pushes: any[] = [];
    let sent = 0;

    // Supervisor: ringkasan semua area (atau areanya sendiri)
    for (const sup of d.sups) {
      const hit = (d.byArea as any[]).filter(
        (a) => sup.areas.includes(a.area) && (a.open + a.inpg) > 0
      );
      if (hit.length === 0) continue;

      const open = hit.reduce((s, a) => s + a.open, 0);
      const inpg = hit.reduce((s, a) => s + a.inpg, 0);
      const title = `FU Toko ${mk}: ${open + inpg} belum CLSD`;
      const body = hit.map((a) => `${a.area}: ${a.open} OPEN • ${a.inpg} INPG`).join(" • ");

      const res: any = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: sup.userId, title, body, kind: "active_store_monthly",
        link: "/toko-aktif", day, dedupeKey: `actstore:${mk}:${day}:${sup.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of sup.tokens) {
          pushes.push({ to: tk, title, body, sound: "default", data: { kind: "active_store_monthly" } });
        }
      }
    }

    // Telemarketing: rekap areanya sendiri
    for (const t of d.tele) {
      const c = t.counts;
      if (!c || (c.open + c.inpg) === 0) continue;

      const title = `FU Toko ${t.area}: ${c.open + c.inpg} belum CLSD`;
      const body = `${c.open} OPEN • ${c.inpg} INPG • ${c.clsd} CLSD. Kejar sebelum tutup bulan.`;

      const res: any = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: t.userId, title, body, kind: "active_store_monthly",
        link: "/toko-aktif", day, dedupeKey: `actstore:${mk}:${day}:${t.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of t.tokens) {
          pushes.push({ to: tk, title, body, sound: "default", data: { kind: "active_store_monthly" } });
        }
      }
    }

    await sendPush(pushes);
    return { skipped: false, monthKey: mk, day, sent };
  },
});

// ===== BARU — BACA: tugas INPG yang menunggu review supervisor =====
export const collectPendingReview = internalQuery({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, { monthKey }) => {
    const mk = monthKey ?? monthKeyWIB();

    const rows = (await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect()) as any[];

    const inpg = rows.filter((r) => r.workflowStatus === "INPG");
    const byArea = new Map<string, number>();
    for (const r of inpg) {
      const a = String(r.area ?? "-");
      byArea.set(a, (byArea.get(a) ?? 0) + 1);
    }

    const users = await ctx.db.query("users").collect();
    const tokensFor = async (uid: any) => {
      const t = await ctx.db.query("push_tokens")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      return t.map((x) => x.token);
    };

    const sups: any[] = [];
    for (const u of users.filter((x: any) => x.role === "supervisor")) {
      const areas = (u as any).area ? [(u as any).area] : Array.from(byArea.keys());
      const count = areas.reduce((s, a) => s + (byArea.get(a) ?? 0), 0);
      if (count === 0) continue;
      sups.push({
        userId: u._id,
        name: (u as any).name ?? "",
        count,
        detail: areas
          .filter((a) => (byArea.get(a) ?? 0) > 0)
          .map((a) => `${a} ${byArea.get(a)}`)
          .join(" • "),
        tokens: await tokensFor(u._id),
      });
    }

    return { monthKey: mk, day: dayKeyWIB(), total: inpg.length, sups };
  },
});

// ===== BARU — AKSI: ingatkan supervisor tiap sore kalau ada yang menunggu review =====
export const checkPendingReview = internalAction({
  handler: async (ctx): Promise<any> => {
    const d: any = await ctx.runQuery(internal.activeStoreReminders.collectPendingReview, {});
    if (d.total === 0) return { total: 0, sent: 0 };

    const pushes: any[] = [];
    let sent = 0;

    for (const sup of d.sups) {
      const title = `FU Toko: ${sup.count} menunggu review`;
      const body = `${sup.detail}. Buka FU Toko untuk menyetujui (CLSD).`;

      const res: any = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: sup.userId, title, body, kind: "active_store_review",
        link: "/toko-aktif", day: d.day, dedupeKey: `actstore-review:${d.monthKey}:${d.day}:${sup.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of sup.tokens) {
          pushes.push({ to: tk, title, body, sound: "default", data: { kind: "active_store_review" } });
        }
      }
    }

    await sendPush(pushes);
    return { total: d.total, sent };
  },
});
