import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";

const RED = "#D92D20";
const GREEN = "#067647";
const GRAY = "#667085";

export default function SpvHub() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const pending = useQuery(api.locationRequests.listPendingRequests) as any;

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  if (viewer.role !== "supervisor") {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Khusus Supervisor</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pendingCount = pending === undefined ? null : pending.length;

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Menu Supervisor</Text>
        <Text style={styles.meta}>Halo, {viewer.name} — kelola semua aktivitas di sini</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity style={styles.banner} onPress={() => router.push("/spv-approval")}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>📍 Persetujuan Lokasi</Text>
            <Text style={styles.bannerText}>
              {pendingCount === null
                ? "Memuat..."
                : pendingCount === 0
                ? "Tidak ada usulan menunggu — semuanya beres."
                : pendingCount + " usulan lokasi toko menunggu keputusanmu."}
            </Text>
          </View>
          {pendingCount !== null && pendingCount > 0 ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>
          ) : null}
          <Text style={styles.bannerArrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Pantau</Text>
        <TouchableOpacity style={styles.menuCard} onPress={() => router.push("/live")}>
          <View style={[styles.iconBox, { backgroundColor: "#E0F2FE" }]}>
            <Text style={styles.iconText}>📡</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>Live Monitor</Text>
            <Text style={styles.menuDesc}>Status sales lapangan real-time (kunjungan, durasi, toko)</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Persetujuan</Text>
        <TouchableOpacity style={styles.menuCard} onPress={() => router.push("/spv-approval")}>
          <View style={[styles.iconBox, { backgroundColor: "#FEE4E2" }]}>
            <Text style={styles.iconText}>📍</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>Approval Lokasi Toko</Text>
            <Text style={styles.menuDesc}>Setujui / tolak usulan perbarui koordinat dari sales</Text>
          </View>
          {pendingCount !== null && pendingCount > 0 ? (
            <View style={styles.badgeSmall}><Text style={styles.badgeSmallText}>{pendingCount}</Text></View>
          ) : null}
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Kelola</Text>
        <TouchableOpacity style={styles.menuCard} onPress={() => router.push("/kelola-toko")}>
          <View style={[styles.iconBox, { backgroundColor: "#FEE4E2" }]}>
            <Text style={styles.iconText}>🏪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>Kelola Toko</Text>
            <Text style={styles.menuDesc}>Cari, edit data & nonaktifkan toko</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuCard} onPress={() => router.push("/kelola-akun")}>
          <View style={[styles.iconBox, { backgroundColor: "#E0F2FE" }]}>
            <Text style={styles.iconText}>🔑</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>Kelola Akun Sales</Text>
            <Text style={styles.menuDesc}>Ubah peran / area, reset password</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <TabBar active="spv" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  banner: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 16, padding: 16, marginTop: 4 },
  bannerTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  bannerText: { fontSize: 13, color: "#B54708", marginTop: 4, lineHeight: 18 },
  bannerArrow: { fontSize: 22, color: RED, marginLeft: 8, fontWeight: "700" },
  badge: { backgroundColor: RED, borderRadius: 14, minWidth: 28, height: 28, justifyContent: "center", alignItems: "center", paddingHorizontal: 8, marginLeft: 8 },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  badgeSmall: { backgroundColor: RED, borderRadius: 12, minWidth: 22, height: 22, justifyContent: "center", alignItems: "center", paddingHorizontal: 6, marginRight: 6 },
  badgeSmallText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  section: { fontSize: 13, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 22, marginBottom: 8, paddingHorizontal: 4 },
  menuCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  iconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 12 },
  iconText: { fontSize: 20 },
  menuLabel: { fontSize: 15, fontWeight: "800", color: "#111" },
  menuDesc: { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 16 },
  arrow: { fontSize: 22, color: "#98A2B3", fontWeight: "700", marginLeft: 6 },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
});
