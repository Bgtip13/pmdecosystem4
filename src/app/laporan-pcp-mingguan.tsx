import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { IS_WEB, TOP_PAD, webNarrow } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const BLUE = "#1D4ED8";

// Lebar batang chart: di web dilebarkan supaya tidak terlihat hilang di kolom lebar
const BAR_W = IS_WEB ? 44 : 26;

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const shortRp = (n?: number | null) =>
  n == null || isNaN(n) ? "-"
  : n >= 1_000_000 ? "Rp" + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "jt"
  : "Rp" + n.toLocaleString("id-ID");
const pctTxt = (n?: number | null) => (n == null ? "-" : Math.round(n) + "%");

const WEEK_LABELS = ["M1", "M2", "M3", "M4", "M5"];
const weekAt = (r: any, i: number) => (r?.weeks ?? [])[i];

// Aktual BERJALAN = nilai minggu berjalan saja (M1 di minggu 1, M2 di minggu 2, dst)
const actAt = (r: any, n: number) => weekAt(r, n - 1)?.act ?? 0;

const runPct = (r: any, n: number) => {
  const t = r?.tgtMgg;
  const a = actAt(r, n);
  return t > 0 ? (a / t) * 100 : 0;
};

const statusOf = (p?: number | null) =>
  p == null ? { txt: "-", bg: "#F2F4F7", fg: GRAY }
    : p < 30 ? { txt: "▲ Perlu Perhatian", bg: "#FEE4E2", fg: RED }
    : p < 70 ? { txt: "◆ Sedang", bg: "#FEF0C7", fg: ORANGE }
    : { txt: "✓ Bagus", bg: "#DCFAE6", fg: GREEN };

const colorOf = (p?: number | null) =>
  p == null ? GRAY : p < 30 ? RED : p < 70 ? ORANGE : GREEN;

export default function LaporanPcpMingguan() {
  const router = useRouter();
  const fetchData = useAction(api.laporan.fetchPcpMingguan);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState("ALL");

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

  const rows: any[] = data?.rows ?? [];
  const areas = ["ALL", ...Array.from(new Set(rows.map((r: any) => r.area).filter((a: any) => a && a !== "GLOBAL")))];
  const shown = area === "ALL" ? rows : rows.filter((r: any) => r.area === area);
  const globalRow = rows.find((r: any) => r.area === "GLOBAL");
  const kpi = globalRow ?? shown[0];

  // Minggu berjalan: tgl 1–7 → M1, 8–14 → M2, 15–21 → M3, 22–28 → M4, 29+ → M5
  const curWeek = Math.min(5, Math.floor((new Date().getDate() - 1) / 7) + 1);

  // Total aktual per minggu (murni minggu tsb) dari baris yang tampil (GLOBAL tidak dihitung dua kali)
  const chartRows = shown.filter((r: any) => r.area !== "GLOBAL");
  const src = chartRows.length > 0 ? chartRows : shown;
  const weekTotals = WEEK_LABELS.map((_, i) => src.reduce((s, r) => s + ((weekAt(r, i)?.act) || 0), 0));
  const maxWeek = Math.max(1, ...weekTotals);

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PCP Mingguan</Text>
        <Text style={styles.sub}>Pencapaian per Minggu (M1–M5) • {data ? new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
      </View>

      <View style={styles.chips}>
        {viewer?.role === "supervisor" ? (
          areas.map((f) => (
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
            <Kpi label="TARGET PERIODE" value={rupiah(kpi.tgtMgg)} />
            <Kpi label={`AKTUAL BERJALAN (M${curWeek})`} value={rupiah(actAt(kpi, curWeek))} />
            <Kpi label="PENCAPAIAN" value={pctTxt(runPct(kpi, curWeek))} />
          </View>

          {/* Grafik aktual per minggu (M1–M5) */}
          <Text style={styles.section}>Grafik Aktual per Minggu</Text>
          <View style={styles.chartCard}>
            {weekTotals.every((v) => v === 0) ? (
              <Text style={styles.meta}>Belum ada data aktual.</Text>
            ) : (
              WEEK_LABELS.map((lbl, i) => {
                const v = weekTotals[i];
                const isCur = i + 1 === curWeek;
                const h = v > 0 ? Math.max(8, (v / maxWeek) * 90) : 4;
                return (
                  <View key={lbl} style={styles.barCol}>
                    <Text style={[styles.barValue, isCur && { color: BLUE, fontWeight: "900" }]}>{shortRp(v)}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { height: h, backgroundColor: v > 0 ? (isCur ? BLUE : "#98A2B3") : "#EEF0F3" }]} />
                    </View>
                    <Text style={[styles.barLabel, isCur && { color: BLUE, fontWeight: "900" }]}>{lbl}{isCur ? " •" : ""}</Text>
                  </View>
                );
              })
            )}
          </View>

          {shown.map((r: any, i: number) => {
            const st = statusOf(runPct(r, curWeek));
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
                  <Metric label="TARGET PERIODE" value={rupiah(r.tgtMgg)} />
                  <Metric label={`AKTUAL BERJALAN (M${curWeek})`} value={rupiah(actAt(r, curWeek))} />
                  <Metric label="PENCAPAIAN" value={pctTxt(runPct(r, curWeek))} accent />
                </View>

                {/* ===== RINCIAN PER MINGGU M1–M5 ===== */}
                <Text style={styles.weekTitle}>Per Minggu (kolom biru = minggu berjalan)</Text>
                <View style={styles.weekRow}>
                  {WEEK_LABELS.map((lbl, wi) => {
                    const w = weekAt(r, wi);
                    const p = w?.pct ?? null;
                    const act = w?.act ?? 0;
                    const has = w != null && (act > 0 || p != null);
                    const isCur = wi + 1 === curWeek;
                    return (
                      <View key={lbl} style={[styles.weekCol, isCur && styles.weekColOn]}>
                        <Text style={[styles.weekLbl, isCur && { color: BLUE, fontWeight: "900" }]}>{lbl}</Text>
                        <Text style={[styles.weekPct, { color: colorOf(p) }]}>{pctTxt(p)}</Text>
                        <Text style={styles.weekAct} numberOfLines={1}>{has ? shortRp(act) : "-"}</Text>
                      </View>
                    );
                  })}
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
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 12 },
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
  // Web: panel chart dibatasi 620px & dipusatkan, batangnya dilebarkan (BAR_W)
  chartCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around",
    borderWidth: 1, borderColor: "#EEF0F3",
    ...webNarrow,
  },
  barCol: { alignItems: "center", flex: 1 },
  barValue: { fontSize: 9, color: GRAY, fontWeight: "700", marginBottom: 4 },
  barTrack: { height: 100, justifyContent: "flex-end", width: BAR_W },
  barFill: { width: BAR_W, borderRadius: 6 },
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
  weekTitle: { fontSize: 10, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 12, marginBottom: 6 },
  weekRow: { flexDirection: "row", borderWidth: 1, borderColor: "#EEF0F3", borderRadius: 10, overflow: "hidden" },
  weekCol: { flex: 1, alignItems: "center", paddingVertical: 8, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#EEF0F3" },
  weekColOn: { backgroundColor: "#EFF6FF" },
  weekLbl: { fontSize: 10, fontWeight: "800", color: GRAY },
  weekPct: { fontSize: 15, fontWeight: "900", marginTop: 2 },
  weekAct: { fontSize: 9, color: "#475467", marginTop: 2 },
});
