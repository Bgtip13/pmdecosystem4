import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GREEN = "#067647";
const GRAY = "#667085";

export default function SpvApproval() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const items = useQuery(api.locationRequests.listPendingRequests) as any;
  const approveRequest = useMutation(api.locationRequests.approveRequest);
  const rejectRequest = useMutation(api.locationRequests.rejectRequest);
  const [busyId, setBusyId] = useState("");

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const onApprove = async (requestId: string) => {
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

  const onReject = (requestId: string) => {
    Alert.alert("Tolak Usulan?", "Koordinat toko tidak akan diubah.", [
      { text: "Batal", style: "cancel" },
      { text: "Ya, Tolak", style: "destructive", onPress: async () => {
          setBusyId(requestId);
          try {
            await rejectRequest({ requestId: requestId as any });
            Alert.alert("Ditolak", "Usulan telah ditolak.");
          } catch (e: any) {
            Alert.alert("Gagal", e?.message ?? "Coba lagi.");
          } finally {
            setBusyId("");
          }
        } },
    ]);
  };

  if (viewer.role !== "supervisor") {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Khusus Supervisor</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Persetujuan Lokasi</Text>
        <Text style={styles.meta}>{items === undefined ? "Memuat..." : `${items.length} menunggu`}</Text>
      </View>

      {items === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tidak ada permintaan</Text>
          <Text style={styles.meta}>Semua usulan lokasi sudah diproses.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it: any) => it.request._id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          renderItem={({ item }: any) => {
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
                  <TouchableOpacity style={[styles.btnApprove, busyId === r._id && { opacity: 0.6 }]} onPress={() => onApprove(r._id)} disabled={busyId === r._id}>
                    <Text style={styles.btnApproveText}>✓ Setujui</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnReject, busyId === r._id && { opacity: 0.6 }]} onPress={() => onReject(r._id)} disabled={busyId === r._id}>
                    <Text style={styles.btnRejectText}>✕ Tolak</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#EEF0F3" },
  storeName: { fontSize: 16, fontWeight: "800", color: "#111" },
  salesLine: { fontSize: 13, color: GRAY, marginTop: 4, fontWeight: "600" },
  timeLine: { fontSize: 12, color: GRAY, marginTop: 2 },
  coordBox: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginTop: 10 },
  coordLabel: { fontSize: 12, color: GRAY, fontWeight: "700", marginTop: 4 },
  coordValue: { fontSize: 13, color: "#344054" },
  coordValueNew: { fontSize: 13, color: GREEN, fontWeight: "700" },
  btnRow: { flexDirection: "row", marginTop: 14 },
  btnApprove: { flex: 1, backgroundColor: GREEN, borderRadius: 10, padding: 13, alignItems: "center", marginRight: 8 },
  btnApproveText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnReject: { flex: 1, backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 10, padding: 13, alignItems: "center" },
  btnRejectText: { color: RED, fontWeight: "800", fontSize: 14 },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
});
