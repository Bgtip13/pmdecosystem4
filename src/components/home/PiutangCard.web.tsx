import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bar, EmptyState, Panel, Pill, Skeleton, WebButton } from "../desktop/ui";
import { A } from "../desktop/tokens";
import { canSyncPiutang, fmtSynced, usePiutangAll } from "./usePiutang";

const rp = (n?: number | null) =>
  n == null || isNaN(Number(n)) ? "–" : "Rp" + Math.round(Number(n)).toLocaleString("id-ID");
function compactRp(n?: number | null) {
  if (n == null || isNaN(Number(n))) return "–";
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return rp(v);
}

const AREA_COLOR: Record<string, string> = { SOLO: A.red, DIY: A.info, SEMARANG: A.green };

// Kartu "Piutang semua area" di Beranda web. Menyembunyikan diri untuk peran yang tidak berhak.
export default function PiutangCard() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const { summary, syncing, error, sync } = usePiutangAll();

  if (summary === null) return null;
  const canSync = canSyncPiutang(viewer?.role);

  return (
    <Panel
      title="Piutang semua area"
      sub={summary?.hasData ? `Sinkron ${fmtSynced(summary.syncedAt)}${summary.source ? ` • ${summary.source}` : ""}` : "Gabungan SOLO, DIY, dan SEMARANG"}
      right={
        <View style={s.actions}>
          {canSync ? <WebButton label={syncing ? "Menyinkron…" : "Sinkronkan"} icon="refresh" variant="soft" size="sm" disabled={syncing} onPress={sync} /> : null}
          <WebButton label="Lihat semua" variant="primary" size="sm" onPress={() => router.push("/piutang-semua" as any)} />
        </View>
      }
    >
      {summary === undefined ? (
        <Skeleton h={90} />
      ) : !summary.hasData ? (
        <EmptyState
          icon="wallet"
          title="Belum ada data piutang"
          desc={canSync ? "Tekan Sinkronkan untuk menarik data dari sheet." : "Minta supervisor menyinkronkan data piutang."}
        />
      ) : (
        <View style={s.grid}>
          <View style={s.colMain}>
            <Text style={s.label}>Total piutang</Text>
            <Text style={s.total}>{rp(summary.total)}</Text>
            <Text style={s.sub}>{summary.pelanggan} pelanggan • {summary.tagihan} tagihan</Text>
            <View style={s.agingWrap}>
              {summary.aging.map((g: any, i: number) => (
                <View key={g.key} style={s.agingCell}>
                  <Text style={[s.agingVal, i >= 2 && g.piutang > 0 ? { color: A.red } : null]} numberOfLines={1}>{compactRp(g.piutang)}</Text>
                  <Text style={s.agingLabel}>{g.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.colAreas}>
            {summary.areas.map((a: any) => (
              <View key={a.area} style={s.areaRow}>
                <View style={s.areaTop}>
                  <Text style={s.areaName}>{a.area}</Text>
                  <Pill text={`${a.pelanggan} pelanggan`} tone="gray" size="sm" />
                  <Text style={s.areaVal}>{compactRp(a.piutang)}</Text>
                </View>
                <Bar pct={summary.total > 0 ? (a.piutang / summary.total) * 100 : 0} color={AREA_COLOR[a.area] ?? A.brand} height={7} />
              </View>
            ))}
          </View>
        </View>
      )}
      {error ? <Text style={s.err}>{error}</Text> : null}
    </Panel>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
  colMain: { flexBasis: 320, flexGrow: 1, minWidth: 260 },
  colAreas: { flexBasis: 320, flexGrow: 1, minWidth: 260, gap: 14, justifyContent: "center" },
  label: { fontSize: 12.5, color: A.muted, fontWeight: "600" },
  total: { fontSize: 30, fontWeight: "800", color: A.ink, letterSpacing: -0.8, marginTop: 4 },
  sub: { fontSize: 12.5, color: A.muted, marginTop: 3 },
  agingWrap: { flexDirection: "row", marginTop: 14, borderWidth: 1, borderColor: A.border, borderRadius: 14, overflow: "hidden" },
  agingCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", borderRightWidth: 1, borderRightColor: A.borderSoft },
  agingVal: { fontSize: 13.5, fontWeight: "800", color: A.ink },
  agingLabel: { fontSize: 11, color: A.muted, marginTop: 2 },
  areaRow: { gap: 7 },
  areaTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  areaName: { flex: 1, fontSize: 13.5, fontWeight: "700", color: A.ink },
  areaVal: { fontSize: 13.5, fontWeight: "800", color: A.ink },
  err: { marginTop: 10, fontSize: 12.5, color: A.red },
});
