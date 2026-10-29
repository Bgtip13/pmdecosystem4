import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Card,
  CardLabel,
  Empty,
  ProgressBar,
  PrimaryButton,
  QuickActions,
  SectionHeader,
  Skeleton,
  SummaryRow,
  compactRupiah,
  monthKeyWIB,
  monthLabel,
  pctColor,
  pctText,
  rupiah,
} from "./ui";
import { pcpAreas, pcpTotals, pcpWeekly, usePcpBulanan, usePcpMingguan } from "./usePcp";
import { theme } from "../../lib/theme";

const { colors: C } = theme;

export default function OwnerHome() {
  const router = useRouter();
  const bulanan = usePcpBulanan(true);
  const mingguan = usePcpMingguan(true);
  const tim = useQuery(api.visits.monthlyKpi, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;

  const totals = pcpTotals(bulanan.data?.rows);
  const areas = pcpAreas(bulanan.data?.rows);
  const weeks = pcpWeekly(mingguan.data?.rows, mingguan.data?.weekLabels);

  const timRows = (tim ?? []) as any[];
  const onTrack = timRows.filter((r) => Number(r.skor ?? 0) >= 70).length;
  const loadingPcp = bulanan.state === "loading" && !totals;
  const pcpError = bulanan.state === "err" && !totals;

  return (
    <>
      <Card>
        <View style={st.rowBetween}>
          <CardLabel>OMSET BULAN INI • {monthLabel(monthKeyWIB()).toUpperCase()}</CardLabel>
          {totals ? (
            <View style={[st.badge, { backgroundColor: pctColor(totals.pct) + "18" }]}>
              <Text style={[st.badgeText, { color: pctColor(totals.pct) }]}>{pctText(totals.pct)}</Text>
            </View>
          ) : null}
        </View>

        {loadingPcp ? (
          <Skeleton lines={4} />
        ) : pcpError || !totals ? (
          <>
            <Text style={st.errorTitle}>Data omset belum bisa ditarik</Text>
            <Text style={st.errorSub}>Sheet PCP tidak merespons. Coba lagi lewat Laporan PCP.</Text>
            <PrimaryButton label="Buka Laporan PCP" icon="trend" onPress={() => router.push("/laporan-pcp" as any)} />
          </>
        ) : (
          <>
            <Text style={st.big} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {compactRupiah(totals.act)}
            </Text>
            <Text style={st.bigSub}>
              dari target {rupiah(totals.tgt)}
              {totals.kejar > 0 ? ` • sisa ${compactRupiah(totals.kejar)}` : ""}
            </Text>
            <View style={{ marginTop: 12 }}>
              <ProgressBar pct={totals.pct} color={pctColor(totals.pct)} height={10} />
            </View>

            {weeks.length > 0 ? (
              <View style={st.weekRow}>
                {weeks.map((w) => (
                  <View key={w.label} style={st.weekChip}>
                    <Text style={st.weekLabel}>{w.label}</Text>
                    <Text style={[st.weekPct, { color: pctColor(w.pct) }]} numberOfLines={1}>
                      {pctText(w.pct)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : mingguan.state === "loading" ? (
              <Text style={st.hint}>Menarik tren mingguan…</Text>
            ) : null}

            <PrimaryButton label="Lihat laporan lengkap" icon="chart" onPress={() => router.push("/laporan" as any)} />
            <Text style={st.hint}>
              Omset mingguan memakai rata-rata kiriman (9 kiriman/bulan). Angka per minggu ada di PCP
              Mingguan.
            </Text>
          </>
        )}
      </Card>

      <QuickActions
        items={[
          { icon: "chart", label: "Laporan", color: C.chip.success.fg, bg: C.chip.success.bg, to: "/laporan" },
          { icon: "star", label: "Rapor sales", color: C.chip.purple.fg, bg: C.chip.purple.bg, to: "/spv-penilaian" },
          { icon: "calendar", label: "PCP mingguan", color: C.chip.info.fg, bg: C.chip.info.bg, to: "/laporan-pcp-mingguan" },
        ]}
      />

      <SectionHeader title="Pencapaian per area" actionLabel="Detail" onAction={() => router.push("/laporan-pcp" as any)} />
      <Card>
        {bulanan.state === "loading" && areas.length === 0 ? (
          <Skeleton lines={3} />
        ) : areas.length === 0 ? (
          <Empty text="Rincian area belum tersedia." />
        ) : (
          areas.map((a, i) => (
            <View key={a.area} style={[st.areaRow, i === 0 && { borderTopWidth: 0, paddingTop: 2 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={st.areaHead}>
                  <Text style={st.areaName}>{a.area}</Text>
                  {a.pct != null && a.pct < 70 ? (
                    <View style={[st.warnChip, { backgroundColor: C.chip.warning.bg }]}>
                      <Text style={[st.warnChipText, { color: C.chip.warning.fg }]}>DI BAWAH TARGET</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={st.areaSub} numberOfLines={1}>
                  {compactRupiah(a.act)} dari {compactRupiah(a.tgt)} • {a.sdm} SDM
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ProgressBar pct={a.pct} color={pctColor(a.pct)} height={6} />
                </View>
              </View>
              <Text style={[st.areaPct, { color: pctColor(a.pct) }]}>{pctText(a.pct)}</Text>
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="Tim" actionLabel="Rapor" onAction={() => router.push("/spv-penilaian" as any)} />
      <Card>
        {tim === undefined ? (
          <Skeleton lines={3} />
        ) : (
          <>
            <SummaryRow
              icon="users"
              label="Sales on track bulan ini"
              sub={`${timRows.length - onTrack} sales masih di bawah skor 70`}
              value={`${onTrack}/${timRows.length}`}
              tone={onTrack === timRows.length && timRows.length > 0 ? C.status.success.fg : C.status.warning.fg}
              onPress={() => router.push("/spv-penilaian" as any)}
            />
            <SummaryRow
              icon="store"
              label="FU Toko"
              sub={fuToko ? `${fuToko.open} OPEN • ${fuToko.inpg} INPG` : "Memuat…"}
              value={fuToko ? `${fuToko.pending} belum` : "–"}
              tone={fuToko?.pending > 0 ? C.role.telemarketing : C.status.success.fg}
              onPress={() => router.push("/toko-aktif" as any)}
            />
            {timRows.length > 0 ? (
              <SummaryRow
                icon="trend"
                label="Rata-rata skor kunjungan"
                sub="Keterangan, info produk, dan jumlah kunjungan"
                value={String(
                  Math.round(timRows.reduce((s, r) => s + Number(r.skor ?? 0), 0) / timRows.length)
                )}
                onPress={() => router.push("/laporan" as any)}
              />
            ) : null}
          </>
        )}
      </Card>

      <Text style={st.footnote}>
        Angka omset bersumber dari Sheet PCP dan diperbarui otomatis setiap 5 menit. Buka Laporan untuk
        rincian per SDM dan target toko.
      </Text>
    </>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800" },

  big: { fontSize: 32, fontWeight: "900", color: C.ink, marginTop: 10, lineHeight: 38 },
  bigSub: { fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 17 },

  weekRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  weekChip: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 9, paddingVertical: 6, alignItems: "center" },
  weekLabel: { fontSize: 9, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.3 },
  weekPct: { fontSize: 12, fontWeight: "900", marginTop: 1 },

  hint: { fontSize: 10.5, color: C.inkFaint, lineHeight: 15, marginTop: 8 },
  errorTitle: { fontSize: 14, fontWeight: "800", color: C.ink, marginTop: 8 },
  errorSub: { fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 17 },

  areaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  areaHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  areaName: { fontSize: 13, fontWeight: "800", color: C.ink },
  warnChip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  warnChipText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  areaSub: { fontSize: 11.5, color: C.inkMuted, marginTop: 2 },
  areaPct: { fontSize: 15, fontWeight: "900", marginLeft: 10 },

  footnote: { fontSize: 10.5, color: C.inkFaint, lineHeight: 15, paddingHorizontal: 4 },
});
