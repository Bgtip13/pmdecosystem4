import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type Colors } from "./colors";

export type ThemePref = "otomatis" | "terang" | "gelap";
export type Scheme = "light" | "dark";

// Pilihan awal kalau pengguna belum memilih apa pun di halaman Akun.
// Selama layar-layar masih dimigrasi bertahap → "terang". Setelah semua layar siap → ganti ke "otomatis".
export const DEFAULT_PREF: ThemePref = "terang";

const KEY = "pmd-tema-pref";

type Ctx = { scheme: Scheme; pref: ThemePref; setPref: (p: ThemePref) => void; colors: Colors };

const ThemeCtx = createContext<Ctx>({
  scheme: "light",
  pref: "terang",
  setPref: () => {},
  colors: lightColors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(DEFAULT_PREF);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "otomatis" || v === "terang" || v === "gelap") setPrefState(v);
      })
      .catch(() => {});
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  };

  const scheme: Scheme = pref === "gelap" ? "dark" : pref === "terang" ? "light" : system === "dark" ? "dark" : "light";

  const value = useMemo<Ctx>(
    () => ({ scheme, pref, setPref, colors: scheme === "dark" ? darkColors : lightColors }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, pref],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
export const useColors = () => useContext(ThemeCtx).colors;

// Gaya dibuat sekali per tema lalu disimpan, jadi tidak ada kerja ulang tiap render.
const cache = new WeakMap<object, { light?: unknown; dark?: unknown }>();
export function useStyles<T>(factory: (C: Colors) => T): T {
  const { scheme, colors } = useContext(ThemeCtx);
  let e = cache.get(factory);
  if (!e) { e = {}; cache.set(factory, e); }
  if (e[scheme] === undefined) e[scheme] = factory(colors);
  return e[scheme] as T;
}
