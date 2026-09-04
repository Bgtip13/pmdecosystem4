import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";

const RED = "#D92D20";
const GRAY = "#667085";

export default function Laporan() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const MENUS = [
    { icon: "🏆", label: "PCP Bulanan", desc: "Pencapaian & target per area/bulan", to: "/laporan-pcp", bg: "#FEF0C7" },
    { icon: "📅", label: "PCP Mingguan", desc: "Pencapaian per minggu (M1–M5)", to: "/laporan-pcp-mingguan", bg: "#E0F2FE" },
    { icon: "🎯", label: "Target vs Act", desc: "Pencapaian per toko (DAP)", to: "/laporan-dap", bg: "#DCFAE6" },
    { icon: "🚚", label: "Ekspedisi", desc: "Kiriman, armada & tunai ekspedisi", to: "/laporan-ekspedisi", bg: "#FEE4E2" },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
        <Text style={styles.title}>Laporan</Text>
        <Text style={styles.meta}>Pencapaian penjualan, target & ekspedisi</Text>
      </View>

      <View style={styles.body}>
        {MENUS.map((m) => (
          <TouchableOpacity key={m.to} style={styles.card} onPress={() => router.push(m.to)}>
            <View style={[styles.iconBox, { backgroundColor: m.bg }]}>
              <Text style={styles.iconText}>{m.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{m.label}</Text>
              <Text style={styles.cardDesc}>{m.desc}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.note}>
          {viewer.role === "supervisor"
            ? "Anda melihat semua area — pakai filter area di dalam tiap laporan."
            : `Data laporan otomatis mengikuti area Anda (${viewer.area ?? "-"}).`}
        </Text>
      </View>

      <TabBar active="laporan" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  brand: { fontSize: 12, fontWeight: "800", color: RED },
  title: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 2 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  body: { padding: 20, paddingBottom: 120 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#EEF0F3" },
  iconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  iconText: { fontSize: 22 },
  cardLabel: { fontSize: 16, fontWeight: "800", color: "#111" },
  cardDesc: { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 16 },
  arrow: { fontSize: 24, color: "#98A2B3", fontWeight: "700", marginLeft: 8 },
  note: { fontSize: 12, color: GRAY, marginTop: 6, paddingHorizontal: 4, lineHeight: 17 },
});
