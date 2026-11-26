import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import { TOP_PAD } from "../lib/layout";

import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
const fmt = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const makeACTION_TONE = (C: Colors): any => (
  {
  "location.approve": C.status.success.fg,
  "location.reject": C.status.danger.fg,
  "location.request": C.status.info.fg,
  "piutang.edit_result": C.status.warning.fg,
  "piutang.reopen": C.status.warning.fg,
  "piutang.sync": C.status.info.fg,
  "visit.delete": C.status.danger.fg,
  "activeStore.markCall": C.status.info.fg,
  "activeStore.saveResult": C.status.warning.fg,
  "activeStore.close": C.status.success.fg,
  "activeStore.reopen": C.status.danger.fg,
}
);
// ← BARU: kelompok aktivitas berdasarkan awalan action
const JENIS: { prefix: string; label: string }[] = [
  { prefix: "activeStore.", label: "FU Toko" },
  { prefix: "piutang.", label: "Piutang" },
  { prefix: "location.", label: "Lokasi" },
  { prefix: "leave.", label: "Izin" },
  { prefix: "visit.", label: "Kunjungan" },
];

export default function Audit() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const ACTION_TONE = makeACTION_TONE(C);
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
        <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>
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
                <AppIcon name="clock" size={13} color={C.inkMuted} />
                <Text style={styles.meta}>{item.actorName} • {item.actorRole ?? "-"} • {fmt(item.createdAt)}</Text>
              </View>
              <Text style={styles.summary}>{item.summary}</Text>
              <Text style={[styles.action, { color: ACTION_TONE[item.action] ?? C.inkMuted }]}>{item.action}{item.area ? ` • ${item.area}` : ""}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
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
  back: { color: C.primary, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  sub: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 10 },
  chip: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  chipTextOn: { color: C.onPrimary },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: C.divider },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  meta: { fontSize: 11, color: C.inkMuted, marginLeft: 6, fontWeight: "700" },
  summary: { fontSize: 13, color: C.ink0, lineHeight: 18 },
  action: { fontSize: 11, fontWeight: "800", marginTop: 6 },
  empty: { fontSize: 14, fontWeight: "700", color: C.ink3 },
});
