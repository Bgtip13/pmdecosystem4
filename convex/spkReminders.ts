import { internalMutation } from "./_generated/server";

// Pengingat "kunjungan kurang" khusus ke SUPERVISOR.
// Dijalankan 17.30 WIB (10:30 UTC) — lihat crons.ts.
// Aturan FASE 1 tetap: sales yang izin hari ini dilewati,
// dan yang sudah mencapai 7 kunjungan tidak diingatkan.

function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
function dayStartWIB(day: string) {
  return Date.parse(day + "T00:00:00+07:00");
}
const MIN_VISITS = 7;

export const sendDaily = internalMutation({
  handler: async (ctx) => {
    const theDay = dayKeyWIB();
    const start = dayStartWIB(theDay);

    const users = await ctx.db.query("users").collect();
    const supervisors = users.filter((u: any) => u.role === "supervisor");
    const sales = users.filter((u: any) => u.role === "field");

    // Izin hari ini → jangan diingatkan
    const leaveRows = await ctx.db.query("sales_leaves")
      .withIndex("by_day", (q) => q.eq("day", theDay))
      .collect();
    const onLeave = new Set(leaveRows.map((l) => String(l.salesId)));

    let created = 0, skipped = 0, scanned = 0;

    for (const s of sales) {
      if (onLeave.has(String(s._id))) continue;
      const today = await ctx.db.query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", s._id))
        .filter((q) => q.gte(q.field("checkinAt"), start))
        .collect();
      const done = today.filter((x: any) => x.status === "done");
      scanned++;
      if (done.length >= MIN_VISITS) continue;

      for (const sup of supervisors) {
        if ((sup as any).area && (sup as any).area !== (s as any).area) continue;
        const dedupeKey = `spk:below_target:${theDay}:${sup._id}:${s._id}`;
        const dup = await ctx.db.query("reminder_deliveries")
          .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).first();
        if (dup) { skipped++; continue; }

        await ctx.db.insert("notifications", {
          userId: sup._id,
          fromName: "Sistem PMD",
          title: `Kunjungan kurang: ${(s as any).name ?? ""}`,
          body: `Baru ${done.length} dari ${MIN_VISITS} kunjungan hari ini (${(s as any).area ?? "-"}).`,
          kind: "spk_exception",
          link: "/riwayat",
          createdAt: Date.now(),
        });
        await ctx.db.insert("reminder_deliveries", {
          dedupeKey, day: theDay, kind: "below_target",
          recipientId: sup._id, subjectUserId: s._id,
          status: "sent", createdAt: Date.now(), sentAt: Date.now(),
        });
        created++;
      }
    }
    return { day: theDay, scanned, created, skipped };
  },
});
