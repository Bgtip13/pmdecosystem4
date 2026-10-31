import { useMemo } from "react";
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
  fmtTime,
  pctText,
  todayRangeWIB,
} from "./ui";
import { theme } from "../../lib/theme";

const { colors: C } = theme;

export default function TeleHome({ viewer }: { viewer: any }) {
  const router = useRouter();
  const range = useMemo(() => todayRangeWIB(), []);
  const piuFu = useQuery(api.piutang.todayByArea, {}) as any;
  const ordFu = useQuery(api.orderFollowups.todayByArea, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;
  const history = useQuery(api.visits.listHistory, { from: range.from, to: range.to }) as any;

  const area = String(viewer?.area ?? "").trim().toUpperCase();
  const piu = ((piuFu ?? []) as any[]).find((r) => String(r.area ?? "").trim().toUpperCase() === area);
  const ord = ((ordFu ?? []) as any[]).find((r) => String(r.area ?? "").trim().toUpperCase() === area);

  const piuPending = Number(piu?.pending ?? 0);
  const piuDone = Number(piu?.done ?? 0);
  const ordPending = Number(ord?.pending ?? 0);
  const ordDone = Number(ord?.done ?? 0);

  const pending = piuPending + ordPending;
  const done = piuDone + ordDone;
  const total = pending + done;
  const pct = total > 0 ? (done / total) * 100 : 100;
  const loading = piuFu === undefined || ordFu === undefined;
  const allDone = !loading && pending === 0;
  const color = allDone ? C.status.success.fg : C.status.warning.fg;

  const visits = ((history ?? []) as any[]).slice(0, 3);

  return (
    <>
      <Card>
        <View style={st.rowBetween}>
          <CardLabel>FOLLOW-UP HARI INI{area ? ` • ${area}` : ""}</CardLabel>
          <View style={[st.badge, { backgroundColor: allDone ? C.chip.success.bg : C.chip.warning.bg }]}>
            <Text style={[st.badgeText, { color }]}>{allDone ? "BERES" : "PERLU DIKERJAKAN"}</Text>
          </View>
        </View>

        {loading ? (
          <Skeleton lines={3} />
        ) : (
          <>
            <View style={st.bigRow}>
              <Text style={[st.big, { color }]}>{pending}</Text>
              <Text style={st.bigOf}>tugas belum selesai</Text>
            </View>
            <ProgressBar pct={pct} color={color} height={9} />
            <Text style={st.helper}>
              {total === 0
                ? "Belum ada tugas follow-up untuk area ini hari ini."
                : allDone
                  ? `Semua ${total} tugas hari ini sudah selesai ✓`
                  : `${done} dari ${total} tugas sudah selesai • ${pctText(pct)}`}
            </Text>

            <View style={st.split}>
              <View style={st.splitBox}>
                <Text style={st.splitLabel}>PIUTANG</Text>
                <Text style={[st.splitValue, { color: piuPending > 0 ? C.primary : C.status.success.fg }]}>
                  {piuPending}
                </Text>
                <Text style={st.splitSub}>{piuDone} selesai</Text>
              </View>
              <View style={st.splitBox}>
                <Text style={st.splitLabel}>SPK SALES H+1</Text>
                <Text style={[st.splitValue, { color: ordPending > 0 ? C.role.telemarketing : C.status.success.fg }]}>
                  {ordPending}
                </Text>
                <Text style={st.splitSub}>{ordDone} selesai</Text>
              </View>
            </View>

            <PrimaryButton
              label={allDone ? "Buka SPK Admin" : "Kerjakan tugas"}
              icon="clipboard"
              tone={allDone ? C.inkSoft : C.primary}
              onPress={() => router.push("/spk?sec=admin" as any)}
            />
          </>
        )}
      </Card>

      <QuickActions
        items={[
          { icon: "clipboard", label: "SPK Admin", color: C.role.telemarketing, bg: C.chip.warning.bg, to: "/spk?sec=admin" },
          { icon: "calendar", label: "Riwayat", color: C.chip.purple.fg, bg: C.chip.purple.bg, to: "/riwayat" },
          { icon: "store", label: "FU Toko", color: C.chip.success.fg, bg: C.chip.success.bg, to: "/toko-aktif" },
          { icon: "star", label: "Nilai saya", color: C.chip.purple.fg, bg: C.chip.purple.bg, to: "/penilaian" },
        ]}
      />

      <SectionHeader title="Kunjungan area hari ini" actionLabel="Lihat semua" onAction={() => router.push("/riwayat" as any)} />
      <Card>
        {history === undefined ? (
          <Skeleton lines={3} />
        ) : visits.length === 0 ? (
          <Empty text={`Belum ada kunjungan sales di area ${area || "ini"} hari ini.`} />
        ) : (
          visits.map((it: any, i: number) => (
            <View key={String(it.visit?._id ?? i)} style={[st.visitRow, i === 0 && { borderTopWidth: 0, paddingTop: 2 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.visitName} numberOfLines={1}>{it.store?.name ?? "Toko"}</Text>
                <Text style={st.visitSub} numberOfLines={1}>
                  {it.salesName || "–"} • {fmtTime(it.visit?.checkoutAt ?? it.visit?.checkinAt)}
                </Text>
              </View>
              <Text style={st.visitTime}>{fmtTime(it.visit?.checkinAt)}</Text>
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="FU Toko bulan ini" actionLabel="Buka" onAction={() => router.push("/toko-aktif" as any)} />
      <Card>
        {fuToko === undefined ? (
          <Skeleton lines={3} />
        ) : !fuToko ? (
          <Empty text="Data FU Toko belum tersedia." />
        ) : (
          <>
            <View style={st.triRow}>
              <View style={st.tri}>
                <Text style={[st.triValue, { color: fuToko.open > 0 ? C.primary : C.status.success.fg }]}>
                  {fuToko.open}
                </Text>
                <Text style={st.triLabel}>OPEN</Text>
              </View>
              <View style={st.tri}>
                <Text style={[st.triValue, { color: fuToko.inpg > 0 ? C.role.telemarketing : C.status.success.fg }]}>
                  {fuToko.inpg}
                </Text>
                <Text style={st.triLabel}>INPG</Text>
              </View>
              <View style={st.tri}>
                <Text style={[st.triValue, { color: C.status.success.fg }]}>{fuToko.clsd}</Text>
                <Text style={st.triLabel}>CLSD</Text>
              </View>
            </View>
            <Text style={st.helper}>
              {fuToko.pending > 0
                ? `${fuToko.pending} dari ${fuToko.total} toko belum CLSD.`
                : `Semua ${fuToko.total} toko sudah CLSD 👍`}
            </Text>
            <PrimaryButton
              label={fuToko.pending > 0 ? "Lanjutkan FU Toko" : "Lihat riwayat FU Toko"}
              icon="store"
              tone={fuToko.pending > 0 ? C.role.telemarketing : C.inkSoft}
              onPress={() =>
                router.push((fuToko.pending > 0 ? "/toko-aktif" : "/fu-toko-riwayat") as any)
              }
            />
          </>
        )}
      </Card>

      <Text style={st.footnote}>
        Piutang dan SPK Sales H+1 dihitung per tugas unik hari ini, bukan per baris yang muncul ulang.
      </Text>
    </>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 },
  bigRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6, marginBottom: 10 },
  big: { fontSize: 44, fontWeight: "900", lineHeight: 48 },
  bigOf: { fontSize: 13, fontWeight: "700", color: C.inkMuted, marginLeft: 8, marginBottom: 7 },
  helper: { fontSize: 12, color: C.inkMuted, lineHeight: 17, marginTop: 9 },

  split: { flexDirection: "row", gap: 8, marginTop: 12 },
  splitBox: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 11, paddingVertical: 9, alignItems: "center" },
  splitLabel: { fontSize: 8.5, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.4 },
  splitValue: { fontSize: 20, fontWeight: "900", marginTop: 2 },
  splitSub: { fontSize: 10, color: C.inkMuted, marginTop: 1 },

  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  visitName: { fontSize: 13, fontWeight: "700", color: C.ink },
  visitSub: { fontSize: 11.5, color: C.inkMuted, marginTop: 2 },
  visitTime: { fontSize: 11, fontWeight: "700", color: C.inkFaint, marginLeft: 8 },

  triRow: { flexDirection: "row", gap: 8 },
  tri: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 11, paddingVertical: 9, alignItems: "center" },
  triValue: { fontSize: 20, fontWeight: "900" },
  triLabel: { fontSize: 8.5, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.4, marginTop: 1 },

  footnote: { fontSize: 10.5, color: C.inkFaint, lineHeight: 15, paddingHorizontal: 4 },
});
