// ===== Parsing angka rupiah dari Google Sheets =====
// "Rp1.043.429" → 1043429 · "1.900.000" → 1900000
// "2346714.2857142857" → 2346714 · "1.500,50" → 1501
export function parseMoney(raw: any): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return isFinite(raw) ? Math.round(raw) : undefined;

  let s = String(raw).trim().replace(/[^\d.,-]/g, "");   // buang "Rp", spasi, dsb
  if (!s) return undefined;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots && commas) {
    // "1.234.567,89" → titik ribuan, koma desimal
    s = s.replace(/\./g, "").replace(/,(\d+)$/, ".$1");
  } else if (commas) {
    if (commas > 1) s = s.replace(/,/g, "");
    else {
      const [a, b] = s.split(",");
      s = a.length <= 3 && b.length === 3 ? a + b : a + "." + b;
    }
  } else if (dots) {
    if (dots > 1) s = s.replace(/\./g, "");
    else {
      const [a, b] = s.split(".");
      s = a.length <= 3 && b.length === 3 ? a + b : a + "." + b;
    }
  }

  const n = parseFloat(s);
  if (isNaN(n)) return undefined;
  if (n > 1e12) return undefined;   // jaga-jaga: nilai tidak wajar dianggap kosong
  return Math.round(n);
}
