import { Alert, Linking, Platform } from "react-native";

// Shortcut ke aplikasi lain (dibuka di browser). Dipakai di Beranda HP & web.
export const EXTERNAL_LINKS = [
  {
    key: "cek-ekspedisi",
    label: "Cek Ekspedisi",
    desc: "Laporan & input ekspedisi",
    url: "https://laporan-app-phi.vercel.app/",
    icon: "box",
  },
  {
    key: "portal-pmd",
    label: "Portal Aplikasi PMD",
    desc: "Kumpulan aplikasi PMD",
    url: "https://portal-aplikasi-pmd-six.vercel.app/",
    icon: "grid",
  },
] as const;

export async function openExternal(url: string) {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Gagal membuka", "Tautan tidak bisa dibuka. Coba lagi.");
  }
}
