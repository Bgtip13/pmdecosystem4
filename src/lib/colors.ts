// Dua set warna: terang (persis seperti sebelumnya, nuansa merah) dan gelap (hitam-biru).
// Bentuk objeknya sama dengan theme.colors, jadi kode lama yang memakai C.ink, C.status.success.bg, dst. tetap jalan.

export const lightColors = {
  bg: "#FCFAFA",
  surface: "#FFFEFC",
  surfaceAlt: "#F8F9FB",
  surfaceTint: "#FFF7F5",

  primary: "#D92D20",
  primaryDark: "#B42318",
  primarySoft: "#FEE4E2",

  ink: "#101828",
  inkSoft: "#344054",
  inkMuted: "#667085",
  inkFaint: "#98A2B3",

  border: "#E4E7EC",
  divider: "#EEF0F3",

  role: {
    field: "#175CD3",
    telemarketing: "#B54708",
    supervisor: "#6941C6",
    owner: "#067647",
  },

  status: {
    success: { bg: "#ECFDF3", fg: "#067647", border: "#ABEFC6" },
    warning: { bg: "#FFFAEB", fg: "#B54708", border: "#FEDF89" },
    danger: { bg: "#FEF3F2", fg: "#B42318", border: "#FECDCA" },
    info: { bg: "#EFF8FF", fg: "#175CD3", border: "#B2DDFF" },
    neutral: { bg: "#F2F4F7", fg: "#344054", border: "#D0D5DD" },
  },

  chip: {
    success: { bg: "#DCFAE6", fg: "#067647" },
    warning: { bg: "#FEF0C7", fg: "#B54708" },
    danger: { bg: "#FEE4E2", fg: "#B42318" },
    info: { bg: "#E0F2FE", fg: "#026AA2" },
    purple: { bg: "#EDE9FE", fg: "#5B21B6" },
    neutral: { bg: "#F2F4F7", fg: "#344054" },
    sun: { bg: "#FEF9C3", fg: "#854D0E" },
  },

  // tambahan untuk tema ganda
  card: "#FFFFFF",          // pengganti putih untuk latar kartu / input
  onPrimary: "#FFFFFF",     // teks / ikon di atas warna aksen (putih di kedua tema)
  ink2: "#475467",
  purpleSoft: "#F4EBFF",
  dangerTint: "#FFF1F0",
  blueStrong: "#1D4ED8",
  violet: "#7C3AED",
  hairline: "#F0F0F0",
  surfaceAlt2: "#F9FAFB",
  borderTint: "#F0D9D5",
  ink0: "#111111",
  ink3: "#333333",
  surfaceAlt3: "#FAFAFA",
  borderTint2: "#F3E3E1",
  hairline2: "#F0ECEC",
  infoTint: "#EFF6FF",
  surfaceAlt4: "#F4F5F7",
  purpleSoft2: "#F5F3FF",
  cyan: "#0E7090",
  cyanSoft: "#CFF9FE",
  violetDark: "#6D28D9",
  areaSolo: "#D92D20",
  primaryTint: "#FDE8E6",
  primaryTint2: "#FFF1F0",
  decoTint: "#FEF3F2",
  dangerTint2: "#FDF2F2",
  surfaceAlt5: "#FAFAFB",
  hairline3: "#EDEFF2",
};

export const darkColors: Colors = {
  bg: "#060A14",
  surface: "#0D1424",
  surfaceAlt: "#121B30",
  surfaceTint: "#0F1A33",

  primary: "#4C8DFF",
  primaryDark: "#7FB0FF",
  primarySoft: "#12254A",

  ink: "#F2F5FB",
  inkSoft: "#C9D2E6",
  inkMuted: "#8C98B4",
  inkFaint: "#66728F",

  border: "#1F2B47",
  divider: "#172038",

  role: {
    field: "#6EA8FF",
    telemarketing: "#F5A64B",
    supervisor: "#A78BFA",
    owner: "#3DD68C",
  },

  status: {
    success: { bg: "#0B2A1E", fg: "#3DD68C", border: "#14503A" },
    warning: { bg: "#2B2008", fg: "#F5B83D", border: "#5A430F" },
    danger: { bg: "#2D1114", fg: "#F97066", border: "#5C2227" },
    info: { bg: "#0C2244", fg: "#6EA8FF", border: "#1B3F7A" },
    neutral: { bg: "#141D33", fg: "#C9D2E6", border: "#2A3858" },
  },

  chip: {
    success: { bg: "#0E3626", fg: "#3DD68C" },
    warning: { bg: "#3A2A0A", fg: "#F5B83D" },
    danger: { bg: "#3A1518", fg: "#F97066" },
    info: { bg: "#0F2E57", fg: "#6EC1FF" },
    purple: { bg: "#2A1F4D", fg: "#B8A2FF" },
    neutral: { bg: "#172038", fg: "#C9D2E6" },
    sun: { bg: "#3A340C", fg: "#EAD26A" },
  },

  card: "#0D1424",
  onPrimary: "#FFFFFF",
  ink2: "#A3AEC8",
  purpleSoft: "#241A44",
  dangerTint: "#2A1216",
  blueStrong: "#7DA8FF",
  violet: "#A78BFA",
  hairline: "#172038",
  surfaceAlt2: "#0F1730",
  borderTint: "#1B2A4A",
  ink0: "#F2F5FB",
  ink3: "#C9D2E6",
  surfaceAlt3: "#0F1730",
  borderTint2: "#1B2A4A",
  hairline2: "#172038",
  infoTint: "#0C2244",
  surfaceAlt4: "#121B30",
  purpleSoft2: "#241A44",
  cyan: "#5FD4F0",
  cyanSoft: "#0B3440",
  violetDark: "#B8A2FF",
  areaSolo: "#F97066",
  primaryTint: "#14284F",
  primaryTint2: "#12254A",
  decoTint: "#0E1B36",
  dangerTint2: "#2A1216",
  surfaceAlt5: "#0F1730",
  hairline3: "#172038",
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Colors = Widen<typeof lightColors>;
