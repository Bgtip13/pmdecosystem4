import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../components/AppText";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import Svg, { Circle } from "react-native-svg";
import { api } from "../../convex/_generated/api";
import { TOP_PAD, webNarrow } from "../lib/layout";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const pct = (n?: number | null) => (n == null ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%");

const areaColors = (C: Colors): any => ({ GLOBAL: C.ink2, SOLO: C.areaSolo, DIY: C.blueStrong, SEMARANG: C.status.success.fg, TAB: C.violet });

function Gauge({ value, center, sub, size = 104 }: { value: number; center: string; sub: string; size?: number }) {
  const C = useColors();
  const styles = useStyles(createStyles);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, value || 0)) / 100;
  const color = value == null ? C.inkMuted : value < 30 ? C.status.danger.fg : value < 70 ? C.status.warning.fg : C.status.success.fg;
  return (
    <View style={styles.gaugeCol}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.divider} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${c}`}
            strokeDashoffset={c * (1 - filled)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[styles.gaugeCenter, { width: size, height: size }]}>
          <Text style={[styles.gaugeValue, { color }]}>{center}</Text>
        </View>
      </View>
      <Text style={styles.gaugeSub}>{sub}</Text>
    </View>
  );
}

export default function LaporanPcp() {
  const C = useColors();
  const AREA_COLOR = areaColors(C);
  const styles = useStyles(createStyles);
  const router = useRouter();
  const fetchPcp = useAction(api.laporan.fetchPcpBulanan);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState("ALL");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r: any = await fetchPcp();
      setData(r);
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
  const kpi = (area === "ALL" ? rows.find((r: any) => r.area === "GLOBAL") : shown[0]) ?? shown[0];

  const tripParts = String(kpi?.trip || "").split("/");
  const tripPct = tripParts[1] ? (Number(tripParts[0]) / Number(tripParts[1])) * 100 : 0;

  const statusOf = (p?: number | null) =>
    p == null ? { txt: "-", bg: C.status.neutral.bg, fg: C.inkMuted }
      : p < 30 ? { txt: "▲ Perlu Perhatian", bg: C.chip.danger.bg, fg: C.status.danger.fg }
      : p < 70 ? { txt: "◆ Sedang", bg: C.chip.warning.bg, fg: C.status.warning.fg }
      : { txt: "✓ Bagus", bg: C.chip.success.bg, fg: C.status.success.fg };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/spv"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PCP Bulanan</Text>
        <Text style={styles.sub}>Pencapaian Bulanan • {data ? new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
      </View>

      <View style={styles.chips}>
        {viewer?.role === "supervisor" ? (
          filters.map((f) => (
            <TouchableOpacity key={f} style={[styles.chip, area === f && styles.chipOn]} onPress={() => setArea(f)}>
              <Text style={[styles.chipText, area === f && styles.chipTextOn]}>{f}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={[styles.chip, styles.chipOn]}>
            <Text style={[styles.chipText, styles.chipTextOn]}>{viewer?.area ?? "-"}</Text>
          </View>
        )}
        <TouchableOpacity style={[styles.chip, { marginLeft: "auto" }]} onPress={load} disabled={loading}>
          <Text style={styles.chipText}>{loading ? "..." : "🔄"}</Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Gagal memuat</Text>
          <Text style={styles.meta}>{err}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryText}>Coba Lagi</Text></TouchableOpacity>
        </View>
      ) : kpi ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.kpiRow}>
            <Kpi label="TARGET" value={rupiah(kpi.tgt)} />
            <Kpi label="AKTUAL" value={rupiah(kpi.act)} />
            <Kpi label="RP KEJAR" value={rupiah(kpi.kejar)} />
            <Kpi label="TA/NOO/REAK" value={`${kpi.taTotal ?? "-"}/${kpi.taNoo ?? "-"}/${kpi.tokoReaktif ?? "-"}`} />
          </View>

          {/* GAUGE */}
          <View style={styles.gaugeRow}>
            <Gauge value={kpi.pcpPct} center={pct(kpi.pcpPct)} sub="PCP (Aktual ÷ Target)" />
            <Gauge value={tripPct} center={kpi.trip || "-"} sub="TRIP vs TRIP KUOTA" />
            <Gauge value={kpi.contrPct} center={pct(kpi.contrPct)} sub="CONTR %" />
          </View>

          {shown.map((r: any, i: number) => {
            const st = statusOf(r.pcpPct);
            return (
              <View key={i} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={[styles.areaChip, { backgroundColor: (AREA_COLOR[r.area] ?? C.ink2) + "22" }]}>
                    <Text style={[styles.areaText, { color: AREA_COLOR[r.area] ?? C.ink2 }]}>{r.area}</Text>
                  </View>
                  <Text style={styles.jabatan}>{r.jabatan}</Text>
                  <View style={[styles.status, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.fg }]}>{st.txt}</Text>
                  </View>
                </View>
                <Text style={styles.sdm}>{r.sdm}</Text>

                <View style={styles.metricRow}>
                  <Metric label="TRIP" value={r.trip || "-"} />
                  <Metric label="PCP" value={pct(r.pcpPct)} accent />
                  <Metric label="CONTR" value={pct(r.contrPct)} />
                  <Metric label="POTENSI" value={r.potensiToko != null ? String(r.potensiToko) : "-"} />
                </View>
                <View style={styles.metricRow}>
                  <Metric label="TGT" value={rupiah(r.tgt)} />
                  <Metric label="ACT" value={rupiah(r.act)} />
                  <Metric label="KEJAR" value={rupiah(r.kejar)} />
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
  const styles = useStyles(createStyles);
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const C = useColors();
  const styles = useStyles(createStyles);
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.mLabel}>{label}</Text>
      <Text style={[styles.mValue, accent && { color: C.primary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
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
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  sub: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 12, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.inkSoft, fontWeight: "700" },
  chipTextOn: { color: C.onPrimary },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink3 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 6, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: C.primary, borderRadius: 12, padding: 12, paddingHorizontal: 24 },
  retryText: { color: C.onPrimary, fontWeight: "800", fontSize: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpi: { width: "48.5%", backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.divider, borderTopWidth: 3, borderTopColor: C.primary },
  kpiLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted },
  kpiValue: { fontSize: 15, fontWeight: "900", color: C.ink0, marginTop: 4 },
  // Web: baris 3 gauge dibatasi lebarnya supaya tidak berjarak 300px satu sama lain
  gaugeRow: {
    flexDirection: "row", justifyContent: "space-between", backgroundColor: C.card,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6, marginVertical: 10,
    borderWidth: 1, borderColor: C.divider,
    ...webNarrow,
  },
  gaugeCol: { flex: 1, alignItems: "center" },
  gaugeCenter: { position: "absolute", left: 0, top: 0, justifyContent: "center", alignItems: "center" },
  gaugeValue: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  gaugeSub: { fontSize: 10, color: C.inkMuted, textAlign: "center", marginTop: 6, paddingHorizontal: 4 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.divider },
  cardHead: { flexDirection: "row", alignItems: "center" },
  areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  areaText: { fontSize: 11, fontWeight: "900" },
  jabatan: { fontSize: 13, fontWeight: "700", color: C.inkMuted, flex: 1 },
  status: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "900" },
  sdm: { fontSize: 16, fontWeight: "800", color: C.ink0, marginTop: 8 },
  metricRow: { flexDirection: "row", marginTop: 12 },
  mLabel: { fontSize: 10, color: C.inkMuted, fontWeight: "700" },
  mValue: { fontSize: 13, fontWeight: "800", color: C.inkSoft, marginTop: 2 },
});
