import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import { Card, DataTable, EmptyState, FilterChip, Kpi, Panel, Pill, WebButton } from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { Donut } from "../components/desktop/charts";
import { A } from "../components/desktop/tokens";

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const pct = (n?: number | null) => (n == null ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%");
const AREA_TONE: Record<string, Tone> = { GLOBAL: "gray", SOLO: "red", DIY: "blue", SEMARANG: "green", TAB: "violet" };
const gaugeColor = (v?: number | null) => (v == null ? A.muted : v < 30 ? A.red : v < 70 ? A.orange : A.green);
const statusOf = (p?: number | null): { txt: string; tone: Tone } =>
  p == null ? { txt: "-", tone: "gray" } : p < 30 ? { txt: "Perlu perhatian", tone: "red" } : p < 70 ? { txt: "Sedang", tone: "amber" } : { txt: "Bagus", tone: "green" };

function Gauge({ title, value, center }: { title: string; value: number; center: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <View style={s.gauge}>
      <Donut parts={[{ value: v, color: gaugeColor(value) }, { value: 100 - v, color: A.borderSoft }]} size={120} stroke={13} center={center} />
      <Text style={s.gaugeTitle}>{title}</Text>
    </View>
  );
}

export default function LaporanPcpWeb() {
  const router = useRouter();
  const fetchPcp = useAction(api.laporan.fetchPcpBulanan);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState("ALL");

  const load = async () => {
    setLoading(true); setErr("");
    try { setData(await fetchPcp()); }
    catch (e: any) { setErr(e?.message ?? "Gagal menarik data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  const rows: any[] = data?.rows ?? [];
  const shown = area === "ALL" ? rows : rows.filter((r) => r.area === area);
  const kpi = (area === "ALL" ? rows.find((r) => r.area === "GLOBAL") : shown[0]) ?? shown[0];
  const tp = String(kpi?.trip || "").split("/");
  const tripPct = tp[1] ? (Number(tp[0]) / Number(tp[1])) * 100 : 0;
  const isSpv = viewer.role === "supervisor";

  const cols: Col[] = [
    { key: "area", label: "Area", width: 100, render: (r: any) => <Pill text={r.area} tone={AREA_TONE[r.area] ?? "gray"} size="sm" /> },
    { key: "jabatan", label: "Jabatan", width: 110, render: (r: any) => <Text style={s.cell}>{r.jabatan}</Text> },
    { key: "sdm", label: "SDM", flex: 1.6, render: (r: any) => <Text style={s.strong} numberOfLines={1}>{r.sdm}</Text> },
    { key: "st", label: "Status", width: 140, render: (r: any) => { const st = statusOf(r.pcpPct); return <Pill text={st.txt} tone={st.tone} size="sm" dot />; } },
    { key: "trip", label: "Trip", width: 80, align: "right", render: (r: any) => <Text style={s.cell}>{r.trip || "-"}</Text> },
    { key: "pcp", label: "PCP", width: 90, align: "right", render: (r: any) => <Text style={[s.strong, { color: gaugeColor(r.pcpPct) }]}>{pct(r.pcpPct)}</Text> },
    { key: "contr", label: "Contr", width: 90, align: "right", render: (r: any) => <Text style={s.cell}>{pct(r.contrPct)}</Text> },
    { key: "pot", label: "Potensi", width: 80, align: "right", render: (r: any) => <Text style={s.cell}>{r.potensiToko != null ? String(r.potensiToko) : "-"}</Text> },
    { key: "tgt", label: "Target", flex: 1.2, align: "right", render: (r: any) => <Text style={s.cell}>{rupiah(r.tgt)}</Text> },
    { key: "act", label: "Aktual", flex: 1.2, align: "right", render: (r: any) => <Text style={s.strong}>{rupiah(r.act)}</Text> },
    { key: "kejar", label: "Rp kejar", flex: 1.2, align: "right", render: (r: any) => <Text style={s.cell}>{rupiah(r.kejar)}</Text> },
  ];

  return (
    <DesktopShell
      active="laporan"
      title="PCP Bulanan"
      subtitle={`Pencapaian bulanan${data ? ` • diperbarui ${new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
      right={
        <View style={s.row}>
          <WebButton label="Kembali ke Laporan" icon="back" variant="ghost" onPress={() => router.replace("/laporan")} />
          <WebButton label={loading ? "Memuat…" : "Muat ulang"} icon="refresh" variant="soft" disabled={loading} onPress={load} />
        </View>
      }
    >
      <View style={s.stack}>
        <Card pad={16}>
          <View style={s.chips}>
            {isSpv
              ? ["ALL", "SOLO", "DIY", "SEMARANG", "TAB"].map((f) => <FilterChip key={f} label={f === "ALL" ? "Semua area" : f} on={area === f} onPress={() => setArea(f)} />)
              : <FilterChip label={viewer.area ?? "-"} on onPress={() => {}} />}
          </View>
        </Card>

        {loading && !data ? (
          <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
        ) : err ? (
          <EmptyState icon="warn" title="Gagal memuat" desc={err} action={<WebButton label="Coba lagi" onPress={load} />} />
        ) : !kpi ? (
          <EmptyState icon="chart" title="Belum ada data" />
        ) : (
          <>
            <View style={s.kpis}>
              <Kpi icon="flag" tone="violet" label="Target" value={rupiah(kpi.tgt)} />
              <Kpi icon="cash" tone="green" label="Aktual" value={rupiah(kpi.act)} />
              <Kpi icon="trend" tone="amber" label="Rp kejar" value={rupiah(kpi.kejar)} />
              <Kpi icon="store" tone="blue" label="TA / NOO / Reaktif" value={`${kpi.taTotal ?? "-"}/${kpi.taNoo ?? "-"}/${kpi.tokoReaktif ?? "-"}`} />
            </View>

            <Panel title="Capaian" sub={kpi.area === "GLOBAL" || area === "ALL" ? "Semua area" : kpi.area}>
              <View style={s.gauges}>
                <Gauge title="PCP (Aktual ÷ Target)" value={kpi.pcpPct} center={pct(kpi.pcpPct)} />
                <Gauge title="Trip vs Trip kuota" value={tripPct} center={kpi.trip || "-"} />
                <Gauge title="Contr %" value={kpi.contrPct} center={pct(kpi.contrPct)} />
              </View>
            </Panel>

            <Card pad={0}>
              <DataTable cols={cols} rows={shown} keyOf={(r: any, i: number) => `${r.area}-${r.sdm}-${i}`} minWidth={1180}
                empty={<EmptyState icon="chart" title="Tidak ada baris" />} />
            </Card>
          </>
        )}
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  stack: { gap: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pad: { padding: 60, alignItems: "center" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gauges: { flexDirection: "row", flexWrap: "wrap", gap: 40, justifyContent: "space-around" },
  gauge: { alignItems: "center", gap: 10 },
  gaugeTitle: { fontSize: 12.5, fontWeight: "700", color: A.muted },
  cell: { fontSize: 13, color: A.inkSoft },
  strong: { fontSize: 13.5, fontWeight: "700", color: A.ink },
});
