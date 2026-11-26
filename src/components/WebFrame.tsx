import { Platform, View, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import type { ReactNode } from "react";

// Rute yang SUDAH punya versi desktop (*.web.tsx). Tambahkan setiap kali ada berkas baru.
// Rute yang hanya lebar bila persis sama (sub-rutenya masih layar mobile)
const EXACT_ONLY = ["/kelola-akun", "/kelola-toko"];
const DESKTOP_ROUTES = ["/notifikasi", "/audit", "/kelola-akun", "/", "/beranda", "/spk", "/spk-sales", "/jadwal", "/spk-detail", "/spk-detail-order", "/spv", "/spv-penilaian", "/spv-approval", "/penilaian", "/laporan", "/akun", "/toko-aktif", "/riwayat", "/visit-detail", "/fu-toko-riwayat", "/piutang-semua", "/kelola-toko", "/izin", "/laporan-produk", "/laporan-pcp", "/laporan-pcp-mingguan", "/laporan-dap", "/laporan-fu-toko"];

export default function WebFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = DESKTOP_ROUTES.some((p) => pathname === p || (!EXACT_ONLY.includes(p) && pathname.startsWith(p + "/")));

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
    backgroundColor: "#E6E8EE",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  pageWide: { backgroundColor: "#EEF0F4", paddingVertical: 0, paddingHorizontal: 0 },
  frame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  frameWide: {
    maxWidth: 1600,
    backgroundColor: "#EEF0F4",
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  frameNarrow: {
    maxWidth: 560,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E7E9EF",
    shadowColor: "#1C2033",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
