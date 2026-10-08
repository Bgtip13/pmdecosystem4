import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import AppIcon from "../components/AppIcon";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R } = theme;

const SHADOW = {
  shadowColor: "#101828",
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const RED = C.primary;
const GRAY = C.inkMuted;

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

  const MenuCard = ({ icon, color, bg, label, desc, to, count }: any) => (
    <TouchableOpacity style={styles.menuCard} activeOpacity={0.85} onPress={() => router.push(to)}>
      <View style={[styles.iconBox, { backgroundColor: bg }]}>
        <AppIcon name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuDesc} numberOfLines={2}>{desc}</Text>
      </View>
      {count ? (
        <View style={styles.badgeSmall}><Text style={styles.badgeSmallText}>{count}</Text></View>
      ) : null}
      <AppIcon name="chevron" size={18} color={C.inkFaint} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );

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
        <Text style={styles.section}>Pantau</Text>
        <MenuCard
          icon="clock" color={C.chip.purple.fg} bg={C.chip.purple.bg}
          label="Audit Aktivitas" desc="Siapa mengubah / menghapus / menyetujui apa, kapan"
          to="/audit"
        />

        <Text style={styles.section}>Persetujuan</Text>
        <MenuCard
          icon="location" color={C.chip.danger.fg} bg={C.chip.danger.bg}
          label="Approval Lokasi Toko" desc="Setujui / tolak usulan perbarui koordinat dari sales"
          to="/spv-approval"
          count={pendingCount && pendingCount > 0 ? pendingCount : null}
        />

        <Text style={styles.section}>Kelola</Text>
        <MenuCard
          icon="calendar" color="#6D28D9" bg="#EDE9FE"
          label="Izin Sales" desc="Tandai sales tidak masuk / tidak keliling (bebas target harian)"
          to="/izin"
        />
        <MenuCard
          icon="key" color={C.chip.purple.fg} bg={C.chip.purple.bg}
          label="Kelola Akun Sales" desc="Ubah peran / area, reset password"
          to="/kelola-akun"
        />
        <Text style={styles.note}>Kelola Toko sekarang ada di Beranda → Akses Cepat.</Text>
      </ScrollView>

      <TabBar active="spv" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  note: { fontSize: 12, color: GRAY, marginTop: 2, paddingHorizontal: 4, fontStyle: "italic" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink },
  badgeSmall: { backgroundColor: RED, borderRadius: 12, minWidth: 22, height: 22, justifyContent: "center", alignItems: "center", paddingHorizontal: 6, marginRight: 6 },
  badgeSmallText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  section: { fontSize: 12, fontWeight: "800", color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 22, marginBottom: 8, paddingHorizontal: 4 },
  menuCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  iconBox: { width: 44, height: 44, borderRadius: R.md, justifyContent: "center", alignItems: "center", marginRight: 12 },
  menuLabel: { fontSize: 15, fontWeight: "800", color: C.ink },
  menuDesc: { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 16, flexShrink: 1 },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: R.md, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
});
