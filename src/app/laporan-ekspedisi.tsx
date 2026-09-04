import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const BLUE = "#1D4ED8";

const rupiah = (n?: number) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));

export default function LaporanEkspedisi() {
  const router = useRouter();
  const fetchData = useAction(api.laporan.fetchEkspedisi);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r: any = await fetchData();
      setData(r);
    } catch (e: any) {
      setErr(e?.message ?? "Gagal menarik data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ekspedisi</Text>
        <Text style={styles.sub}>Laporan Ekspedisi • {data ? new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
        <TouchableOpacity style={styles.refresh} onPress={load} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? "Memuat..." : "🔄 Segarkan"}</Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Gagal memuat</Text>
          <Text style={styles.meta}>{err}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryText}>Coba Lagi</Text></TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.kpiRow}>
            <Kpi label="TOTAL TUNAI" value={rupiah(data.totalTunai)} />
            <Kpi label="TOTAL TRANSFER" value={rupiah(data.totalTransfer)} />
            <Kpi label="PENGIRIMAN" value={`${data.totalCount} kiriman`} />
            <Kpi label="ARMADA" value={`${data.perArmadaList?.length ?? 0}`} />
          </View>

          {/* Per Kategori */}
          <Text style={styles.section}>Per Kategori</Text>
          <View style={styles.card}>
            {Object.entries(data.perKategori ?? {}).map(([k, v]: any) => (
              <View key={k} style={styles.sumRow}>
                <Text style={styles.sumLabel}>{k}</Text>
                <Text style={styles.sumValue}>{rupiah(v)}</Text>
              </View>
            ))}
          </View>

          {/* Per Armada */}
          <Text style={styles.section}>Per Armada (Prima vs Ecer)</Text>
          <View style={styles.card}>
            {(data.perArmadaList ?? []).map((a: any, i: number) => (
              <View key={i} style={styles.sumRow}>
                <Text style={[styles.sumLabel, { flex: 1.4 }]}>{a.armada}</Text>
                <Text style={styles.sumMini}>{rupiah(a.prima)}</Text>
                <Text style={styles.sumMini}>{rupiah(a.ecer)}</Text>
                <Text style={[styles.sumMini, { fontWeight: "900", color: "#111" }]}>{rupiah(a.total)}</Text>
              </View>
            ))}
          </View>

          {/* Detail per armada */}
          <Text style={styles.section}>Detail Pengiriman</Text>
          {(data.detail ?? []).map((g: any, gi: number) => {
            const isOpen = open === g.armada;
            const totalG = g.rows.reduce((s: number, r: any) => s + (r.tunai || 0), 0);
            return (
              <View key={gi} style={styles.group}>
                <TouchableOpacity style={styles.groupHead} onPress={() => setOpen(isOpen ? null : g.armada)}>
                  <Text style={styles.groupTitle}>{g.armada}</Text>
                  <Text style={styles.groupMeta}>{g.rows.length} kiriman • {rupiah(totalG)}</Text>
                  <Text style={styles.arrow}>{isOpen ? "▴" : "▾"}</Text>
                </TouchableOpacity>
                {isOpen ? (
                  g.rows.map((r: any, ri: number) => (
                    <View key={ri} style={styles.item}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemDate}>{r.tanggal} {r.jam}</Text>
                        <View style={[styles.katChip, { backgroundColor: r.kategori === "Prima" ? "#FEE4E2" : "#E0F2FE" }]}>
                          <Text style={[styles.katText, { color: r.kategori === "Prima" ? RED : BLUE }]}>{r.kategori}</Text>
                        </View>
                      </View>
                      <Text style={styles.itemStore} numberOfLines={1}>{r.store}</Text>
                      <Text style={styles.itemMeta}>🚚 {r.driver}{r.helper ? " • " + r.helper : ""} • {r.armada}</Text>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemBayar}>
                          {r.bayar === "Ya" ? "✅ " + (r.typeByr || "Bayar") : "⛔ Tidak"}
                        </Text>
                        {r.tunai > 0 ? <Text style={styles.itemMoney}>Tunai {rupiah(r.tunai)}</Text> : null}
                        {r.transfer > 0 ? <Text style={[styles.itemMoney, { color: BLUE }]}>TF {rupiah(r.transfer)}</Text> : null}
                      </View>
                      {r.ket ? <Text style={styles.itemKet} numberOfLines={2}>📝 {r.ket}</Text> : null}
                      {r.gps && r.gps !== "-" ? <Text style={styles.itemGps} numberOfLines={1}>📍 {r.gps}</Text> : null}
                    </View>
                  ))
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  sub: { fontSize: 12, color: GRAY, marginTop: 2 },
  refresh: { marginTop: 10, backgroundColor: "#EEF0F3", borderRadius: 10, padding: 10, alignItems: "center" },
  refreshText: { color: "#344054", fontWeight: "800", fontSize: 13 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  meta: { fontSize: 13, color: GRAY, marginTop: 6, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: RED, borderRadius: 12, padding: 12, paddingHorizontal: 24 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpi: { width: "48.5%", backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#EEF0F3", borderTopWidth: 3, borderTopColor: GREEN },
  kpiLabel: { fontSize: 10, fontWeight: "800", color: GRAY },
  kpiValue: { fontSize: 14, fontWeight: "900", color: "#111", marginTop: 4 },
  section: { fontSize: 13, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#EEF0F3" },
  sumRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  sumLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: "#344054" },
  sumMini: { width: 90, textAlign: "right", fontSize: 12, color: "#475467", fontWeight: "600" },
  sumValue: { fontSize: 13, fontWeight: "800", color: "#111" },
  group: { backgroundColor: "#fff", borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3", overflow: "hidden" },
  groupHead: { flexDirection: "row", alignItems: "center", padding: 14 },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: "#111" },
  groupMeta: { fontSize: 11, color: GRAY, fontWeight: "600", marginRight: 8 },
  arrow: { fontSize: 14, color: GRAY },
  item: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F2F4F7" },
  itemTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  itemDate: { fontSize: 12, color: GRAY, fontWeight: "700", marginRight: 8 },
  katChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  katText: { fontSize: 10, fontWeight: "900" },
  itemStore: { fontSize: 14, fontWeight: "800", color: "#111", marginTop: 4 },
  itemMeta: { fontSize: 11, color: GRAY, marginTop: 2 },
  itemBayar: { fontSize: 12, color: "#344054", fontWeight: "700", marginRight: 10 },
  itemMoney: { fontSize: 12, color: GREEN, fontWeight: "800", marginRight: 10 },
  itemKet: { fontSize: 11, color: "#475467", marginTop: 4, lineHeight: 15 },
  itemGps: { fontSize: 10, color: BLUE, marginTop: 3 },
});
