import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// JAGA: URL ini sama dengan di piutang.ts — kalau ganti sheets, ganti di dua tempat.
export const PIUTANG_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=1683363636&single=true&output=csv";

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;

// Hari ini dalam zona WIB (UTC+7) → YYYY-MM-DD
function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function parseMoney(s: string): number | undefined {
  const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

function parseCsv(text: string): any[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const clean = (c: string) => c.trim().replace(/^"|"$/g, "");
  const header = lines[0].split(",").map((h) => clean(h).toLowerCase());
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iArea = find(["area"]);
  const iName = find(["pelanggan", "nama toko", "nama"]);
  const iTgl = find(["tanggal", "tgl"]);
  const iTotal = find(["total"]);
  const iPiutang = find(["piutang"]);
  const iCicil = find(["cicil"]);
  const iUsia = find(["usia", "umur"]);
  const out: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(clean);
    const get = (ix: number) => (ix >= 0 ? cols[ix] ?? "" : "");
    const area = get(iArea).toUpperCase().trim();
    const storeName = get(iName).trim();
    if (!(AREAS as readonly string[]).includes(area) || !storeName) continue;
    out.push({
      area,
      storeName,
      tanggal: get(iTgl) || undefined,
      total: parseMoney(get(iTotal)),
      piutang: parseMoney(get(iPiutang)),
      cicil: parseMoney(get(iCicil)),
      usia: parseInt(get(iUsia), 10) || undefined,
    });
  }
  return out;
}

// ===== IMPOR BARIS PIUTANG (dipanggil autoSync & manualSync) =====
export const importRows = internalMutation({
  args: { csv: v.string(), day: v.string() },
  handler: async (ctx, { csv, day }) => {
    const rows = parseCsv(csv);
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const existing = await ctx.db.query("piutang_tasks")
        .withIndex("by_area_status", (q) => q.eq("area", r.area))
        .filter((q) => q.eq(q.field("day"), day))
        .filter((q) => q.eq(q.field("storeName"), r.storeName))
        .first();
      if (existing?.status === "done") continue; // riwayat tidak diganggu
      if (existing) {
        await ctx.db.patch(existing._id, {
          tanggal: r.tanggal, total: r.total, piutang: r.piutang,
          cicil: r.cicil, usia: r.usia,
        });
        updated++;
      } else {
        await ctx.db.insert("piutang_tasks", {
          ...r, day, status: "pending", createdAt: Date.now(),
        });
        inserted++;
      }
    }
    return { inserted, updated, total: rows.length };
  },
});
