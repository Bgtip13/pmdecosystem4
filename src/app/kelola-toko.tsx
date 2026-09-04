import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";

const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };

export default function KelolaToko() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [area, setArea] = useState("ALL");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useQuery(api.stores.listManageStores, {
    ...(debounced ? { q: debounced } : {}),
    ...(area !== "ALL" ? { area: area as any } : {}),
  }) as any;

  const renderItem = ({ item }: any) => {
    const active = item.status === "active";
    const hasLoc = item.lat != null;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/kelola-toko/${item._id}`)}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.area] ?? "#F2F4F7" }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[item.area] ?? GRAY }]}>{item.area}</Text>
            </View>
          </View>
          <Text style={styles.addr} numberOfLines={2}>{item.address}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <Text style={[styles.loc, { color: hasLoc ? GREEN : ORANGE }]}>
              {hasLoc ? "📍 Ada koordinat" : "⚠ Tanpa koordinat"}
            </Text>
            {item.phone ? <Text style={styles.phone}> • {item.phone}</Text> : null}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", marginLeft: 8 }}>
          <View style={[styles.statusChip, { backgroundColor: active ? "#DCFAE6" : "#F2F4F7" }]}>
            <Text style={[styles.statusText, { color: active ? GREEN : GRAY }]}>{active ? "Aktif" : "Nonaktif"}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Kelola Toko</Text>
        <Text style={styles.meta}>Ketuk toko untuk edit data & status</Text>
        <View style={styles.searchBox}>
          <TextInput style={styles.searchInput} placeholder="Cari nama / alamat / no HP..."
            value={q} onChangeText={setQ} autoCapitalize="none" />
        </View>
        <View style={styles.chipRow}>
          {["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => {
            const on = area === a;
            return (
              <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setArea(a)}>
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{a === "ALL" ? "Semua" : a}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {rows === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s: any) => s._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Toko tidak ditemukan</Text>
              <Text style={styles.meta}>Coba kata kunci / area lain.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  searchBox: { backgroundColor: "#F2F4F7", borderRadius: 12, marginTop: 12, paddingHorizontal: 14 },
  searchInput: { paddingVertical: 10, fontSize: 14, color: "#111" },
  chipRow: { flexDirection: "row", marginTop: 10 },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  name: { fontSize: 15, fontWeight: "800", color: "#111", marginRight: 8, flexShrink: 1 },
  areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  areaChipText: { fontSize: 11, fontWeight: "800" },
  addr: { fontSize: 13, color: GRAY, marginTop: 4, lineHeight: 18 },
  loc: { fontSize: 12, fontWeight: "700" },
  phone: { fontSize: 12, color: GRAY },
  statusChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  arrow: { fontSize: 20, color: "#98A2B3", fontWeight: "700", marginTop: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333" },
});
