import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "../AppText";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardLabel, ProgressBar, Skeleton, compactRupiah, rupiah } from "./ui";
import { canSyncPiutang, fmtSynced, usePiutangAll } from "./usePiutang";
import { useColors, useStyles } from "../../lib/themeContext";
import type { Colors } from "../../lib/colors";

// Kartu "Piutang semua area" di Beranda HP. Menyembunyikan diri untuk peran yang tidak berhak.
export default function PiutangCard() {
  const C = useColors();
  const st = useStyles(createSt);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const { summary, syncing, error, sync } = usePiutangAll();

  if (summary === null) return null;
  const canSync = canSyncPiutang(viewer?.role);
  const areaColor: Record<string, string> = { SOLO: C.areaSolo, DIY: C.blueStrong, SEMARANG: C.status.success.fg };
  const open = () => router.push("/piutang-semua" as any);

  return (
    <Card>
      <View style={st.rowBetween}>
        <CardLabel>PIUTANG SEMUA AREA</CardLabel>
        {canSync ? (
          <TouchableOpacity onPress={sync} disabled={syncing} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={st.action}>{syncing ? "Menyinkron…" : "Sinkronkan"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {summary === undefined ? (
        <Skeleton lines={3} />
      ) : !summary.hasData ? (
        <Text style={st.empty}>
          Belum ada data piutang.{canSync ? " Tekan Sinkronkan untuk menarik dari sheet." : " Minta supervisor menyinkronkan."}
        </Text>
      ) : (
        <>
          <Text style={st.total}>{rupiah(summary.total)}</Text>
          <Text style={st.sub}>
            {summary.pelanggan} pelanggan • {summary.tagihan} tagihan • sinkron {fmtSynced(summary.syncedAt)}
          </Text>

          <View style={{ marginTop: 12 }}>
            {summary.areas.map((a: any) => (
              <View key={a.area} style={st.areaRow}>
                <View style={st.areaTop}>
                  <Text style={st.areaName}>{a.area}</Text>
                  <Text style={st.areaVal}>
                    {compactRupiah(a.piutang)} <Text style={st.areaMeta}>• {a.pelanggan} pelanggan</Text>
                  </Text>
                </View>
                <ProgressBar
                  pct={summary.total > 0 ? (a.piutang / summary.total) * 100 : 0}
                  color={areaColor[a.area] ?? C.primary}
                  height={6}
                />
              </View>
            ))}
          </View>

          <View style={st.agingRow}>
            {summary.aging.map((g: any, i: number) => (
              <View key={g.key} style={[st.agingCell, i === summary.aging.length - 1 && { borderRightWidth: 0 }]}>
                <Text style={[st.agingVal, i >= 2 && g.piutang > 0 ? { color: C.status.danger.fg } : null]}>
                  {compactRupiah(g.piutang)}
                </Text>
                <Text style={st.agingLabel}>{g.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={st.cta} onPress={open} activeOpacity={0.88}>
            <Text style={st.ctaText}>Lihat semua piutang ›</Text>
          </TouchableOpacity>
        </>
      )}
      {error ? <Text style={st.err}>{error}</Text> : null}
    </Card>
  );
}

const createSt = (C: Colors) =>
  StyleSheet.create({
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    action: { color: C.primary, fontSize: 13, fontWeight: "700" },
    total: { fontSize: 26, fontWeight: "800", color: C.ink, marginTop: 6, letterSpacing: -0.5 },
    sub: { fontSize: 12, color: C.inkMuted, marginTop: 3 },
    empty: { fontSize: 13, color: C.inkMuted, marginTop: 8, lineHeight: 19 },
    areaRow: { marginBottom: 10 },
    areaTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
    areaName: { fontSize: 13, fontWeight: "700", color: C.ink },
    areaVal: { fontSize: 13, fontWeight: "700", color: C.ink },
    areaMeta: { fontSize: 11.5, fontWeight: "500", color: C.inkMuted },
    agingRow: {
      flexDirection: "row", marginTop: 6, borderWidth: 1, borderColor: C.divider,
      borderRadius: 12, overflow: "hidden",
    },
    agingCell: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, alignItems: "center", borderRightWidth: 1, borderRightColor: C.divider },
    agingVal: { fontSize: 12.5, fontWeight: "800", color: C.ink },
    agingLabel: { fontSize: 10.5, color: C.inkMuted, marginTop: 2 },
    cta: {
      marginTop: 12, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 11, alignItems: "center",
    },
    ctaText: { color: C.onPrimary, fontSize: 14, fontWeight: "700" },
    err: { marginTop: 8, fontSize: 12, color: C.status.danger.fg },
  });
