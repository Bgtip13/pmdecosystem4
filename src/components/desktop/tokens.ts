// Palet & token khusus tampilan WEB. Tidak dipakai oleh APK/native.
// Bahasa desain (mengikuti video referensi):
//  • latar abu-lavender sangat terang, kartu putih ber-radius besar, bayangan lembut
//  • tombol utama HITAM, status berupa pill pastel (bg lembut + teks pekat)
//  • aksen warna hanya untuk makna: hijau = selesai, amber = menunggu, merah = perlu perhatian,
//    ungu = informasi/agen, biru = netral-info
// Nama kunci lama (brand, blue, navy, dst.) sengaja dipertahankan supaya layar lama tidak patah,
// tetapi nilainya sudah diarahkan ke palet baru.
export const FONT =
  '"Inter", "Samsung One", "SamsungOne", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';

export const A = {
  // Aksi utama = hitam tinta
  brand: "#14161B",
  brandDark: "#000000",
  brandDeep: "#0B0C10",
  brandSoft: "#F1F2F6",
  brandBorder: "#E3E5EC",
  cream: "#F7F8FB",

  // Permukaan & garis
  page: "#EEF0F4",
  surface: "#FFFFFF",
  surfaceAlt: "#F6F7FA",
  border: "#E7E9EF",
  borderSoft: "#F0F1F5",
  headerRow: "#F7F8FB",

  // Teks
  ink: "#101218",
  inkSoft: "#3A3F4C",
  muted: "#6B7183",
  mutedSoft: "#A0A6B5",

  // Status
  green: "#079455",
  greenSoft: "#E6F6EE",
  greenBorder: "#B7E4CC",
  orange: "#B25E09",
  orangeSoft: "#FFF1DB",
  purple: "#6A55D8",
  purpleSoft: "#EFECFD",
  red: "#D92D20",
  redSoft: "#FDECEA",
  info: "#2563D8",
  infoSoft: "#EAF1FE",
  infoBorder: "#BCD3FA",

  // Warna grafik
  teal: "#14B8A6",
  amber: "#F5A524",
  violet: "#8B7CF6",
  rose: "#F2557B",
  sky: "#38A3F5",

  // Alias lama → diarahkan ke palet baru
  blue: "#14161B",
  blueDark: "#000000",
  blueSoft: "#F1F2F6",
  blueBorder: "#E3E5EC",
  navy: "#14161B",
  navyDeep: "#0B0C10",
  navyActive: "#F1F2F6",
  onNavy: "#C9CCD6",
};

export const R = { card: 20, tile: 14, field: 12, pill: 999 } as const;

export const SHADOW = {
  shadowColor: "#1C2033",
  shadowOpacity: 0.06,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

export const SHADOW_POP = {
  shadowColor: "#1C2033",
  shadowOpacity: 0.16,
  shadowRadius: 40,
  shadowOffset: { width: 0, height: 18 },
  elevation: 12,
} as const;
