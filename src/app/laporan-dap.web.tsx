import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import { Card, DataTable, EmptyState, FilterChip, Kpi, Panel, Pill, SearchField, WebButton } from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { BarChart } from "../components/desktop/charts";
import { A } from "../components/desktop/tokens";

const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const pct = (n?: number | null) => (n == null ? "-" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%");
const AREA_TONE: Record<string, Tone> = { GLOBAL: "gray", SOLO: "red", DIY: "blue", SEMARANG: "green", TAB: "violet" };
const PAGE = 100;

function statusTone(st: string): Tone {
  const t = (st || "").toUpperCase();
  if (t.includes("LANCAR")) return "green";
  if (t.includes("WARNING") || t.includes("PASIF") || t.includes("TUTUP")) return "amber";
  if (t.includes("BARU")) return "blue";
  return "gray";
}

export default function LaporanDapWeb() {
  const router = useRouter();
  const fetchData = useAction(api.laporan.fetchDap);
  const viewer = useQuery(api.users.viewer) as any;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [mi, setMi] = useState(8);
  const [area, setArea] = useState("ALL");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const r: any = await fetchData();
      setData(r);
      if (r?.bulanBerjalan) setMi(Math.max(0, Math.min(11, r.bulanBerjalan - 1)));
    } catch (e: any) { setErr(e?.message ?? "Gagal menarik data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setLimit(PAGE); }, [area, q, mi]);

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  const rows: any[] = data?.rows ?? [];
  const areas = ["ALL", ...Array.from(new Set(rows.map((r: any) => r.area)))] as string[];
  const kw = q.trim().toLowerCase();
  const shown = rows
    .filter((r: any) => area === "ALL" || r.area === area)
    .filter((r: any) => !kw || (r.pelanggan || "").toLowerCase().includes(kw) || (r.kab || "").toLowerCase().includes(kw) || (r.kec || "").toLowerCase().includes(kw));
  const mName = data?.months?.[mi] ?? "SEP";
  const totalAct = shown.reduce((t, r) => t + (r.months[mi] || 0), 0);
  const totalTarget = area === "ALL" ? (data?.targetGlobal ?? 0) : shown.reduce((t, r) => t + (r.targetToko || 0), 0);
  const pencapaian = totalTarget > 0 ? (totalAct / totalTarget) * 100 : 0;
  const isSpv = viewer.role === "supervisor";
  const visible = shown.slice(0, limit);

  const cols: Col[] = [
    {
      key: "p", label: "Pelanggan", flex: 2.4,
      render: (r: any) => (
        <View style={{ gap: 2, width: "100%" }}>
          <Text style={s.strong} numberOfLines={1}>{r.pelanggan}</Text>
          <Text style={s.tiny} numberOfLines={1}>{[r.kab, r.kec].filter(Boolean).join(" • ") || "-"}</Text>
        </View>
      ),
    },
    { key: "area", label: "Area", width: 100, render: (r: any) => <Pill text={r.area} tone={AREA_TONE[r.area] ?? "gray"} size="sm" /> },
    { key: "adm", label: "ADM", flex: 1, render: (r: any) => <Text style={s.cell} numberOfLines={1}>{r.adm || "-"}</Text> },
    { key: "kelas", label: "Kelas", width: 90, render: (r: any) => <Text style={s.cell}>{r.kelasToko || "-"}{r.kelasByr ? ` / ${r.kelasByr}` : ""}</Text> },
    { key: "st", label: "Status", width: 130, render: (r: any) => <Pill text={r.status || "-"} tone={statusTone(r.status)} size="sm" dot /> },
    { key: "act", label: `ACT ${mName}`, flex: 1.2, align: "right", render: (r: any) => <Text style={[s.strong, { color: A.info }]}>{rupiah(r.months[mi])}</Text> },
    { key: "tgt", label: "Target", flex: 1.2, align: "right", render: (r: any) => <Text style={s.cell}>{rupiah(r.targetToko)}</Text> },
    { key: "kon", label: "Kontrib", width: 90, align: "right", render: (r: any) => <Text style={s.cell}>{pct(r.kontribPct)}</Text> },
    { key: "pcp", label: "PCP", width: 90, align: "right", render: (r: any) => <Text style={s.strong}>{pct(r.pcpPct)}</Text> },
  ];

  return (
    <DesktopShell
      active="laporan"
      title="Target vs Act Toko"
      subtitle={`Per toko${data ? ` • diperbarui ${new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
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
            {(data?.months ?? []).map((m: string, idx: number) => <FilterChip key={m} label={m} on={mi === idx} onPress={() => setMi(idx)} />)}
          </View>
          <View style={[s.toolbar, { marginTop: 12 }]}>
            <View style={s.chips}>
              {isSpv
                ? areas.map((a) => <FilterChip key={a} label={a === "ALL" ? "Semua area" : a} on={area === a} onPress={() => setArea(a)} />)
                : <FilterChip label={viewer.area ?? "-"} on onPress={() => {}} />}
            </View>
            <SearchField value={q} onChangeText={setQ} placeholder="Cari nama toko / kecamatan…" width={320} />
          </View>
        </Card>

        {loading && !data ? (
          <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
        ) : err ? (
          <EmptyState icon="warn" title="Gagal memuat" desc={err} action={<WebButton label="Coba lagi" onPress={load} />} />
        ) : data ? (
          <>
            <View style={s.kpis}>
              <Kpi icon="store" tone="violet" label="Total toko" value={shown.length} />
              <Kpi icon="cash" tone="green" label={`ACT ${mName}`} value={rupiah(totalAct)} />
              <Kpi icon="flag" tone="amber" label="Total target" value={rupiah(totalTarget)} />
              <Kpi icon="trend" tone="blue" label="Pencapaian" value={pct(pencapaian)} />
            </View>

            <Panel title={`Penjualan per bulan (${data.months[0]}–${mName})`} sub="Dalam juta rupiah">
              <BarChart
                data={(data.monthTotals ?? []).slice(0, mi + 1).map((v: number, idx: number) => ({
                  label: data.months[idx], value: Math.round((v / 1000000) * 10) / 10, color: idx === mi ? A.info : undefined,
                }))}
                width={720} height={190}
              />
            </Panel>

            <Card pad={0}>
              <DataTable cols={cols} rows={visible} keyOf={(r: any, i: number) => `${r.pelanggan}-${i}`} minWidth={1180}
                empty={<EmptyState icon="store" title="Belum ada data toko" />} />
              {shown.length > visible.length ? (
                <View style={s.more}>
                  <Text style={s.tiny}>Menampilkan {visible.length} dari {shown.length} toko</Text>
                  <WebButton label="Tampilkan lebih banyak" variant="soft" size="sm" onPress={() => setLimit((l) => l + PAGE)} />
                </View>
              ) : null}
            </Card>
          </>
        ) : null}
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  stack: { gap: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  pad: { padding: 60, alignItems: "center" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: { fontSize: 13, color: A.inkSoft },
  strong: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  tiny: { fontSize: 12, color: A.muted },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderTopWidth: 1, borderTopColor: A.borderSoft },
});
