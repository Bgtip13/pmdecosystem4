import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";

const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };

export default function Live() {
  const router = useRouter();
  const rows = useQuery(api.visits.listLiveSales) as any;
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!rows) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  const activeCount = rows.filter((r: any) => r.state === "visit").length;

  const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const fmtDur = (ms: number) => {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "<1 mnt";
    if (m < 60) return m + " mnt";
    return Math.floor(m / 60) + "j " + (m % 60) + "m";
  };

  const renderItem = ({ item }: any) => {
    const visiting = item.state === "visit";
    const initial = (item.sales.name || "?").charAt(0).toUpperCase();
    const durActive = visiting ? Date.now() - item.checkinAt : 0;
    const todayCount = item.todayDoneCount + (visiting ? 1 : 0);
    const todayMs = item.todayDoneMs + durActive;

    return (
      <View style={styles.card}>
        <View style={[styles.avatar, { backgroundColor: visiting ? "#FEF0C7" : "#DCFAE6" }]}>
          <Text style={[styles.avatarText, { color: visiting ? ORANGE : GREEN }]}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.name} numberOfLines={1}>{item.sales.name}</Text>
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.sales.area] ?? "#F2F4F7" }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[item.sales.area] ?? GRAY }]}>{item.sales.area}</Text>
            </View>
          </View>
          {visiting ? (
            <>
              <Text style={styles.stateVisit}>● Sedang kunjungan</Text>
              <Text style={styles.storeName} numberOfLines={1}>{item.storeName}</Text>
              <Text style={styles.sub}>sejak {fmtClock(item.checkinAt)} • durasi {fmtDur(durActive)}</Text>
            </>
          ) : (
            <>
              <Text style={styles.stateFree}>● Tidak ada kunjungan aktif</Text>
              <Text style={styles.sub}>
                {item.lastDoneAt ? "Kunjungan terakhir " + fmtClock(item.lastDoneAt) : "Belum ada kunjungan hari ini"}
              </Text>
            </>
          )}
          <Text style={styles.today}>Hari ini: {todayCount} kunjungan • total {fmtDur(todayMs)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Monitor</Text>
          <Text style={styles.subtitle}>{activeCount} sales sedang di lapangan</Text>
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r: any) => r.sales._id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Tidak ada sales terdaftar.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F2F4F7", justifyContent: "center", alignItems: "center", marginRight: 12 },
  backText: { fontSize: 18, color: "#111", fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 12, color: GRAY, marginTop: 2 },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "800", color: "#111", marginRight: 8, flexShrink: 1 },
  areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  areaChipText: { fontSize: 11, fontWeight: "800" },
  stateVisit: { fontSize: 13, fontWeight: "800", color: ORANGE, marginTop: 6 },
  stateFree: { fontSize: 13, fontWeight: "800", color: GREEN, marginTop: 6 },
  storeName: { fontSize: 15, fontWeight: "700", color: "#111", marginTop: 2 },
  sub: { fontSize: 12, color: GRAY, marginTop: 2 },
  today: { fontSize: 12, fontWeight: "700", color: "#344054", marginTop: 8 },
  empty: { textAlign: "center", color: GRAY, marginTop: 40 },
});
