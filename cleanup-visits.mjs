// Membersihkan data kunjungan tes (HATI-HATI: menghapus SEMUA kunjungan).
// deleteAllVisits sekarang internal, jadi dijalankan lewat Convex CLI:
//   node cleanup-visits.mjs
import { execSync } from "node:child_process";

let total = 0;
while (true) {
  const out = execSync("npx convex run visits:deleteAllVisits", { encoding: "utf8" }).trim();
  const n = Number(out.split(/\s+/).pop());
  if (!n) break;
  total += n;
  console.log("Terhapus:", total);
}
console.log("SELESAI - total kunjungan dihapus:", total);
