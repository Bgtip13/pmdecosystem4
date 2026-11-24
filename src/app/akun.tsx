import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from "react-native";
import { Text } from "../components/AppText";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import Constants from "expo-constants";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import AppIcon from "../components/AppIcon";
import { toFriendlyError } from "../lib/msg";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";
import { useColors, useStyles, useTheme } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
import { resetLoginLogged } from "../lib/sessionLog";

const { radius: R } = theme;

const SHADOW = {
  shadowColor: "#101828",
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Versi aplikasi: otomatis ikut app.json saat update dipublikasikan
const APP_VERSION = Constants.expoConfig?.version ?? "4.0.6";

// Versi native yang terpasang di HP ini (tidak berubah oleh OTA).
// Hanya tampil kalau berbeda dengan versi bundle — penanda update belum masuk.
const NATIVE_VERSION = Constants.nativeAppVersion ?? null;

export default function Akun() {
  const C = useColors();
  const { pref, setPref } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer) as any;
  const unread = useQuery(api.notifications.unreadCount) as any;
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveMyPhoto = useMutation(api.users.saveMyPhoto);
  const recordActivity = useMutation(api.activity.record);
  const [loggingOut, setLoggingOut] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!viewer) return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await recordActivity({ action: "auth.logout", summary: "Logout dari aplikasi HP" }).catch(() => {});
      resetLoginLogged();
      await signOut();
      router.replace("/");
    } catch (e: any) {
      setLoggingOut(false);
      Alert.alert("Gagal Keluar", "Coba lagi.");
    }
  };

  // ===== FOTO PROFIL =====
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin Galeri", "Aktifkan izin galeri untuk memilih foto profil.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (res.canceled) return;
    const a = res.assets[0];
    setPhotoBusy(true);
    try {
      const url = await generateUploadUrl();
      const up = await expoFetch(url, {
        method: "POST",
        headers: { "Content-Type": a.mimeType ?? "image/jpeg" },
        body: new File(a.uri),
      });
      if (!up.ok) throw new Error("Upload foto gagal (" + up.status + ").");
      const json: any = await up.json();
      await saveMyPhoto({ storageId: json.storageId });
      Alert.alert("Tersimpan ✅", "Foto profil kamu sudah diperbarui.");
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = () => {
    setPhotoBusy(true);
    saveMyPhoto({})
      .then(() => Alert.alert("Terhapus", "Foto dihapus — kembali memakai inisial nama."))
      .catch((e: any) => Alert.alert("Gagal", toFriendlyError(e)))
      .finally(() => setPhotoBusy(false));
  };

  const openPhotoMenu = () => {
    const opts: any[] = [{ text: viewer.image ? "Ganti foto" : "Pilih foto dari galeri", onPress: pickPhoto }];
    if (viewer.image) opts.push({ text: "Hapus foto", style: "destructive", onPress: removePhoto });
    opts.push({ text: "Batal", style: "cancel" });
    Alert.alert("Foto Profil", "Pilih tindakan untuk foto profilmu.", opts);
  };

  const roleLabel: any = { owner: "Owner", field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor", ppic: "PPIC", hr: "HR", akunting: "Akunting" };
  const areaLabel = viewer.area ? viewer.area : "Semua Area";

  const MenuRow = ({ icon, color, label, desc, onPress, count }: any) => (
    <TouchableOpacity style={styles.menuCard} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.menuIcon, { backgroundColor: (color ?? C.primary) + "1A" }]}>
        <AppIcon name={icon} size={18} color={color ?? C.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {desc ? <Text style={styles.menuDesc}>{desc}</Text> : null}
      </View>
      {count > 0 ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      ) : null}
      <AppIcon name="chevron" size={18} color={C.inkFaint} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
        <Text style={styles.title}>Akun</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Profil */}
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={openPhotoMenu} activeOpacity={0.85} disabled={photoBusy}>
            {viewer.image ? (
              <Image source={{ uri: viewer.image }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(viewer.name || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <AppIcon name={photoBusy ? "clock" : "camera"} size={12} color={C.onPrimary} />
            </View>
          </TouchableOpacity>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={styles.name}>{viewer.name}</Text>
            <Text style={styles.meta}>@{viewer.email?.replace("@pmd.local", "") ?? "-"}</Text>
            <Text style={styles.meta}>{roleLabel[viewer.role] ?? viewer.role} • {areaLabel}</Text>
            <Text style={styles.photoHint}>
              {photoBusy ? "Memproses foto..." : viewer.image ? "Ketuk foto untuk ganti / hapus" : "Ketuk untuk pasang foto profil"}
            </Text>
          </View>
        </View>

        {/* Menu */}
        <MenuRow icon="bell" color={C.primary} label="Notifikasi" desc="Pesan supervisor & sistem" onPress={() => router.push("/notifikasi")} count={unread ?? 0} />
        <MenuRow icon="key" color={C.role.field} label="Ganti Password" desc="Perbarui password akunmu" onPress={() => router.push("/ganti-password")} />

        {/* Tampilan */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tampilan</Text>
          <View style={styles.segWrap}>
            {([["otomatis", "Otomatis"], ["terang", "Terang"], ["gelap", "Gelap"]] as const).map(([k, l]) => (
              <TouchableOpacity key={k} style={[styles.seg, pref === k && styles.segOn]} onPress={() => setPref(k)} activeOpacity={0.85}>
                <Text style={[styles.segText, pref === k && styles.segTextOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.line}>Otomatis mengikuti pengaturan tampilan di HP Anda.</Text>
        </View>

        {/* Tentang Aplikasi */}
        <View style={styles.card}>
          <View style={styles.aboutHead}>
            <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.appName}>PMD Ecosystem 4.0</Text>
              <Text style={styles.appVersion}>Versi v{APP_VERSION}</Text>
              {NATIVE_VERSION && NATIVE_VERSION !== APP_VERSION ? (
                <Text style={styles.appBuild}>Build terpasang: v{NATIVE_VERSION}</Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.desc}>
            Aplikasi resmi internal CV Prima Mandiri Distribusi untuk mendukung kegiatan sales lapangan & telemarketing: Kunjungan toko, SPK,Piutang dan Monitoring.
          </Text>
        </View>

        {/* Informasi */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informasi</Text>
          <Row label="Pengembang" value="NB Projects" />
          <Row label="Tahun Rilis" value="2026" />
          <Row label="Perusahaan" value="CV Prima Mandiri Distribusi" />
          <Row label="Platform" value="Android" last />
        </View>

        {/* Lisensi & Hak Cipta */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lisensi & Hak Cipta</Text>
          <Text style={styles.line}>
            © 2026 CV Prima Mandiri Distribusi. Hak cipta dan kepemilikan kode sumber sepenuhnya milik perusahaan. Dilarang menggandakan atau mendistribusikan tanpa izin tertulis.
          </Text>
          <Text style={styles.line}>
            PMD Ecosystem 4.0 adalah perangkat lunak internal perusahaan.
          </Text>
          <Text style={styles.line}>
            Penggunaan hanya diperuntukkan bagi karyawan CV Prima Mandiri Distribusi yang
            berwenang. Seluruh data toko, kunjungan, dan piutang bersifat rahasia.
          </Text>
        </View>

        {/* Dikembangkan oleh */}
        <View style={styles.devCard}>
          <Image source={require("../../assets/nb-projects.png")} style={styles.devLogo} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.devName}>NB Projects</Text>
            <Text style={styles.devSub}>Dikembangkan oleh Bagus Triawan Isa Putra</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, loggingOut && { opacity: 0.6 }]} onPress={doLogout} disabled={loggingOut}>
          <AppIcon name="logout" size={16} color={C.primaryDark} style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>{loggingOut ? "Keluar..." : "Keluar"}</Text>
        </TouchableOpacity>
      </ScrollView>

      <TabBar active="akun" />
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: C.surfaceTint,
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  brand: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 2 },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  body: { padding: 20, paddingBottom: 130 },
  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 16, borderWidth: 1, borderColor: C.border, ...SHADOW },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.surfaceAlt },
  avatarText: { color: C.onPrimary, fontSize: 24, fontWeight: "900" },
  avatarBadge: { position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.surface },
  name: { fontSize: 18, fontWeight: "800", color: C.ink },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 2 },
  photoHint: { fontSize: 11, color: C.inkFaint, marginTop: 4, fontStyle: "italic" },
  menuCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginTop: 12, borderWidth: 1, borderColor: C.border, ...SHADOW },
  menuIcon: { width: 44, height: 44, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 15, fontWeight: "800", color: C.ink },
  menuDesc: { fontSize: 12, color: C.inkMuted, marginTop: 1 },
  menuBadge: { backgroundColor: C.primary, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 6, justifyContent: "center", alignItems: "center", marginRight: 6 },
  menuBadgeText: { color: C.onPrimary, fontSize: 11, fontWeight: "800" },
  card: { backgroundColor: C.surface, borderRadius: R.xl, padding: 16, marginTop: 14, borderWidth: 1, borderColor: C.border, ...SHADOW },
  aboutHead: { flexDirection: "row", alignItems: "center" },
  logo: { width: 64, height: 64, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.divider },
  appName: { fontSize: 16, fontWeight: "800", color: C.ink },
  appVersion: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  appBuild: { fontSize: 11, color: C.inkFaint, marginTop: 1 },
  desc: { fontSize: 13, color: C.inkSoft, lineHeight: 19, marginTop: 12 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.ink, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowLabel: { fontSize: 13, color: C.inkMuted },
  rowValue: { fontSize: 13, color: C.ink, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  line: { fontSize: 12, color: C.ink2, lineHeight: 18, marginTop: 6 },
  devCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginTop: 14, borderWidth: 1, borderColor: C.border, ...SHADOW },
  devLogo: { width: 56, height: 56, borderRadius: R.md, backgroundColor: C.surfaceAlt },
  devName: { fontSize: 15, fontWeight: "800", color: C.ink },
  devSub: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.status.danger.bg, borderWidth: 1, borderColor: C.status.danger.border, borderRadius: R.lg, padding: 16, marginTop: 14 },
  logoutText: { color: C.primaryDark, fontWeight: "800", fontSize: 15 },
  segWrap: { flexDirection: "row", backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 4, marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: C.divider },
  seg: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segOn: { backgroundColor: C.primary },
  segText: { fontSize: 13, fontWeight: "700", color: C.inkMuted },
  segTextOn: { color: C.onPrimary },
});
