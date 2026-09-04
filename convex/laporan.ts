import { action } from "./_generated/server";
import { api } from "./_generated/api";

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
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing") {
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

    // Non-supervisor hanya melihat area-nya sendiri
    if (role !== "supervisor") {
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
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing") {
      throw new Error("Tidak diizinkan.");
    }

    const res = await fetch(EKSPEDISI_URL);
    if (!res.ok) throw new Error("Gagal menarik data (" + res.status + ").");
    const text = await res.text();

    const grid = parseCsv(text);
    if (grid.length < 2) throw new Error("Data kosong / belum siap.");

    const rows: any[] = grid.slice(1).map((c) => {
      const num = (s?: string) => {
        if (!s || !s.trim()) return 0;
        const n = parseInt(s.replace(/[^\d]/g, ""), 10);
        return isNaN(n) ? 0 : n;
      };
      return {
        tanggal: c[0]?.trim() ?? "",
        jam: c[1]?.trim() ?? "",
        kategori: c[2]?.trim() ?? "",
        store: c[3]?.trim() ?? "",
        driver: c[4]?.trim() ?? "",
        helper: c[5]?.trim() ?? "",
        armada: c[6]?.trim() || "Tanpa Armada",
        bayar: c[7]?.trim() ?? "",
        typeByr: c[8]?.trim() ?? "",
        tunai: num(c[9]),
        transfer: num(c[10]),
        fotoUang: c[11]?.trim() ?? "",
        pod: c[12]?.trim() ?? "",
        retur: c[13]?.trim() ?? "",
        ket: c[14]?.trim() ?? "",
        gps: c[15]?.trim() ?? "",
      };
    });

    const totalTunai = rows.reduce((s, r) => s + (r.tunai || 0), 0);
    const totalTransfer = rows.reduce((s, r) => s + (r.transfer || 0), 0);

    const perKategori: Record<string, number> = {};
    const perArmadaMap: Record<string, any> = {};
    for (const r of rows) {
      perKategori[r.kategori || "Lain"] = (perKategori[r.kategori || "Lain"] || 0) + (r.tunai || 0);
      if (!perArmadaMap[r.armada]) perArmadaMap[r.armada] = { armada: r.armada, prima: 0, ecer: 0, total: 0 };
      perArmadaMap[r.armada].total += r.tunai || 0;
      if ((r.kategori || "").toLowerCase().includes("prima")) perArmadaMap[r.armada].prima += r.tunai || 0;
      else perArmadaMap[r.armada].ecer += r.tunai || 0;
    }

    const armadas = Object.keys(perArmadaMap).sort((a, b) => a.localeCompare(b));
    const perArmadaList = armadas.map((a) => perArmadaMap[a]);
    const detail = armadas.map((a) => ({ armada: a, rows: rows.filter((r) => r.armada === a) }));

    return { fetchedAt: Date.now(), totalTunai, totalTransfer, totalCount: rows.length, perKategori, perArmadaList, detail };
  },
});
const PCP_MINGGUAN_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=389169579&single=true&output=csv";

export const fetchPcpMingguan = action({
  handler: async (ctx) => {
    const viewer = await ctx.runQuery(api.users.viewer);
    if (!viewer) throw new Error("Belum login.");
    const role = (viewer as any).role;
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing") throw new Error("Tidak diizinkan.");

    const res = await fetch(PCP_MINGGUAN_URL);
    if (!res.ok) throw new Error("Gagal menarik data (" + res.status + ").");
    const text = await res.text();
    const grid = parseCsv(text);
    if (grid.length < 2) throw new Error("Data kosong / belum siap.");

    const header = grid[0];
    let rows: any[] = grid.slice(1).map((c) => {
      const weeks: any[] = [];
      for (let i = 5; i + 1 < header.length; i += 2) {
        const mLabel = (header[i] || "").replace(/ACT\s*/i, "").trim() || "M" + (Math.floor((i - 3) / 2));
        weeks.push({ m: mLabel, act: toInt(c[i]), pct: toPct(c[i + 1]) });
      }
      return {
        no: c[0]?.trim() ?? "",
        jabatan: c[1]?.trim() ?? "",
        area: c[2]?.trim() ?? "",
        sdm: c[3]?.trim() ?? "",
        tgtMgg: toInt(c[4]),
        weeks,
      };
    });

    if (role !== "supervisor") {
      const myArea = (viewer as any).area;
      rows = rows.filter((r: any) => r.area === myArea);
    }

    const weekLabels: string[] = rows.length ? rows[0].weeks.map((w: any) => w.m) : [];
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
    if (role !== "supervisor" && role !== "field" && role !== "telemarketing") throw new Error("Tidak diizinkan.");

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

    if (role !== "supervisor") {
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
