import IOSSpinner from "./IOSSpinner";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "./AppIcon";
import { A } from "./desktop/tokens";

const GRAY = A.muted;
const RED = A.red;
const GREEN = A.green;
const ORANGE = A.orange;
const VIOLET = A.purple;
const BLUE = A.blue;

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const LEAVE_LABEL: any = {
  sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur",
};
const SCOPE_LABEL: any = { tidak_masuk: "tidak masuk", tidak_keliling: "tidak keliling" };
const LEAVE_TONE: any = {
  sakit: { bg: "#FDF2F2", fg: A.red },
  izin: { bg: "#FFF8EC", fg: A.orange },
  cuti: { bg: A.blueSoft, fg: A.blue },
  dinas_luar: { bg: "#F3EFFC", fg: A.purple },
  libur: { bg: "#F2F4F7", fg: A.inkSoft },
};

export default function TodayCardWeb() {
  const router = useRouter();
  const ov = useQuery(api.dashboard.supervisorTodayOverview, {}) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;

  if (ov === undefined) {
    return <View style={styles.card}><IOSSpinner size="small" color={BLUE} /></View>;
  }
  if (!ov) return null;

  const t = ov.totals;
  const sync = ov.sync;
  const staleHours = sync?.finishedAt ? (Date.now() - sync.finishedAt) / 3600000 : null;
  const syncWarn = !sync?.hasSync || (staleHours !== null && staleHours > 12) || sync?.status === "failed";
  const leaves = (ov.leaves ?? []) as any[];

  const Metric = ({ label, value, tone }: any) => (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone ?? A.ink }]}>{value}</Text>
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
          <AppIcon name="trend" size={14} color={BLUE} />
          <Text style={styles.title}>Hari Ini</Text>
          <Text style={styles.sub}>{ov.day}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.metricGrid}>
            <Metric label="Sales aktif" value={`${t.salesStarted}/${t.eligibleSales ?? t.activeSales}`} tone={BLUE} />
            <Metric label="Kunjungan" value={t.visitsDone} tone={GREEN} />
            <Metric label="SPK admin" value={t.spkAdminPending} tone={t.spkAdminPending > 0 ? RED : GREEN} />
            <Metric label="Piutang" value={t.piutangPending} tone={t.piutangPending > 0 ? ORANGE : GREEN} />
          </View>

          <Line label="Belum mulai" value={`${t.salesNotStarted} sales`} tone={t.salesNotStarted > 0 ? ORANGE : null} />
          <Line label="Kurang target" value={`${t.salesBelowTarget} sales`} tone={t.salesBelowTarget > 0 ? RED : null} />
          <Line label="Izin hari ini" value={`${t.excusedSales} sales`} />
          <Line label="Approval lokasi" value={`${t.locationApprovalPending} menunggu`} tone={t.locationApprovalPending > 0 ? BLUE : null} />
          <Line label="Notif belum dibaca" value={String(t.unreadNotifications)} />
          <Line
            label="Piutang disinkron"
            value={
              sync?.hasSync
                ? `${fmtTime(sync.finishedAt ?? sync.requestedAt)}${sync.requestedByName ? ` • ${sync.requestedByName}` : ""}`
                : "belum pernah"
            }
            tone={syncWarn ? RED : null}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btn} onPress={() => router.push("/live")}>
              <AppIcon name="eye" size={13} color={BLUE} style={{ marginRight: 5 }} />
              <Text style={styles.btnText}>Live Monitor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={() => router.push("/spv")}>
              <AppIcon name="users" size={13} color={BLUE} style={{ marginRight: 5 }} />
              <Text style={styles.btnText}>Menu SPV</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ===== PERLU TINDAKAN ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="warn" size={14} color={ORANGE} />
          <Text style={styles.title}>Perlu Tindakan</Text>
          <Text style={styles.sub}>{exc?.summary?.total ?? 0}</Text>
        </View>
        <View style={styles.body}>
          {exc === undefined ? (
            <IOSSpinner size="small" color={BLUE} />
          ) : (exc?.items ?? []).length === 0 ? (
            <Text style={styles.ok}>Semua beres hari ini</Text>
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
                    <Text style={[styles.sevText, { color: bad ? A.red : A.orange }]}>
                      {bad ? "Kritis" : "Perhatian"}
                    </Text>
                  </View>
                  <AppIcon name="chevron" size={14} color={A.muted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>

      {/* ===== IZIN HARI INI ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="calendar" size={14} color={VIOLET} />
          <Text style={styles.title}>Izin Hari Ini</Text>
          <Text style={styles.sub}>{leaves.length}</Text>
        </View>
        <View style={styles.body}>
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: A.surface, borderRadius: 10, borderWidth: 1, borderColor: A.border, overflow: "hidden" },
  head: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: A.headerRow,
    borderBottomWidth: 1, borderBottomColor: A.border,
  },
  title: { fontSize: 11.5, fontWeight: "800", color: A.inkSoft, marginLeft: 7, flex: 1, textTransform: "uppercase", letterSpacing: 0.5 },
  sub: { fontSize: 10.5, color: GRAY, fontWeight: "700" },
  body: { padding: 12 },

  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  metricBox: {
    flexBasis: 140, flexGrow: 1, minWidth: 120,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
    borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10,
  },
  metricLabel: { fontSize: 9.5, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  metricValue: { fontSize: 19, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] },

  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: A.borderSoft },
  lineLabel: { fontSize: 11.5, color: GRAY },
  lineValue: { fontSize: 11.5, color: A.ink, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 10, fontVariant: ["tabular-nums"] },

  btnRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center",
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.blueBorder,
    borderRadius: 8, paddingVertical: 9,
  },
  btnText: { color: A.blue, fontWeight: "700", fontSize: 11.5 },
  btnWide: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.blueBorder,
    borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 10,
  },
  btnWideText: { color: A.blue, fontWeight: "700", fontSize: 11.5 },
  ok: { fontSize: 11.5, color: GREEN, fontWeight: "700" },

  excRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 8, paddingHorizontal: 9,
    borderRadius: 2, marginTop: 6,
    borderWidth: 1, borderLeftWidth: 3,
  },
  excBad: { backgroundColor: "#FDF2F2", borderColor: "#F3D6D6", borderLeftColor: A.red },
  excWarn: { backgroundColor: "#FFF8EC", borderColor: "#F0E0C0", borderLeftColor: A.orange },
  excTitle: { fontSize: 11.5, fontWeight: "700", color: A.ink },
  excDesc: { fontSize: 11, color: GRAY, marginTop: 1 },
  sevChip: { borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 6 },
  sevBad: { backgroundColor: "#FBE4E4" },
  sevWarn: { backgroundColor: "#FBEBCF" },
  sevText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },

  leaveRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderTopWidth: 1, borderTopColor: A.borderSoft },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 9 },
  avatarText: { fontSize: 12, fontWeight: "800" },
  leaveName: { fontSize: 11.5, fontWeight: "700", color: A.ink },
  leaveNote: { fontSize: 11, color: GRAY, marginTop: 1 },
  chip: { borderRadius: 2, paddingHorizontal: 7, paddingVertical: 4, marginLeft: 8, maxWidth: 160 },
  chipText: { fontSize: 9.5, fontWeight: "800" },
});
