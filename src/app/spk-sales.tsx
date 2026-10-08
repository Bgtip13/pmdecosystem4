import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R, shadow: SH } = theme;

const RED = C.primary;
const GRAY = C.inkMuted;

export default function SpkSales() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const ongoing = useQuery(api.visits.getMyOngoing) as any;

  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [take, setTake] = useState(30);

  // Tunggu 600 ms setelah berhenti mengetik, baru cari ke server
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 600);
    return () => clearTimeout(t);
  }, [q]);

  const area = viewer?.role === "supervisor" ? undefined : viewer?.area;
  const searchMode = qDeb.length >= 2;

  // ← HEMAT: 30 baris dulu (bukan seluruh toko area), cari ≥2 huruf → server
  const paged = useQuery(
    api.stores.listStoresPage,
    !searchMode && viewer ? ({ area, take } as any) : "skip"
  ) as any;
  const found = useQuery(
    api.stores.searchStores,
    searchMode && viewer ? ({ q: qDeb, area, limit: 30 } as any) : "skip"
  ) as any;

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
  const rows: any[] = searchMode ? (found ?? []) : (paged ?? []);
  const loading = searchMode ? found === undefined : paged === undefined;
  const hasMore = !searchMode && (paged ?? []).length >= take;
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>SPK Sales</Text>
          <Text style={styles.headerSub}>
            {areaLabel} •{" "}
            {loading
              ? "Memuat..."
              : searchMode
                ? `${rows.length} hasil untuk "${qDeb}"`
                : `${rows.length} toko${hasMore ? " (30-an pertama)" : ""}`}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push("/toko-baru")}>
          <Text style={styles.headerBtnText}>+ Toko</Text>
        </TouchableOpacity>
      </View>

      {ongoing?.visit ? (
        <TouchableOpacity style={styles.banner} onPress={() => router.push(`/visit/${ongoing.visit._id}`)}>
          <Text style={styles.bannerTitle}>⏱ Kunjungan berjalan</Text>
          <Text style={styles.bannerText}>
            {ongoing.store?.name} — sejak {fmtTime(ongoing.visit.checkinAt)}. Ketuk untuk lanjut →
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama toko (min. 2 huruf)..."
          placeholderTextColor={C.inkFaint}
          value={q}
          onChangeText={(v) => { setQ(v); setTake(30); }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      {q.trim().length === 1 ? (
        <Text style={styles.searchHint}>Ketik minimal 2 huruf supaya pencarian jalan.</Text>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{searchMode ? "Tidak ada toko yang cocok" : "Tidak ada toko"}</Text>
          <Text style={styles.meta}>{searchMode ? "Coba kata kunci lain." : "Hubungi supervisor untuk data toko."}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item: any) => item._id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.moreBtn} onPress={() => setTake((t) => t + 30)}>
                <Text style={styles.moreText}>Muat 30 toko lagi</Text>
              </TouchableOpacity>
            ) : searchMode ? (
              <Text style={styles.moreHint}>Hasil pencarian dibatasi 30 toko — persempit kata kunci kalau belum ketemu.</Text>
            ) : null
          }
          renderItem={({ item }: any) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/store/${item._id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                {item.area ? (
                  <View style={styles.areaChip}><Text style={styles.areaChipText}>{item.area}</Text></View>
                ) : null}
              </View>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row", alignItems: "center", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: C.surfaceTint,
    borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: SH.elevation,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.ink, letterSpacing: -0.2 },
  headerSub: { fontSize: 13, color: C.inkMuted, marginTop: 3 },
  headerBtn: {
    backgroundColor: RED, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9,
    shadowColor: RED, shadowOpacity: 0.25, shadowRadius: 8, elevation: 2,
  },
  headerBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  banner: {
    backgroundColor: C.status.danger.bg, borderColor: C.status.danger.border, borderWidth: 1,
    borderRadius: R.md, marginHorizontal: 20, marginTop: 14, padding: 14,
  },
  bannerTitle: { color: C.status.danger.fg, fontWeight: "800", fontSize: 14 },
  bannerText: { color: C.status.danger.fg, fontSize: 13, marginTop: 4 },

  searchBox: { paddingHorizontal: 20, paddingTop: 14 },
  searchInput: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink,
    shadowColor: SH.color, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  searchHint: { fontSize: 12, color: GRAY, paddingHorizontal: 22, paddingTop: 6, fontStyle: "italic" },

  listContent: { padding: 20, paddingBottom: 130 },
  card: {
    backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.divider,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center" },
  cardName: { flex: 1, fontSize: 16, fontWeight: "700", color: C.ink, marginRight: 8 },
  areaChip: { backgroundColor: C.chip.info.bg, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3 },
  areaChipText: { fontSize: 11, fontWeight: "800", color: C.chip.info.fg },
  cardAddr: { fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 18 },
  locBadge: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  locOk: { color: C.status.success.fg },
  locNo: { color: C.status.warning.fg },

  moreBtn: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md,
    paddingVertical: 14, alignItems: "center", marginTop: 4,
  },
  moreText: { color: RED, fontWeight: "800", fontSize: 14 },
  moreHint: { fontSize: 12, color: GRAY, textAlign: "center", marginTop: 8, lineHeight: 17 },

  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink, textAlign: "center" },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 6, textAlign: "center" },
});
