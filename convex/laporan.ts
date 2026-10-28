import { action, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

// Kunci unik baris pengiriman (dipakai quick-edit supervisor/PPIC)
const eksKey = (r: any) => [r.tanggal, r.jam, r.armada, r.store].join("||");
const PCP_BULANAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=137493638&single=true&output=csv";

// Parser CSV benar (tahan koma & kutip di dalam sel)
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

function toInt(v?: string): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? null : n;
}

function toPct(v?: string): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace("%", "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export const fetchPcpBulanan = action({
  handler: async (ctx) => {
    const viewer = await ctx.runQuery(api.users.viewer);
    if (!viewer) throw new Error("Belum login.");
    const role = (viewer as any).role;
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing" && role !== "owner") {
      throw new Error("Tidak diizinkan.");
    }

    const res = await fetch(PCP_BULANAN_URL);
    if (!res.ok) throw new Error("Gagal menarik data (" + res.status + ").");
    const text = await res.text();

    const grid = parseCsv(text);
    if (grid.length < 2) throw new Error("Data kosong / belum siap.");

    let rows = grid.slice(1).map((c) => ({
      no: c[0]?.trim() ?? "",
      jabatan: c[1]?.trim() ?? "",
      area: c[2]?.trim() ?? "",
      sdm: c[3]?.trim() ?? "",
      potensiToko: toInt(c[4]),
      taTotal: toInt(c[5]),
      contrPct: toPct(c[6]),
      taNoo: toInt(c[7]),
      tokoReaktif: toInt(c[8]),
      trip: c[9]?.trim() ?? "",
      tripKuota: c[10]?.trim() ?? "",
      tgt: toInt(c[11]),
      act: toInt(c[12]),
      pcpPct: toPct(c[13]),
      kejar: toInt(c[14]),
    }));

    if (role !== "supervisor" && role !== "owner") {
      const myArea = (viewer as any).area;
      rows = rows.filter((r: any) => r.area === myArea);
    }

    return { fetchedAt: Date.now(), rows };
  },
});



const EKSPEDISI_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSv4YvcmiT6ThR4FS4F6znSo7GSWOJ5hN4radzDrqMyikF2yisZybIMYSng9vgi6TAPUbD5mbKGXMJL/pub?gid=794983242&single=true&output=csv";

export const fetchEkspedisi = action({
  handler: async (ctx) => {
    const viewer = await ctx.runQuery(api.users.viewer);
    if (!viewer) throw new Error("Belum login.");
    const role = (viewer as any).role;
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing" && role !== "owner" && role !== "ppic") {
      throw new Error("Tidak diizinkan.");
    }

    const res = await fetch(EKSPEDISI_URL);
    if (!res.ok) throw new Error("Gagal menarik data (" + res.status + ").");
    const text = await res.text();
    const grid = parseCsv(text);
    if (grid.length < 2) throw new Error("Data kosong / belum siap.");

    const allRows: any[] = grid.slice(1).map((c) => {
      const num = (s?: string) => {
        if (!s || !s.trim()) return 0;
        const n = parseInt(s.replace(/[^\d]/g, ""), 10);
        return isNaN(n) ? 0 : n;
      };
      const tgl = c[0]?.trim() ?? "";
      const jam = c[1]?.trim() ?? "";
      const armada = c[6]?.trim() || "Tanpa Armada";
      return {
        tanggal: tgl,
        jam,
        kategori: c[2]?.trim() ?? "",
        store: c[3]?.trim() ?? "",
        driver: c[4]?.trim() ?? "",
        helper: c[5]?.trim() ?? "",
        armada,
        bayar: c[7]?.trim() ?? "",
        typeByr: c[8]?.trim() ?? "",
        tunai: num(c[9]),
        transfer: num(c[10]),
        pod: c[12]?.trim() ?? "",
        ket: c[14]?.trim() ?? "",
        gps: c[15]?.trim() ?? "",
        checked: false,
      };
    });

    // Terapkan quick-edit (Dicek & nominal Tunai) — supervisor & PPIC
    const edits = (await ctx.runQuery(internal.laporan.listEkspedisiEditsInternal, {})) as any[];
    const editMap = new Map((edits ?? []).map((e: any) => [e.key, e]));
    for (const r of allRows) {
      const e = editMap.get(eksKey(r));
      if (!e) continue;
      if (e.checked) r.checked = true;
      if (typeof e.tunai === "number") r.tunai = e.tunai;
    }

    const totalTunai = allRows.reduce((s, r) => s + (r.tunai || 0), 0);
    const totalTransfer = allRows.reduce((s, r) => s + (r.transfer || 0), 0);

    const perKategori: Record<string, number> = {};
    const perArmadaMap: Record<string, any> = {};
    for (const r of allRows) {
      perKategori[r.kategori || "Lain"] = (perKategori[r.kategori || "Lain"] || 0) + (r.tunai || 0);
      if (!perArmadaMap[r.armada]) perArmadaMap[r.armada] = { armada: r.armada, prima: 0, ecer: 0, total: 0, count: 0 };
      const a = perArmadaMap[r.armada];
      a.total += r.tunai || 0;
      a.count++;
      if ((r.kategori || "").toLowerCase().includes("prima")) a.prima += r.tunai || 0;
      else a.ecer += r.tunai || 0;
    }
    const armadas = Object.keys(perArmadaMap).sort((a, b) => a.localeCompare(b));
    const perArmadaList = armadas.map((a) => perArmadaMap[a]);

    // Detail selalu dikirim — sheet dijaga ≤ 60 baris oleh admin
    const detail = armadas.map((a) => ({ armada: a, rows: allRows.filter((r) => r.armada === a) }));

    return {
      fetchedAt: Date.now(),
      totalTunai,
      totalTransfer,
      totalCount: allRows.length,
      dicekCount: allRows.filter((r) => r.checked).length,
      perKategori,
      perArmadaList,
      detail,
    };
  },
});

const PCP_MINGGUAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=389169579&single=true&output=csv";

export const fetchPcpMingguan = action({
  handler: async (ctx) => {
    const viewer = await ctx.runQuery(api.users.viewer);
    if (!viewer) throw new Error("Belum login.");
    const role = (viewer as any).role;
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing" && role !== "owner") throw new Error("Tidak diizinkan.");

    const res = await fetch(PCP_MINGGUAN_URL);
    if (!res.ok) throw new Error("Gagal menarik data (" + res.status + ").");
    const text = await res.text();
    const grid = parseCsv(text);
    if (grid.length < 2) throw new Error("Data kosong / belum siap.");

    const header = grid[0];

    // ===== Label minggu dijamin M1..M5 (fallback kalau header kosong/aneh) =====
    const weekLabels: string[] = [];
    for (let i = 5; i + 1 < header.length && weekLabels.length < 5; i += 2) {
      const raw = (header[i] || "").replace(/\bACT\b/i, "").trim();
      const mm = raw.match(/m\s*([1-5])/i);
      weekLabels.push(mm ? "M" + mm[1] : raw || "M" + (weekLabels.length + 1));
    }
    if (weekLabels.length === 0) {
      for (let i = 1; i <= 5; i++) weekLabels.push("M" + i);
    }

    let rows: any[] = grid.slice(1).map((c) => {
      const weeks: any[] = [];
      const mRow: any = {};
      for (let wi = 0; wi < weekLabels.length; wi++) {
        const i = 5 + wi * 2;
        const p = toPct(c[i + 1]);
        weeks.push({ m: weekLabels[wi], act: toInt(c[i]), pct: p });
        const mm = weekLabels[wi].match(/m\s*([1-5])/i);
        if (mm) mRow["m" + mm[1]] = p ?? undefined;
      }
      return {
        no: c[0]?.trim() ?? "",
        jabatan: c[1]?.trim() ?? "",
        area: c[2]?.trim() ?? "",
        sdm: c[3]?.trim() ?? "",
        tgtMgg: toInt(c[4]),
        weeks,
        ...mRow,
      };
    });

    if (role !== "supervisor" && role !== "owner") {
      const myArea = (viewer as any).area;
      rows = rows.filter((r: any) => r.area === myArea);
    }

    return { fetchedAt: Date.now(), rows, weekLabels };
  },
});

const DAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=963300823&single=true&output=csv";
const DAP_MONTHS = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];

export const fetchDap = action({
  handler: async (ctx) => {
    const viewer = await ctx.runQuery(api.users.viewer);
    if (!viewer) throw new Error("Belum login.");
    const role = (viewer as any).role;
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing" && role !== "owner") throw new Error("Tidak diizinkan.");

    const res = await fetch(DAP_URL);
    if (!res.ok) throw new Error("Gagal menarik data (" + res.status + ").");
    const grid = parseCsv(await res.text());
    if (grid.length < 6) throw new Error("Data kosong / belum siap.");

    // Metadata di baris atas
    let bulanBerjalan = 9;
    let targetGlobal: number | null = null;
    for (const r of grid) {
      const key = (r[2] || "").trim().toUpperCase();
      if (key.startsWith("BULAN BERJALAN")) bulanBerjalan = toInt(r[3]) ?? 9;
      if (key.startsWith("TARGET GLOBAL")) targetGlobal = toInt(r[3]);
    }

    // Baris data dimulai setelah 2 baris judul (indeks 5 dst), filter yang punya pelanggan
    let dataRows = grid.slice(5).filter((c: any) => (c[5] || "").trim().length > 0 && (c[1] || "").trim().length > 0);

    if (role !== "supervisor" && role !== "owner") {
      const myArea = (viewer as any).area;
      dataRows = dataRows.filter((c: any) => (c[1] || "").trim().toUpperCase() === myArea);
    }

    const rows = dataRows.map((c: any) => ({
      no: c[0]?.trim() ?? "",
      area: (c[1] || "").trim().toUpperCase(),
      kab: c[2]?.trim() ?? "",
      kec: c[3]?.trim() ?? "",
      existing: c[4]?.trim() ?? "",
      pelanggan: c[5]?.trim() ?? "",
      adm: c[6]?.trim() ?? "",
      kelasToko: c[7]?.trim() ?? "",
      kelasByr: c[8]?.trim() ?? "",
      months: DAP_MONTHS.map((_, i) => toInt(c[9 + i]) ?? 0),
      ytd: toInt(c[21]) ?? 0,
      kontribPct: toPct(c[22]),
      avg: toInt(c[23]) ?? 0,
      bulanAktif: toInt(c[24]) ?? 0,
      targetToko: toInt(c[25]) ?? 0,
      status: c[26]?.trim() ?? "",
      pcpPct: toPct(c[27]),
    }));

    // Total per bulan (semua area) untuk grafik
    const monthTotals = DAP_MONTHS.map((_, mi) => rows.reduce((s, r) => s + (r.months[mi] || 0), 0));

    return {
      fetchedAt: Date.now(),
      bulanBerjalan,
      targetGlobal,
      months: DAP_MONTHS,
      monthTotals,
      rows,
    };
  },
});

// ===== QUICK-EDIT EKSPEDISI (supervisor & PPIC; tersimpan di database app) =====
export const listEkspedisiEditsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("ekspedisi_edits" as any).collect()) as any;
  },
});

export const saveEkspedisiEdit = mutation({
  args: {
    key: v.string(),
    checked: v.optional(v.boolean()),
    tunai: v.optional(v.number()),
  },
  handler: async (ctx, { key, checked, tunai }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    const r = (me as any)?.role;
    if (r !== "supervisor" && r !== "ppic") throw new Error("Khusus supervisor / PPIC.");

    const all = (await ctx.db.query("ekspedisi_edits" as any).collect()) as any[];
    const existing = all.find((d: any) => d.key === key);

    const patch: any = { updatedBy: userId, updatedAt: Date.now() };
    if (checked !== undefined) patch.checked = checked;
    if (tunai !== undefined) patch.tunai = tunai;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("ekspedisi_edits" as any, {
        key,
        checked: checked ?? false,
        tunai: tunai ?? null,
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});
