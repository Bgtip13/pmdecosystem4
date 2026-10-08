import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";

const fmt = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const ACTION_TONE: any = {
  "location.approve": "#067647",
  "location.reject": "#B42318",
  "location.request": "#175CD3",
  "piutang.edit_result": "#B54708",
  "piutang.reopen": "#B54708",
  "piutang.sync": "#175CD3",
  "visit.delete": "#B42318",
  "activeStore.markCall": "#175CD3",
  "activeStore.saveResult": "#B54708",
  "activeStore.close": "#067647",
  "activeStore.reopen": "#B42318",
};

// ← BARU: kelompok aktivitas berdasarkan awalan action
const JENIS: { prefix: string; label: string }[] = [
  { prefix: "activeStore.", label: "FU Toko" },
  { prefix: "piutang.", label: "Piutang" },
  { prefix: "location.", label: "Lokasi" },
  { prefix: "leave.", label: "Izin" },
  { prefix: "visit.", label: "Kunjungan" },
];

export default function Audit() {
  const router = useRouter();
  const [area, setArea] = useState<string | undefined>(undefined);
  const [jenis, setJenis] = useState<string | undefined>(undefined); // ← BARU

  const res = useQuery(api.audit.listAuditEvents, {
    area: area as any,
    actionPrefix: jenis as any,
    limit: 100,
  }) as any;

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/spv"); };
  const items = res?.items ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={goBack}><Text style={styles.back}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Audit Aktivitas</Text>
        <Text style={styles.sub}>Siapa mengubah apa, kapan</Text>
      </View>

      {/* ← BARU: filter jenis aktivitas */}
      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, !jenis && styles.chipOn]} onPress={() => setJenis(undefined)}>
          <Text style={[styles.chipText, !jenis && styles.chipTextOn]}>Semua Jenis</Text>
        </TouchableOpacity>
        {JENIS.map((j) => {
          const on = jenis === j.prefix;
          return (
            <TouchableOpacity key={j.prefix} style={[styles.chip, on && styles.chipOn]} onPress={() => setJenis(on ? undefined : j.prefix)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{j.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.chipRow}>
        <TouchableOpacity style={[styles.chip, !area && styles.chipOn]} onPress={() => setArea(undefined)}>
          <Text style={[styles.chipText, !area && styles.chipTextOn]}>Semua Area</Text>
        </TouchableOpacity>
        {["SOLO", "DIY", "SEMARANG"].map((a) => (
          <TouchableOpacity key={a} style={[styles.chip, area === a && styles.chipOn]} onPress={() => setArea(area === a ? undefined : a)}>
            <Text style={[styles.chipText, area === a && styles.chipTextOn]}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {res === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>Belum ada aktivitas untuk filter ini.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it: any) => it._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <AppIcon name="clock" size={13} color={GRAY} />
                <Text style={styles.meta}>{item.actorName} • {item.actorRole ?? "-"} • {fmt(item.createdAt)}</Text>
              </View>
              <Text style={styles.summary}>{item.summary}</Text>
              <Text style={[styles.action, { color: ACTION_TONE[item.action] ?? GRAY }]}>{item.action}{item.area ? ` • ${item.area}` : ""}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 12 },
  back: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  sub: { fontSize: 12, color: GRAY, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 10 },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: "#fff" },
  chipOn: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 12, color: "#344054", fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: "#EEF0F3" },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  meta: { fontSize: 11, color: GRAY, marginLeft: 6, fontWeight: "700" },
  summary: { fontSize: 13, color: "#111", lineHeight: 18 },
  action: { fontSize: 11, fontWeight: "800", marginTop: 6 },
  empty: { fontSize: 14, fontWeight: "700", color: "#333" },
});
