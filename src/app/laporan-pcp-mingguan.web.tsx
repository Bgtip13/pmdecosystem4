import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import { Card, DataTable, EmptyState, FilterChip, Kpi, Panel, Pill, WebButton } from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { BarChart } from "../components/desktop/charts";
import { A } from "../components/desktop/tokens";

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const shortRp = (n?: number | null) =>
  n == null || isNaN(n) ? "-" : n >= 1_000_000 ? "Rp" + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "jt" : "Rp" + n.toLocaleString("id-ID");
const pctTxt = (n?: number | null) => (n == null ? "-" : Math.round(n) + "%");
const WEEKS = ["M1", "M2", "M3", "M4", "M5"];
const weekAt = (r: any, i: number) => (r?.weeks ?? [])[i];
const actAt = (r: any, n: number) => weekAt(r, n - 1)?.act ?? 0;
const runPct = (r: any, n: number) => (r?.tgtMgg > 0 ? (actAt(r, n) / r.tgtMgg) * 100 : 0);
const colorOf = (p?: number | null) => (p == null ? A.muted : p < 30 ? A.red : p < 70 ? A.orange : A.green);
const statusOf = (p?: number | null): { txt: string; tone: Tone } =>
  p == null ? { txt: "-", tone: "gray" } : p < 30 ? { txt: "Perlu perhatian", tone: "red" } : p < 70 ? { txt: "Sedang", tone: "amber" } : { txt: "Bagus", tone: "green" };
const AREA_TONE: Record<string, Tone> = { GLOBAL: "gray", SOLO: "red", DIY: "blue", SEMARANG: "green", TAB: "violet" };

export default function LaporanPcpMingguanWeb() {
  const router = useRouter();
  const fetchData = useAction(api.laporan.fetchPcpMingguan);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState("ALL");

  const load = async () => {
    setLoading(true); setErr("");
    try { setData(await fetchData()); }
    catch (e: any) { setErr(e?.message ?? "Gagal menarik data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  const rows: any[] = data?.rows ?? [];
  const areas = ["ALL", ...Array.from(new Set(rows.map((r) => r.area).filter((a: any) => a && a !== "GLOBAL")))] as string[];
  const shown = area === "ALL" ? rows : rows.filter((r) => r.area === area);
  const kpi = rows.find((r) => r.area === "GLOBAL") ?? shown[0];
  const curWeek = Math.min(5, Math.floor((new Date().getDate() - 1) / 7) + 1);   // 1–7 → M1, 8–14 → M2, dst
  const chartRows = shown.filter((r) => r.area !== "GLOBAL");
  const src = chartRows.length > 0 ? chartRows : shown;
  const weekTotals = WEEKS.map((_, i) => src.reduce((t, r) => t + ((weekAt(r, i)?.act) || 0), 0));
  const isSpv = viewer.role === "supervisor";

  const weekCol = (i: number): Col => ({
    key: `w${i}`, label: WEEKS[i] + (i + 1 === curWeek ? " •" : ""), width: 96, align: "right",
    render: (r: any) => {
      const w = weekAt(r, i);
      const p = w?.pct ?? null;
      const act = w?.act ?? 0;
      const has = w != null && (act > 0 || p != null);
      return (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.strong, { color: colorOf(p), fontSize: 13 }]}>{pctTxt(p)}</Text>
          <Text style={s.tiny}>{has ? shortRp(act) : "-"}</Text>
        </View>
      );
    },
  });

  const cols: Col[] = [
    { key: "area", label: "Area", width: 100, render: (r: any) => <Pill text={r.area} tone={AREA_TONE[r.area] ?? "gray"} size="sm" /> },
    { key: "jabatan", label: "Jabatan", width: 110, render: (r: any) => <Text style={s.cell}>{r.jabatan}</Text> },
    { key: "sdm", label: "SDM", flex: 1.5, render: (r: any) => <Text style={s.strong} numberOfLines={1}>{r.sdm}</Text> },
    { key: "st", label: "Status", width: 140, render: (r: any) => { const st = statusOf(runPct(r, curWeek)); return <Pill text={st.txt} tone={st.tone} size="sm" dot />; } },
    { key: "tgt", label: "Target periode", flex: 1.1, align: "right", render: (r: any) => <Text style={s.cell}>{rupiah(r.tgtMgg)}</Text> },
    { key: "act", label: `Aktual M${curWeek}`, flex: 1.1, align: "right", render: (r: any) => <Text style={s.strong}>{rupiah(actAt(r, curWeek))}</Text> },
    { key: "pc", label: "Capaian", width: 90, align: "right", render: (r: any) => <Text style={[s.strong, { color: colorOf(runPct(r, curWeek)) }]}>{pctTxt(runPct(r, curWeek))}</Text> },
    ...[0, 1, 2, 3, 4].map(weekCol),
  ];

  return (
    <DesktopShell
      active="laporan"
      title="PCP Mingguan"
      subtitle={`Pencapaian per minggu (M1–M5)${data ? ` • diperbarui ${new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
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
              ? areas.map((f) => <FilterChip key={f} label={f === "ALL" ? "Semua area" : f} on={area === f} onPress={() => setArea(f)} />)
              : <FilterChip label={viewer.area ?? "-"} on onPress={() => {}} />}
          </View>
        </Card>

        {loading && !data ? (
          <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
        ) : err ? (
          <EmptyState icon="warn" title="Gagal memuat" desc={err} action={<WebButton label="Coba lagi" onPress={load} />} />
        ) : !kpi ? (
          <EmptyState icon="calendar" title="Belum ada data" />
        ) : (
          <>
            <View style={s.kpis}>
              <Kpi icon="flag" tone="violet" label="Target periode" value={rupiah(kpi.tgtMgg)} />
              <Kpi icon="cash" tone="green" label={`Aktual berjalan (M${curWeek})`} value={rupiah(actAt(kpi, curWeek))} />
              <Kpi icon="trend" tone="blue" label="Pencapaian" value={pctTxt(runPct(kpi, curWeek))} />
            </View>

            <Panel title="Aktual per minggu" sub={`Minggu berjalan: M${curWeek}`}>
              {weekTotals.every((v) => v === 0) ? (
                <Text style={s.cell}>Belum ada data aktual.</Text>
              ) : (
                <BarChart
                  data={WEEKS.map((l, i) => ({ label: l + (i + 1 === curWeek ? " •" : ""), value: weekTotals[i], color: i + 1 === curWeek ? A.info : undefined }))}
                  width={640} height={190}
                />
              )}
            </Panel>

            <Card pad={0}>
              <DataTable cols={cols} rows={shown} keyOf={(r: any, i: number) => `${r.area}-${r.sdm}-${i}`} minWidth={1320}
                empty={<EmptyState icon="calendar" title="Tidak ada baris" />} />
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
  cell: { fontSize: 13, color: A.inkSoft },
  strong: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  tiny: { fontSize: 11, color: A.muted, marginTop: 1 },
});
