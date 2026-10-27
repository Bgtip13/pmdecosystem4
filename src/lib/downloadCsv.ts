// ============================================================================
// Unduh CSV lewat browser (khusus WEB). Dipakai layar-layar *.web.tsx.
// Berkas native memakai src/lib/csvExport.ts (expo-sharing) — jangan dipakai di sini.
// ============================================================================

const cell = (v: any): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ").trim();
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(header: string[], rows: any[][]): string {
  const all = [header, ...rows].map((r) => r.map(cell).join(","));
  return "\uFEFF" + all.join("\r\n") + "\r\n";
}

// Mengembalikan false kalau browser tidak mendukung unduhan (mis. dirender di server).
export function downloadCsv(fileName: string, header: string[], rows: any[][]): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const name = /\.csv$/i.test(fileName) ? fileName : `${fileName}.csv`;
  const csv = buildCsv(header, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
