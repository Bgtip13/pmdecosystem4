import { useState } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import { fmtSynced, usePiutangAll, usePiutangList } from "../components/home/usePiutang";
import type { PiutangArea } from "../components/home/usePiutang";
import { compactRupiah, rupiah } from "../components/home/ui";
import { TOP_PAD } from "../lib/layout";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

const FILTERS: Array<PiutangArea | "ALL"> = ["ALL", "SOLO", "DIY", "SEMARANG"];

export default function PiutangSemua() {
  const C = useColors();
  const st = useStyles(createSt);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const { summary } = usePiutangAll();
  const [area, setArea] = useState<PiutangArea | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const rows = usePiutangList(area, search);

  const areaColor: Record<string, string> = { SOLO: C.areaSolo, DIY: C.blueStrong, SEMARANG: C.status.success.fg };
  const back = () => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); };

  if (!viewer) return <View style={st.center}><IOSSpinner size="large" color={C.primary} /></View>;

  const areaTotal = area === "ALL" ? summary?.total : summary?.areas?.find((a: any) => a.area === area)?.piutang;

  return (
    <View style={st.screen}>
      <View style={st.topbar}>
        <TouchableOpacity onPress={back}><Text style={st.back}>‹ Kembali</Text></TouchableOpacity>
        <Text style={st.title}>Piutang Semua Area</Text>
        <Text style={st.sub}>
          {summary?.hasData ? `Sinkron ${fmtSynced(summary.syncedAt)}` : "Belum ada data — sinkronkan dari Beranda"}
        </Text>
      </View>

      <View style={st.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[st.chip, area === f && st.chipOn]} onPress={() => setArea(f)}>
            <Text style={[st.chipText, area === f && st.chipTextOn]}>{f === "ALL" ? "Semua" : f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={st.searchWrap}>
        <TextInput
          style={st.search}
          placeholder="Cari nama pelanggan…"
          placeholderTextColor={C.inkFaint}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {rows === undefined ? (
        <View style={st.center}><IOSSpinner size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r: any) => r.key}
          contentContainerStyle={st.list}
          ListHeaderComponent={
            <Text style={st.summaryLine}>
              {rows.length} pelanggan • total {rupiah(areaTotal ?? rows.reduce((a: number, r: any) => a + r.piutang, 0))}
            </Text>
          }
          ListEmptyComponent={<Text style={st.empty}>{search ? "Tidak ada pelanggan yang cocok." : "Belum ada data piutang."}</Text>}
          renderItem={({ item: r }: { item: any }) => {
            const late = r.usiaMax > 60;
            return (
              <View style={st.card}>
                <View style={st.cardTop}>
                  <Text style={st.name} numberOfLines={2}>{r.storeName}</Text>
                  <View style={[st.areaChip, { backgroundColor: (areaColor[r.area] ?? C.ink2) + "22" }]}>
                    <Text style={[st.areaChipText, { color: areaColor[r.area] ?? C.ink2 }]}>{r.area}</Text>
                  </View>
                </View>
                <Text style={st.amount}>{rupiah(r.piutang)}</Text>
                <Text style={st.meta}>
                  {r.tagihan} tagihan • total {compactRupiah(r.total)}
                  {r.cicil ? ` • cicil ${compactRupiah(r.cicil)}` : ""}
                  {r.retur ? ` • retur ${compactRupiah(r.retur)}` : ""}
                </Text>
                {r.usiaMax > 0 ? (
                  <View style={[st.age, { backgroundColor: late ? C.chip.danger.bg : C.chip.neutral.bg }]}>
                    <Text style={[st.ageText, { color: late ? C.status.danger.fg : C.inkMuted }]}>Usia terlama {r.usiaMax} hari</Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const createSt = (C: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
    topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12 },
    back: { color: C.primary, fontSize: 15, fontWeight: "700" },
    title: { fontSize: 22, fontWeight: "800", color: C.ink, marginTop: 6 },
    sub: { fontSize: 12.5, color: C.inkMuted, marginTop: 2 },
    filters: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 12 },
    chip: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: C.card },
    chipOn: { backgroundColor: C.primary, borderColor: C.primary },
    chipText: { fontSize: 13, fontWeight: "600", color: C.ink },
    chipTextOn: { color: C.onPrimary },
    searchWrap: { paddingHorizontal: 16, paddingBottom: 6 },
    search: { backgroundColor: C.card, borderWidth: 1, borderColor: C.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink },
    list: { padding: 16, paddingBottom: 40 },
    summaryLine: { fontSize: 12.5, color: C.inkMuted, marginBottom: 10 },
    empty: { textAlign: "center", color: C.inkMuted, marginTop: 40, fontSize: 14 },
    card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.divider },
    cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    name: { flex: 1, fontSize: 14.5, fontWeight: "700", color: C.ink, marginRight: 8 },
    areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    areaChipText: { fontSize: 11, fontWeight: "800" },
    amount: { fontSize: 19, fontWeight: "800", color: C.ink, marginTop: 6 },
    meta: { fontSize: 12, color: C.inkMuted, marginTop: 3 },
    age: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 },
    ageText: { fontSize: 11.5, fontWeight: "700" },
  });
