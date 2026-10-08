import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const MIN_VISITS = 7;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const rupiah = (n: number) => "Rp" + (n || 0).toLocaleString("id-ID");
const clampPush = (s: string) => (s.length > 120 ? s.slice(0, 117) + "…" : s);

// ===== PENYUSUN PESAN (menyesuaikan jumlah tugas) =====
function pickNames(names: string[], max = 2) {
  const clean = Array.from(new Set(names.filter((n) => !!n && n.trim() !== "")));
  return { shown: clean.slice(0, max), more: Math.max(0, clean.length - max) };
}

// Telemarketing — SPK Admin
function buildAdminTasksMessage({ piu, ord, names }: { piu: number; ord: number; names: string[] }) {
  const total = piu + ord;
  if (total === 0) return null; // tidak ada tugas → jangan kirim
  const title = total === 1 ? "SPK Admin: 1 tugas belum selesai" : `SPK Admin: ${total} tugas belum selesai`;
  const parts: string[] = [];
  if (piu > 0) parts.push(`${piu} follow-up piutang`);
  if (ord > 0) parts.push(`${ord} orderan`);
  const { shown, more } = pickNames(names);
  const tail = shown.length ? ` Mulai dari ${shown.join(", ")}${more > 0 ? ` +${more} lagi` : ""}.` : "";
  return {
    title,
    body: `Belum selesai: ${parts.join(" + ")}.${tail}`,
    pushBody: clampPush(`${parts.join(" + ")} belum selesai${shown.length ? ` — ${shown[0]}` : ""}.`),
  };
}

// Sales lapangan — target kunjungan
function buildFieldVisitMessage({ done, target, storeName }: { done: number; target: number; storeName?: string }) {
  const less = Math.max(0, target - done);
  if (less === 0) return null; // target tercapai → jangan kirim
  const title = done === 0 ? "Belum ada kunjungan hari ini" : `Kunjungan ${done}/${target} hari ini`;
  const body = done === 0
    ? `Target ${target} toko/hari. Belum ada check-in sama sekali — mulai dari toko terdekat.`
    : `Baru ${done} dari ${target} kunjungan • kurang ${less} toko lagi${storeName ? ` • terakhir di ${storeName}` : ""}.`;
  return { title, body, pushBody: `Baru ${done}/${target} kunjungan — kurang ${less} lagi.` };
}

// Janji bayar jatuh tempo
function buildPromiseMessage(items: { name: string; amount: number }[]) {
  const n = items.length;
  if (n === 0) return null;
  const total = items.reduce((s, x) => s + (x.amount || 0), 0);
  const title = n === 1 ? "1 janji bayar jatuh tempo" : `${n} janji bayar jatuh tempo`;
  const detail = n === 1
    ? `${items[0].name} — ${rupiah(items[0].amount)}`
    : `${items[0].name}, ${items[1].name}${n > 2 ? ` +${n - 2} lagi` : ""} • total ${rupiah(total)}`;
  return { title, body: `${detail}. Tindak lanjut hari ini ya.`, pushBody: clampPush(detail) };
}

// Rekap 20.00
function buildRecapMessage({ piu, ord, names }: { piu: number; ord: number; names: string[] }) {
  const total = piu + ord;
  if (total === 0) return null;
  const parts: string[] = [];
  if (piu > 0) parts.push(`${piu} piutang`);
  if (ord > 0) parts.push(`${ord} orderan`);
  const { shown, more } = pickNames(names, 1);
  return {
    title: total === 1 ? "Masih ada 1 tugas hari ini" : `Masih ada ${total} tugas hari ini`,
    body: `Tersisa ${parts.join(" + ")}${shown.length ? ` (${shown[0]}${more > 0 ? ` +${more}` : ""})` : ""}. Selesaikan besok pagi, jangan menumpuk.`,
    pushBody: clampPush(`Sisa ${parts.join(" + ")} belum selesai.`),
  };
}

// ===== KIRIM PUSH (best-effort) =====
async function sendPush(payloads: any[]) {
  for (let i = 0; i < payloads.length; i += 100) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloads.slice(i, i + 100)),
      });
      await res.json().catch(() => null);
    } catch {
      // diabaikan — notifikasi in-app sudah tersimpan
    }
  }
}

// ===== 08.00 WIB — janji bayar jatuh tempo =====
export const checkPromiseDue = internalAction({
  handler: async (ctx): Promise<any> => {
    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const day = d.day;
    const pushes: any[] = [];
    let sent = 0;

    const byArea = new Map<string, any[]>();
    for (const p of d.promise) {
      const a = String((p as any).area ?? "");
      const arr = byArea.get(a) ?? [];
      arr.push(p);
      byArea.set(a, arr);
    }

    for (const row of d.teleRows) {
      if (row.onLeave) continue;
      const list = byArea.get(row.area) ?? [];
      const msg = buildPromiseMessage(list.map((x: any) => ({ name: x.storeName, amount: x.piutang })));
      if (!msg) continue;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId, title: msg.title, body: msg.body, kind: "promise_due",
        link: "/spk", day, dedupeKey: `reminders:promise:${day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "promise_due" } });
        }
      }
    }
    await sendPush(pushes);
    return { day, sent };
  },
});

// ===== 15.00 WIB — SPK Admin belum beres =====
export const checkSpkAdmin = internalAction({
  handler: async (ctx): Promise<any> => {
    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const day = d.day;
    const pushes: any[] = [];
    let sent = 0;

    const areaPending = new Map<string, number>();
    for (const row of d.teleRows) {
      const total = row.piu + row.ord;
      areaPending.set(row.area, (areaPending.get(row.area) ?? 0) + total);

      if (row.onLeave || total === 0) continue; // izin / sudah beres → jangan diganggu
      const msg = buildAdminTasksMessage({ piu: row.piu, ord: row.ord, names: row.names });
      if (!msg) continue;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId, title: msg.title, body: msg.body, kind: "spk_admin",
        link: "/spk", day, dedupeKey: `reminders:spkadmin:${day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "spk_admin" } });
        }
      }
    }

    // Ringkasan 1 notif untuk tiap supervisor
    for (const sup of d.supRows) {
      const hit = sup.areas.filter((a: string) => (areaPending.get(a) ?? 0) > 0);
      if (hit.length === 0) continue;
      const total = hit.reduce((s: number, a: string) => s + (areaPending.get(a) ?? 0), 0);
      const title = total === 1 ? "SPK Admin: 1 tugas tersisa" : `SPK Admin: ${total} tugas tersisa (15.00)`;
      const body = `Belum beres: ${hit.map((a: string) => `${a} ${areaPending.get(a)}`).join(" • ")}.`;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: sup.userId, title, body, kind: "spk_admin_sum",
        link: "/spk", day, dedupeKey: `reminders:spkadmin-sup:${day}:${sup.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of sup.tokens) {
          pushes.push({ to: tk, title, body: clampPush(body), sound: "default", data: { kind: "spk_admin_sum" } });
        }
      }
    }

    await sendPush(pushes);
    return { day, sent };
  },
});

// ===== 17.00 WIB — sales lapangan kurang kunjungan (langsung ke salesnya) =====
export const checkFieldVisits = internalAction({
  handler: async (ctx): Promise<any> => {
    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const day = d.day;
    const pushes: any[] = [];
    let sent = 0;

    for (const row of d.fieldRows) {
      if (row.onLeave) continue; // izin → tidak diingatkan, dan tidak dianggap kurang
      const msg = buildFieldVisitMessage({ done: row.done, target: MIN_VISITS, storeName: row.lastStore });
      if (!msg) continue;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId, title: msg.title, body: msg.body, kind: "field_visits",
        link: "/spk", day, dedupeKey: `reminders:visits:${day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "field_visits" } });
        }
      }
    }
    await sendPush(pushes);
    return { day, sent };
  },
});

// ===== 20.00 WIB — rekap penutup (yang masih ada sisa) =====
export const dailyRecap = internalAction({
  handler: async (ctx): Promise<any> => {
    const d: any = await ctx.runQuery(internal.reminderData.collectPending, {});
    const day = d.day;
    const pushes: any[] = [];
    let sent = 0;

    for (const row of d.teleRows) {
      if (row.onLeave) continue;
      const msg = buildRecapMessage({ piu: row.piu, ord: row.ord, names: row.names });
      if (!msg) continue;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId, title: msg.title, body: msg.body, kind: "recap_spk_admin",
        link: "/spk", day, dedupeKey: `reminders:recap-tele:${day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: msg.title, body: msg.pushBody, sound: "default", data: { kind: "recap_spk_admin" } });
        }
      }
    }

    for (const row of d.fieldRows) {
      if (row.onLeave) continue;
      const msg = buildFieldVisitMessage({ done: row.done, target: MIN_VISITS, storeName: row.lastStore });
      if (!msg) continue;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: row.userId, title: "Rekap hari ini", body: msg.body, kind: "recap_visits",
        link: "/spk", day, dedupeKey: `reminders:recap-field:${day}:${row.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of row.tokens) {
          pushes.push({ to: tk, title: "Rekap kunjungan hari ini", body: msg.pushBody, sound: "default", data: { kind: "recap_visits" } });
        }
      }
    }

    // ← BARU: ringkasan FU Toko untuk supervisor (OPEN/INPG belum CLSD)
    const fut: any = await ctx.runQuery(internal.activeStoreReminders.collectActiveStorePending, {});
    for (const sup of fut.sups) {
      const hit = (fut.byArea as any[]).filter(
        (a) => sup.areas.includes(a.area) && (a.open + a.inpg) > 0
      );
      if (hit.length === 0) continue;

      const open = hit.reduce((s: number, a: any) => s + a.open, 0);
      const inpg = hit.reduce((s: number, a: any) => s + a.inpg, 0);
      const title = `Rekap FU Toko: ${open + inpg} belum CLSD`;
      const body = `${hit.map((a: any) => `${a.area} ${a.open} OPEN/${a.inpg} INPG`).join(" • ")}.`;

      const res = await ctx.runMutation(internal.reminderData.saveNotif, {
        userId: sup.userId, title, body, kind: "recap_active_store",
        link: "/toko-aktif", day, dedupeKey: `reminders:recap-futoko:${day}:${sup.userId}`,
      });
      if (res.saved) {
        sent++;
        for (const tk of sup.tokens) {
          pushes.push({ to: tk, title, body: clampPush(body), sound: "default", data: { kind: "recap_active_store" } });
        }
      }
    }

    await sendPush(pushes);
    return { day, sent };
  },
});
