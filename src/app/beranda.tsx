import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";

const GRAY = "#667085";
const RED = "#D92D20";
const BLUE = "#1D4ED8";
const VIOLET = "#6D28D9";
const GREEN = "#067647";
const ORANGE = "#B54708";

const ROLE_LABEL: any = { field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor" };
const HASIL: any = {
  janji_bayar: { label: "Janji bayar", bg: "#FEF0C7", tx: "#B54708" },
  lunas: { label: "Lunas", bg: "#DCFAE6", tx: "#067647" },
  cicil: { label: "Cicil", bg: "#E0F2FE", tx: "#026AA2" },
};
const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };

// Cache hasil fetch laporan 5 menit (hindari fetch Google Sheets tiap dashboard dibuka)
let pcpCache: { at: number; data: any } | null = null;
let eksCache: { at: number; data: any } | null = null;

function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}
const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));

export default function Beranda() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const summary = useQuery(api.visits.todaySummary) as any;
  const pending = useQuery(api.piutang.pendingCount) as any;
  const fetchPcp = useAction(api.laporan.fetchPcpBulanan);
  const fetchEks = useAction(api.laporan.fetchEkspedisi);

  const role = viewer?.role;
  const isField = role === "field";
  const isTele = role === "telemarketing";
  const isSuper = role === "supervisor";
  const usesPiutang = isTele || isSuper;

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayEnd = dayStart + 86400000 - 1;

  const approvals = useQuery(api.locationRequests.listPendingRequests, isSuper ? undefined : "skip") as any;
  const live = useQuery(api.visits.listLiveSales, isSuper ? undefined : "skip") as any;
  const doneHist = useQuery(api.piutang.listDone, usesPiutang ? undefined : "skip") as any;
  const visitHist = useQuery(api.visits.listHistory, isTele ? { from: dayStart, to: dayEnd } : "skip") as any;

  // ==== Fetch laporan (cache 5 mnt) untuk panel Pencapaian & Ekspedisi ====
  const [pcp, setPcp] = useState<any>(null);
  const [pcpState, setPcpState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [eks, setEks] = useState<any>(null);
  const [eksState, setEksState] = useState<"idle" | "loading" | "done" | "err">("idle");

  useEffect(() => {
    if (!viewer) return;
    if (pcpCache && Date.now() - pcpCache.at < 5 * 60 * 1000) {
      setPcp(pcpCache.data);
      setPcpState("done");
      return;
    }
    setPcpState("loading");
    fetchPcp()
      .then((r: any) => {
        pcpCache = { at: Date.now(), data: r };
        setPcp(r);
        setPcpState("done");
      })
      .catch(() => setPcpState("err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
    if (eksCache && Date.now() - eksCache.at < 5 * 60 * 1000) {
      setEks(eksCache.data);
      setEksState("done");
      return;
    }
    setEksState("loading");
    fetchEks()
      .then((r: any) => {
        eksCache = { at: Date.now(), data: r };
        setEks(r);
        setEksState("done");
      })
      .catch(() => setEksState("err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const accent = isField ? RED : isTele ? BLUE : VIOLET;
  const areaLabel = viewer.area ?? "Semua Area";
  const fmtTime = (ms: number | null) =>
    ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

  // ==== Kartu stat ====
  const statCards: any[] = [];
  if (isField) {
    statCards.push({ color: GREEN, value: summary ? String(summary.doneCount ?? 0) : "–", label: "Kunjungan selesai" });
    statCards.push({ color: accent, value: summary ? fmtDur(summary.durMs ?? 0) : "–", label: "Durasi hari ini" });
  }
  if (isTele) {
    statCards.push({ color: BLUE, value: pending ? String(pending.count ?? 0) : "–", label: "Follow-up belum dikerjakan" });
    statCards.push({ color: GREEN, value: visitHist ? String((visitHist ?? []).length) : "–", label: "Kunjungan area hari ini" });
  }
  if (isSuper) {
    statCards.push({ color: VIOLET, value: approvals ? String(approvals.length ?? 0) : "–", label: "Persetujuan lokasi" });
    statCards.push({ color: BLUE, value: pending ? String(pending.count ?? 0) : "–", label: "Follow-up piutang" });
    statCards.push({ color: GREEN, value: live ? String(live.filter((s: any) => s.state === "visit").length) : "–", label: "Sales di lapangan" });
  }

  // ==== Rincian follow-up piutang (hari ini) ====
  const doneToday = usesPiutang ? (doneHist ?? []).filter((it: any) => it.task.doneAt >= dayStart && it.task.doneAt <= dayEnd) : [];
  const hasilCount: any = {};
  for (const it of doneToday) hasilCount[it.task.hasil] = (hasilCount[it.task.hasil] || 0) + 1;

  // ==== Rincian pencapaian bulanan ====
  const pcpRows = pcp?.rows ?? null;

  const SectionCard = ({ title, children }: any) => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const Row = ({ left, right, rightColor }: any) => (
    <View style={styles.row}>
      <Text style={styles.rowLeft}>{left}</Text>
      <Text style={[styles.rowRight, rightColor ? { color: rightColor } : null]}>{right}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
        <Text style={styles.greet}>Halo, {viewer.name} 👋</Text>
        <Text style={styles.meta}>{ROLE_LABEL[role] ?? role} • {areaLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        {ongoing?.visit ? (
          <TouchableOpacity style={styles.banner} onPress={() => router.push(`/visit/${ongoing.visit._id}`)}>
            <Text style={styles.bannerTitle}>⏱ Kunjungan berjalan</Text>
            <Text style={styles.bannerText}>{ongoing.store?.name} — sejak {fmtTime(ongoing.visit.checkinAt)}. Ketuk untuk lanjut →</Text>
          </TouchableOpacity>
        ) : null}

        {statCards.length > 0 ? (
          <View style={styles.statRow}>
            {statCards.map((c, i) => (
              <View key={i} style={[styles.statCard, { borderTopColor: c.color }]}>
                <Text style={[styles.statValue, { color: c.color }]}>{c.value}</Text>
                <Text style={styles.statLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ===== PROGRES KUNJUNGAN ===== */}
        {isSuper ? (
          <SectionCard title="🟢 Progres Kunjungan Sales">
            {live === undefined ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
            ) : (live ?? []).length === 0 ? (
              <Text style={styles.meta}>Belum ada data sales hari ini.</Text>
            ) : (
              (live ?? []).map((s: any) => (
                <View key={s.sales._id} style={styles.row}>
                  <View style={[styles.dot, s.state === "visit" ? styles.dotOn : styles.dotOff]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveName}>{s.sales.name}</Text>
                    <Text style={styles.liveInfo} numberOfLines={1}>
                      {s.state === "visit"
                        ? `📍 ${s.storeName ?? "Kunjungan"} • ${s.checkinAt ? fmtTime(s.checkinAt) : ""}`
                        : `✅ ${s.todayDoneCount} kunjungan selesai`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </SectionCard>
        ) : null}

        {isField ? (
          <SectionCard title="🏪 Progres Kunjungan Hari Ini">
            <Row left="Kunjungan selesai" right={summary ? String(summary.doneCount ?? 0) : "–"} rightColor={GREEN} />
            <Row left="Total durasi" right={summary ? fmtDur(summary.durMs ?? 0) : "–"} rightColor={accent} />
            <Row left="Kunjungan berjalan" right={ongoing?.visit ? "1 aktif" : "Tidak ada"} rightColor={ongoing?.visit ? RED : GRAY} />
            <Text style={styles.hint}>Daftar toko kunjungan ada di tab SPK → SPK Sales.</Text>
          </SectionCard>
        ) : null}

        {isTele ? (
          <SectionCard title="🏪 Progres Kunjungan Area (hari ini)">
            {visitHist === undefined ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
            ) : (visitHist ?? []).length === 0 ? (
              <Text style={styles.meta}>Belum ada kunjungan sales di area {areaLabel} hari ini.</Text>
            ) : (
              (visitHist ?? []).slice(0, 5).map((it: any) => (
                <View key={it.visit._id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveName} numberOfLines={1}>{it.store?.name ?? "Toko terhapus"}</Text>
                    <Text style={styles.liveInfo}>👤 {it.salesName || "-"} • {fmtTime(it.visit.checkinAt)}</Text>
                  </View>
                </View>
              ))
            )}
            <Text style={styles.hint}>Riwayat lengkap ada di tab SPK → Riwayat.</Text>
          </SectionCard>
        ) : null}

        {/* ===== FOLLOW-UP PIUTANG ===== */}
        {usesPiutang ? (
          <SectionCard title="📞 Follow-up Piutang (hari ini)">
            <View style={styles.pairRow}>
              <View style={[styles.pairBox, { borderColor: "#D0D5DD" }]}>
                <Text style={styles.pairValue}>{pending ? String(pending.count ?? 0) : "–"}</Text>
                <Text style={styles.pairLabel}>Belum dikerjakan</Text>
              </View>
              <View style={[styles.pairBox, { borderColor: "#ABEFC6" }]}>
                <Text style={[styles.pairValue, { color: GREEN }]}>{doneToday.length}</Text>
                <Text style={styles.pairLabel}>Selesai hari ini</Text>
              </View>
            </View>
            {doneToday.length > 0 ? (
              <View style={styles.chipRowWrap}>
                {Object.keys(hasilCount).map((k) => (
                  <View key={k} style={[styles.chip, { backgroundColor: HASIL[k]?.bg ?? "#F2F4F7" }]}>
                    <Text style={[styles.chipText, { color: HASIL[k]?.tx ?? GRAY }]}>
                      {HASIL[k]?.label ?? k}: {hasilCount[k]}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/spk")}>
              <Text style={styles.btnSmallText}>Buka SPK Admin →</Text>
            </TouchableOpacity>
          </SectionCard>
        ) : null}

        {/* ===== PENCAPAIAN BULANAN PER SALES ===== */}
        <SectionCard title="🏆 Pencapaian Bulanan per Sales">
          {pcpState === "loading" ? (
            <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
          ) : pcpState === "err" || !pcpRows || pcpRows.length === 0 ? (
            <View>
              <Text style={styles.meta}>Data belum tersedia.</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/laporan-pcp")}>
                <Text style={styles.btnSmallText}>Buka Laporan PCP →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            pcpRows.slice(0, 6).map((r: any, i: number) => (
              <View key={i} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveName} numberOfLines={1}>
                    {r.sdm || r.jabatan || "-"}
                    {r.area ? <Text style={styles.areaTxt}>  •  {r.area}</Text> : null}
                  </Text>
                  <Text style={styles.liveInfo}>{r.jabatan || ""}{r.trip ? ` • TRIP ${r.trip}` : ""}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowRight}>{rupiah(r.act)}</Text>
                  <Text style={[styles.pctTxt, { color: r.pcpPct != null && r.pcpPct < 30 ? RED : r.pcpPct != null && r.pcpPct < 70 ? ORANGE : GREEN }]}>
                    {r.pcpPct == null ? "-" : r.pcpPct.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        {/* ===== UANG EKSPEDISI ===== */}
        <SectionCard title="🚚 Uang Ekspedisi">
          {eksState === "loading" ? (
            <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
          ) : eksState === "err" || !eks ? (
            <View>
              <Text style={styles.meta}>Data belum tersedia.</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/laporan-ekspedisi")}>
                <Text style={styles.btnSmallText}>Buka Laporan Ekspedisi →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Row left="Total tunai" right={rupiah(eks.totalTunai)} rightColor={GREEN} />
              <Row left="Total transfer" right={rupiah(eks.totalTransfer)} rightColor={BLUE} />
              <Row left="Jumlah kiriman" right={String(eks.totalCount ?? 0)} />
              <Row left="Armada" right={String(eks.perArmadaList?.length ?? 0)} />
              <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/laporan-ekspedisi")}>
                <Text style={styles.btnSmallText}>Lihat detail ekspedisi →</Text>
              </TouchableOpacity>
            </>
          )}
        </SectionCard>

        {/* ===== AKSES CEPAT (sementara) ===== */}
        <Text style={styles.gridLabel}>Akses Cepat</Text>
        <View style={styles.grid}>
          {(isField || isSuper) ? (
            <TouchableOpacity style={styles.action} onPress={() => router.push("/toko-baru")}>
              <Text style={styles.actionIcon}>➕</Text>
              <Text style={styles.actionLabel}>Toko Baru</Text>
              <Text style={styles.actionDesc} numberOfLines={2}>Daftarkan toko baru</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.action} onPress={() => router.push("/riwayat")}>
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionLabel}>Riwayat</Text>
            <Text style={styles.actionDesc} numberOfLines={2}>Riwayat kunjungan & follow-up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TabBar active="beranda" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: "#fff" },
  brand: { fontSize: 13, fontWeight: "800", color: RED, letterSpacing: 0.5 },
  greet: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 2 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  banner: { backgroundColor: "#FFF1F0", borderColor: "#FECDCA", borderWidth: 1, borderRadius: 12, marginBottom: 14, padding: 14 },
  bannerTitle: { color: RED, fontWeight: "800", fontSize: 14 },
  bannerText: { color: "#B42318", fontSize: 13, marginTop: 4 },
  statRow: { flexDirection: "row", marginBottom: 6 },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14, marginRight: 10, borderWidth: 1, borderColor: "#EEF0F3", borderTopWidth: 3 },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 12, color: GRAY, marginTop: 4, fontWeight: "600" },
  sectionCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#EEF0F3" },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#111", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0F0F0" },
  rowLeft: { fontSize: 13, color: "#344054", fontWeight: "600", flex: 1, marginRight: 8 },
  rowRight: { fontSize: 14, fontWeight: "800", color: "#111" },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  dotOn: { backgroundColor: "#F79009" },
  dotOff: { backgroundColor: GREEN },
  liveName: { fontSize: 14, fontWeight: "700", color: "#111" },
  liveInfo: { fontSize: 12, color: GRAY, marginTop: 1 },
  areaTxt: { fontSize: 11, fontWeight: "700", color: GRAY },
  pctTxt: { fontSize: 12, fontWeight: "800", marginTop: 2 },
  hint: { fontSize: 11, color: GRAY, marginTop: 8, fontStyle: "italic" },
  pairRow: { flexDirection: "row" },
  pairBox: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, marginRight: 10, alignItems: "center" },
  pairValue: { fontSize: 24, fontWeight: "900", color: "#111" },
  pairLabel: { fontSize: 11, color: GRAY, marginTop: 2, fontWeight: "600" },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  chipText: { fontSize: 12, fontWeight: "800" },
  btnSmall: { backgroundColor: "#F2F4F7", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 10 },
  btnSmallText: { color: "#344054", fontWeight: "800", fontSize: 13 },
  gridLabel: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 18, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  action: { width: "48.5%", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  actionIcon: { fontSize: 22 },
  actionLabel: { fontSize: 14, fontWeight: "800", color: "#111", marginTop: 6 },
  actionDesc: { fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 16 },
});
