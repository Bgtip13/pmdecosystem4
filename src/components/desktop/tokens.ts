// Palet khusus tampilan WEB. Tidak dipakai oleh APK/native.
// Tema merah-putih mengikuti aplikasi HP: merah PMD sebagai aksen utama,
// permukaan putih bersih, dan netral hangat (bukan abu kebiruan).
export const FONT =
  '"Plus Jakarta Sans", "Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export const A = {
  // Aksen merek
  brand: "#D92D20",
  brandDark: "#B42318",
  brandDeep: "#7A1D14",
  brandSoft: "#FEF3F2",
  brandBorder: "#FECDCA",
  cream: "#FFF7F5",

  // Permukaan & garis
  page: "#F6F2F0",
  surface: "#FFFFFF",
  surfaceAlt: "#FAF7F5",
  border: "#E9E2DE",
  borderSoft: "#F2ECE8",
  headerRow: "#FFF7F5",

  // Teks
  ink: "#1B1513",
  inkSoft: "#4A3F3B",
  muted: "#7C6F69",
  mutedSoft: "#A0928C",

  // Status
  green: "#0E7C4F",
  greenSoft: "#ECFDF3",
  greenBorder: "#ABEFC6",
  orange: "#B54708",
  orangeSoft: "#FFFAEB",
  purple: "#6941C6",
  purpleSoft: "#F4EBFF",
  red: "#B42318",
  info: "#175CD3",
  infoSoft: "#EFF8FF",
  infoBorder: "#B2DDFF",

  // Alias lama (banyak layar web memakai nama ini) → diarahkan ke merah merek
  blue: "#D92D20",
  blueDark: "#B42318",
  blueSoft: "#FEF3F2",
  blueBorder: "#FECDCA",
  navy: "#7A1D14",
  navyDeep: "#5E150E",
  navyActive: "#FFF1EE",
  onNavy: "#F3CFC9",
};

export const SHADOW = {
  shadowColor: "#3B1D16",
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
