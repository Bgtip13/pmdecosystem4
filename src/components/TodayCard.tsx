import IOSSpinner from "./IOSSpinner";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./AppText";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "./AppIcon";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const LEAVE_LABEL: any = {
  sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur",
};
const SCOPE_LABEL: any = { tidak_masuk: "tidak masuk", tidak_keliling: "tidak keliling" };
const leaveTone = (C: Colors): any => ({
  sakit: { bg: C.status.danger.bg, fg: C.status.danger.fg },
  izin: { bg: C.status.warning.bg, fg: C.status.warning.fg },
  cuti: { bg: C.status.info.bg, fg: C.status.info.fg },
  dinas_luar: { bg: C.chip.purple.bg, fg: C.chip.purple.fg },
  libur: { bg: C.status.neutral.bg, fg: C.ink2 },
});

export default function TodayCard() {
  const C = useColors();
  const LEAVE_TONE = leaveTone(C);
  const TONE_BG: any = {
    [C.status.success.fg]: C.status.success.bg,
    [C.status.danger.fg]: C.status.danger.bg,
    [C.status.warning.fg]: C.status.warning.bg,
    [C.status.info.fg]: C.status.info.bg,
  };
  const styles = useStyles(createStyles);
  const router = useRouter();
  const ov = useQuery(api.dashboard.supervisorTodayOverview, {}) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;

  if (ov === undefined) {
    return <View style={styles.card}><IOSSpinner size="small" color={C.primary} /></View>;
  }
  if (!ov) return null;

  const t = ov.totals;
  const sync = ov.sync;
  const staleHours = sync?.finishedAt ? (Date.now() - sync.finishedAt) / 3600000 : null;
  const syncWarn = !sync?.hasSync || (staleHours !== null && staleHours > 12) || sync?.status === "failed";
  const leaves = (ov.leaves ?? []) as any[];

  const Metric = ({ label, value, tone }: any) => (
    <View style={[styles.metricBox, { backgroundColor: TONE_BG[tone] ?? C.surfaceAlt5 }]}>
      <Text style={[styles.metricValue, { color: tone ?? C.ink0 }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );

  const Line = ({ label, value, tone }: any) => (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );

  return (
    <>
      {/* ===== HARI INI ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="trend" size={16} color={C.primary} />
          <Text style={styles.title}>Hari Ini</Text>
          <Text style={styles.sub}>{ov.day}</Text>
        </View>

        {/* ← angka jadi kotak 2×2, warnanya ikut status */}
        <View style={styles.metricGrid}>
          <Metric label="Sales aktif" value={`${t.salesStarted}/${t.eligibleSales ?? t.activeSales}`} tone={C.status.info.fg} />
          <Metric label="Kunjungan" value={t.visitsDone} tone={C.status.success.fg} />
          <Metric label="SPK admin" value={t.spkAdminPending} tone={t.spkAdminPending > 0 ? C.status.danger.fg : C.status.success.fg} />
          <Metric label="Piutang" value={t.piutangPending} tone={t.piutangPending > 0 ? C.status.warning.fg : C.status.success.fg} />
        </View>

        <Line label="Belum mulai" value={`${t.salesNotStarted} sales`} tone={t.salesNotStarted > 0 ? C.status.warning.fg : null} />
        <Line label="Kurang target" value={`${t.salesBelowTarget} sales`} tone={t.salesBelowTarget > 0 ? C.status.danger.fg : null} />
        <Line label="Izin hari ini" value={`${t.excusedSales} sales`} />
        <Line label="Approval lokasi" value={`${t.locationApprovalPending} menunggu`} tone={t.locationApprovalPending > 0 ? C.status.info.fg : null} />
        <Line label="Notif belum dibaca" value={String(t.unreadNotifications)} />
        <Line
          label="Piutang disinkron"
          value={
            sync?.hasSync
              ? `${fmtTime(sync.finishedAt ?? sync.requestedAt)}${sync.requestedByName ? ` • ${sync.requestedByName}` : ""}`
              : "belum pernah"
          }
          tone={syncWarn ? C.status.danger.fg : null}
        />

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btn} onPress={() => router.push("/live")}>
            <AppIcon name="eye" size={14} color={C.primary} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Live Monitor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => router.push("/spv")}>
            <AppIcon name="users" size={14} color={C.primary} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Menu SPV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== PERLU TINDAKAN ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="warn" size={16} color={C.status.warning.fg} />
          <Text style={styles.title}>Perlu Tindakan</Text>
          <Text style={styles.sub}>{exc?.summary?.total ?? 0}</Text>
        </View>

        {exc === undefined ? (
          <IOSSpinner size="small" color={C.primary} />
        ) : (exc?.items ?? []).length === 0 ? (
          <Text style={styles.ok}>✅ Semua beres hari ini</Text>
        ) : (
          (exc.items as any[]).slice(0, 8).map((it, i) => {
            const bad = it.severity === "danger";
            return (
              <TouchableOpacity
                key={i}
                style={[styles.excRow, bad ? styles.excBad : styles.excWarn]}
                onPress={() => router.push(it.link as any)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.excTitle} numberOfLines={1}>
                    {it.userName ? `${it.userName}${it.area ? ` • ${it.area}` : ""}` : it.title}
                  </Text>
                  <Text style={styles.excDesc} numberOfLines={2}>
                    {it.userName ? `${it.title}${it.description ? ` — ${it.description}` : ""}` : it.description}
                  </Text>
                </View>
                <View style={[styles.sevChip, bad ? styles.sevBad : styles.sevWarn]}>
                  <Text style={[styles.sevText, { color: bad ? C.status.danger.fg : C.status.warning.fg }]}>
                    {bad ? "Kritis" : "Perhatian"}
                  </Text>
                </View>
                <AppIcon name="chevron" size={15} color={C.inkFaint} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ===== IZIN HARI INI ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="calendar" size={16} color={C.violetDark} />
          <Text style={styles.title}>Izin Hari Ini</Text>
          <Text style={styles.sub}>{leaves.length}</Text>
        </View>

        {leaves.length === 0 ? (
          <Text style={styles.ok}>Tidak ada sales izin hari ini.</Text>
        ) : (
          leaves.map((l) => {
            const tone = LEAVE_TONE[l.type] ?? LEAVE_TONE.izin;
            return (
              <View key={String(l.salesId)} style={styles.leaveRow}>
                <View style={[styles.avatar, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.avatarText, { color: tone.fg }]}>
                    {(l.name || "?").trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaveName} numberOfLines={1}>
                    {l.name}{l.area ? ` • ${l.area}` : ""}
                  </Text>
                  {l.note ? <Text style={styles.leaveNote} numberOfLines={2}>{l.note}</Text> : null}
                </View>
                <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.chipText, { color: tone.fg }]}>
                    {LEAVE_LABEL[l.type] ?? l.type} · {SCOPE_LABEL[l.scope] ?? l.scope}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <TouchableOpacity style={styles.btnWide} onPress={() => router.push("/izin")}>
          <Text style={styles.btnWideText}>Kelola Izin Sales</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.divider },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 15, fontWeight: "800", color: C.ink0, marginLeft: 8, flex: 1 },
  sub: { fontSize: 12, color: C.inkMuted, fontWeight: "700" },

  // ← angka: 2 kolom, ada latar lembut
  metricGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  metricBox: { width: "48%", marginHorizontal: "1%", borderRadius: 12, paddingVertical: 10, alignItems: "center", marginBottom: 8 },
  metricValue: { fontSize: 20, fontWeight: "900" },
  metricLabel: { fontSize: 11, color: C.inkMuted, marginTop: 2, textAlign: "center", fontWeight: "600" },

  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.surfaceAlt4 },
  lineLabel: { fontSize: 13, color: C.inkMuted },
  lineValue: { fontSize: 13, color: C.ink0, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 10 },

  btnRow: { flexDirection: "row", marginTop: 12 },
  btn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", backgroundColor: C.primaryTint2, borderRadius: 10, paddingVertical: 11, marginRight: 6 },
  btnText: { color: C.primary, fontWeight: "800", fontSize: 13 },
  btnWide: { backgroundColor: C.purpleSoft2, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 10 },
  btnWideText: { color: C.violetDark, fontWeight: "800", fontSize: 13 },
  ok: { fontSize: 13, color: C.status.success.fg, fontWeight: "700" },

  // ← tiap kendala jadi kotak berwarna + label Kritis/Perhatian
  excRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, marginTop: 6, borderWidth: 1 },
  excBad: { backgroundColor: C.status.danger.bg, borderColor: C.status.danger.border },
  excWarn: { backgroundColor: C.status.warning.bg, borderColor: C.status.warning.border },
  excTitle: { fontSize: 13, fontWeight: "800", color: C.ink0 },
  excDesc: { fontSize: 12, color: C.inkMuted, marginTop: 1 },
  sevChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 6 },
  sevBad: { backgroundColor: C.primarySoft },
  sevWarn: { backgroundColor: C.chip.warning.bg },
  sevText: { fontSize: 10, fontWeight: "800" },

  leaveRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.surfaceAlt4 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  avatarText: { fontSize: 14, fontWeight: "900" },
  leaveName: { fontSize: 13, fontWeight: "800", color: C.ink0 },
  leaveNote: { fontSize: 12, color: C.inkMuted, marginTop: 1 },
  chip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8, maxWidth: 160 },
  chipText: { fontSize: 10, fontWeight: "800" },
});
