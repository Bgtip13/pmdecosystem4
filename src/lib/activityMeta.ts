// ===== Metadata aktivitas (dipakai notifikasi & log aktivitas di WEB) =====
// Mengubah kode action dari audit_events menjadi jenis (tambah/ubah/hapus/unduh/login/…),
// label, ikon, dan warna — supaya tampil seragam di lonceng, feed, dan tabel.
import type { Tone } from "../components/desktop/ui";

export type Kind = "login" | "logout" | "create" | "update" | "delete" | "download" | "approve" | "sync";

export const KIND_META: Record<Kind, { label: string; icon: string; tone: Tone }> = {
  login: { label: "Login", icon: "key", tone: "blue" },
  logout: { label: "Logout", icon: "logout", tone: "gray" },
  create: { label: "Tambah", icon: "plus", tone: "green" },
  update: { label: "Ubah", icon: "edit", tone: "amber" },
  delete: { label: "Hapus", icon: "trash", tone: "red" },
  download: { label: "Unduh", icon: "download", tone: "violet" },
  approve: { label: "Persetujuan", icon: "check", tone: "green" },
  sync: { label: "Sinkron", icon: "sync", tone: "gray" },
};

export const KIND_ORDER: Kind[] = ["login", "logout", "create", "update", "delete", "download", "approve", "sync"];

export function kindOf(action: string): Kind {
  const a = String(action || "");
  if (a === "auth.login") return "login";
  if (a === "auth.logout") return "logout";
  if (a.startsWith("export.")) return "download";
  if (a.endsWith(".sync")) return "sync";
  if (/\.(delete|clear)$/.test(a)) return "delete";
  if (/\.(approve|reject|close|complete|finish|mark_done|markCall|saveResult)$/.test(a)) return "approve";
  if (/\.(create|add_ad_hoc|start|send|request|set|request\.move|request\.cancel)$/.test(a)) return "create";
  return "update";
}

const DOMAIN: Record<string, string> = {
  auth: "Sesi", export: "Unduhan", store: "Toko", visit: "Kunjungan", jadwal: "Jadwal",
  order: "SPK Sales", piutang: "Piutang", activeStore: "FU Toko", location: "Lokasi toko",
  leave: "Izin sales", user: "Akun", notification: "Notifikasi", laporan: "Laporan",
};
export const domainOf = (action: string) => DOMAIN[String(action || "").split(".")[0]] ?? "Lainnya";

const LABEL: Record<string, string> = {
  "auth.login": "Login", "auth.logout": "Logout", "export.download": "Unduh data",
  "store.create": "Tambah toko", "store.update": "Ubah toko", "store.import_replace": "Impor ulang data toko",
  "visit.start": "Check-in kunjungan", "visit.finish": "Check-out kunjungan", "visit.edit_result": "Ubah hasil kunjungan",
  "visit.close": "Tutup kunjungan (CLSD)", "visit.delete": "Hapus kunjungan",
  "jadwal.sync": "Sinkron jadwal", "jadwal.restore": "Pulihkan jadwal", "jadwal.add_ad_hoc": "Tambah kunjungan luar jadwal",
  "jadwal.mark_done": "Jadwal selesai", "jadwal.request.move": "Ajukan pindah jadwal", "jadwal.request.cancel": "Ajukan batal jadwal",
  "order.close": "Setujui SPK Sales", "order.complete": "Selesaikan SPK Sales",
  "piutang.sync": "Sinkron piutang", "piutang.close": "Setujui piutang", "piutang.edit_result": "Ubah hasil piutang",
  "piutang.reopen": "Buka ulang piutang", "piutang.complete": "Selesaikan piutang",
  "activeStore.sync": "Sinkron FU Toko", "activeStore.markCall": "Tandai telepon FU Toko", "activeStore.saveResult": "Simpan hasil FU Toko",
  "activeStore.close": "Setujui FU Toko", "activeStore.reopen": "Buka ulang FU Toko",
  "location.request": "Ajukan lokasi toko", "location.approve": "Setujui lokasi toko", "location.reject": "Tolak lokasi toko",
  "leave.set": "Catat izin sales", "leave.clear": "Hapus izin sales",
  "user.create": "Tambah akun", "user.update_role": "Ubah peran akun", "user.delete": "Hapus akun",
  "user.reset_password": "Reset password", "user.change_password": "Ganti password",
  "notification.send": "Kirim notifikasi", "laporan.edit_ekspedisi": "Ubah laporan ekspedisi",
};
export const labelOf = (action: string) => LABEL[action] ?? String(action || "Aktivitas");

// Format waktu
export function timeAgo(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms);
  const m = Math.floor(d / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd} hari lalu`;
  return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

export function dayLabel(ms: number, now = Date.now()): string {
  const off = 7 * 3600 * 1000;
  const k = (t: number) => new Date(t + off).toISOString().slice(0, 10);
  if (k(ms) === k(now)) return "Hari ini";
  if (k(ms) === k(now - 86400000)) return "Kemarin";
  return new Date(ms).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
}
export const dayKeyWIB = (ms: number) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
