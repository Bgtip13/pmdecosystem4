import IOSSpinner from "../components/IOSSpinner";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../components/AppText";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import AppIcon from "../components/AppIcon";
import { TOP_PAD, IS_WEB } from "../lib/layout";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

// Menu laporan — Ekspedisi DIHAPUS (tidak tampil untuk role mana pun).
// Kalau nanti mau dikembalikan khusus PPIC, tambahkan satu entri di sini
// lalu ganti MENUS jadi: isPpic ? ALL_MENUS.filter(m => m.to === "/laporan-ekspedisi") : ALL_MENUS
const getMenus = (C: Colors) => [
  { icon: "trophy-outline", color: C.chip.warning.fg, bg: C.chip.warning.bg, label: "PCP Bulanan", desc: "Pencapaian & target per area/bulan", to: "/laporan-pcp" },
  { icon: "calendar-outline", color: C.chip.info.fg, bg: C.chip.info.bg, label: "PCP Mingguan", desc: "Pencapaian per minggu (M1–M5)", to: "/laporan-pcp-mingguan" },
  { icon: "target-outline", color: C.chip.success.fg, bg: C.chip.success.bg, label: "Target vs Act", desc: "Pencapaian per toko (DAP)", to: "/laporan-dap" },
  { icon: "cube-outline", color: C.cyan, bg: C.cyanSoft, label: "Produk per Toko", desc: "Produk yang diambil toko per bulan, per brand", to: "/laporan-produk" },
  { icon: "store-outline", color: C.chip.danger.fg, bg: C.chip.danger.bg, label: "Rekap FU Toko", desc: "OPEN/INPG/CLSD per area (bulanan)", to: "/laporan-fu-toko" },
  { icon: "time-outline", color: C.chip.purple.fg, bg: C.purpleSoft, label: "Riwayat FU Toko", desc: "Hasil per bulan — September, Oktober, dst.", to: "/fu-toko-riwayat" },
];


export default function Laporan() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;
  }

  const isPpic = viewer.role === "ppic";
  const MENUS = getMenus(C);

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
        <Text style={styles.title}>Laporan</Text>
        <Text style={styles.meta}>
          {isPpic ? "Belum ada laporan untuk akun ini" : "Pencapaian penjualan & target"}
        </Text>
      </View>

      <View style={styles.body}>
        {MENUS.length === 0 ? (
          <Text style={styles.note}>Belum ada laporan yang tersedia.</Text>
        ) : (
          MENUS.map((m) => (
            <TouchableOpacity key={m.to} style={styles.card} onPress={() => router.push(m.to as any)}>
              <View style={[styles.iconBox, { backgroundColor: m.bg }]}>
                <AppIcon name={m.icon} size={22} color={m.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{m.label}</Text>
                <Text style={styles.cardDesc}>{m.desc}</Text>
              </View>
              <AppIcon name="chevron" size={18} color={C.inkFaint} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.note}>
          {isPpic
            ? "Akun PPIC tidak memiliki menu laporan di sini."
            : viewer.role === "supervisor"
              ? "Anda melihat semua area — pakai filter area di dalam tiap laporan."
              : `Data laporan otomatis mengikuti area Anda (${viewer.area ?? "-"}).`}
        </Text>
      </View>

      <TabBar active="laporan" />
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: C.surfaceTint,
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  brand: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 2 },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  body: {
    padding: 20, paddingBottom: 120,
    // Web: menu tersusun 2 kolom
    ...(IS_WEB ? { flexDirection: "row" as const, flexWrap: "wrap" as const, justifyContent: "space-between" as const } : {}),
  },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.card,
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.divider,
    ...(IS_WEB ? { width: "48.5%" as const } : {}),
  },
  iconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  cardLabel: { fontSize: 16, fontWeight: "800", color: C.ink0 },
  cardDesc: { fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 16 },
  note: {
    fontSize: 12, color: C.inkMuted, marginTop: 6, paddingHorizontal: 4, lineHeight: 17,
    // Web: catatan tetap selebar penuh, tidak ikut jadi kartu
    ...(IS_WEB ? { width: "100%" as const } : {}),
  },
});
