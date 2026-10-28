import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// ============================================================================
// PENILAIAN BULANAN SALES (supervisor & owner)
//
// Dua kategori terpisah:
//   1. Sales Field     → kunjungan harian, toko tembus order, keterangan lengkap,
//                        omset bulanan & mingguan.
//   2. Telemarketing   → FU Toko, SPK penagihan (muncul lagi = belum tertagih),
//                        SPK orderan, omset bulanan & mingguan.
//
// Omset diambil langsung dari sheet PCP (bulanan & mingguan) yang juga dipakai
// halaman Laporan, lalu dicocokkan per nama sales. Kalau sheet tidak bisa
// ditarik, komponen omset dilewati (bobot dinormalisasi ulang), bukan dianggap 0.
// ============================================================================

const MIN_KUNJUNGAN = 7;        // target minimal toko / hari
const MIN_KUNJUNGAN_SABTU = 3;  // khusus hari Sabtu
const ON_TRACK_MIN = 70;        // skor minimal untuk "ON TRACK"

const PCP_BULANAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=137493638&single=true&output=csv";
const PCP_MINGGUAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=389169579&single=true&output=csv";

function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function monthRangeWib(key: string) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  const start = Date.parse(`${key}-01T00:00:00+07:00`);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = Date.parse(`${nextMonth}T00:00:00+07:00`) - 1;
  return { start, end };
}

// 0 = Minggu, 6 = Sabtu
function weekdayOf(day: string) {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

// Hanya hari yang sudah lewat (sampai hari ini) yang dinilai.
function monthDayKeys(monthKey: string, upto: string) {
  const [y, m] = monthKey.split("-").map((x) => parseInt(x, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const key = `${monthKey}-${String(d).padStart(2, "0")}`;
    if (key > upto) break;
    out.push(key);
  }
  return out;
}

const normName = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ===== PARSER CSV (tanpa dependency) =====
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ""));
}

function toInt(s?: string): number | null {
  if (!s) return null;
  const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? null : n;
}

function toPct(s?: string): number | null {
  if (!s) return null;
  const n = parseFloat(String(s).replace("%", "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

// ===== OMSET (sheet PCP) =====
async function fetchPcpBulanan(): Promise<any[] | null> {
  try {
    const res = await fetch(PCP_BULANAN_URL);
    if (!res.ok) return null;
    const grid = parseCsv(await res.text());
    if (grid.length < 2) return null;
    return grid.slice(1).map((c) => ({
      sdm: c[3]?.trim() ?? "",
      area: c[2]?.trim() ?? "",
      jabatan: c[1]?.trim() ?? "",
      tgt: toInt(c[11]),
      act: toInt(c[12]),
      pcpPct: toPct(c[13]),
    }));
  } catch {
    return null;
  }
}

async function fetchPcpMingguan(): Promise<any[] | null> {
  try {
    const res = await fetch(PCP_MINGGUAN_URL);
    if (!res.ok) return null;
    const grid = parseCsv(await res.text());
    if (grid.length < 2) return null;
    const header = grid[0];
    const weekLabels: string[] = [];
    for (let i = 5; i + 1 < header.length && weekLabels.length < 5; i += 2) {
      const raw = (header[i] || "").replace(/\bACT\b/i, "").trim();
      const mm = raw.match(/m\s*([1-5])/i);
      weekLabels.push(mm ? `M${mm[1]}` : raw || `M${weekLabels.length + 1}`);
    }
    if (weekLabels.length === 0) for (let i = 1; i <= 5; i++) weekLabels.push(`M${i}`);

    return grid.slice(1).map((c) => {
      const weeks: any[] = [];
      for (let wi = 0; wi < weekLabels.length; wi++) {
        const i = 5 + wi * 2;
        weeks.push({ m: weekLabels[wi], act: toInt(c[i]), pct: toPct(c[i + 1]) });
      }
      return { sdm: c[3]?.trim() ?? "", area: c[2]?.trim() ?? "", tgtMgg: toInt(c[4]), weeks };
    });
  } catch {
    return null;
  }
}

// Sheet PCP menulis satu sel untuk dua orang, mis. "ADELIA | SURYA".
// Cocokkan nama utuh dulu, lalu per kata.
function findSdm(rows: any[] | null, name: string) {
  const nk = normName(name);
  if (!nk || !rows) return null;
  const exact = rows.find((r) => normName(r.sdm) === nk);
  if (exact) return exact;
  return (
    rows.find((r) =>
      String(r.sdm ?? "")
        .split(/[^A-Za-z0-9]+/)
        .some((t) => normName(t) === nk)
    ) ?? null
  );
}

function omsetOf(name: string, area: string, bulanan: any[] | null, mingguan: any[] | null) {
  const b = findSdm(bulanan, name);
  const m = findSdm(mingguan, name);

  let bulanPct: number | null = null;
  if (b) {
    if (b.pcpPct != null) bulanPct = Math.round(b.pcpPct);
    else if (b.tgt && b.act != null) bulanPct = Math.round((b.act / b.tgt) * 100);
  }

  let mingguPct: number | null = null;
  let mingguLabel: string | null = null;
  let mingguAct: number | null = null;
  if (m) {
    const last = [...(m.weeks ?? [])].reverse().find((w: any) => w.pct != null || w.act != null);
    if (last) {
      mingguLabel = last.m;
      mingguAct = last.act ?? null;
      if (last.pct != null) mingguPct = Math.round(last.pct);
      else if (m.tgtMgg && last.act != null) mingguPct = Math.round((last.act / m.tgtMgg) * 100);
    }
  }

  return {
    area,
    omsetBulan: b?.act ?? null,
    omsetBulanTarget: b?.tgt ?? null,
    omsetBulanPct: bulanPct,
    omsetMingguAct: mingguAct,
    omsetMingguLabel: mingguLabel,
    omsetMingguPct: mingguPct,
  };
}

// Skor 0..100 dari komponen berbobot. Komponen yang datanya tidak ada
// (mis. sheet omset gagal ditarik) dilewati dan bobotnya dinormalisasi ulang.
function hitungSkor(parts: { label: string; pct: number | null; bobot: number }[]) {
  let sum = 0;
  let wsum = 0;
  const komponen: { label: string; pct: number | null; bobot: number }[] = [];
  for (const p of parts) {
    komponen.push(p);
    if (p.pct == null) continue;
    const val = Math.max(0, Math.min(100, p.pct));
    sum += val * p.bobot;
    wsum += p.bobot;
  }
  const skor = wsum === 0 ? 0 : Math.round(sum / wsum);
  return { skor, status: skor >= ON_TRACK_MIN ? "ON TRACK" : "PERLU PERHATIAN", komponen };
}

// ===== DATA MENTAH (tanpa jaringan, bisa dipakai internal) =====
export const raw = internalQuery({
  args: { monthKey: v.string() },
  handler: async (ctx, { monthKey }) => {
    const { start, end } = monthRangeWib(monthKey);
    const today = dayKeyWIB();
    const days = monthDayKeys(monthKey, today);

    const allUsers: any[] = await ctx.db.query("users").collect();
    const fieldUsers = allUsers.filter((u) => u.role === "field");
    const teleUsers = allUsers.filter((u) => u.role === "telemarketing");

    // ---------- SALES FIELD ----------
    const field: any[] = [];
    for (const u of fieldUsers) {
      const visits: any[] = await ctx.db
        .query("visits")
        .withIndex("by_sales_checkin", (q) => q.eq("salesId", u._id).gte("checkinAt", start).lte("checkinAt", end))
        .collect();
      const done = visits.filter((x) => x.status === "done");

      const leaves: any[] = await ctx.db
        .query("sales_leaves")
        .withIndex("by_user_day", (q) =>
          q.eq("salesId", u._id).gte("day", `${monthKey}-01`).lte("day", `${monthKey}-31`)
        )
        .collect();
      const leaveSet = new Set(leaves.map((l) => l.day));

      const perDay = new Map<string, number>();
      for (const x of done) {
        const k = dayKeyWIB(x.checkinAt ?? 0);
        perDay.set(k, (perDay.get(k) ?? 0) + 1);
      }

      let hariWajib = 0;
      let hariMemenuhi = 0;
      let hariLibur = 0;
      for (const d of days) {
        if (leaveSet.has(d)) { hariLibur++; continue; } // izin/cuti tidak dihitung
        const dow = weekdayOf(d);
        if (dow === 0) continue; // Minggu libur
        hariWajib++;
        const target = dow === 6 ? MIN_KUNJUNGAN_SABTU : MIN_KUNJUNGAN;
        if ((perDay.get(d) ?? 0) >= target) hariMemenuhi++;
      }

      const orderCount = done.filter((x) => x.ordered === true).length;
      const lengkap = done.filter(
        (x) =>
          (x.notes || "").trim().length > 0 &&
          ((x.productTrend || "").trim().length > 0 || (x.productSearched || "").trim().length > 0)
      ).length;

      field.push({
        id: u._id,
        name: u.name ?? "",
        area: u.area ?? "",
        kunjungan: done.length,
        hariWajib,
        hariMemenuhi,
        hariLibur,
        targetHarian: MIN_KUNJUNGAN,
        targetSabtu: MIN_KUNJUNGAN_SABTU,
        kunjunganPct: hariWajib > 0 ? Math.round((hariMemenuhi / hariWajib) * 100) : 0,
        orderCount,
        orderPct: done.length > 0 ? Math.round((orderCount / done.length) * 100) : 0,
        keteranganLengkap: lengkap,
        ketPct: done.length > 0 ? Math.round((lengkap / done.length) * 100) : 0,
      });
    }

    // ---------- DATA HARIAN PER AREA (sekali baca untuk semua telemarketing) ----------
    const piutangDaily = new Map<string, Map<string, any[]>>();
    const followupDaily = new Map<string, Map<string, any[]>>();
    for (const d of days) {
      const pRows: any[] = await ctx.db.query("piutang_tasks").withIndex("by_day", (q) => q.eq("day", d)).collect();
      const pm = new Map<string, any[]>();
      for (const r of pRows) {
        const a = String(r.area ?? "");
        if (!pm.has(a)) pm.set(a, []);
        pm.get(a)!.push(r);
      }
      piutangDaily.set(d, pm);

      const fRows: any[] = await ctx.db.query("order_followups").withIndex("by_day_status", (q) => q.eq("day", d)).collect();
      const fm = new Map<string, any[]>();
      for (const r of fRows) {
        const a = String(r.area ?? "");
        if (!fm.has(a)) fm.set(a, []);
        fm.get(a)!.push(r);
      }
      followupDaily.set(d, fm);
    }

    // Kunci tagihan: nama toko + nominal (persis seperti permintaan penilaian)
    const tagihanKey = (r: any) =>
      `${String(r.storeName ?? "").trim().toLowerCase()}|${r.piutang ?? r.total ?? 0}`;

    const metricsForArea = async (area: string) => {
      // ===== FU Toko (sheet Toko_aktif) =====
      const fuRows: any[] = await ctx.db
        .query("active_store_tasks")
        .withIndex("by_month_area", (q) => q.eq("monthKey", monthKey).eq("area", area as any))
        .collect();
      const fuHasil = fuRows.filter((r) => r.result != null);
      const fuOrder = fuHasil.filter((r) => r.result === "order_masuk").length;
      const fuPlan = fuHasil.filter((r) => r.result === "plan_order").length;
      const fuNoRespon = fuHasil.filter((r) => r.result === "no_respon").length;
      const fuTidakOrder = fuHasil.length - fuOrder - fuPlan - fuNoRespon;

      // ===== SPK penagihan: muncul lagi besok dengan nama + nominal sama? =====
      let tagihTotal = 0;
      let tagihSelesai = 0;
      let tagihMasih = 0;
      for (let i = 0; i + 1 < days.length; i++) {
        const rows = piutangDaily.get(days[i])?.get(area) ?? [];
        const nextRows = piutangDaily.get(days[i + 1])?.get(area) ?? [];
        // hari tanpa daftar (libur / belum sync) tidak dinilai
        if (rows.length === 0 || nextRows.length === 0) continue;
        const nextSet = new Set(nextRows.map(tagihanKey));
        for (const r of rows) {
          if (r.status === "done" || r.workflowStatus === "CLSD") continue;
          tagihTotal++;
          if (nextSet.has(tagihanKey(r))) tagihMasih++;
          else tagihSelesai++;
        }
      }

      // ===== SPK orderan (order_followups) =====
      let spkTotal = 0;
      let spkOrder = 0;
      let spkNoRespon = 0;
      let spkTidakOrder = 0;
      for (const d of days) {
        const rows = followupDaily.get(d)?.get(area) ?? [];
        for (const r of rows) {
          if (r.hasil == null) continue;
          spkTotal++;
          if (r.hasil === "order_masuk" || r.hasil === "order_tambah") spkOrder++;
          else if (r.hasil === "no_respon") spkNoRespon++;
          else spkTidakOrder++;
        }
      }

      return {
        area,
        fuTotal: fuHasil.length,
        fuOrder,
        fuPlan,
        fuNoRespon,
        fuTidakOrder,
        fuPct: fuHasil.length > 0 ? Math.round(((fuOrder + fuPlan * 0.5) / fuHasil.length) * 100) : null,
        tagihTotal,
        tagihSelesai,
        tagihMasih,
        tagihPct: tagihTotal > 0 ? Math.round((tagihSelesai / tagihTotal) * 100) : null,
        spkTotal,
        spkOrder,
        spkNoRespon,
        spkTidakOrder,
        spkPct: spkTotal > 0 ? Math.round((spkOrder / spkTotal) * 100) : null,
      };
    };

    const areas = Array.from(new Set(teleUsers.map((u) => String(u.area ?? "")).filter((a) => a.length > 0)));
    const areaMetrics = new Map<string, any>();
    for (const a of areas) areaMetrics.set(a, await metricsForArea(a));

    const tele = teleUsers.map((u) => {
      const m = areaMetrics.get(String(u.area ?? "")) ?? null;
      return {
        id: u._id,
        name: u.name ?? "",
        area: u.area ?? "",
        ...(m ?? {
          fuTotal: 0, fuOrder: 0, fuPlan: 0, fuNoRespon: 0, fuTidakOrder: 0, fuPct: null,
          tagihTotal: 0, tagihSelesai: 0, tagihMasih: 0, tagihPct: null,
          spkTotal: 0, spkOrder: 0, spkNoRespon: 0, spkTidakOrder: 0, spkPct: null,
        }),
      };
    });

    return { monthKey, today, hariDinilai: days.length, field, tele };
  },
});

// ===== PENILAIAN BULANAN (dipanggil halaman SPV) =====
export const monthly = action({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, { monthKey }) => {
    const viewer: any = await ctx.runQuery(api.users.viewer);
    if (!viewer || (viewer.role !== "supervisor" && viewer.role !== "owner")) {
      throw new Error("Khusus supervisor.");
    }

    const mk = monthKey ?? dayKeyWIB().slice(0, 7);
    const raw: any = await ctx.runQuery(internal.penilaian.raw, { monthKey: mk });

    const [bulanan, mingguan] = await Promise.all([fetchPcpBulanan(), fetchPcpMingguan()]);

    const field = (raw.field ?? []).map((f: any) => {
      const omset = omsetOf(f.name, f.area, bulanan, mingguan);
      const hasil = hitungSkor([
        { label: "Kunjungan harian", pct: f.kunjunganPct, bobot: 30 },
        { label: "Toko order", pct: f.orderPct, bobot: 25 },
        { label: "Keterangan lengkap", pct: f.ketPct, bobot: 15 },
        { label: "Omset bulanan", pct: omset.omsetBulanPct, bobot: 20 },
        { label: "Omset mingguan", pct: omset.omsetMingguPct, bobot: 10 },
      ]);
      return { ...f, ...omset, ...hasil };
    });

    const tele = (raw.tele ?? []).map((t: any) => {
      const omset = omsetOf(t.name, t.area, bulanan, mingguan);
      const hasil = hitungSkor([
        { label: "FU Toko", pct: t.fuPct, bobot: 30 },
        { label: "SPK penagihan", pct: t.tagihPct, bobot: 30 },
        { label: "SPK orderan", pct: t.spkPct, bobot: 20 },
        { label: "Omset bulanan", pct: omset.omsetBulanPct, bobot: 15 },
        { label: "Omset mingguan", pct: omset.omsetMingguPct, bobot: 5 },
      ]);
      return { ...t, ...omset, ...hasil };
    });

    const urut = (a: any, b: any) => b.skor - a.skor || String(a.name).localeCompare(String(b.name));
    field.sort(urut);
    tele.sort(urut);

    return {
      monthKey: mk,
      fetchedAt: Date.now(),
      batasOnTrack: ON_TRACK_MIN,
      omsetTersedia: bulanan != null || mingguan != null,
      field,
      tele,
      summary: {
        field: { total: field.length, onTrack: field.filter((x: any) => x.skor >= ON_TRACK_MIN).length },
        tele: { total: tele.length, onTrack: tele.filter((x: any) => x.skor >= ON_TRACK_MIN).length },
      },
    };
  },
});
