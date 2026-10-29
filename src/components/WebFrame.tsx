import { Platform, View, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import type { ReactNode } from "react";

// Rute yang SUDAH punya versi desktop (*.web.tsx). Tambahkan setiap kali ada berkas baru.
const DESKTOP_ROUTES = ["/", "/beranda", "/spk", "/spk-sales", "/jadwal", "/spk-detail", "/spk-detail-order", "/spv", "/spv-penilaian", "/laporan", "/akun", "/toko-aktif", "/riwayat", "/visit-detail", "/fu-toko-riwayat"];

export default function WebFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = DESKTOP_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={[s.page, wide && s.pageWide]}>
      <View style={[s.frame, wide ? s.frameWide : s.frameNarrow]}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#EFE8E4",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  pageWide: { backgroundColor: "#F6F2F0", paddingVertical: 0, paddingHorizontal: 0 },
  frame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#FCFAFA",
    overflow: "hidden",
  },
  frameWide: {
    maxWidth: 1600,
    backgroundColor: "#F6F2F0",
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  frameNarrow: {
    maxWidth: 560,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9E2DE",
    shadowColor: "#3B1D16",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
