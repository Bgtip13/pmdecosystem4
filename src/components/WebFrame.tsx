import { Platform, View, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import type { ReactNode } from "react";

// Rute yang SUDAH punya versi desktop (*.web.tsx). Tambahkan setiap kali ada berkas baru.
const DESKTOP_ROUTES = ["/beranda", "/spk", "/toko-aktif"];

export default function WebFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = DESKTOP_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={s.page}>
      <View style={[s.frame, { maxWidth: wide ? 1440 : 560 }]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#E9EDF3",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  frame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#FCFAFA",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    shadowColor: "#101828",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: "hidden",
  },
});
