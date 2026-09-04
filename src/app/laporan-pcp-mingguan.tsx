import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const BAR: any = { GLOBAL: "#1D4ED8", SOLO: "#16A34A", DIY: "#DC2626", SEMARANG: "#D97706", TAB: "#7C3AED" };

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const pct = (n?: number | null) => (n == null ? "-" : Math.round(n) + "%");

export default function LaporanPcpMingguan() {
  const router = useRouter();
  const fetchData = useAction(api.laporan.fetchPcpMingguan);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState("ALL");
  const [wk, setWk] = useState("M1");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r: any = await fetchData();
      setData(r);
      if (r?.weekLabels?.length && !r.weekLabels.includes(wk)) setWk(r.weekLabels[0]);
    } catch (e: any) {
      setErr(e?.message ?? "Gagal menarik data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filters = ["ALL", "SOLO", "DIY", "SEMARANG", "TAB"];
  const rows: any[] = data?.rows ?? [];
  const shown = area === "ALL" ? rows : rows.filter((r: any) => r.area === area);
  const globalRow = rows.find((r: any) => r.area === "GLOBAL");
  const kpi = globalRow ?? shown[0];
  const wkOf = (r: any) => (r?.weeks ?? []).find((w: any) => w.m === wk);

  const chartAreas = ["GLOBAL", "SOLO", "DIY", "SEMARANG", "TAB"];
  const chart = chartAreas
    .map((a) => ({ a, row: rows.find((r: any) => r.area === a) }))
    .map(({ a, row }) => ({ a, act: wkOf(row)?.act ?? 0 }))
    .filter((x) => x.act > 0);
  const maxAct = Math.max(1, ...chart.map((x) => x.act));

  const statusOf = (p?: number | null) =>
    p == null ? { txt: "-", bg: "#F2F4F7", fg: GRAY }
      : p < 30 ? { txt: "▲ Perlu Perhatian", bg: "#FEE4E2", fg: RED }
      : p < 70 ? { txt: "◆ Sedang", bg: "#FEF0C7", fg: ORANGE }
      : { txt: "✓ Bagus", bg: "#DCFAE6", fg: GREEN };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PCP Mingguan</Text>
        <Text style={styles.sub}>Pencapaian Mingguan • {data ? new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
      </View>

      <View style={styles.chips}>
        {viewer?.role === "supervisor" ? (
          filters.map((f) => (
            <TouchableOpacity key={f} style={[styles.chip, area === f && styles.chipOn]} onPress={() => setArea(f)}>
              <Text style={[styles.chipText, area === f && styles.chipTextOn]}>{f === "ALL" ? "Semua" : f}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={[styles.chip, styles.chipOn]}><Text style={[styles.chipText, styles.chipTextOn]}>{viewer?.area ?? "-"}</Text></View>
        )}
        <TouchableOpacity style={[styles.chip, { marginLeft: "auto" }]} onPress={load} disabled={loading}>
          <Text style={styles.chipText}>{loading ? "..." : "🔄"}</Text>
        </TouchableOpacity>
      </View>

      {(data?.weekLabels?.length ?? 0) > 1 ? (
        <View style={styles.chips}>
          {data.weekLabels.map((m: string) => (
            <TouchableOpacity key={m} style={[styles.chip, wk === m && styles.chipOn]} onPress={() => setWk(m)}>
              <Text style={[styles.chipText, wk === m && styles.chipTextOn]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {loading && !data ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Gagal memuat</Text>
          <Text style={styles.meta}>{err}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryText}>Coba Lagi</Text></TouchableOpacity>
        </View>
      ) : kpi ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.kpiRow}>
            <Kpi label="TGT / MGG" value={rupiah(kpi.tgtMgg)} />
            <Kpi label={`ACT ${wk}`} value={rupiah(wkOf(kpi)?.act)} />
            <Kpi label={`${wk} %`} value={pct(wkOf(kpi)?.pct)} />
          </View>

          {/* Grafik batang */}
          <Text style={styles.section}>Grafik Aktual {wk}</Text>
          <View style={styles.chartCard}>
            {chart.length === 0 ? (
              <Text style={styles.meta}>Belum ada data aktual.</Text>
            ) : (
              chart.map((x) => (
                <View key={x.a} style={styles.barCol}>
                  <Text style={styles.barValue}>{Math.round((x.act / 1000000) * 10) / 10}jt</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: Math.max(6, (x.act / maxAct) * 90), backgroundColor: BAR[x.a] ?? GRAY }]} />
                  </View>
                  <Text style={styles.barLabel}>{x.a}</Text>
                </View>
              ))
            )}
          </View>

          {shown.map((r: any, i: number) => {
            const w = wkOf(r);
            const st = statusOf(w?.pct);
            return (
              <View key={i} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.areaTxt}>{r.area}</Text>
                  <Text style={styles.jabatan}>{r.jabatan}</Text>
                  <View style={[styles.status, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.fg }]}>{st.txt}</Text>
                  </View>
                </View>
                <Text style={styles.sdm}>{r.sdm}</Text>
                <View style={styles.metricRow}>
                  <Metric label="TGT / MGG" value={rupiah(r.tgtMgg)} />
                  <Metric label={`ACT ${wk}`} value={rupiah(w?.act)} />
                  <Metric label={`${wk} %`} value={pct(w?.pct)} accent />
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.center}><Text style={styles.meta}>Belum ada data.</Text></View>
      )}
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

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.mLabel}>{label}</Text>
      <Text style={[styles.mValue, accent && { color: RED }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  sub: { fontSize: 12, color: GRAY, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 10, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: "#fff" },
  chipOn: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 12, color: "#344054", fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  meta: { fontSize: 13, color: GRAY, marginTop: 6, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: RED, borderRadius: 12, padding: 12, paddingHorizontal: 24 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpi: { width: "32%", backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#EEF0F3", borderTopWidth: 3, borderTopColor: RED },
  kpiLabel: { fontSize: 9, fontWeight: "800", color: GRAY },
  kpiValue: { fontSize: 13, fontWeight: "900", color: "#111", marginTop: 4 },
  section: { fontSize: 13, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  chartCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", borderWidth: 1, borderColor: "#EEF0F3" },
  barCol: { alignItems: "center", flex: 1 },
  barValue: { fontSize: 9, color: GRAY, fontWeight: "700", marginBottom: 4 },
  barTrack: { height: 100, justifyContent: "flex-end", width: 26 },
  barFill: { width: 26, borderRadius: 6 },
  barLabel: { fontSize: 10, color: "#344054", fontWeight: "800", marginTop: 6 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardHead: { flexDirection: "row", alignItems: "center" },
  areaTxt: { fontSize: 12, fontWeight: "900", color: RED, marginRight: 8 },
  jabatan: { fontSize: 12, fontWeight: "700", color: GRAY, flex: 1 },
  status: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "900" },
  sdm: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 6 },
  metricRow: { flexDirection: "row", marginTop: 10 },
  mLabel: { fontSize: 9, color: GRAY, fontWeight: "700" },
  mValue: { fontSize: 12, fontWeight: "800", color: "#344054", marginTop: 2 },
});
