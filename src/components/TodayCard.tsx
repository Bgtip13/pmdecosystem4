import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "./AppIcon";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const VIOLET = "#6D28D9";
const BLUE = "#175CD3";

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const LEAVE_LABEL: any = {
  sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur",
};
const SCOPE_LABEL: any = { tidak_masuk: "tidak masuk", tidak_keliling: "tidak keliling" };
const LEAVE_TONE: any = {
  sakit: { bg: "#FEF3F2", fg: "#B42318" },
  izin: { bg: "#FFFAEB", fg: "#B54708" },
  cuti: { bg: "#EFF8FF", fg: "#175CD3" },
  dinas_luar: { bg: "#EDE9FE", fg: "#5B21B6" },
  libur: { bg: "#F2F4F7", fg: "#475467" },
};
// ← BARU: latar lembut untuk kotak angka, mengikuti warnanya
const TONE_BG: any = { [GREEN]: "#ECFDF3", [RED]: "#FEF3F2", [ORANGE]: "#FFFAEB", [BLUE]: "#EFF8FF" };

export default function TodayCard() {
  const router = useRouter();
  const ov = useQuery(api.dashboard.supervisorTodayOverview, {}) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;

  if (ov === undefined) {
    return <View style={styles.card}><ActivityIndicator size="small" color={RED} /></View>;
  }
  if (!ov) return null;

  const t = ov.totals;
  const sync = ov.sync;
  const staleHours = sync?.finishedAt ? (Date.now() - sync.finishedAt) / 3600000 : null;
  const syncWarn = !sync?.hasSync || (staleHours !== null && staleHours > 12) || sync?.status === "failed";
  const leaves = (ov.leaves ?? []) as any[];

  const Metric = ({ label, value, tone }: any) => (
    <View style={[styles.metricBox, { backgroundColor: TONE_BG[tone] ?? "#FAFAFB" }]}>
      <Text style={[styles.metricValue, { color: tone ?? "#111" }]}>{value}</Text>
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
          <AppIcon name="trend" size={16} color={RED} />
          <Text style={styles.title}>Hari Ini</Text>
          <Text style={styles.sub}>{ov.day}</Text>
        </View>

        {/* ← angka jadi kotak 2×2, warnanya ikut status */}
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
            <AppIcon name="eye" size={14} color={RED} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Live Monitor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => router.push("/spv")}>
            <AppIcon name="users" size={14} color={RED} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Menu SPV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== PERLU TINDAKAN ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="warn" size={16} color={ORANGE} />
          <Text style={styles.title}>Perlu Tindakan</Text>
          <Text style={styles.sub}>{exc?.summary?.total ?? 0}</Text>
        </View>

        {exc === undefined ? (
          <ActivityIndicator size="small" color={RED} />
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
                  <Text style={[styles.sevText, { color: bad ? "#B42318" : "#B54708" }]}>
                    {bad ? "Kritis" : "Perhatian"}
                  </Text>
                </View>
                <AppIcon name="chevron" size={15} color="#98A2B3" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ===== IZIN HARI INI ===== */}
      <View style={styles.card}>
        <View style={styles.head}>
          <AppIcon name="calendar" size={16} color={VIOLET} />
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

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#EEF0F3" },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 15, fontWeight: "800", color: "#111", marginLeft: 8, flex: 1 },
  sub: { fontSize: 12, color: GRAY, fontWeight: "700" },

  // ← angka: 2 kolom, ada latar lembut
  metricGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  metricBox: { width: "48%", marginHorizontal: "1%", borderRadius: 12, paddingVertical: 10, alignItems: "center", marginBottom: 8 },
  metricValue: { fontSize: 20, fontWeight: "900" },
  metricLabel: { fontSize: 11, color: GRAY, marginTop: 2, textAlign: "center", fontWeight: "600" },

  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#F4F5F7" },
  lineLabel: { fontSize: 13, color: GRAY },
  lineValue: { fontSize: 13, color: "#111", fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 10 },

  btnRow: { flexDirection: "row", marginTop: 12 },
  btn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", backgroundColor: "#FFF1F0", borderRadius: 10, paddingVertical: 11, marginRight: 6 },
  btnText: { color: RED, fontWeight: "800", fontSize: 13 },
  btnWide: { backgroundColor: "#F5F3FF", borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 10 },
  btnWideText: { color: VIOLET, fontWeight: "800", fontSize: 13 },
  ok: { fontSize: 13, color: GREEN, fontWeight: "700" },

  // ← tiap kendala jadi kotak berwarna + label Kritis/Perhatian
  excRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, marginTop: 6, borderWidth: 1 },
  excBad: { backgroundColor: "#FEF3F2", borderColor: "#FECDCA" },
  excWarn: { backgroundColor: "#FFFAEB", borderColor: "#FEDF89" },
  excTitle: { fontSize: 13, fontWeight: "800", color: "#111" },
  excDesc: { fontSize: 12, color: GRAY, marginTop: 1 },
  sevChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 6 },
  sevBad: { backgroundColor: "#FEE4E2" },
  sevWarn: { backgroundColor: "#FEF0C7" },
  sevText: { fontSize: 10, fontWeight: "800" },

  leaveRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#F4F5F7" },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 10 },
  avatarText: { fontSize: 14, fontWeight: "900" },
  leaveName: { fontSize: 13, fontWeight: "800", color: "#111" },
  leaveNote: { fontSize: 12, color: GRAY, marginTop: 1 },
  chip: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8, maxWidth: 160 },
  chipText: { fontSize: 10, fontWeight: "800" },
});
