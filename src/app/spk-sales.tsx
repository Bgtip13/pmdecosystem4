import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";

const RED = "#D92D20";
const GRAY = "#667085";

export default function SpkSales() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const [q, setQ] = useState("");

  const area = viewer?.role === "supervisor" ? undefined : viewer?.area;
  const stores = useQuery(api.stores.listStores, { area }) as any;

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  if (viewer.role !== "field" && viewer.role !== "supervisor") {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>🔒 Khusus Sales Lapangan</Text>
          <Text style={styles.meta}>Daftar toko & check-in hanya untuk sales lapangan.</Text>
        </View>
        <TabBar active="spk-sales" />
      </View>
    );
  }

  const areaLabel = area ?? "Semua Area";
  const filtered = (stores ?? []).filter((s: any) => {
    const t = q.toLowerCase();
    return s.name.toLowerCase().includes(t) || (s.address || "").toLowerCase().includes(t);
  });
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>SPK Sales</Text>
          <Text style={styles.headerSub}>{areaLabel} • {stores === undefined ? "Memuat..." : `${filtered.length} toko`}</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push("/toko-baru")}>
          <Text style={styles.headerBtnText}>+ Toko</Text>
        </TouchableOpacity>
      </View>

      {ongoing?.visit ? (
        <TouchableOpacity style={styles.banner} onPress={() => router.push(`/visit/${ongoing.visit._id}`)}>
          <Text style={styles.bannerTitle}>⏱ Kunjungan berjalan</Text>
          <Text style={styles.bannerText}>{ongoing.store?.name} — sejak {fmtTime(ongoing.visit.checkinAt)}. Ketuk untuk lanjut →</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.searchBox}>
        <TextInput style={styles.searchInput} placeholder="Cari nama / alamat toko..."
          value={q} onChangeText={setQ} autoCapitalize="none" />
      </View>

      {stores === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tidak ada toko</Text>
          <Text style={styles.meta}>Coba kata kunci lain.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: any) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/store/${item._id}`)}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.address ? <Text style={styles.cardAddr} numberOfLines={2}>{item.address}</Text> : null}
              <Text style={[styles.locBadge, item.lat ? styles.locOk : styles.locNo]}>
                {item.lat ? "📍 Ada koordinat" : "📍 Belum ada koordinat"} • Ketuk untuk check-in →
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <TabBar active="spk-sales" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: "#fff" },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#111" },
  headerSub: { fontSize: 13, color: GRAY, marginTop: 2 },
  headerBtn: { backgroundColor: RED, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  headerBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  banner: { backgroundColor: "#FFF1F0", borderColor: "#FECDCA", borderWidth: 1, borderRadius: 12, marginHorizontal: 20, marginTop: 12, padding: 14 },
  bannerTitle: { color: RED, fontWeight: "800", fontSize: 14 },
  bannerText: { color: "#B42318", fontSize: 13, marginTop: 4 },
  searchBox: { paddingHorizontal: 20, paddingTop: 12 },
  searchInput: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 12, padding: 12, fontSize: 15 },
  listContent: { padding: 20, paddingBottom: 130 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardName: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardAddr: { fontSize: 13, color: GRAY, marginTop: 6, lineHeight: 18 },
  locBadge: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  locOk: { color: "#067647" },
  locNo: { color: "#B54708" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333", textAlign: "center" },
});
