import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Image } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";

const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function Riwayat() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const [day, setDay] = useState(new Date());
  const [showCal, setShowCal] = useState(false);
  const [calCursor, setCalCursor] = useState(new Date());

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = start + 86400000 - 1;
  const rows = useQuery(api.visits.listHistory, { from: start, to: end }) as any;

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

  const renderCard = ({ item }: any) => {
    const v = item.visit;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/visit-detail/${v._id}`)}>
        <View style={styles.cardHead}>
          <Text style={styles.cardName} numberOfLines={1}>{item.store?.name ?? "Toko terhapus"}</Text>
          <View style={styles.rightCol}>
            <View style={styles.chip}><Text style={styles.chipText}>{MET_LABEL[v.metWith] ?? "-"}</Text></View>
            {item.photoSelfieUrl ? (
              <Image source={{ uri: item.photoSelfieUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}><Text style={styles.thumbEmptyText}>📷</Text></View>
            )}
          </View>
        </View>
        {viewer.role === "supervisor" || viewer.role === "telemarketing" ? (
          <Text style={styles.salesLine}>👤 {item.salesName || "-"} • {item.store?.area ?? ""}</Text>
        ) : null}
        <Text style={styles.timeLine}>🕐 {fmtTime(v.checkinAt)} → {v.checkoutAt ? fmtTime(v.checkoutAt) : "-"} • {v.durationMin ?? 0} mnt</Text>
        {v.paid ? (
          <Text style={styles.badgeGreen}>💰 Bayar {rupiah(v.paidAmount ?? 0)} ({v.payMethod === "tunai" ? "Tunai" : "Transfer"})</Text>
        ) : v.promiseDate ? (
          <Text style={styles.badgeOrange}>📅 Janji bayar {v.promiseDate}</Text>
        ) : null}
        {v.ordered ? (
          <Text style={styles.badgeBlue}>📦 Order {v.orderItems?.length ?? 0} produk</Text>
        ) : v.noOrderReason ? (
          <Text style={styles.badgeRed}>🚫 {REASON_LABEL[v.noOrderReason] ?? v.noOrderReason}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
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
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Belum ada kunjungan</Text>
          <Text style={styles.meta}>Tidak ada SPK selesai pada tanggal ini.</Text>
        </View>
      ) : (
        <FlatList data={rows} keyExtractor={(it: any) => it.visit._id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }} renderItem={renderCard} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 10 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  dateNav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0F0F0", marginTop: 4 },
  dateArrow: { paddingHorizontal: 16, paddingVertical: 4 },
  dateArrowText: { fontSize: 26, color: RED, fontWeight: "800" },
  dateLabel: { fontSize: 16, fontWeight: "800", color: "#111", textAlign: "center" },
  meta: { fontSize: 13, color: GRAY, textAlign: "center", marginTop: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardHead: { flexDirection: "row", justifyContent: "space-between" },
  cardName: { fontSize: 16, fontWeight: "800", color: "#111", flex: 1, marginRight: 8 },
  rightCol: { alignItems: "center" },
  chip: { backgroundColor: "#FEE4E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: "800", color: "#B42318" },
  thumb: { width: 46, height: 46, borderRadius: 23, marginTop: 6 },
  thumbEmpty: { backgroundColor: "#F2F4F7", alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { fontSize: 16 },
  salesLine: { fontSize: 12, color: GRAY, marginTop: 6, fontWeight: "600" },
  timeLine: { fontSize: 13, color: "#344054", marginTop: 6, fontWeight: "600" },
  badgeGreen: { fontSize: 13, color: "#067647", marginTop: 6, fontWeight: "700" },
  badgeOrange: { fontSize: 13, color: "#B54708", marginTop: 6, fontWeight: "700" },
  badgeBlue: { fontSize: 13, color: "#175CD3", marginTop: 6, fontWeight: "700" },
  badgeRed: { fontSize: 13, color: "#B42318", marginTop: 6, fontWeight: "700" },
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
