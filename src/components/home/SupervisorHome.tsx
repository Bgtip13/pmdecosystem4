import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  AlertRow,
  Card,
  CardLabel,
  Empty,
  PrimaryButton,
  SectionHeader,
  Skeleton,
  SummaryRow,
  compactRupiah,
  pctColor,
  pctText,
} from "./ui";
import { pcpTotals, usePcpBulanan } from "./usePcp";
import { theme } from "../../lib/theme";

const { colors: C } = theme;

export default function SupervisorHome() {
  const router = useRouter();
  const ov = useQuery(api.dashboard.supervisorTodayOverview, {}) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;
  const pcp = usePcpBulanan(true);
  const totals = pcpTotals(pcp.data?.rows);

  const t = ov?.totals;
  const items = ((exc?.items ?? []) as any[]).slice(0, 3);
  const need = exc?.summary?.total ?? 0;
  const allClear = exc !== undefined && need === 0;
  const pcpValue = pcp.state === "loading" && !totals ? "…" : totals ? pctText(totals.pct) : "–";

  return (
    <>
      <Card>
        <View style={st.rowBetween}>
          <CardLabel>HARI INI{ov?.day ? ` • ${ov.day}` : ""}</CardLabel>
          <View
            style={[
              st.badge,
              { backgroundColor: allClear ? C.chip.success.bg : exc === undefined ? C.chip.neutral.bg : C.chip.danger.bg },
            ]}
          >
            <Text
              style={[
                st.badgeText,
                {
                  color: allClear
                    ? C.status.success.fg
                    : exc === undefined
                      ? C.inkMuted
                      : C.status.danger.fg,
                },
              ]}
            >
              {allClear ? "SEMUA BERES" : exc === undefined ? "MEMUAT" : `${need} PERLU TINDAKAN`}
            </Text>
          </View>
        </View>

        {t === undefined ? (
          <Skeleton lines={3} />
        ) : !t ? (
          <Empty text="Data hari ini belum tersedia." />
        ) : (
          <>
            <View style={st.bigRow}>
              <Text style={st.big}>{t.salesStarted}</Text>
              <Text style={st.bigOf}>/{t.eligibleSales ?? t.activeSales} sales sudah mulai</Text>
            </View>
            <View style={st.statRow}>
              <View style={st.stat}>
                <Text style={st.statValue}>{t.visitsDone}</Text>
                <Text style={st.statLabel}>KUNJUNGAN</Text>
              </View>
              <View style={st.stat}>
                <Text style={[st.statValue, { color: t.salesBelowTarget > 0 ? C.primary : C.status.success.fg }]}>
                  {t.salesBelowTarget}
                </Text>
                <Text style={st.statLabel}>KURANG TARGET</Text>
              </View>
              <View style={st.stat}>
                <Text style={[st.statValue, { color: t.excusedSales > 0 ? C.role.telemarketing : C.ink }]}>
                  {t.excusedSales}
                </Text>
                <Text style={st.statLabel}>IZIN</Text>
              </View>
            </View>
            <PrimaryButton label="Review & tindak lanjut" icon="shield" onPress={() => router.push("/spv" as any)} />
          </>
        )}
      </Card>

      {exc === undefined ? (
        <Card>
          <CardLabel>PERLU TINDAKAN</CardLabel>
          <Skeleton lines={2} />
        </Card>
      ) : allClear ? (
        <Card style={{ backgroundColor: C.status.success.bg, borderColor: C.status.success.border }}>
          <CardLabel color={C.status.success.fg}>PERLU TINDAKAN</CardLabel>
          <Text style={st.okText}>Tidak ada yang perlu ditindaklanjuti sekarang ✓</Text>
          <Text style={st.okSub}>Kunjungan sales, SPK, dan FU Toko sudah sesuai.</Text>
        </Card>
      ) : (
        <>
          <SectionHeader title="Perlu tindakan" actionLabel="Menu SPV" onAction={() => router.push("/spv" as any)} />
          <Card>
            {items.map((it: any, i: number) => (
              <AlertRow
                key={`${it.kind}-${i}`}
                title={it.userName ? `${it.userName}${it.area ? ` • ${it.area}` : ""}` : it.title}
                desc={it.userName ? `${it.title} — ${it.description ?? ""}` : it.description}
                severity={it.severity === "danger" ? "danger" : "warning"}
                onPress={() => router.push(it.link as any)}
              />
            ))}
            {need > items.length ? (
              <Text style={st.more}>+{need - items.length} pengecualian lain — buka SPV untuk melihat semuanya.</Text>
            ) : null}
          </Card>
        </>
      )}

      <SectionHeader title="Ringkasan" />
      <Card>
        {t === undefined ? (
          <Skeleton lines={4} />
        ) : !t ? (
          <Empty text="Data ringkasan belum tersedia." />
        ) : (
          <>
            <SummaryRow
              icon="users"
              label="Progres kunjungan sales"
              sub={`${t.salesNotStarted} belum mulai • ${t.ongoingVisits} sedang berkunjung`}
              value={`${t.salesStarted}/${t.eligibleSales ?? t.activeSales}`}
              tone={t.salesNotStarted > 0 ? C.status.warning.fg : C.status.success.fg}
              onPress={() => router.push("/live" as any)}
            />
            <SummaryRow
              icon="clipboard"
              label="SPK Admin & piutang"
              sub={`${t.spkAdminPending} SPK • ${t.piutangPending} piutang • ${t.spkAdminInpg + t.piutangInpg} menunggu review`}
              value={`${t.spkAdminPending + t.piutangPending}`}
              tone={t.spkAdminPending + t.piutangPending > 0 ? C.primary : C.status.success.fg}
              onPress={() => router.push("/spk?sec=admin" as any)}
            />
            <SummaryRow
              icon="store"
              label="FU Toko"
              sub={fuToko ? `${fuToko.open} OPEN • ${fuToko.inpg} INPG` : "Memuat…"}
              value={fuToko ? `${fuToko.pending} belum` : "–"}
              tone={fuToko?.pending > 0 ? C.role.telemarketing : C.status.success.fg}
              onPress={() => router.push("/toko-aktif" as any)}
            />
            <SummaryRow
              icon="calendar"
              label="Izin sales hari ini"
              sub={t.locationApprovalPending > 0 ? `${t.locationApprovalPending} approval lokasi menunggu` : "Tidak ada approval lokasi"}
              value={`${t.excusedSales} sales`}
              tone={t.excusedSales > 0 ? C.role.telemarketing : C.inkSoft}
              onPress={() => router.push("/izin" as any)}
            />
            <SummaryRow
              icon="trend"
              label="PCP bulan ini"
              sub={totals ? `${compactRupiah(totals.act)} dari ${compactRupiah(totals.tgt)}` : "Menarik data sheet…"}
              value={pcpValue}
              tone={pctColor(totals?.pct)}
              onPress={() => router.push("/laporan-pcp" as any)}
            />
          </>
        )}
      </Card>

      <Text style={st.footnote}>
        Angka diambil dari kunjungan, SPK Admin, FU Toko, dan PCP bulan berjalan. Data PCP diperbarui
        otomatis tiap 5 menit.
      </Text>
    </>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 },
  bigRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
  big: { fontSize: 42, fontWeight: "900", color: C.ink, lineHeight: 46 },
  bigOf: { fontSize: 13, fontWeight: "700", color: C.inkMuted, marginLeft: 8, marginBottom: 7, flexShrink: 1 },

  statRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  stat: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 11, paddingVertical: 9, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "900", color: C.ink },
  statLabel: { fontSize: 8.5, fontWeight: "800", color: C.inkMuted, marginTop: 2, letterSpacing: 0.4 },

  okText: { fontSize: 14, fontWeight: "800", color: C.status.success.fg, marginTop: 8 },
  okSub: { fontSize: 12, color: C.inkMuted, marginTop: 3, lineHeight: 17 },
  more: { fontSize: 11.5, color: C.inkMuted, marginTop: 10 },

  footnote: { fontSize: 10.5, color: C.inkFaint, lineHeight: 15, paddingHorizontal: 4 },
});
