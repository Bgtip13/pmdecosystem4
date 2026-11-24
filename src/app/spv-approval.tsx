import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, TextInput, Modal, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GREEN = "#067647";
const GRAY = "#667085";
const PURPLE = "#6941C6";
const ORANGE = "#B54708";

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function fmtTanggal(dk?: string | null) {
  if (!dk) return "-";
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][dt.getUTCDay()];
  return `${hari} ${pad2(d)} ${BULAN_SHORT[m - 1]} ${y}`;
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ==========================================================================
// PUSAT PERSETUJUAN (SUPERVISOR & OWNER)
//   1. Perubahan jadwal  ← pengajuan sales: geser tanggal / hapus toko
//   2. Lokasi toko       ← usulan perbarui koordinat dari sales
// Semua keputusan tercatat di audit dan dikirim sebagai notifikasi ke pengaju.
// ==========================================================================
export default function SpvApproval() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const viewer = useQuery(api.users.viewer) as any;
  const jadwalReq = useQuery(api.jadwalRequests.list, { status: "pending" } as any) as any;
  const items = useQuery(api.locationRequests.listPendingRequests) as any;
  const decideJadwal = useMutation(api.jadwalRequests.decide);
  const approveRequest = useMutation(api.locationRequests.approveRequest);
  const rejectRequest = useMutation(api.locationRequests.rejectRequest);

  const [tab, setTab] = useState<"jadwal" | "lokasi">(params.tab === "lokasi" ? "lokasi" : "jadwal");
  const [busyId, setBusyId] = useState("");
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectNote, setRejectNote] = useState("");

  if (!viewer) return <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>;

  if (viewer.role !== "supervisor" && viewer.role !== "owner") {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Khusus Supervisor</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const jadwalCount = jadwalReq === undefined ? null : jadwalReq.length;
  const lokasiCount = items === undefined ? null : items.length;

  // ===== Jadwal: setujui (dengan jalan keluar kuota minimal) =====
  const approveJadwal = async (id: string, ignoreMinimum = false) => {
    setBusyId(id);
    try {
      await decideJadwal({ requestId: id as any, approve: true, ignoreMinimum });
      Alert.alert("Disetujui ✅", "Jadwal sudah diperbarui sesuai pengajuan sales.");
    } catch (e: any) {
      const msg = toFriendlyError(e);
      if (!ignoreMinimum && msg.includes("di bawah minimal")) {
        Alert.alert("Di bawah minimal harian", msg, [
          { text: "Batal", style: "cancel" },
          { text: "Tetap setujui", style: "destructive", onPress: () => approveJadwal(id, true) },
        ]);
      } else {
        Alert.alert("Gagal menyetujui", msg);
      }
    } finally {
      setBusyId("");
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget._id);
    try {
      await decideJadwal({
        requestId: rejectTarget._id,
        approve: false,
        reviewNote: rejectNote.trim() || undefined,
      });
      setRejectTarget(null);
      setRejectNote("");
      Alert.alert("Ditolak", "Jadwal tidak diubah. Sales menerima alasannya lewat notifikasi.");
    } catch (e: any) {
      Alert.alert("Gagal menolak", toFriendlyError(e));
    } finally {
      setBusyId("");
    }
  };

  // ===== Lokasi toko (perilaku lama) =====
  const onApproveLokasi = async (requestId: string) => {
    setBusyId(requestId);
    try {
      await approveRequest({ requestId: requestId as any });
      Alert.alert("Disetujui ✅", "Koordinat toko diperbarui.");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusyId("");
    }
  };

  const onRejectLokasi = (requestId: string) => {
    Alert.alert("Tolak Usulan?", "Koordinat toko tidak akan diubah.", [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya, Tolak",
        style: "destructive",
        onPress: async () => {
          setBusyId(requestId);
          try {
            await rejectRequest({ requestId: requestId as any });
            Alert.alert("Ditolak", "Usulan telah ditolak.");
          } catch (e: any) {
            Alert.alert("Gagal", e?.message ?? "Coba lagi.");
          } finally {
            setBusyId("");
          }
        },
      },
    ]);
  };

  const jadwalList: any[] = (jadwalReq ?? []) as any[];
  const lokasiList: any[] = (items ?? []) as any[];

  const renderJadwal = ({ item }: any) => {
    const busy = busyId === item._id;
    const isMove = item.kind === "move";
    const stale = item.scheduleStatus && item.scheduleStatus !== "PLANNED";
    return (
      <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: isMove ? "#175CD3" : ORANGE }]}>
        <View style={styles.cardTop}>
          <View style={[styles.kindBadge, { backgroundColor: isMove ? "#EFF8FF" : "#FEF0C7" }]}>
            <Text style={[styles.kindText, { color: isMove ? "#175CD3" : ORANGE }]}>
              {isMove ? "GESER TANGGAL" : "HAPUS DARI JADWAL"}
            </Text>
          </View>
          <Text style={styles.time}>{fmtDate(item.createdAt)}</Text>
        </View>

        <Text style={styles.storeName}>{item.storeName}</Text>
        <Text style={styles.line}>👤 {item.requestedByName} • {item.area}</Text>
        <Text style={styles.line}>
          {isMove
            ? `📅 ${fmtTanggal(item.fromDateKey)} → ${fmtTanggal(item.toDateKey)}`
            : `📅 Dihapus dari ${fmtTanggal(item.fromDateKey)}`}
        </Text>
        {item.noSpk ? <Text style={styles.line}>No. SPK: {item.noSpk}</Text> : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>ALASAN DARI SALES</Text>
          <Text style={styles.noteValue}>{item.reason || "-"}</Text>
          {item.note ? <Text style={styles.noteSub}>Catatan: {item.note}</Text> : null}
        </View>

        {stale ? (
          <Text style={styles.stale}>
            Baris ini sekarang berstatus {item.scheduleStatus} — persetujuan akan ditolak sistem. Tolak saja pengajuannya.
          </Text>
        ) : null}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btnApprove, busy && { opacity: 0.6 }]}
            onPress={() => approveJadwal(item._id)}
            disabled={busy}
          >
            <Text style={styles.btnApproveText}>{busy ? "Memproses…" : "✓ Setujui"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnReject, busy && { opacity: 0.6 }]}
            onPress={() => { setRejectNote(""); setRejectTarget(item); }}
            disabled={busy}
          >
            <Text style={styles.btnRejectText}>✕ Tolak</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderLokasi = ({ item }: any) => {
    const r = item.request;
    return (
      <View style={styles.card}>
        <Text style={styles.storeName}>{item.store?.name ?? "Toko terhapus"}</Text>
        <Text style={styles.salesLine}>👤 {item.salesName} • {r.area}</Text>
        <Text style={styles.timeLine}>🕐 {fmtDate(r.createdAt)}</Text>

        <View style={styles.coordBox}>
          <Text style={styles.coordLabel}>Lokasi lama</Text>
          <Text style={styles.coordValue}>
            {r.oldLat ? `${r.oldLat.toFixed(6)}, ${r.oldLng?.toFixed(6)}` : "Belum ada"}
          </Text>
          <Text style={styles.coordLabel}>→ Lokasi usulan</Text>
          <Text style={styles.coordValueNew}>{r.proposedLat.toFixed(6)}, {r.proposedLng.toFixed(6)}</Text>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btnApprove, busyId === r._id && { opacity: 0.6 }]}
            onPress={() => onApproveLokasi(r._id)}
            disabled={busyId === r._id}
          >
            <Text style={styles.btnApproveText}>✓ Setujui</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnReject, busyId === r._id && { opacity: 0.6 }]}
            onPress={() => onRejectLokasi(r._id)}
            disabled={busyId === r._id}
          >
            <Text style={styles.btnRejectText}>✕ Tolak</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pusat Persetujuan</Text>
        <Text style={styles.meta}>Keputusan langsung tercatat di audit & dikirim ke pengaju.</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === "jadwal" && styles.tabOn]}
            onPress={() => setTab("jadwal")}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === "jadwal" && styles.tabTextOn]}>
              Perubahan Jadwal{jadwalCount ? ` (${jadwalCount})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "lokasi" && styles.tabOn]}
            onPress={() => setTab("lokasi")}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === "lokasi" && styles.tabTextOn]}>
              Lokasi Toko{lokasiCount ? ` (${lokasiCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === "jadwal" ? (
        jadwalReq === undefined ? (
          <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>
        ) : jadwalList.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Tidak ada pengajuan jadwal</Text>
            <Text style={styles.emptyMeta}>
              Sales mengajukan geser tanggal / hapus toko dari kartu SPK Jadwal. Pengajuannya muncul di sini.
            </Text>
          </View>
        ) : (
          <FlatList
            data={jadwalList}
            keyExtractor={(it: any) => it._id}
            renderItem={renderJadwal}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          />
        )
      ) : items === undefined ? (
        <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>
      ) : lokasiList.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tidak ada permintaan</Text>
          <Text style={styles.emptyMeta}>Semua usulan lokasi sudah diproses.</Text>
        </View>
      ) : (
        <FlatList
          data={lokasiList}
          keyExtractor={(it: any) => it.request._id}
          renderItem={renderLokasi}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        />
      )}

      {/* ===== Modal tolak pengajuan (alasan opsional) ===== */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <Pressable style={styles.modalBg} onPress={() => setRejectTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Tolak pengajuan</Text>
            <Text style={styles.modalSub}>
              {rejectTarget?.storeName} • {rejectTarget?.requestedByName}
            </Text>
            <Text style={styles.modalHint}>
              Alasan membantu sales memahami keputusanmu. Jadwal tidak akan berubah.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Contoh: toko tetap harus dikunjungi minggu ini"
              placeholderTextColor="#98A2B3"
              value={rejectNote}
              onChangeText={setRejectNote}
              multiline
            />
            <View style={styles.modalFoot}>
              <TouchableOpacity style={styles.modalGhost} onPress={() => setRejectTarget(null)}>
                <Text style={styles.modalGhostText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDanger, busyId && { opacity: 0.6 }]}
                onPress={submitReject}
                disabled={!!busyId}
              >
                <Text style={styles.modalDangerText}>Tolak pengajuan</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: {
    backgroundColor: "#FFF7F5",
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: "#101828", letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 12.5, color: GRAY, marginTop: 3, lineHeight: 18 },

  tabs: { flexDirection: "row", backgroundColor: "#fff", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 999, padding: 4, marginTop: 12 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999 },
  tabOn: { backgroundColor: RED },
  tabText: { fontSize: 11.5, fontWeight: "800", color: GRAY },
  tabTextOn: { color: "#fff" },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#333", textAlign: "center" },
  emptyMeta: { fontSize: 12.5, color: GRAY, marginTop: 6, textAlign: "center", lineHeight: 18 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#EEF0F3" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  kindBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  kindText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  time: { fontSize: 10.5, color: GRAY },
  storeName: { fontSize: 15.5, fontWeight: "800", color: "#111" },
  line: { fontSize: 12, color: "#475467", marginTop: 3, fontWeight: "600", lineHeight: 17 },
  noteBox: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, marginTop: 10 },
  noteLabel: { fontSize: 9, fontWeight: "800", color: GRAY, letterSpacing: 0.5 },
  noteValue: { fontSize: 12.5, color: "#344054", marginTop: 3, fontWeight: "700", lineHeight: 17 },
  noteSub: { fontSize: 11.5, color: GRAY, marginTop: 3, lineHeight: 16 },
  stale: { fontSize: 11, color: ORANGE, fontWeight: "700", marginTop: 8, lineHeight: 16 },

  btnRow: { flexDirection: "row", marginTop: 12 },
  btnApprove: { flex: 1, backgroundColor: GREEN, borderRadius: 10, padding: 12, alignItems: "center", marginRight: 8 },
  btnApproveText: { color: "#fff", fontWeight: "800", fontSize: 13.5 },
  btnReject: { flex: 1, backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 10, padding: 12, alignItems: "center" },
  btnRejectText: { color: RED, fontWeight: "800", fontSize: 13.5 },

  salesLine: { fontSize: 13, color: GRAY, marginTop: 4, fontWeight: "600" },
  timeLine: { fontSize: 12, color: GRAY, marginTop: 2 },
  coordBox: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginTop: 10 },
  coordLabel: { fontSize: 12, color: GRAY, fontWeight: "700", marginTop: 4 },
  coordValue: { fontSize: 13, color: "#344054" },
  coordValueNew: { fontSize: 13, color: GREEN, fontWeight: "700" },

  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },

  modalBg: { flex: 1, backgroundColor: "rgba(16,24,40,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#101828" },
  modalSub: { fontSize: 12.5, color: GRAY, marginTop: 3 },
  modalHint: { fontSize: 12, color: GRAY, marginTop: 8, lineHeight: 17 },
  input: {
    backgroundColor: "#F8F9FB", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#101828",
    marginTop: 10, minHeight: 70, textAlignVertical: "top",
  },
  modalFoot: { flexDirection: "row", marginTop: 14 },
  modalGhost: { flex: 1, borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginRight: 8 },
  modalGhostText: { fontSize: 13, fontWeight: "800", color: "#344054" },
  modalDanger: { flex: 1, backgroundColor: RED, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalDangerText: { fontSize: 13, fontWeight: "800", color: "#fff" },
});
