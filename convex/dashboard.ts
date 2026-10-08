import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));
const MIN_VISITS = 7;          // target minimal kunjungan / hari
const ONGOING_LIMIT_MIN = 45;  // kunjungan dianggap "kelamaan"

function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function dayStartWIB(day: string) {
  return Date.parse(day + "T00:00:00+07:00");
}

// ===== DASHBOARD "HARI INI" (supervisor) =====
export const supervisorTodayOverview = query({
  args: { day: v.optional(v.string()), area: v.optional(AREA) },
  handler: async (ctx, { day, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor") return null;

    const theDay = day ?? dayKeyWIB();
    const start = dayStartWIB(theDay);
    const now = Date.now();

    // Izin hari ini → sales ini TIDAK dihitung sebagai "kunjungan kurang"
    const leaveRows = await ctx.db.query("sales_leaves")
      .withIndex("by_day", (q) => q.eq("day", theDay))
      .collect();
    const leaveMap = new Map<string, any>();
    for (const l of leaveRows) leaveMap.set(String(l.salesId), l);

    const allUsers = await ctx.db.query("users").collect();
    const sales = allUsers.filter((u: any) => u.role === "field" && (!area || u.area === area));

    // sales yang wajib kena target (izin dikecualikan)
    const eligibleSales = sales.filter((s: any) => !leaveMap.has(String(s._id)));

    const rows: any[] = [];
    let visitsDone = 0, ongoingVisits = 0, belowTarget = 0, started = 0, notStarted = 0, excusedSales = 0;

    for (const s of sales) {
      const leave = leaveMap.get(String(s._id)) ?? null;
      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id))
        .filter((q) => q.gte(q.field("checkinAt"), start))
        .collect();
      const done = today.filter((x: any) => x.status === "done");
      const ongoing = today.find((x: any) => x.status === "ongoing") ?? null;
      if (done.length > 0 || ongoing) started++;
      else if (!leave) notStarted++;
      if (leave) excusedSales++;
      if (done.length < MIN_VISITS && !leave) belowTarget++;
      visitsDone += done.length;
      if (ongoing) ongoingVisits++;

      let storeName: string | null = null;
      if (ongoing) storeName = ((await ctx.db.get(ongoing.storeId)) as any)?.name ?? null;
      const lastCheckoutAt = done.reduce((m: number, x: any) => Math.max(m, x.checkoutAt ?? 0), 0) || null;

      rows.push({
        userId: s._id, name: s.name ?? "", area: s.area ?? "",
        visitCount: done.length, target: MIN_VISITS,
        belowTarget: done.length < MIN_VISITS && !leave,
        excused: !!leave,
        excusedType: leave?.type ?? null,
        excusedScope: leave?.scope ?? null,
        excusedNote: leave?.note ?? null,
        orderedCount: done.filter((x: any) => x.ordered === true).length,
        lastCheckoutAt,
        ongoing: ongoing ? {
          visitId: ongoing._id, storeName,
          checkinAt: ongoing.checkinAt,
          minutes: Math.round((now - ongoing.checkinAt) / 60000),
        } : null,
      });
    }
    rows.sort((a, b) => (Number(a.excused) - Number(b.excused)) || a.visitCount - b.visitCount || a.name.localeCompare(b.name));

    // Piutang hari ini yang BELUM CLSD (OPEN + INPG)
    const pRows = await ctx.db.query("piutang_tasks")
      .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending")).collect();
    const piutangPending = pRows.filter((r: any) => !area || r.area === area).length;
    const piutangInpg = pRows.filter((r: any) => (r.workflowStatus ?? "OPEN") === "INPG" && (!area || r.area === area)).length;

    // FASE 1: hitung HANYA tugas hari ini.
    // (Kalau pakai by_status pending, tugas INPG hari-hari sebelumnya ikut terhitung
    //  sehingga angka di kartu "Hari Ini" membengkak.)
    const spkRows = await ctx.db.query("order_followups")
      .withIndex("by_day_status", (q) => q.eq("day", theDay).eq("status", "pending")).collect();
    const spkFiltered = spkRows.filter((r: any) => !area || r.area === area);
    const spkAdminPending = spkFiltered.length;
    const spkAdminInpg = spkFiltered.filter((r: any) => (r.workflowStatus ?? "OPEN") === "INPG").length;

    const lrRows = await ctx.db.query("store_location_requests")
      .withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    const locationApprovalPending = lrRows.filter((r: any) => !area || r.area === area).length;

    const notifs = await ctx.db.query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", userId)).collect();
    const unreadNotifications = notifs.filter((n: any) => !n.readAt).length;

    // Status sinkron piutang — acuan: SUPERVISOR yang menekan sinkron
    const runs = await ctx.db.query("piutang_sync_runs")
      .withIndex("by_role_requested", (q) => q.eq("requestedByRole", "supervisor"))
      .order("desc").take(1);
    const last: any = runs[0] ?? null;
    const sync = last ? {
      hasSync: true,
      requestedAt: last.requestedAt,
      finishedAt: last.finishedAt ?? null,
      status: last.status,
      importedCount: last.importedCount ?? 0,
      requestedByName: ((await ctx.db.get(last.requestedBy)) as any)?.name ?? "",
      error: last.error ?? null,
    } : {
      hasSync: false, requestedAt: null, finishedAt: null,
      status: "never", importedCount: 0, requestedByName: null, error: null,
    };

    // Daftar izin hari ini (untuk blok "Izin Hari Ini" di kartu)
    const leaves: any[] = [];
    for (const s of sales) {
      const leave = leaveMap.get(String(s._id));
      if (!leave) continue;
      leaves.push({
        salesId: s._id, name: s.name ?? "", area: s.area ?? "",
        type: leave.type, scope: leave.scope, note: leave.note ?? null,
      });
    }
    leaves.sort((a, b) => (a.area || "").localeCompare(b.area || "") || a.name.localeCompare(b.name));

    return {
      day: theDay,
      generatedAt: now,
      totals: {
        activeSales: sales.length,
        eligibleSales: eligibleSales.length,   // yang wajib kena target
        salesStarted: started,
        salesNotStarted: notStarted, salesBelowTarget: belowTarget,
        excusedSales, visitsDone, ongoingVisits, spkAdminPending,
        piutangPending, locationApprovalPending, unreadNotifications,
        // ← FASE 1: berapa yang menunggu review supervisor
        piutangInpg, spkAdminInpg,
      },
      sales: rows,
      leaves,
      sync,
    };
  },
});

// ===== PENGECUALIAN SPK HARI INI (sales izin dilewati) =====
export const todaySpkExceptions = query({
  args: { day: v.optional(v.string()), area: v.optional(AREA), minVisits: v.optional(v.number()) },
  handler: async (ctx, { day, area, minVisits }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "field") return null;

    const theDay = day ?? dayKeyWIB();
    const start = dayStartWIB(theDay);
    const min = minVisits ?? MIN_VISITS;
    const now = Date.now();

    // Izin hari ini → bukan masalah, jangan dimunculkan
    const leaveRows = await ctx.db.query("sales_leaves")
      .withIndex("by_day", (q) => q.eq("day", theDay))
      .collect();
    const leaveMap = new Map<string, any>();
    for (const l of leaveRows) leaveMap.set(String(l.salesId), l);

    const allUsers = await ctx.db.query("users").collect();
    let sales = allUsers.filter((u: any) => u.role === "field");
    if (me.role === "field") sales = sales.filter((u: any) => String(u._id) === String(userId));
    if (area) sales = sales.filter((u: any) => u.area === area);

    const items: any[] = [];
    for (const s of sales) {
      const leave = leaveMap.get(String(s._id)) ?? null;

      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id))
        .filter((q) => q.gte(q.field("checkinAt"), start))
        .collect();
      const done = today.filter((x: any) => x.status === "done");
      const ongoing = today.find((x: any) => x.status === "ongoing") ?? null;

      if (done.length < min && !leave) {
        items.push({
          kind: "below_target",
          severity: done.length === 0 ? "danger" : "warning",
          userId: s._id, userName: s.name ?? "", area: s.area ?? "",
          visitCount: done.length, threshold: min,
          title: `Kunjungan kurang (${done.length}/${min})`,
          description: done.length === 0 ? "Belum ada kunjungan hari ini." : `Baru ${done.length} dari ${min} kunjungan.`,
          link: "/riwayat",
        });
      }
      // ← sales izin tidak dikejar karena kunjungannya kelamaan
      if (ongoing && !leave) {
        const mins = Math.round((now - ongoing.checkinAt) / 60000);
        if (mins >= ONGOING_LIMIT_MIN) {
          items.push({
            kind: "ongoing_too_long", severity: "warning",
            userId: s._id, userName: s.name ?? "", area: s.area ?? "",
            visitId: ongoing._id, since: ongoing.checkinAt,
            title: `Kunjungan kelamaan (${mins} menit)`,
            description: `Masih check-in, belum check-out.`,
            link: "/live",
          });
        }
      }
    }

    const spkRows = await ctx.db.query("order_followups")
      .withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    const spkFiltered = spkRows.filter((r: any) => !area || r.area === area);
    if (spkFiltered.length > 0 && me.role === "supervisor") {
      items.push({
        kind: "admin_spk_pending", severity: "danger",
        userName: "", area: "",
        title: `SPK Admin belum beres (${spkFiltered.length})`,
        description: "Follow-up orderan sales belum diselesaikan.",
        link: "/spk?sec=admin",
      });
    }

    // ← BARU: FU Toko — menunggu review (INPG) atau belum dihubungi (OPEN)
    if (me.role === "supervisor") {
      const mk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
      const ast = await ctx.db.query("active_store_tasks")
        .withIndex("by_month", (q) => q.eq("monthKey", mk))
        .collect();
      const mine = ast.filter((r: any) => !area || r.area === area);
      const inpg = mine.filter((r: any) => r.workflowStatus === "INPG").length;
      const open = mine.filter((r: any) => r.workflowStatus === "OPEN").length;

      if (inpg > 0) {
        items.push({
          kind: "futoko_review", severity: "warning",
          userName: "", area: "",
          title: `FU Toko menunggu review (${inpg})`,
          description: "Sudah diisi telemarketing, belum disetujui (CLSD).",
          link: "/toko-aktif",
        });
      }
      if (open > 0) {
        items.push({
          kind: "futoko_open", severity: "warning",
          userName: "", area: "",
          title: `FU Toko belum dihubungi (${open})`,
          description: "Masih OPEN — telemarketing belum follow-up.",
          link: "/toko-aktif",
        });
      }
    }

    // Yang bermasalah dulu, lalu urut nama
    items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "danger" ? -1 : 1) ||
      (a.userName || "").localeCompare(b.userName || ""));

    const summary = {
      total: items.length,
      belowTarget: items.filter((i) => i.kind === "below_target").length,
      ongoingTooLong: items.filter((i) => i.kind === "ongoing_too_long").length,
      adminSpkPending: items.filter((i) => i.kind === "admin_spk_pending").length,
      futoko: items.filter((i) => i.kind === "futoko_review" || i.kind === "futoko_open").length, // ← BARU
    };
    return { day: theDay, generatedAt: now, summary, items };
  },
});

// ===== KARTU BERANDA: rekap FU Toko (OPEN/INPG/CLSD) bulan berjalan =====
export const activeStoreMonthly = query({
  args: { monthKey: v.optional(v.string()), area: v.optional(AREA) },
  handler: async (ctx, { monthKey, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    const role = me?.role;
    if (role !== "supervisor" && role !== "owner" && role !== "telemarketing") return null;

    // "YYYY-MM" dalam WIB — periode kerja FU Toko
    const mk = monthKey ?? new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);

    let rows = await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect();

    const myArea = role === "telemarketing" ? (me?.area ?? null) : (area ?? null);
    if (myArea) rows = rows.filter((r) => r.area === myArea);

    const open = rows.filter((r) => r.workflowStatus === "OPEN").length;
    const inpg = rows.filter((r) => r.workflowStatus === "INPG").length;
    const clsd = rows.filter((r) => r.workflowStatus === "CLSD").length;

    return { monthKey: mk, area: myArea ?? null, total: rows.length, open, inpg, clsd, pending: open + inpg };
  },
});
// ===== LAPORAN: rekap FU Toko per area (satu bulan) =====
export const activeStoreReport = query({
  args: { monthKey: v.optional(v.string()), area: v.optional(AREA) },
  handler: async (ctx, { monthKey, area }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me: any = await ctx.db.get(userId);
    const role = me?.role;
    if (role !== "supervisor" && role !== "owner" && role !== "telemarketing") return null;

    const mk = monthKey ?? new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);

    let rows = await ctx.db.query("active_store_tasks")
      .withIndex("by_month", (q) => q.eq("monthKey", mk))
      .collect();

    const myArea = role === "telemarketing" ? (me?.area ?? null) : (area ?? null);
    if (myArea) rows = rows.filter((r) => r.area === myArea);

    const AREAS = ["SOLO", "DIY", "SEMARANG"];
    const perArea = AREAS.map((a) => {
      const rs = rows.filter((r) => r.area === a);
      return {
        area: a,
        total: rs.length,
        open: rs.filter((r) => r.workflowStatus === "OPEN").length,
        inpg: rs.filter((r) => r.workflowStatus === "INPG").length,
        clsd: rs.filter((r) => r.workflowStatus === "CLSD").length,
      };
    });

    const sum = (f: (x: any) => number) => perArea.reduce((s, x) => s + f(x), 0);
    return {
      monthKey: mk,
      area: myArea ?? null,
      perArea,
      totals: { total: sum((x) => x.total), open: sum((x) => x.open), inpg: sum((x) => x.inpg), clsd: sum((x) => x.clsd) },
    };
  },
});
