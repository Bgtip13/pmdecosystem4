import { Platform } from "react-native";

export const IS_WEB = Platform.OS === "web";

// Header: di web tidak ada status bar, jadi lebih rapat.
export const TOP_PAD = IS_WEB ? 22 : 60;

// Pembatas lebar panel (chart / baris gauge) — hanya berlaku di web.
export const webNarrow = IS_WEB
  ? { maxWidth: 620, width: "100%" as const, alignSelf: "center" as const }
  : {};
