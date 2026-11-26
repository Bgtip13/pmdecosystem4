import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import { TOP_PAD } from "../lib/layout";

import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
const makeAREA_BG = (C: Colors): any => (
  { SOLO: C.chip.danger.bg, DIY: C.chip.info.bg, SEMARANG: C.chip.success.bg }
);
const makeAREA_TX = (C: Colors): any => (
  { SOLO: C.status.danger.fg, DIY: C.chip.info.fg, SEMARANG: C.status.success.fg }
);
export default function Live() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const AREA_BG = makeAREA_BG(C);
  const AREA_TX = makeAREA_TX(C);
  const router = useRouter();
  const rows = useQuery(api.visits.listLiveSales) as any;
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!rows) return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;

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
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/riwayat?salesId=${item.sales._id}`)}
        activeOpacity={0.75}
      >
        <View style={[styles.avatar, { backgroundColor: visiting ? C.chip.warning.bg : C.chip.success.bg }]}>
          <Text style={[styles.avatarText, { color: visiting ? C.status.warning.fg : C.status.success.fg }]}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.name} numberOfLines={1}>{item.sales.name}</Text>
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.sales.area] ?? C.status.neutral.bg }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[item.sales.area] ?? C.inkMuted }]}>{item.sales.area}</Text>
            </View>
          </View>
          {visiting ? (
            <>
              <View style={styles.stateRow}>
                <AppIcon name="location" size={13} color={C.status.warning.fg} style={{ marginRight: 5 }} />
                <Text style={styles.stateVisit}>Sedang kunjungan</Text>
              </View>
              <Text style={styles.storeName} numberOfLines={1}>{item.storeName}</Text>
              <Text style={styles.sub}>sejak {fmtClock(item.checkinAt)} • durasi {fmtDur(durActive)}</Text>
            </>
          ) : (
            <>
              <View style={styles.stateRow}>
                <AppIcon name="check" size={13} color={C.status.success.fg} style={{ marginRight: 5 }} />
                <Text style={styles.stateFree}>Tidak ada kunjungan aktif</Text>
              </View>
              <Text style={styles.sub}>
                {item.lastDoneAt ? "Kunjungan terakhir " + fmtClock(item.lastDoneAt) : "Belum ada kunjungan hari ini"}
              </Text>
            </>
          )}
          <Text style={styles.today}>Hari ini: {todayCount} kunjungan • total {fmtDur(todayMs)}</Text>
        </View>
        <AppIcon name="chevron" size={18} color={C.inkFaint} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="back" size={18} color={C.ink0} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Monitor</Text>
          <Text style={styles.subtitle}>{activeCount} sales sedang di lapangan • ketuk sales untuk riwayatnya</Text>
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

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  header: {
    flexDirection: "row", alignItems: "center", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: C.surfaceTint,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    shadowColor: "#101828", shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primaryTint, justifyContent: "center", alignItems: "center", marginRight: 12 },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.divider },
  avatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "800", color: C.ink0, marginRight: 8, flexShrink: 1 },
  areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  areaChipText: { fontSize: 11, fontWeight: "800" },
  stateRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  stateVisit: { fontSize: 13, fontWeight: "800", color: C.status.warning.fg },
  stateFree: { fontSize: 13, fontWeight: "800", color: C.status.success.fg },
  storeName: { fontSize: 15, fontWeight: "700", color: C.ink0, marginTop: 4 },
  sub: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  today: { fontSize: 12, fontWeight: "700", color: C.inkSoft, marginTop: 8 },
  empty: { textAlign: "center", color: C.inkMuted, marginTop: 40 },
});
