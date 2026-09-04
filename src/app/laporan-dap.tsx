import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const BLUE = "#1D4ED8";

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const pct = (n?: number | null) => (n == null ? "-" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%");

export default function LaporanDap() {
  const router = useRouter();
  const fetchData = useAction(api.laporan.fetchDap);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [mi, setMi] = useState(8); // index bulan (default dari data)
  const [area, setArea] = useState("ALL");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r: any = await fetchData();
      setData(r);
      if (r?.bulanBerjalan) setMi(Math.max(0, Math.min(11, r.bulanBerjalan - 1)));
    } catch (e: any) {
      setErr(e?.message ?? "Gagal menarik data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows: any[] = data?.rows ?? [];
  const areas = ["ALL", ...Array.from(new Set(rows.map((r: any) => r.area)))];
  const shown = area === "ALL" ? rows : rows.filter((r: any) => r.area === area);
  const mName = data?.months?.[mi] ?? "SEP";
  const totalAct = shown.reduce((s, r) => s + (r.months[mi] || 0), 0);
  const totalTarget = data?.targetGlobal ?? 0;
  const pencapaian = totalTarget > 0 ? (totalAct / totalTarget) * 100 : 0;
  const maxMonth = Math.max(1, ...(data?.monthTotals ?? []).slice(0, mi + 1));

  const statusColor = (s: string) => {
    const t = (s || "").toUpperCase();
    if (t.includes("LANCAR")) return { bg: "#DCFAE6", fg: GREEN };
    if (t.includes("WARNING") || t.includes("PASIF") || t.includes("TUTUP")) return { bg: "#FEF0C7", fg: "#B54708" };
    if (t.includes("BARU")) return { bg: "#E0F2FE", fg: BLUE };
    return { bg: "#F2F4F7", fg: GRAY };
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Target vs Act Toko</Text>
        <Text style={styles.sub}>Target vs Act per toko • {data ? new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
      </View>

      {/* Filter bulan */}
      <View style={styles.chips}>
        {(data?.months ?? []).map((m: string, idx: number) => (
          <TouchableOpacity key={m} style={[styles.chip, mi === idx && styles.chipOn]} onPress={() => setMi(idx)}>
            <Text style={[styles.chipText, mi === idx && styles.chipTextOn]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Filter area (supervisor) */}
      <View style={styles.chips}>
        {viewer?.role === "supervisor" ? (
          areas.map((a) => (
            <TouchableOpacity key={a} style={[styles.chip, area === a && styles.chipOn]} onPress={() => setArea(a)}>
              <Text style={[styles.chipText, area === a && styles.chipTextOn]}>{a === "ALL" ? "Semua" : a}</Text>
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
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.kpiRow}>
            <Kpi label="TOTAL TOKO" value={String(shown.length)} />
            <Kpi label={`ACT ${mName}`} value={rupiah(totalAct)} />
            <Kpi label="TOTAL TARGET" value={rupiah(totalTarget)} />
            <Kpi label="PENCAPAIAN" value={pct(pencapaian)} />
          </View>

          {/* Grafik per bulan s.d. bulan terpilih */}
          <Text style={styles.section}>Penjualan per Bulan ({data.months[0]}–{mName})</Text>
          <View style={styles.chartCard}>
            {(data.monthTotals ?? []).slice(0, mi + 1).map((v: number, idx: number) => (
              <View key={idx} style={styles.barCol}>
                <Text style={styles.barValue}>{Math.round((v / 1000000) * 10) / 10}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: Math.max(4, (v / maxMonth) * 80) }]} />
                </View>
                <Text style={styles.barLabel}>{data.months[idx]}</Text>
              </View>
            ))}
          </View>

          {/* Daftar toko */}
          {shown.length === 0 ? (
            <View style={styles.center}><Text style={styles.meta}>Belum ada data toko.</Text></View>
          ) : (
            shown.map((r: any, i: number) => {
              const sc = statusColor(r.status);
              return (
                <View key={i} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.storeName} numberOfLines={1}>{r.pelanggan}</Text>
                    <View style={[styles.status, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.fg }]}>{r.status || "-"}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{r.area}{r.kab ? " • " + r.kab : ""}{r.kec ? " • " + r.kec : ""}</Text>
                  <Text style={styles.meta}>ADM: {r.adm || "-"} • Kelas: {r.kelasToko || "-"}{r.kelasByr ? " / " + r.kelasByr : ""}</Text>
                  <View style={styles.metricRow}>
                    <Metric label={`ACT ${mName}`} value={rupiah(r.months[mi])} accent />
                    <Metric label="Target" value={rupiah(r.targetToko)} />
                    <Metric label="Kontrib" value={pct(r.kontribPct)} />
                    <Metric label="PCP" value={pct(r.pcpPct)} />
                  </View>
                </View>
              );
            })
          )}
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
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 11, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: "#fff" },
  chipOn: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 11, color: "#344054", fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  meta: { fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 16 },
  retry: { marginTop: 14, backgroundColor: RED, borderRadius: 12, padding: 12, paddingHorizontal: 24 },
  retryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpi: { width: "48.5%", backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#EEF0F3", borderTopWidth: 3, borderTopColor: BLUE },
  kpiLabel: { fontSize: 10, fontWeight: "800", color: GRAY },
  kpiValue: { fontSize: 15, fontWeight: "900", color: "#111", marginTop: 4 },
  section: { fontSize: 13, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  chartCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderColor: "#EEF0F3" },
  barCol: { flex: 1, alignItems: "center" },
  barValue: { fontSize: 8, color: GRAY, fontWeight: "700", marginBottom: 4 },
  barTrack: { height: 90, justifyContent: "flex-end", width: 18 },
  barFill: { width: 18, borderRadius: 5, backgroundColor: "#1D4ED8" },
  barLabel: { fontSize: 9, color: "#344054", fontWeight: "800", marginTop: 6 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardHead: { flexDirection: "row", alignItems: "center" },
  storeName: { flex: 1, fontSize: 14, fontWeight: "800", color: "#111", marginRight: 6 },
  status: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 9, fontWeight: "900" },
  metricRow: { flexDirection: "row", marginTop: 10 },
  mLabel: { fontSize: 9, color: GRAY, fontWeight: "700" },
  mValue: { fontSize: 11, fontWeight: "800", color: "#344054", marginTop: 2 },
});
