// ===== KATALOG MENU =====
// Satu sumber kebenaran untuk semua layar yang bisa dibuka.
// Dipakai hub "Menu SPK" di HP (src/app/spk/index.tsx), panel "Menu SPK" di web
// (src/app/spk/index.web.tsx), dan pencarian menu di sidebar web (DesktopShell).
//
// Aturan: kalau ada layar baru, daftarkan di sini — jangan hanya di satu tempat,
// supaya tidak ada menu yang "tersembunyi" lagi.

export type MenuRole = "owner" | "supervisor" | "field" | "telemarketing" | "ppic" | "hr" | "akunting";

export type MenuEntry = {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: string; // nama AppIcon (dipakai web)
  emoji: string; // ikon HP
  bg: string;
  fg: string;
  section: string;
  roles: MenuRole[];
};

export const MENU_SECTIONS = ["Data & Toko", "Penilaian & Pantau", "Laporan", "Sistem"];

// Owner, HR, Akunting: tampilan sama, hanya melihat (read-only).
const OWNERISH: MenuRole[] = ["owner", "hr", "akunting"];
const SEMUA: MenuRole[] = [...OWNERISH, "supervisor", "field", "telemarketing"];
const NON_FIELD: MenuRole[] = [...OWNERISH, "supervisor", "telemarketing"];
const SUPERVISOR: MenuRole[] = ["supervisor"];
const TOKO_VIEW: MenuRole[] = [...OWNERISH, "supervisor", "field", "telemarketing"];
// Akunting hanya melihat riwayat Follow-up Admin (tanpa Kunjungan & FU Toko).
const NON_FIELD_TANPA_AKUNTING: MenuRole[] = ["owner", "hr", "supervisor", "telemarketing"];
// Izin Sales: supervisor (kelola) + HR (input & lihat).
const IZIN: MenuRole[] = ["supervisor", "hr"];

export const MENUS: MenuEntry[] = [
  // ===== Data & Toko =====
  {
    key: "kelola-toko",
    label: "Kelola Toko",
    desc: "Cari, tambah, dan perbarui data toko (nama, alamat, area, titik lokasi)",
    href: "/kelola-toko",
    icon: "store",
    emoji: "🏬",
    bg: "#E0F2FE",
    fg: "#026AA2",
    section: "Data & Toko",
    roles: TOKO_VIEW,
  },
  {
    key: "toko-baru",
    label: "Toko Baru",
    desc: "Daftarkan toko baru lengkap dengan foto & titik lokasi",
    href: "/toko-baru",
    icon: "plus",
    emoji: "➕",
    bg: "#FEE4E2",
    fg: "#B42318",
    section: "Data & Toko",
    roles: ["field", "supervisor"],
  },
  {
    key: "toko-aktif",
    label: "FU Toko",
    desc: "Toko belum ambil bulan ini — hubungi & catat hasilnya",
    href: "/toko-aktif",
    icon: "phone",
    emoji: "📞",
    bg: "#FEF0C7",
    fg: "#B54708",
    section: "Data & Toko",
    roles: NON_FIELD,
  },
  {
    key: "fu-toko-riwayat",
    label: "Riwayat FU Toko",
    desc: "Hasil follow-up toko per bulan — OPEN, INPG, CLSD",
    href: "/fu-toko-riwayat",
    icon: "clock",
    emoji: "🕘",
    bg: "#F4EBFF",
    fg: "#5B21B6",
    section: "Data & Toko",
    roles: NON_FIELD_TANPA_AKUNTING,
  },
  {
    key: "jadwal",
    label: "SPK Jadwal",
    desc: "Kunjungan hari ini sesuai jadwal bulanan",
    href: "/jadwal",
    icon: "calendar",
    emoji: "📅",
    bg: "#E0F2FE",
    fg: "#026AA2",
    section: "Data & Toko",
    roles: ["field", "supervisor", ...OWNERISH],
  },
  {
    key: "riwayat",
    label: "Riwayat",
    desc: "Kunjungan, follow-up admin & FU Toko yang sudah selesai",
    href: "/riwayat",
    icon: "clock",
    emoji: "🗂️",
    bg: "#F4EBFF",
    fg: "#5B21B6",
    section: "Data & Toko",
    roles: SEMUA,
  },

  // ===== Penilaian & Pantau =====
  {
    key: "penilaian",
    label: "Nilai Saya",
    desc: "Rapor penilaian pribadi: kunjungan, follow-up, dan skor",
    href: "/penilaian",
    icon: "star",
    emoji: "⭐",
    bg: "#DCFAE6",
    fg: "#067647",
    section: "Penilaian & Pantau",
    roles: ["field", "telemarketing"],
  },
  {
    key: "spv-penilaian",
    label: "Penilaian Sales & Telemarketing",
    desc: "On-track/tidak per orang • kunjungan • follow-up",
    href: "/spv-penilaian",
    icon: "chart",
    emoji: "📊",
    bg: "#DCFAE6",
    fg: "#067647",
    section: "Penilaian & Pantau",
    roles: ["supervisor", ...OWNERISH],
  },
  {
    key: "live",
    label: "Pantau Live",
    desc: "Sales yang sedang berkunjung & yang belum mulai hari ini",
    href: "/live",
    icon: "eye",
    emoji: "👀",
    bg: "#F4EBFF",
    fg: "#5B21B6",
    section: "Penilaian & Pantau",
    roles: ["supervisor", ...OWNERISH],
  },

  // ===== Laporan =====
  {
    key: "laporan",
    label: "Laporan",
    desc: "Semua rekap penjualan dalam satu tempat",
    href: "/laporan",
    icon: "chart",
    emoji: "🧾",
    bg: "#DCFAE6",
    fg: "#067647",
    section: "Laporan",
    roles: NON_FIELD,
  },
  {
    key: "laporan-pcp",
    label: "PCP Bulanan",
    desc: "Pencapaian & target per area/bulan",
    href: "/laporan-pcp",
    icon: "trend",
    emoji: "📈",
    bg: "#FEF0C7",
    fg: "#B54708",
    section: "Laporan",
    roles: NON_FIELD,
  },
  {
    key: "laporan-pcp-mingguan",
    label: "PCP Mingguan",
    desc: "Pencapaian per minggu (M1–M5)",
    href: "/laporan-pcp-mingguan",
    icon: "calendar",
    emoji: "🗓️",
    bg: "#E0F2FE",
    fg: "#026AA2",
    section: "Laporan",
    roles: NON_FIELD,
  },
  {
    key: "laporan-dap",
    label: "Target vs Aktual",
    desc: "Pencapaian per toko (DAP)",
    href: "/laporan-dap",
    icon: "flag",
    emoji: "🎯",
    bg: "#DCFAE6",
    fg: "#067647",
    section: "Laporan",
    roles: NON_FIELD,
  },
  {
    key: "laporan-produk",
    label: "Produk per Toko",
    desc: "Produk yang diambil toko per bulan, per brand",
    href: "/laporan-produk",
    icon: "box",
    emoji: "📦",
    bg: "#CFF9FE",
    fg: "#0E7490",
    section: "Laporan",
    roles: NON_FIELD,
  },
  {
    key: "laporan-fu-toko",
    label: "Rekap FU Toko",
    desc: "OPEN/INPG/CLSD per area (bulanan)",
    href: "/laporan-fu-toko",
    icon: "store",
    emoji: "🏪",
    bg: "#FEE4E2",
    fg: "#B42318",
    section: "Laporan",
    roles: NON_FIELD,
  },

  // ===== Sistem =====
  {
    key: "spv",
    label: "Menu Supervisor",
    desc: "Audit, persetujuan, izin, dan kelola akun sales",
    href: "/spv",
    icon: "shield",
    emoji: "🛡️",
    bg: "#F4EBFF",
    fg: "#5B21B6",
    section: "Sistem",
    roles: SUPERVISOR,
  },
  {
    key: "spv-approval",
    label: "Persetujuan",
    desc: "Perubahan jadwal & usulan lokasi toko dari sales",
    href: "/spv-approval",
    icon: "check",
    emoji: "✅",
    bg: "#DCFAE6",
    fg: "#067647",
    section: "Sistem",
    roles: SUPERVISOR,
  },
  {
    key: "izin",
    label: "Izin Sales",
    desc: "Tandai sales tidak masuk / tidak keliling",
    href: "/izin",
    icon: "calendar",
    emoji: "🌴",
    bg: "#F4EBFF",
    fg: "#5B21B6",
    section: "Sistem",
    roles: IZIN,
  },
  {
    key: "kelola-akun",
    label: "Kelola Akun Sales",
    desc: "Ubah peran / area, reset password",
    href: "/kelola-akun",
    icon: "key",
    emoji: "🔑",
    bg: "#EFF8FF",
    fg: "#175CD3",
    section: "Sistem",
    roles: SUPERVISOR,
  },
  {
    key: "audit",
    label: "Audit Aktivitas",
    desc: "Siapa mengubah / menghapus / menyetujui apa, kapan",
    href: "/audit",
    icon: "shield",
    emoji: "🕵️",
    bg: "#F4EBFF",
    fg: "#5B21B6",
    section: "Sistem",
    roles: SUPERVISOR,
  },
  {
    key: "notifikasi-kirim",
    label: "Kirim Notifikasi",
    desc: "Kirim pengumuman ke semua user atau pilih penerima",
    href: "/notifikasi-kirim",
    icon: "send",
    emoji: "✉️",
    bg: "#E0F2FE",
    fg: "#026AA2",
    section: "Sistem",
    roles: SUPERVISOR,
  },
  {
    key: "chat",
    label: "Chat Internal",
    desc: "Pesan dengan tim",
    href: "/chat",
    icon: "chat",
    emoji: "💬",
    bg: "#E0F2FE",
    fg: "#026AA2",
    section: "Sistem",
    roles: SEMUA,
  },
  {
    key: "notifikasi",
    label: "Notifikasi",
    desc: "Pemberitahuan tugas & aktivitas",
    href: "/notifikasi",
    icon: "bell",
    emoji: "🔔",
    bg: "#FEF0C7",
    fg: "#B54708",
    section: "Sistem",
    roles: SEMUA,
  },
  {
    key: "akun",
    label: "Akun",
    desc: "Profil, peran, dan pengaturan aplikasi",
    href: "/akun",
    icon: "user",
    emoji: "👤",
    bg: "#F2F4F7",
    fg: "#475467",
    section: "Sistem",
    roles: SEMUA,
  },
  {
    key: "ganti-password",
    label: "Ganti Password",
    desc: "Ganti kata sandi akun kamu",
    href: "/ganti-password",
    icon: "lock",
    emoji: "🔒",
    bg: "#F2F4F7",
    fg: "#475467",
    section: "Sistem",
    roles: SEMUA,
  },
];

/** Semua menu yang boleh dibuka role ini (urut sesuai MENUS). */
export function menusFor(role?: string | null): MenuEntry[] {
  if (!role) return [];
  return MENUS.filter((m) => m.roles.includes(role as MenuRole));
}

/**
 * Menu role ini, dikelompokkan per bagian.
 * `exclude` dipakai hub SPK HP: kartu kerja (SPK Sales/Admin/Riwayat/Jadwal/FU Toko)
 * sudah tampil di atas, jadi tidak perlu diulang.
 */
export function menuSectionsFor(role?: string | null, exclude: string[] = []) {
  const skip = new Set(exclude);
  const items = menusFor(role).filter((m) => !skip.has(m.key));
  return MENU_SECTIONS.map((title) => ({
    title,
    items: items.filter((m) => m.section === title),
  })).filter((g) => g.items.length > 0);
}
