import { lightColors } from "./colors";

export const theme = {
  colors: lightColors,

  radius: { xs: 8, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },

  shadow: { color: "#101828", opacity: 0.06, radius: 12, elevation: 3 },
} as const;
