import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import AppIcon from "../components/AppIcon";
import { TOP_PAD, IS_WEB } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";

// Menu laporan — Ekspedisi DIHAPUS (tidak tampil untuk role mana pun).
// Kalau nanti mau dikembalikan khusus PPIC, tambahkan satu entri di sini
// lalu ganti MENUS jadi: isPpic ? ALL_MENUS.filter(m => m.to === "/laporan-ekspedisi") : ALL_MENUS
const ALL_MENUS = [
  { icon: "trophy-outline", color: "#B54708", bg: "#FEF0C7", label: "PCP Bulanan", desc: "Pencapaian & target per area/bulan", to: "/laporan-pcp" },
  { icon: "calendar-outline", color: "#026AA2", bg: "#E0F2FE", label: "PCP Mingguan", desc: "Pencapaian per minggu (M1–M5)", to: "/laporan-pcp-mingguan" },
  { icon: "target-outline", color: "#067647", bg: "#DCFAE6", label: "Target vs Act", desc: "Pencapaian per toko (DAP)", to: "/laporan-dap" },
  { icon: "store-outline", color: "#B42318", bg: "#FEE4E2", label: "Rekap FU Toko", desc: "OPEN/INPG/CLSD per area (bulanan)", to: "/laporan-fu-toko" },
  { icon: "time-outline", color: "#5B21B6", bg: "#F4EBFF", label: "Riwayat FU Toko", desc: "Hasil per bulan — September, Oktober, dst.", to: "/fu-toko-riwayat" },
];


export default function Laporan() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const isPpic = viewer.role === "ppic";
  const MENUS = ALL_MENUS;

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
              <AppIcon name="chevron" size={18} color="#98A2B3" style={{ marginLeft: 8 }} />
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

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#F0D9D5" },
  brand: { fontSize: 12, fontWeight: "800", color: RED },
  title: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 2 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  body: {
    padding: 20, paddingBottom: 120,
    // Web: menu tersusun 2 kolom
    ...(IS_WEB ? { flexDirection: "row" as const, flexWrap: "wrap" as const, justifyContent: "space-between" as const } : {}),
  },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#EEF0F3",
    ...(IS_WEB ? { width: "48.5%" as const } : {}),
  },
  iconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  cardLabel: { fontSize: 16, fontWeight: "800", color: "#111" },
  cardDesc: { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 16 },
  note: {
    fontSize: 12, color: GRAY, marginTop: 6, paddingHorizontal: 4, lineHeight: 17,
    // Web: catatan tetap selebar penuh, tidak ikut jadi kartu
    ...(IS_WEB ? { width: "100%" as const } : {}),
  },
});
