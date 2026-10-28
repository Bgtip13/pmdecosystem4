import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const WIB = 7 * 3600 * 1000;

function dayKeyWIB(now = Date.now()) {
  return new Date(now + WIB).toISOString().slice(0, 10);
}
function dayStartWIB(day: string) {
  return Date.parse(day + "T00:00:00+07:00");
}

// FASE 1: OPEN = belum dikerjakan · INPG = sudah diisi, menunggu review supervisor
// CLSD tidak pernah ikut (statusnya sudah "done" jadi tidak ada di daftar pending).
function wfOf(row: any): string {
  return (row?.workflowStatus ?? "OPEN") as string;
}

// ===== BACA DATA untuk 5 aturan notifikasi (semua angka dihitung di sini) =====
export const collectPending = internalQuery({
  args: { day: v.optional(v.string()) },
  handler: async (ctx, { day }) => {
    const theDay = day ?? dayKeyWIB();
    const start = dayStartWIB(theDay);

    // Izin hari ini → orangnya tidak dikirimi pengingat (tugasnya tetap ada di dashboard)
    const leaveRows = await ctx.db.query("sales_leaves")
      .withIndex("by_day", (q) => q.eq("day", theDay))
      .collect();
    const onLeave = new Set(leaveRows.map((l) => String(l.salesId)));

    const users = await ctx.db.query("users").collect();
    const tokensFor = async (uid: any) => {
      const rows = await ctx.db.query("push_tokens")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      return rows.map((r) => r.token);
    };

    // Tugas hari ini yang BELUM CLSD (status "pending" = OPEN + INPG)
    const piuRows = (await ctx.db.query("piutang_tasks")
      .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending"))
      .collect()) as any[];
    const ordRows = (await ctx.db.query("order_followups")
      .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending"))
      .collect()) as any[];

    const openOf = (rows: any[]) => rows.filter((r) => wfOf(r) === "OPEN");
    const inpgOf = (rows: any[]) => rows.filter((r) => wfOf(r) === "INPG");

    // ---- Telemarketing: SPK Admin per orang. Yang dipakai notifikasi hanya OPEN. ----
    const teleRows: any[] = [];
    for (const t of users.filter((u: any) => u.role === "telemarketing" && u.area)) {
      const p = piuRows.filter((x: any) => x.area === (t as any).area);
      const o = ordRows.filter((x: any) => x.area === (t as any).area);
      const pOpen = openOf(p);
      const oOpen = openOf(o);
      // Toko paling mendesak dulu (usia piutang terbesar)
      const pSorted = [...pOpen].sort((a: any, b: any) => (b.usia ?? 0) - (a.usia ?? 0));
      teleRows.push({
        userId: t._id,
        name: (t as any).name ?? "",
        area: (t as any).area,
        onLeave: onLeave.has(String(t._id)),
        tokens: await tokensFor(t._id),
        piuOpen: pOpen.length,
        ordOpen: oOpen.length,
        names: [
          ...pSorted.map((x: any) => x.storeName ?? ""),
          ...oOpen.map((x: any) => x.storeName ?? ""),
        ],
      });
    }

    // ---- Sales lapangan: jumlah kunjungan hari ini (untuk aturan 5) ----
    const fieldRows: any[] = [];
    let visitTotal = 0, visitDone = 0, visitInpg = 0;
    for (const s of users.filter((u: any) => u.role === "field")) {
      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id))
        .filter((q) => q.gte(q.field("checkinAt"), start))
        .collect();
      const done = today.filter((x: any) => x.status === "done");
      visitTotal += today.length;
      visitDone += done.length;
      visitInpg += today.filter((x: any) => wfOf(x) === "INPG").length;

      let lastStore = "";
      if (done.length > 0) {
        const last = done.reduce((m: any, x: any) => ((x.checkoutAt ?? 0) > (m.checkoutAt ?? 0) ? x : m));
        lastStore = ((await ctx.db.get(last.storeId)) as any)?.name ?? "";
      }
      fieldRows.push({
        userId: s._id,
        name: (s as any).name ?? "",
        area: (s as any).area ?? "",
        onLeave: onLeave.has(String(s._id)),
        tokens: await tokensFor(s._id),
        done: done.length,
        lastStore,
      });
    }

    // ---- Supervisor & owner (penerima aturan 3) ----
    const supRows: any[] = [];
    for (const sup of users.filter((u: any) => u.role === "supervisor")) {
      supRows.push({
        userId: sup._id,
        name: (sup as any).name ?? "",
        area: (sup as any).area ?? "",
        tokens: await tokensFor(sup._id),
      });
    }
    const ownerRows: any[] = [];
    for (const ow of users.filter((u: any) => u.role === "owner")) {
      ownerRows.push({
        userId: ow._id,
        name: (ow as any).name ?? "",
        tokens: await tokensFor(ow._id),
      });
    }

    const adminOpen = openOf(piuRows).length + openOf(ordRows).length;
    const adminInpg = inpgOf(piuRows).length + inpgOf(ordRows).length;

    return {
      day: theDay,
      teleRows,
      fieldRows,
      supRows,
      ownerRows,
      visits: { total: visitTotal, done: visitDone, inpg: visitInpg },
      admin: { open: adminOpen, inpg: adminInpg },
    };
  },
});

// ===== TOKEN PUSH untuk daftar user (dipakai reminders.pushToUsers) =====
export const getPushTokens = internalQuery({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const out: string[] = [];
    for (const uid of userIds) {
      const rows = await ctx.db.query("push_tokens")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      for (const r of rows) out.push(r.token);
    }
    return out;
  },
});

// ===== SIMPAN NOTIFIKASI (sekali per hari per orang) =====
export const saveNotif = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    kind: v.string(),
    link: v.optional(v.string()),
    day: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, a) => {
    const dup = await ctx.db.query("reminder_deliveries")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", a.dedupeKey))
      .first();
    if (dup) return { saved: false };

    await ctx.db.insert("notifications", {
      userId: a.userId,
      fromName: "Sistem PMD",
      title: a.title,
      body: a.body,
      kind: a.kind,
      link: a.link,
      createdAt: Date.now(),
    });
    await ctx.db.insert("reminder_deliveries", {
      dedupeKey: a.dedupeKey,
      day: a.day,
      kind: a.kind,
      recipientId: a.userId,
      status: "sent",
      createdAt: Date.now(),
      sentAt: Date.now(),
    });
    return { saved: true };
  },
});
