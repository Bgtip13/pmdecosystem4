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

// Sebulan dibagi 9 kali kiriman. Porsi mingguan memakai rata-rata kiriman
// per minggu (9 kiriman / 4 minggu = 2,25), jadi bobot target mingguan =
// 2,25/9 = 25% dari target bulanan. Semua angka ditampilkan di rapor supaya
// supervisor bisa menjelaskan asal targetnya.
const KIRIMAN_PER_BULAN = 9;
const MINGGU_PER_BULAN = 4;
const KIRIMAN_PER_MINGGU = KIRIMAN_PER_BULAN / MINGGU_PER_BULAN;

function rupiahShort(n: number | null) {
  if (n == null) return "-";
  if (Math.abs(n) >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(n) >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  return `Rp${n.toLocaleString("id-ID")}`;
}

function omsetOf(name: string, area: string, bulanan: any[] | null, mingguan: any[] | null) {
  const b = findSdm(bulanan, name);
  const m = findSdm(mingguan, name);

  let bulanPct: number | null = null;
  if (b) {
    if (b.pcpPct != null) bulanPct = Math.round(b.pcpPct);
    else if (b.tgt && b.act != null) bulanPct = Math.round((b.act / b.tgt) * 100);
  }

  // Rata-rata mingguan: seluruh minggu yang sudah ada ACT-nya.
  const weeks = ((m?.weeks ?? []) as any[]).filter((w) => w.act != null);
  const mingguAct = weeks.length
    ? Math.round(weeks.reduce((a, w) => a + Number(w.act ?? 0), 0) / weeks.length)
    : null;

  // Target per kiriman → porsi mingguan 9 kiriman/bulan.
  const targetPerKiriman = b?.tgt != null ? Math.round(b.tgt / KIRIMAN_PER_BULAN) : null;
  const targetMinggu =
    targetPerKiriman != null
      ? Math.round(targetPerKiriman * KIRIMAN_PER_MINGGU)
      : m?.tgtMgg ?? null;

  let mingguPct: number | null = null;
  if (mingguAct != null && targetMinggu) {
    mingguPct = Math.round((mingguAct / targetMinggu) * 100);
  }

  return {
    area,
    omsetBulan: b?.act ?? null,
    omsetBulanTarget: b?.tgt ?? null,
    omsetBulanPct: bulanPct,
    omsetMingguAct: mingguAct,
    omsetMingguTarget: targetMinggu,
    omsetMingguPct: mingguPct,
    omsetMingguCount: weeks.length,
    omsetMingguLabel: weeks.length ? `rata-rata ${weeks.map((w) => w.m).join("/")}` : null,
    omsetMingguWeeks: ((m?.weeks ?? []) as any[]).map((w) => ({
      label: w.m,
      act: w.act ?? null,
      pct: w.pct ?? null,
    })),
    omsetTargetPerKiriman: targetPerKiriman,
    omsetKirimanPerBulan: KIRIMAN_PER_BULAN,
    omsetKirimanPerMinggu: KIRIMAN_PER_MINGGU,
    omsetRingkas: `${rupiahShort(mingguAct)} / minggu`,
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

    // ===== RIWAYAT SPK ADMIN =====
    // Sync piutang menghapus & membuat ulang tugas OPEN tiap hari, jadi satu
    // tagihan punya beberapa _id. Identitas tagihan = toko + tanggal/nominal.
    // Kalau ada duplikat, baris yang paling maju (CLSD > INPG > OPEN) dipakai.
    const rankWf = (r: any) =>
      r.workflowStatus === "CLSD" ? 3 : r.workflowStatus === "INPG" ? 2 : r.status === "done" ? 1 : 0;
    const piutangKey = (r: any) =>
      [
        String(r.storeName ?? "").trim().toLowerCase(),
        r.tanggal ?? "",
        r.total ?? "",
        r.piutang ?? "",
      ].join("|");

    const piutangByArea = new Map<string, Map<string, any>>();
    for (const dayMap of piutangDaily.values()) {
      for (const [area, rows] of dayMap) {
        if (!piutangByArea.has(area)) piutangByArea.set(area, new Map());
        const bucket = piutangByArea.get(area)!;
        for (const r of rows) {
          const key = piutangKey(r);
          const prev = bucket.get(key);
          if (!prev || rankWf(r) > rankWf(prev) || (rankWf(r) === rankWf(prev) && (r.updatedAt ?? r.createdAt ?? 0) > (prev.updatedAt ?? prev.createdAt ?? 0))) {
            bucket.set(key, r);
          }
        }
      }
    }

    // Order follow-up tidak dibuat ulang tiap hari, tapi dedupeKey tetap dipakai
    // supaya hitungan aman kalau ada baris ganda.
    const orderByArea = new Map<string, Map<string, any>>();
    for (const dayMap of followupDaily.values()) {
      for (const [area, rows] of dayMap) {
        if (!orderByArea.has(area)) orderByArea.set(area, new Map());
        const bucket = orderByArea.get(area)!;
        for (const r of rows) bucket.set(String(r.dedupeKey ?? r._id), r);
      }
    }

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

      // ===== SPK penagihan (riwayat piutang_tasks bulan ini) =====
      const pTasks = Array.from(piutangByArea.get(area)?.values() ?? []);
      const pHasil = (h: string) => pTasks.filter((r) => r.hasil === h).length;
      const pClosed = pTasks.filter((r) => r.workflowStatus === "CLSD").length;
      const pInpg = pTasks.filter((r) => r.workflowStatus === "INPG").length;
      const pOpen = pTasks.length - pClosed - pInpg;
      // Pekerjaan yang sudah dikirim tapi belum di-review tetap dihargai separuh,
      // supaya keterlambatan review supervisor tidak menjatuhkan nilai petugas.
      const tagihPct = pTasks.length > 0
        ? Math.round(((pClosed + pInpg * 0.5) / pTasks.length) * 100)
        : null;

      // ===== SPK orderan (riwayat order_followups bulan ini) =====
      const oTasks = Array.from(orderByArea.get(area)?.values() ?? []);
      const oHasil = (h: string) => oTasks.filter((r) => r.hasil === h).length;
      const oClosed = oTasks.filter((r) => r.workflowStatus === "CLSD").length;
      const oInpg = oTasks.filter((r) => r.workflowStatus === "INPG").length;
      const oOpen = oTasks.length - oClosed - oInpg;
      const oOrder = oHasil("order_masuk") + oHasil("order_tambah");
      // Konversi order dihitung dari seluruh tugas bulan ini; tugas yang belum
      // dikerjakan menahan skor, bukan diabaikan.
      const spkOrderPct = oTasks.length > 0 ? Math.round((oOrder / oTasks.length) * 100) : null;

      return {
        area,
        fuTotal: fuHasil.length,
        fuOrder,
        fuPlan,
        fuNoRespon,
        fuTidakOrder,
        fuPct: fuHasil.length > 0 ? Math.round(((fuOrder + fuPlan * 0.5) / fuHasil.length) * 100) : null,
        tagihTotal: pTasks.length,
        tagihClosed: pClosed,
        tagihInpg: pInpg,
        tagihOpen: pOpen,
        tagihPct,
        tagihLunas: pHasil("lunas"),
        tagihCicil: pHasil("cicil"),
        tagihJanji: pHasil("janji_bayar"),
        tagihNoRespon: pHasil("no_respon"),
        spkTotal: oTasks.length,
        spkClosed: oClosed,
        spkInpg: oInpg,
        spkOpen: oOpen,
        spkOrder: oOrder,
        spkOrderMasuk: oHasil("order_masuk"),
        spkOrderTambah: oHasil("order_tambah"),
        spkNoRespon: oHasil("no_respon"),
        spkTidakOrder: oHasil("tidak_order"),
        spkPct: spkOrderPct,
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
          tagihTotal: 0, tagihClosed: 0, tagihInpg: 0, tagihOpen: 0, tagihPct: null,
          tagihLunas: 0, tagihCicil: 0, tagihJanji: 0, tagihNoRespon: 0,
          spkTotal: 0, spkClosed: 0, spkInpg: 0, spkOpen: 0, spkOrder: 0, spkPct: null,
          spkOrderMasuk: 0, spkOrderTambah: 0, spkNoRespon: 0, spkTidakOrder: 0,
        }),
      };
    });

    return { monthKey, today, hariDinilai: days.length, field, tele };
  },
});

// ===== HITUNG RAPOR (dipakai aksi publik & pemeriksaan internal) =====
async function computeMonthly(ctx: any, monthKey: string) {
    const mk = monthKey;
    const raw: any = await ctx.runQuery(internal.penilaian.raw, { monthKey: mk });

    const [bulanan, mingguan] = await Promise.all([fetchPcpBulanan(), fetchPcpMingguan()]);

    // Setiap komponen membawa nilai, target, sumber data, dan penjelasan agar
    // halaman detail bisa menjadi rapor yang bisa dibaca sendiri oleh sales.
    type Komponen = {
      key: string;
      label: string;
      bobot: number;
      pct: number | null;
      nilai: string;
      target?: string;
      sumber: string;
      penjelasan: string;
    };
    const nilaiPct = (p: number | null) => (p == null ? null : Math.max(0, Math.min(100, p)));
    const susun = (parts: Komponen[]) => {
      const hasil = hitungSkor(parts.map((p) => ({ label: p.label, pct: p.pct, bobot: p.bobot })));
      return {
        skor: hasil.skor,
        status: hasil.status,
        komponen: parts.map((p) => ({ ...p, pct: nilaiPct(p.pct) })),
      };
    };
    const komponenOmset = (omset: any, bobotBulan: number, bobotMinggu: number): Komponen[] => [
      {
        key: "omset_bulan",
        label: "Omset bulanan",
        bobot: bobotBulan,
        pct: omset.omsetBulanPct,
        nilai: `${rupiahShort(omset.omsetBulan)} / ${rupiahShort(omset.omsetBulanTarget)}`,
        target: omset.omsetBulanTarget != null ? rupiahShort(omset.omsetBulanTarget) : "-",
        sumber: "Sheet PCP bulanan",
        penjelasan: "Omset aktual bulan berjalan dibanding target bulanan dari sheet PCP.",
      },
      {
        key: "omset_minggu",
        label: "Omset mingguan",
        bobot: bobotMinggu,
        pct: omset.omsetMingguPct,
        nilai: `${rupiahShort(omset.omsetMingguAct)} / minggu`,
        target: omset.omsetMingguTarget != null ? rupiahShort(omset.omsetMingguTarget) : "-",
        sumber: "Sheet PCP mingguan",
        penjelasan:
          `Rata-rata ${omset.omsetMingguCount ?? 0} minggu yang sudah ada ACT. ` +
          `Target mingguan = target per kiriman × ${KIRIMAN_PER_MINGGU} kiriman/minggu ` +
          `(porsi ${KIRIMAN_PER_BULAN} kiriman dalam sebulan).`,
      },
    ];

    const field = (raw.field ?? []).map((f: any) => {
      const omset = omsetOf(f.name, f.area, bulanan, mingguan);
      const hasil = susun([
        {
          key: "kunjungan",
          label: "Kunjungan sesuai target",
          bobot: 30,
          pct: f.kunjunganPct,
          nilai: `${f.hariMemenuhi}/${f.hariWajib} hari`,
          target: `${f.targetHarian} toko/hari (Sabtu ${f.targetSabtu})`,
          sumber: "Check-in kunjungan sales",
          penjelasan:
            `Dihitung dari jumlah hari yang mencapai target kunjungan (${f.targetHarian} toko, ` +
            `Sabtu ${f.targetSabtu}). Hari Minggu dan izin/cuti tidak dihitung. ` +
            `Total kunjungan bulan ini: ${f.kunjungan} toko.`,
        },
        {
          key: "order",
          label: "Toko tembus order",
          bobot: 25,
          pct: f.orderPct,
          nilai: `${f.orderCount}/${f.kunjungan} toko`,
          target: "Semakin tinggi semakin baik",
          sumber: "Form kunjungan (status order)",
          penjelasan:
            "Persentase toko yang dikunjungi lalu menghasilkan order. " +
            "Kunjungan tanpa order tetap dihitung ke penyebut.",
        },
        {
          key: "keterangan",
          label: "Kelengkapan keterangan",
          bobot: 15,
          pct: f.ketPct,
          nilai: `${f.keteranganLengkap}/${f.kunjungan} kunjungan`,
          target: "Catatan + tren/produk dicari",
          sumber: "Form kunjungan",
          penjelasan:
            "Kunjungan dianggap lengkap bila catatan terisi dan tren/produk yang dicari juga diisi. " +
            "Data lengkap memudahkan telemarketing menindaklanjuti.",
        },
        ...komponenOmset(omset, 20, 10),
      ]);
      return { ...f, role: "field", ...omset, ...hasil };
    });

    const tele = (raw.tele ?? []).map((t: any) => {
      const omset = omsetOf(t.name, t.area, bulanan, mingguan);
      const hasil = susun([
        {
          key: "fu_toko",
          label: "FU Toko",
          bobot: 25,
          pct: t.fuPct,
          nilai: `${t.fuOrder} order + ${t.fuPlan} rencana / ${t.fuTotal} FU`,
          target: "Order & rencana order dihargai",
          sumber: "Sheet Toko Aktif",
          penjelasan:
            `Hasil FU bulan ini: ${t.fuOrder} order, ${t.fuPlan} rencana order, ` +
            `${t.fuNoRespon} no respon, ${t.fuTidakOrder} tidak order. ` +
            "Rencana order dihargai separuh.",
        },
        {
          key: "spk_penagihan",
          label: "SPK penagihan (riwayat)",
          bobot: 30,
          pct: t.tagihPct,
          nilai: `${t.tagihClosed} CLSD + ${t.tagihInpg} review / ${t.tagihTotal} tugas`,
          target: "CLSD penuh, INPG separuh",
          sumber: "Riwayat SPK Admin — piutang_tasks",
          penjelasan:
            `Dari ${t.tagihTotal} tugas penagihan bulan ini: ${t.tagihClosed} disetujui (CLSD), ` +
            `${t.tagihInpg} menunggu review, ${t.tagihOpen} belum dikerjakan. ` +
            `Hasil tercatat: ${t.tagihLunas} lunas, ${t.tagihCicil} cicil, ` +
            `${t.tagihJanji} janji bayar, ${t.tagihNoRespon} no respon.`,
        },
        {
          key: "spk_orderan",
          label: "SPK orderan (riwayat)",
          bobot: 20,
          pct: t.spkPct,
          nilai: `${t.spkOrder}/${t.spkTotal} order`,
          target: "Order masuk/tambah dari SPK H+1",
          sumber: "Riwayat SPK Admin — order_followups",
          penjelasan:
            `Dari ${t.spkTotal} tugas orderan bulan ini: ${t.spkClosed} CLSD, ` +
            `${t.spkInpg} menunggu review, ${t.spkOpen} belum dikerjakan. ` +
            `Hasil: ${t.spkOrderMasuk} order masuk, ${t.spkOrderTambah} order tambah, ` +
            `${t.spkTidakOrder} tidak order, ${t.spkNoRespon} no respon.`,
        },
        ...komponenOmset(omset, 15, 10),
      ]);
      return { ...t, role: "telemarketing", ...omset, ...hasil };
    });

    const urut = (a: any, b: any) => b.skor - a.skor || String(a.name).localeCompare(String(b.name));
    field.sort(urut);
    tele.sort(urut);

    return {
      monthKey: mk,
      fetchedAt: Date.now(),
      batasOnTrack: ON_TRACK_MIN,
      omsetTersedia: bulanan != null || mingguan != null,
      porsiOmset: {
        kirimanPerBulan: KIRIMAN_PER_BULAN,
        mingguPerBulan: MINGGU_PER_BULAN,
        kirimanPerMinggu: KIRIMAN_PER_MINGGU,
        catatan:
          `Omset mingguan memakai rata-rata minggu berjalan. Target per kiriman = ` +
          `target bulanan ÷ ${KIRIMAN_PER_BULAN}; target mingguan = target per kiriman × ` +
          `${KIRIMAN_PER_MINGGU} kiriman/minggu.`,
      },
      field,
      tele,
      summary: {
        field: { total: field.length, onTrack: field.filter((x: any) => x.skor >= ON_TRACK_MIN).length },
        tele: { total: tele.length, onTrack: tele.filter((x: any) => x.skor >= ON_TRACK_MIN).length },
      },
    };
}

// ===== PENILAIAN BULANAN =====
// Supervisor & owner: daftar semua sales + rapor lengkap.
// Sales lapangan & telemarketing: HANYA rapornya sendiri yang dikirim ke
// perangkatnya. Penyaringan dilakukan di SERVER, bukan disembunyikan di UI,
// supaya data orang lain tidak pernah sampai ke perangkat sales.
export const monthly = action({
  args: { monthKey: v.optional(v.string()) },
  handler: async (ctx, { monthKey }) => {
    const viewer: any = await ctx.runQuery(api.users.viewer);
    if (!viewer) throw new Error("Belum login.");

    const role = String(viewer.role ?? "");
    const isManager = role === "supervisor" || role === "owner";
    const isField = role === "field";
    const isTele = role === "telemarketing";
    if (!isManager && !isField && !isTele) {
      throw new Error("Rapor penilaian hanya untuk sales, telemarketing, supervisor, dan owner.");
    }

    const full: any = await computeMonthly(ctx, monthKey ?? dayKeyWIB().slice(0, 7));

    if (isManager) {
      return {
        ...full,
        scope: "all",
        isManager: true,
        viewerId: viewer._id,
        viewerName: viewer.name ?? "",
        viewerRole: role,
      };
    }

    // ===== RAPOR SENDIRI =====
    const list: any[] = isField ? (full.field ?? []) : (full.tele ?? []);
    const mine = list.find((p) => String(p.id) === String(viewer._id)) ?? null;

    return {
      ...full,
      field: isField && mine ? [mine] : [],
      tele: isTele && mine ? [mine] : [],
      summary: {
        field: { total: isField && mine ? 1 : 0, onTrack: isField && mine && mine.skor >= ON_TRACK_MIN ? 1 : 0 },
        tele: { total: isTele && mine ? 1 : 0, onTrack: isTele && mine && mine.skor >= ON_TRACK_MIN ? 1 : 0 },
      },
      scope: "self",
      isManager: false,
      viewerId: viewer._id,
      viewerName: viewer.name ?? "",
      viewerRole: role,
      selfKind: isField ? "field" : "tele",
      selfMissing: !mine,
    };
  },
});
