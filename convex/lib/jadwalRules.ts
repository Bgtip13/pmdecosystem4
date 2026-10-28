// ==========================================================================
// ATURAN JADWAL KUNJUNGAN — satu sumber untuk backend.
//
// • 1 area = 1 sales lapangan, jadi kuota harian dihitung per area (= per sales).
// • Kuota di sini adalah MINIMAL, bukan maksimal: suatu hari dianggap "kurang"
//   kalau jumlah tokonya di bawah angka ini.
// • Sabtu lebih longgar karena banyak toko tutup / jam kerja pendek.
// ==========================================================================

export const MIN_PER_DAY = 7;           // Minggu–Jumat
export const MIN_PER_DAY_SATURDAY = 3;  // Sabtu

export const pad2 = (n: number) => String(n).padStart(2, "0");

// Hari ini menurut WIB (bukan UTC HP/server)
export function dayKeyWIB(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isValidDateKey(dk: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dk ?? ""))) return false;
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 0 = Minggu … 6 = Sabtu
export function dowOf(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function minPerDay(dateKey: string) {
  return dowOf(dateKey) === 6 ? MIN_PER_DAY_SATURDAY : MIN_PER_DAY;
}

// "2026-10-02" → "02-10-2026" (format yang dipakai sheet & layar)
export function tanggalOf(dateKey: string) {
  const [y, m, d] = dateKey.split("-");
  return `${d}-${m}-${y}`;
}

// Nomor SPK dibentuk SEKALI lalu disimpan di baris.
// Tujuannya: tanggal boleh digeser tanpa mengubah nomor, supaya cocok dengan
// catatan fisik / obrolan admin. Baris lama (belum punya noSpk) tetap dihitung
// seperti sebelumnya.
export function noSpkOf(s: any) {
  if (s?.noSpk) return String(s.noSpk);
  const d = String(s?.dateKey ?? "").replace(/-/g, "");
  const urut = s?.urutan != null ? String(s.urutan).padStart(2, "0") : "00";
  return `SPK-${d}-${s?.area ?? "?"}-${urut}`;
}
