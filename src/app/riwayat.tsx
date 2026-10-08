import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Image, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import { SpkStatusBadge, ReviewNoteBox } from "../components/SpkWorkflow";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";

const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Kunjungan lama (sebelum fitur review) sudah otomatis CLSD — lihat backfill FASE 1.
const wfOf = (v: any) => (v?.workflowStatus ?? "CLSD") as string;

const IconLine = ({ icon, color, children }: any) => (
  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
    <AppIcon name={icon} size={14} color={color} style={{ marginRight: 6 }} />
    <Text style={{ color, fontSize: 13, fontWeight: "700", flex: 1 }}>{children}</Text>
  </View>
);

export default function Riwayat() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const deleteVisit = useMutation(api.visits.deleteVisitBySupervisor);
  const [day, setDay] = useState(new Date());
  const [showCal, setShowCal] = useState(false);
  const [calCursor, setCalCursor] = useState(new Date());
  // FASE 1: filter status pekerjaan
  const [wfFilter, setWfFilter] = useState<"all" | "INPG" | "CLSD">("all");
  // Preselect sales bila datang dari Live Monitor (?salesId=...)
  const [salesId, setSalesId] = useState<string | undefined>(
    typeof params.salesId === "string" ? params.salesId : undefined
  );

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = start + 86400000 - 1;

  // Daftar sales untuk chip filter (Supervisor: semua area; Telemarketing: area sendiri)
  const canFilter = viewer && (viewer.role === "supervisor" || viewer.role === "telemarketing" || viewer.role === "owner");
  const salesList = useQuery(
    api.users.listFieldSales,
    canFilter
      ? viewer.role === "telemarketing"
        ? { area: (viewer as any).area as any }
        : {}
      : "skip"
  ) as any;

  const rows = useQuery(api.visits.listHistory, {
    from: start,
    to: end,
    ...(salesId ? { salesId: salesId as any } : {}),
  }) as any;

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  const isToday = day.toDateString() === new Date().toDateString();
  const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const shiftDay = (n: number) => setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); };
  const onDeleteVisit = (v: any) => {
    Alert.alert("Hapus Kunjungan?", "Kunjungan ini akan dihapus permanen dari riwayat. Lanjutkan?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya, Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVisit({ visitId: v._id });
            Alert.alert("Terhapus", "Kunjungan dihapus.");
          } catch (e: any) {
            Alert.alert("Gagal", e?.message ?? "Coba lagi.");
          }
        },
      },
    ]);
  };

  // ===== FASE 1: saring berdasarkan status pekerjaan =====
  const allRows: any[] = rows ?? [];
  const inpgCount = allRows.filter((r: any) => wfOf(r.visit) === "INPG").length;
  const clsdCount = allRows.filter((r: any) => wfOf(r.visit) === "CLSD").length;
  const shown = wfFilter === "all" ? allRows : allRows.filter((r: any) => wfOf(r.visit) === wfFilter);

  const renderCard = ({ item }: any) => {
    const v = item.visit;
    const wf = wfOf(v);
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/visit-detail/${v._id}`)}>
        <View style={styles.cardHead}>
          {/* titik hijau = kunjungan pakai mock GPS */}
          <View style={styles.nameRow}>
            {viewer.role === "supervisor" && (v as any).isMock ? <View style={styles.dot} /> : null}
            <Text style={styles.cardName} numberOfLines={1}>{item.store?.name ?? "Toko terhapus"}</Text>
          </View>
          <View style={styles.rightCol}>
            <View style={styles.chip}><Text style={styles.chipText}>{MET_LABEL[v.metWith] ?? "-"}</Text></View>
            <SpkStatusBadge status={wf} style={{ marginTop: 6 }} />
            {item.photoSelfieUrl ? (
              <Image source={{ uri: item.photoSelfieUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}><AppIcon name="camera" size={16} color={GRAY} /></View>
            )}
          </View>
        </View>
        {viewer.role === "supervisor" || viewer.role === "telemarketing" ? (
          <IconLine icon="user" color={GRAY}>
            {item.salesName || "-"} • {item.store?.area ?? ""}
          </IconLine>
        ) : null}
        <IconLine icon="clock" color="#344054">
          {fmtTime(v.checkinAt)} → {v.checkoutAt ? fmtTime(v.checkoutAt) : "-"} • {v.durationMin ?? 0} mnt
        </IconLine>
        {v.paid ? (
          <IconLine icon="cash" color="#067647">Bayar {rupiah(v.paidAmount ?? 0)} ({v.payMethod === "tunai" ? "Tunai" : "Transfer"})</IconLine>
        ) : v.promiseDate ? (
          <IconLine icon="calendar" color="#B54708">Janji bayar {v.promiseDate}</IconLine>
        ) : null}
        {v.ordered ? (
          <IconLine icon="box" color="#175CD3">Order {v.orderItems?.length ?? 0} produk</IconLine>
        ) : v.noOrderReason ? (
          <IconLine icon="close" color="#B42318">{REASON_LABEL[v.noOrderReason] ?? v.noOrderReason}</IconLine>
        ) : null}

        {wf === "INPG" ? (
          <Text style={styles.pendingReview}>Menunggu review SPV — hasil masih bisa dikoreksi.</Text>
        ) : null}

        <ReviewNoteBox note={(v as any).reviewNote} reviewerName={item.reviewerName} />

        {viewer.role === "supervisor" ? (
          <TouchableOpacity style={styles.delVisitBtn} onPress={() => onDeleteVisit(v)}>
            <AppIcon name="trash" size={13} color="#B42318" style={{ marginRight: 5 }} />
            <Text style={styles.delVisitText}>Hapus kunjungan ini</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Riwayat Kunjungan</Text>
      </View>

      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>‹</Text></TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, alignItems: "center" }} onPress={() => setShowCal(!showCal)}>
          <Text style={styles.dateLabel}>{isToday ? "Hari Ini" : fmtDate(day)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftDay(1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>›</Text></TouchableOpacity>
      </View>

      {/* ===== FASE 1: FILTER STATUS PEKERJAAN ===== */}
      <View style={styles.wfWrap}>
        <TouchableOpacity style={[styles.wfChip, wfFilter === "all" && styles.wfChipOn]} onPress={() => setWfFilter("all")}>
          <Text style={[styles.wfChipText, wfFilter === "all" && styles.wfChipTextOn]}>Semua ({allRows.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.wfChip, wfFilter === "INPG" && styles.wfChipOn]} onPress={() => setWfFilter("INPG")}>
          <Text style={[styles.wfChipText, wfFilter === "INPG" && styles.wfChipTextOn]}>Perlu review ({inpgCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.wfChip, wfFilter === "CLSD" && styles.wfChipOn]} onPress={() => setWfFilter("CLSD")}>
          <Text style={[styles.wfChipText, wfFilter === "CLSD" && styles.wfChipTextOn]}>Selesai ({clsdCount})</Text>
        </TouchableOpacity>
      </View>

      {/* ===== FILTER PER SALES ===== */}
      {canFilter && salesList ? (
        <View style={styles.salesWrap}>
          <TouchableOpacity
            style={[styles.salesChip, !salesId && styles.salesChipOn]}
            onPress={() => setSalesId(undefined)}
          >
            <Text style={[styles.salesChipText, !salesId && styles.salesChipTextOn]}>Semua Sales</Text>
          </TouchableOpacity>
          {(salesList ?? []).map((s: any) => {
            const on = salesId === s._id;
            return (
              <TouchableOpacity key={s._id} style={[styles.salesChip, on && styles.salesChipOn]}
                onPress={() => setSalesId(on ? undefined : s._id)}>
                <Text style={[styles.salesChipText, on && styles.salesChipTextOn]} numberOfLines={1}>
                  {s.name}{s.role === "supervisor" ? " (SPV)" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {showCal ? (
        <View style={styles.calBox}>
          <View style={styles.calHead}>
            <TouchableOpacity onPress={() => setCalCursor(new Date(y, m - 1, 1))}><Text style={styles.calNav}>‹</Text></TouchableOpacity>
            <Text style={styles.calTitle}>{MONTHS[m]} {y}</Text>
            <TouchableOpacity onPress={() => setCalCursor(new Date(y, m + 1, 1))}><Text style={styles.calNav}>›</Text></TouchableOpacity>
          </View>
          <View style={styles.calDowRow}>{DOW.map((d) => <Text key={d} style={styles.calDow}>{d}</Text>)}</View>
          <View style={styles.calGrid}>
            {cells.map((d, i) =>
              d === null ? <View key={"e" + i} style={styles.calCell} /> : (
                <TouchableOpacity key={d}
                  style={[styles.calCell, day.getDate() === d && day.getMonth() === m && day.getFullYear() === y ? styles.calCellActive : null]}
                  onPress={() => { setDay(new Date(y, m, d)); setShowCal(false); }}>
                  <Text style={styles.calDay}>{d}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      ) : null}

      {rows === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : shown.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>
            {wfFilter === "all" ? "Belum ada kunjungan" : wfFilter === "INPG" ? "Tidak ada yang menunggu review" : "Belum ada yang selesai"}
          </Text>
          <Text style={styles.meta}>Tidak ada SPK selesai pada tanggal ini.</Text>
        </View>
      ) : (
        <FlatList data={shown} keyExtractor={(it: any) => it.visit._id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }} renderItem={renderCard} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 10 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  dateNav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0F0F0", marginTop: 4 },
  dateArrow: { paddingHorizontal: 16, paddingVertical: 4 },
  dateArrowText: { fontSize: 26, color: RED, fontWeight: "800" },
  dateLabel: { fontSize: 16, fontWeight: "800", color: "#111", textAlign: "center" },
  // ← FASE 1
  wfWrap: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 10, backgroundColor: "#fff" },
  wfChip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 8, backgroundColor: "#fff" },
  wfChipOn: { backgroundColor: "#344054", borderColor: "#344054" },
  wfChipText: { fontSize: 12, color: "#344054", fontWeight: "700" },
  wfChipTextOn: { color: "#fff" },
  salesWrap: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  salesChip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 8, backgroundColor: "#fff", maxWidth: 160 },
  salesChipOn: { backgroundColor: RED, borderColor: RED },
  salesChipText: { fontSize: 12, color: "#344054", fontWeight: "700" },
  salesChipTextOn: { color: "#fff" },
  meta: { fontSize: 13, color: GRAY, textAlign: "center", marginTop: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333", textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardHead: { flexDirection: "row", justifyContent: "space-between" },
  // baris nama toko + titik penanda mock GPS
  nameRow: { flex: 1, flexDirection: "row", alignItems: "center", marginRight: 8 },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: "#12B76A", marginRight: 7 },
  cardName: { fontSize: 16, fontWeight: "800", color: "#111", flexShrink: 1 },
  rightCol: { alignItems: "center" },
  chip: { backgroundColor: "#FEE4E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: "800", color: "#B42318" },
  thumb: { width: 46, height: 46, borderRadius: 23, marginTop: 6 },
  thumbEmpty: { backgroundColor: "#F2F4F7", alignItems: "center", justifyContent: "center" },
  pendingReview: { fontSize: 12, color: "#175CD3", fontWeight: "700", marginTop: 8 },
  delVisitBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 8, backgroundColor: "#FFF1F0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  delVisitText: { color: "#B42318", fontSize: 12, fontWeight: "800" },
  calBox: { backgroundColor: "#fff", marginHorizontal: 20, marginTop: 10, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#E4E7EC" },
  calHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  calNav: { fontSize: 24, color: RED, fontWeight: "700", paddingHorizontal: 8 },
  calTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  calDowRow: { flexDirection: "row" },
  calDow: { width: "14.28%", textAlign: "center", fontSize: 11, color: GRAY, fontWeight: "700", paddingVertical: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", paddingVertical: 6 },
  calCellActive: { backgroundColor: RED, borderRadius: 20 },
  calDay: { fontSize: 13, color: "#111" },
});
