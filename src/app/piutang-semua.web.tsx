import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import { Bar, Card, DataTable, EmptyState, FilterChip, Kpi, Pill, SearchField, WebButton } from "../components/desktop/ui";
import type { Col } from "../components/desktop/ui";
import { A } from "../components/desktop/tokens";
import { canSyncPiutang, fmtSynced, usePiutangAll, usePiutangList } from "../components/home/usePiutang";
import type { PiutangArea } from "../components/home/usePiutang";
import { downloadCsv } from "../lib/downloadCsv";

const rp = (n?: number | null) =>
  n == null || isNaN(Number(n)) ? "–" : "Rp" + Math.round(Number(n)).toLocaleString("id-ID");
function compactRp(n?: number | null) {
  if (n == null || isNaN(Number(n))) return "–";
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return rp(v);
}
const FILTERS: Array<PiutangArea | "ALL"> = ["ALL", "SOLO", "DIY", "SEMARANG"];
const AREA_TONE: Record<string, "red" | "blue" | "green"> = { SOLO: "red", DIY: "blue", SEMARANG: "green" };

export default function PiutangSemuaWeb() {
  const viewer = useQuery(api.users.viewer) as any;
  const { summary, syncing, error, sync } = usePiutangAll();
  const [area, setArea] = useState<PiutangArea | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const rows = usePiutangList(area, search);

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  const canSync = canSyncPiutang(viewer.role);
  const maxPiutang = Math.max(1, ...(rows ?? []).map((r: any) => r.piutang));

  const cols: Col[] = [
    { key: "storeName", label: "Pelanggan", flex: 2.4, render: (r: any) => <Text style={s.cellStrong} numberOfLines={1}>{r.storeName}</Text> },
    { key: "area", label: "Area", width: 110, render: (r: any) => <Pill text={r.area} tone={AREA_TONE[r.area] ?? "gray"} size="sm" /> },
    { key: "tagihan", label: "Tagihan", width: 80, align: "right", render: (r: any) => <Text style={s.cell}>{r.tagihan}</Text> },
    { key: "usiaMax", label: "Usia terlama", width: 120, align: "right", render: (r: any) => (
      <Text style={[s.cell, r.usiaMax > 60 ? { color: A.red, fontWeight: "700" } : null]}>{r.usiaMax ? `${r.usiaMax} hari` : "–"}</Text>
    ) },
    { key: "piutang", label: "Piutang", flex: 1.6, align: "right", render: (r: any) => (
      <View style={{ width: "100%", alignItems: "flex-end", gap: 5 }}>
        <Text style={s.cellStrong}>{rp(r.piutang)}</Text>
        <View style={{ width: "100%" }}><Bar pct={(r.piutang / maxPiutang) * 100} color={A.red} height={4} /></View>
      </View>
    ) },
  ];

  const exportCsv = () => {
    if (!rows?.length) return;
    downloadCsv(
      `piutang-semua-area-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Pelanggan", "Area", "Tagihan", "Usia terlama (hari)", "Total", "Cicil", "Retur", "Piutang"],
      rows.map((r: any) => [r.storeName, r.area, r.tagihan, r.usiaMax || "", r.total, r.cicil, r.retur, r.piutang]),
    );
  };

  return (
    <DesktopShell
      active="beranda"
      title="Piutang Semua Area"
      subtitle={summary?.hasData ? `Sinkron ${fmtSynced(summary.syncedAt)}${summary.source ? ` • ${summary.source}` : ""}` : "Belum ada data piutang"}
      right={
        <View style={s.actions}>
          {canSync ? <WebButton label={syncing ? "Menyinkron…" : "Sinkronkan"} icon="refresh" variant="soft" disabled={syncing} onPress={sync} /> : null}
          <WebButton label="Unduh CSV" icon="download" variant="ghost" disabled={!rows?.length} onPress={exportCsv} />
        </View>
      }
    >
      <View style={s.stack}>
        {error ? <Text style={s.err}>{error}</Text> : null}

        {summary?.hasData ? (
          <View style={s.kpis}>
            <Kpi icon="wallet" tone="red" label="Total piutang" value={compactRp(summary.total)} hint={`${summary.tagihan} tagihan`} />
            <Kpi icon="store" tone="violet" label="Pelanggan" value={summary.pelanggan} hint="dengan piutang berjalan" />
            {summary.areas.map((a: any) => (
              <Kpi key={a.area} icon="pin" tone={AREA_TONE[a.area] === "red" ? "red" : AREA_TONE[a.area] === "blue" ? "blue" : "green"} label={a.area} value={compactRp(a.piutang)} hint={`${a.pelanggan} pelanggan`} />
            ))}
          </View>
        ) : null}

        <Card pad={16}>
          <View style={s.toolbar}>
            <View style={s.chips}>
              {FILTERS.map((f) => (
                <FilterChip key={f} label={f === "ALL" ? "Semua area" : f} on={area === f} onPress={() => setArea(f)} />
              ))}
            </View>
            <SearchField value={search} onChangeText={setSearch} placeholder="Cari nama pelanggan…" width={300} />
          </View>
        </Card>

        <Card pad={0}>
          {rows === undefined ? (
            <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
          ) : (
            <DataTable
              cols={cols}
              rows={rows}
              keyOf={(r: any) => r.key}
              minWidth={760}
              empty={<EmptyState icon="wallet" title={search ? "Tidak ada pelanggan yang cocok" : "Belum ada data piutang"} desc={search ? undefined : canSync ? "Tekan Sinkronkan untuk menarik data dari sheet." : "Minta supervisor menyinkronkan."} />}
            />
          )}
        </Card>
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: A.page },
  stack: { gap: 16 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pad: { padding: 40, alignItems: "center" },
  cell: { fontSize: 13, color: A.inkSoft },
  cellStrong: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  err: { fontSize: 13, color: A.red },
});
