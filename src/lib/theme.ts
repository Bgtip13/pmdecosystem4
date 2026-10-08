export const theme = {
  colors: {
    bg: "#F7F8FA",
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
      sun: { bg: "#FEF9C3", fg: "#854D0E" },   // ← BARU: kuning; role.telemarketing tidak diubah
    },
  },

  radius: { xs: 8, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },

  shadow: { color: "#101828", opacity: 0.06, radius: 12, elevation: 3 },
} as const;
