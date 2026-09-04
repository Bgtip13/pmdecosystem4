import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image } from "react-native";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";

const RED = "#D92D20";
const GRAY = "#667085";

export default function Akun() {
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  const roleLabel: any = { field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor" };
  const areaLabel = viewer.area ? viewer.area : "Semua Area";

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}><Text style={styles.title}>Akun</Text></View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Profil */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(viewer.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={styles.name}>{viewer.name}</Text>
            <Text style={styles.meta}>@{viewer.email?.replace("@pmd.local", "") ?? "-"}</Text>
            <Text style={styles.meta}>{roleLabel[viewer.role] ?? viewer.role} • {areaLabel}</Text>
          </View>
        </View>

        {/* Tentang Aplikasi */}
        <View style={styles.card}>
          <View style={styles.aboutHead}>
                        <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.appName}>PMD Ecosystem 4.0</Text>
              <Text style={styles.appVersion}>Versi v4.0.1</Text>
            </View>
          </View>
          <Text style={styles.desc}>
            Aplikasi internal Prima Mandiri Distribusi untuk mendukung kegiatan sales lapangan &
            telemarketing: kunjungan toko, SPK, piutang, dan monitoring.
          </Text>
        </View>

        {/* Informasi */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informasi</Text>
          <Row label="Pengembang" value="Bagus Triawan Isa Putra" />
          <Row label="Tahun Rilis" value="2026" />
          <Row label="Perusahaan" value="PT Prima Mandiri Distribusi" />
          <Row label="Platform" value="Android" />
        </View>

        {/* Lisensi & Hak Cipta */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lisensi & Hak Cipta</Text>
          <Text style={styles.line}>
            © 2026 PT Prima Mandiri Distribusi. Seluruh hak cipta dilindungi undang-undang.
          </Text>
          <Text style={styles.line}>
            PMD Ecosystem 4.0 adalah perangkat lunak internal perusahaan. Aplikasi ini tidak untuk
            diperjualbelikan, disalin, atau didistribusikan tanpa izin tertulis dari pemilik hak cipta.
          </Text>
          <Text style={styles.line}>
            Penggunaan hanya diperuntukkan bagi karyawan/agen resmi Prima Mandiri Distribusi yang
            berwenang. Seluruh data toko, kunjungan, dan piutang bersifat rahasia.
          </Text>
        </View>

        <Text style={styles.credit}>Dibuat & dikembangkan oleh Bagus Triawan Isa Putra — 2026</Text>

        <TouchableOpacity style={styles.logoutBtn} onPress={() => signOut()}>
          <Text style={styles.logoutText}>Keluar</Text>
        </TouchableOpacity>
      </ScrollView>

      <TabBar active="akun" />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  body: { padding: 20, paddingBottom: 130 },
  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#EEF0F3" },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: RED, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "900" },
  name: { fontSize: 18, fontWeight: "800", color: "#111" },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 14, borderWidth: 1, borderColor: "#EEF0F3" },
  aboutHead: { flexDirection: "row", alignItems: "center" },
    logo: { width: 64, height: 64, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#F2F2F2" },
  logoText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  appName: { fontSize: 16, fontWeight: "800", color: "#111" },
  appVersion: { fontSize: 12, color: GRAY, marginTop: 2 },
  desc: { fontSize: 13, color: "#344054", lineHeight: 19, marginTop: 12 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#F2F4F7" },
  rowLabel: { fontSize: 13, color: GRAY },
  rowValue: { fontSize: 13, color: "#111", fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  line: { fontSize: 12, color: "#475467", lineHeight: 18, marginTop: 6 },
  credit: { fontSize: 11, color: GRAY, textAlign: "center", marginTop: 18, fontStyle: "italic" },
  logoutBtn: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 14 },
  logoutText: { color: RED, fontWeight: "800", fontSize: 15 },
});
