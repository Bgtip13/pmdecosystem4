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

// ===== BACA DATA (semua angka dihitung di sini) =====
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

    // ---- Telemarketing: hitung tugas SPK Admin per orang ----
    const teleRows: any[] = [];
    for (const t of users.filter((u: any) => u.role === "telemarketing" && u.area)) {
      const p = piuRows.filter((x: any) => x.area === (t as any).area);
      const o = ordRows.filter((x: any) => x.area === (t as any).area);
      const pOpen = openOf(p);
      const oOpen = openOf(o);
      const pSorted = [...pOpen].sort((a: any, b: any) => (b.usia ?? 0) - (a.usia ?? 0));
      teleRows.push({
        userId: t._id,
        name: (t as any).name ?? "",
        area: (t as any).area,
        onLeave: onLeave.has(String(t._id)),
        tokens: await tokensFor(t._id),
        piu: p.length,                 // belum CLSD
        ord: o.length,                 // belum CLSD
        piuOpen: pOpen.length,         // masih harus dikerjakan
        ordOpen: oOpen.length,         // masih harus dikerjakan
        piuInpg: inpgOf(p).length,     // menunggu review supervisor
        ordInpg: inpgOf(o).length,     // menunggu review supervisor
        piuAmount: pOpen.reduce((s: number, x: any) => s + (x.piutang ?? 0), 0),
        names: [
          ...pSorted.map((x: any) => x.storeName ?? ""),
          ...oOpen.map((x: any) => x.storeName ?? ""),
        ],
      });
    }

    // ---- Sales lapangan: jumlah kunjungan hari ini ----
    const fieldRows: any[] = [];
    for (const s of users.filter((u: any) => u.role === "field")) {
      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id))
        .filter((q) => q.gte(q.field("checkinAt"), start))
        .collect();
      const done = today.filter((x: any) => x.status === "done");
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

    // ---- Janji bayar jatuh tempo hari ini ----
    // FASE 1: dibaca langsung dari kolom promiseDate (bukan lagi dari daftar "done"),
    // supaya tugas yang masih INPG pun tetap ikut diingatkan.
    const promiseRows = (await ctx.db.query("piutang_tasks")
      .withIndex("by_promise", (q) => q.eq("promiseDate", theDay))
      .collect()) as any[];
    const promise = promiseRows
      .filter((t: any) => t.hasil === "janji_bayar")
      .map((t: any) => ({ area: t.area, storeName: t.storeName ?? "", piutang: t.piutang ?? 0 }));

    // ---- Ringkasan per area (supervisor) ----
    const areasAll = ["SOLO", "DIY", "SEMARANG"];
    const perArea = areasAll.map((a) => {
      const p = piuRows.filter((x: any) => x.area === a);
      const o = ordRows.filter((x: any) => x.area === a);
      return {
        area: a,
        open: openOf(p).length + openOf(o).length,
        inpg: inpgOf(p).length + inpgOf(o).length,
      };
    });
    const totals = {
      open: perArea.reduce((s, x) => s + x.open, 0),
      inpg: perArea.reduce((s, x) => s + x.inpg, 0),
    };

    // ---- Supervisor ----
    const supRows: any[] = [];
    for (const sup of users.filter((u: any) => u.role === "supervisor")) {
      supRows.push({
        userId: sup._id,
        name: (sup as any).name ?? "",
        tokens: await tokensFor(sup._id),
        areas: (sup as any).area ? [(sup as any).area] : areasAll,
      });
    }

    // ---- Sudah sinkron hari ini? (acuan pengingat 08.00 & notif "sudah sinkron") ----
    const runs = await ctx.db.query("piutang_sync_runs")
      .withIndex("by_status", (q) => q.eq("status", "success"))
      .order("desc").take(5);
    const alreadySynced = (runs as any[]).some(
      (r) => dayKeyWIB(r.requestedAt ?? r.finishedAt ?? 0) === theDay
    );

    // ---- Penerima notif "data sudah sinkron" (semua yang punya tugas, tanpa owner) ----
    const syncRecipients: { userId: any; name: string; tokens: string[] }[] = [];
    for (const r of teleRows) {
      if (r.onLeave) continue;
      if (r.piuOpen + r.ordOpen === 0) continue;
      syncRecipients.push({ userId: r.userId, name: r.name, tokens: r.tokens });
    }
    for (const r of fieldRows) {
      if (r.onLeave) continue;
      syncRecipients.push({ userId: r.userId, name: r.name, tokens: r.tokens });
    }
    for (const r of supRows) {
      syncRecipients.push({ userId: r.userId, name: r.name, tokens: r.tokens });
    }

    return {
      day: theDay,
      alreadySynced,
      teleRows,
      fieldRows,
      promise,
      supRows,
      perArea,
      totals,
      syncRecipients,
    };
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
