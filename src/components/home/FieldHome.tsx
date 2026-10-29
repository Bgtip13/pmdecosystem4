import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  AlertRow,
  Card,
  CardLabel,
  Empty,
  ProgressBar,
  PrimaryButton,
  QuickActions,
  SectionHeader,
  Skeleton,
  TARGET_HARIAN,
  fmtDur,
  fmtTime,
  pctText,
  todayRangeWIB,
} from "./ui";
import { theme } from "../../lib/theme";

const { colors: C } = theme;

export default function FieldHome() {
  const router = useRouter();
  const range = useMemo(() => todayRangeWIB(), []);
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const summary = useQuery(api.visits.todaySummary, {}) as any;
  const history = useQuery(api.visits.listHistory, { from: range.from, to: range.to }) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const doneCount = summary?.doneCount ?? 0;
  const pos = doneCount + (ongoing?.visit ? 1 : 0);
  const pct = (pos / TARGET_HARIAN) * 100;
  const reached = pos >= TARGET_HARIAN;
  const color = reached ? C.status.success.fg : C.status.warning.fg;
  const elapsed = ongoing?.visit ? now - ongoing.visit.checkinAt : 0;

  const tooLong = ((exc?.items ?? []) as any[]).filter((it) => it.kind === "ongoing_too_long");
  const rows = ((history ?? []) as any[]).slice(0, 3);

  return (
    <>
      <Card>
        <View style={st.rowBetween}>
          <CardLabel color={ongoing?.visit ? C.status.info.fg : C.inkMuted}>
            {ongoing?.visit ? "KUNJUNGAN BERJALAN" : "TARGET HARI INI"}
          </CardLabel>
          <View style={[st.badge, { backgroundColor: reached ? C.chip.success.bg : C.chip.warning.bg }]}>
            <Text style={[st.badgeText, { color }]}>
              {reached ? "TERCAPAI" : `KURANG ${TARGET_HARIAN - pos}`}
            </Text>
          </View>
        </View>

        {summary === undefined || ongoing === undefined ? (
          <Skeleton lines={3} />
        ) : ongoing?.visit ? (
          <>
            <Text style={st.store} numberOfLines={2}>
              {ongoing.store?.name ?? "Toko"}
            </Text>
            <Text style={st.sub}>
              Sejak {fmtTime(ongoing.visit.checkinAt)} • {fmtDur(elapsed)}
            </Text>
            <View style={{ marginTop: 12 }}>
              <ProgressBar pct={pct} color={color} height={8} />
              <View style={st.rowBetween}>
                <Text style={st.caption}>Target {pos}/{TARGET_HARIAN} toko</Text>
                <Text style={[st.caption, { color, fontWeight: "800" }]}>{pctText(pct)}</Text>
              </View>
            </View>
            <PrimaryButton
              label="Lanjut isi SPK"
              icon="clipboard"
              onPress={() => router.push(`/visit/${ongoing.visit._id}` as any)}
            />
          </>
        ) : (
          <>
            <View style={st.bigRow}>
              <Text style={st.big}>{pos}</Text>
              <Text style={st.bigOf}>/{TARGET_HARIAN} toko</Text>
            </View>
            <ProgressBar pct={pct} color={color} height={10} />
            <Text style={st.helper}>
              {pos === 0
                ? "Belum ada kunjungan. Mulai dari daftar toko di SPK Sales."
                : reached
                  ? "Target harian sudah tercapai. Lanjutkan bila masih ada toko."
                  : `${TARGET_HARIAN - pos} toko lagi untuk mencapai target.`}
            </Text>
            <PrimaryButton
              label="Mulai kunjungan"
              icon="store"
              onPress={() => router.push("/spk-sales" as any)}
            />
          </>
        )}

        {summary ? (
          <View style={st.statRow}>
            <View style={st.stat}>
              <Text style={st.statValue}>{summary.doneCount ?? 0}</Text>
              <Text style={st.statLabel}>SELESAI</Text>
            </View>
            <View style={st.stat}>
              <Text style={st.statValue}>{fmtDur(summary.durMs ?? 0)}</Text>
              <Text style={st.statLabel}>TOTAL DURASI</Text>
            </View>
            <View style={st.stat}>
              <Text style={st.statValue}>{summary.ongoing ? 1 : 0}</Text>
              <Text style={st.statLabel}>BERJALAN</Text>
            </View>
          </View>
        ) : null}
      </Card>

      {tooLong.map((it: any, i: number) => (
        <AlertRow
          key={`${it.kind}-${i}`}
          title={it.title}
          desc={it.description}
          severity="warning"
          onPress={() => (it.visitId ? router.push(`/visit/${it.visitId}` as any) : undefined)}
        />
      ))}

      <QuickActions
        items={[
          { icon: "clipboard", label: "SPK Sales", color: C.role.field, bg: C.chip.info.bg, to: "/spk-sales" },
          { icon: "plus", label: "Toko baru", color: C.primary, bg: C.chip.danger.bg, to: "/toko-baru" },
          { icon: "calendar", label: "Riwayat", color: C.chip.purple.fg, bg: C.chip.purple.bg, to: "/riwayat" },
        ]}
      />

      <SectionHeader title="Kunjungan hari ini" actionLabel="Lihat semua" onAction={() => router.push("/riwayat" as any)} />
      <Card>
        {history === undefined ? (
          <Skeleton lines={3} />
        ) : rows.length === 0 ? (
          <Empty text="Belum ada kunjungan selesai hari ini. Ketuk “SPK Sales” untuk mulai." />
        ) : (
          rows.map((it: any, i: number) => {
            const v = it.visit ?? {};
            const closed = v.metWith === "toko_tutup";
            const ordered = v.ordered === true;
            return (
              <View key={String(v._id ?? i)} style={[st.visitRow, i === 0 && { borderTopWidth: 0, paddingTop: 2 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.visitName} numberOfLines={1}>{it.store?.name ?? "Toko"}</Text>
                  <Text style={st.visitSub} numberOfLines={1}>
                    {fmtTime(v.checkoutAt)} • {fmtDur((v.checkoutAt ?? 0) - (v.checkinAt ?? 0))}
                  </Text>
                </View>
                <View
                  style={[
                    st.chip,
                    { backgroundColor: closed ? C.chip.neutral.bg : ordered ? C.chip.success.bg : C.chip.warning.bg },
                  ]}
                >
                  <Text
                    style={[
                      st.chipText,
                      { color: closed ? C.chip.neutral.fg : ordered ? C.chip.success.fg : C.chip.warning.fg },
                    ]}
                  >
                    {closed ? "Tutup" : ordered ? "Order" : "Tidak order"}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Text style={st.footnote}>
        Target {TARGET_HARIAN} toko/hari. Kunjungan yang masih berjalan dihitung satu, jadi angka bisa
        naik setelah check-out.
      </Text>
    </>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.5 },
  store: { fontSize: 22, fontWeight: "900", color: C.ink, marginTop: 10, lineHeight: 28 },
  sub: { fontSize: 12.5, color: C.inkMuted, marginTop: 3 },
  bigRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6, marginBottom: 10 },
  big: { fontSize: 44, fontWeight: "900", color: C.ink, lineHeight: 48 },
  bigOf: { fontSize: 15, fontWeight: "700", color: C.inkMuted, marginLeft: 6, marginBottom: 6 },
  helper: { fontSize: 12, color: C.inkMuted, lineHeight: 17, marginTop: 9 },
  caption: { fontSize: 11, color: C.inkMuted, marginTop: 6 },

  statRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 10, paddingVertical: 8, alignItems: "center" },
  statValue: { fontSize: 14, fontWeight: "900", color: C.ink },
  statLabel: { fontSize: 8.5, fontWeight: "800", color: C.inkMuted, marginTop: 2, letterSpacing: 0.4 },

  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  visitName: { fontSize: 13, fontWeight: "700", color: C.ink },
  visitSub: { fontSize: 11.5, color: C.inkMuted, marginTop: 2 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  chipText: { fontSize: 10, fontWeight: "800" },

  footnote: { fontSize: 10.5, color: C.inkFaint, lineHeight: 15, paddingHorizontal: 4 },
});
