import { Platform, StyleSheet } from "react-native";
import { FONT } from "../components/desktop/tokens";

export const IS_WEB = Platform.OS === "web";

// Header: di web tidak ada status bar, jadi lebih rapat.
export const TOP_PAD = IS_WEB ? 22 : 60;

// Pembatas lebar panel (chart / baris gauge) — hanya berlaku di web.
export const webNarrow = IS_WEB
  ? { maxWidth: 620, width: "100%" as const, alignSelf: "center" as const }
  : {};

// Gaya layar DETAIL (kunjungan / follow-up SPK).
// Native tetap persis seperti aslinya; di web tipografi disamakan dengan tema
// desktop yang sedang berjalan: Plus Jakarta Sans + skala lebih besar supaya
// tidak terasa kecil seperti tampilan HP.
export function detailStyles<T extends Record<string, any>>(obj: T): T {
  if (!IS_WEB) return StyleSheet.create(obj) as unknown as T;

  const SCALE = 1.18;
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const value: any = { ...(obj[key] as any) };
    if (value && typeof value === "object") {
      value.fontFamily = FONT;
      if (typeof value.fontSize === "number") value.fontSize = Math.round(value.fontSize * SCALE);
      if (typeof value.lineHeight === "number") value.lineHeight = Math.round(value.lineHeight * SCALE);
    }
    out[key] = value;
  }
  return StyleSheet.create(out) as unknown as T;
}
