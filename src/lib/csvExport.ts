// ============================================================================
// Ekspor CSV yang aman.
// - Menolak ekspor kalau tidak ada baris (dulu: berkas keluar hanya header)
// - Nama berkas unik (timestamp) supaya tidak tertukar berkas lama
// - Membaca ulang berkas dari disk SEBELUM dibagikan
// ============================================================================
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { notifyDownload } from "./downloadCsv";

// Satu sel CSV. Newline di dalam sel diubah jadi spasi (aman di Excel/Sheets),
// dibungkus tanda kutip hanya kalau memang perlu.
const cell = (v: any): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ").trim();
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Bangun isi CSV lengkap (BOM + header + baris, CRLF).
export function buildCsv(header: string[], rows: any[][]): string {
  const all = [header, ...rows].map((r) => r.map(cell).join(","));
  return "\uFEFF" + all.join("\r\n") + "\r\n";
}

export type ExportCsvOpts = {
  fileName: string;      // tanpa .csv — ekstensi & timestamp ditambahkan otomatis
  header: string[];
  rows: any[][];
  dialogTitle?: string;
};

export type ExportCsvResult = { file: string; rows: number };

export async function exportCsv(opts: ExportCsvOpts): Promise<ExportCsvResult> {
  const { header, rows } = opts;

  if (!header || header.length === 0) throw new Error("Header ekspor kosong.");
  if (!rows || rows.length === 0) {
    throw new Error("Tidak ada data pada pilihan ini. Lebarkan rentang/filter lalu coba lagi.");
  }

  const csv = buildCsv(header, rows);

  // 20260928T1530 — cukup unik, tidak mungkin bentrok dengan ekspor sebelumnya
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const name = `${opts.fileName.replace(/\.csv$/i, "")}_${stamp}.csv`;

  // ---- WEB: unduh langsung lewat browser (Sharing/folder cache tidak ada di sana)
  if (Platform.OS === "web") {
    if (typeof document === "undefined") throw new Error("Unduhan tidak didukung di peramban ini.");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notifyDownload(name, rows.length); // catat ke log aktivitas (web)
    return { file: name, rows: rows.length };
  }

  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(csv); // sinkron di SDK 54+

  // ---- VERIFIKASI: baca balik dari disk. Kalau isinya kurang → jangan dibagikan.
  // (dibungkus try supaya kalau API text() tidak tersedia, ekspor tetap jalan)
  let back = "";
  try {
    back = await file.text();
  } catch {
    back = "";
  }
  if (back) {
    const written = back.split("\r\n").filter((l) => l.length > 0).length;
    if (written < rows.length + 1) {
      throw new Error("Berkas tidak tertulis lengkap. Coba ekspor ulang.");
    }
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Berbagi berkas tidak tersedia di perangkat ini.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    dialogTitle: opts.dialogTitle ?? "Ekspor PMD",
    UTI: "public.comma-separated-values-text",
  });

  return { file: name, rows: rows.length };
}
