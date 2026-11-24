import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import Constants from "expo-constants";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { toFriendlyError } from "../lib/msg";
import { A } from "../components/desktop/tokens";

const APP_VERSION = Constants.expoConfig?.version ?? "4.0.6";
const NATIVE_VERSION = Constants.nativeAppVersion ?? null;

const roleLabel: any = { owner: "Owner", field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor", ppic: "PPIC", hr: "HR", akunting: "Akunting" };

export default function AkunWeb() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer) as any;
  const unread = useQuery(api.notifications.unreadCount) as any;
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const recordActivity = useMutation(api.activity.record);
  const saveMyPhoto = useMutation(api.users.saveMyPhoto);
  const [loggingOut, setLoggingOut] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;
  }

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      try { await recordActivity({ action: "auth.logout", summary: `Logout dari web (${roleLabel[viewer.role] ?? viewer.role})` }); } catch {}
      try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("pmd.login.logged"); } catch {}
      await signOut();
      router.replace("/");
    } catch (e: any) {
      setLoggingOut(false);
      Alert.alert("Gagal Keluar", "Coba lagi.");
    }
  };

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
      Alert.alert("Tersimpan", "Foto profil kamu sudah diperbarui.");
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

  const MenuRow = ({ icon, label, desc, onPress, count }: any) => (
    <TouchableOpacity style={s.menuRow} activeOpacity={0.85} onPress={onPress}>
      <View style={s.menuIcon}>
        <AppIcon name={icon} size={15} color={A.blue} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.menuLabel}>{label}</Text>
        {desc ? <Text style={s.menuDesc}>{desc}</Text> : null}
      </View>
      {count > 0 ? (
        <View style={s.menuBadge}><Text style={s.menuBadgeText}>{count > 9 ? "9+" : count}</Text></View>
      ) : null}
      <AppIcon name="chevron" size={15} color={A.muted} />
    </TouchableOpacity>
  );

  const Info = ({ label, value, last }: any) => (
    <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );

  const initial = (viewer.name || "?").charAt(0).toUpperCase();

  return (
    <DesktopShell active="akun" title="Akun" subtitle="Profil, keamanan, dan informasi aplikasi">
      <View style={s.cols}>
        {/* Profil */}
        <View style={s.panel}>
          <View style={s.panelHead}><Text style={s.panelTitle}>Profil Pengguna</Text></View>
          <View style={s.profileBody}>
            <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} disabled={photoBusy}>
              {viewer.image ? (
                <Image source={{ uri: viewer.image }} style={s.avatarImg} />
              ) : (
                <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
              )}
              <View style={s.avatarBadge}>
                <AppIcon name={photoBusy ? "clock" : "camera"} size={11} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name}>{viewer.name}</Text>
              <Text style={s.meta}>@{viewer.email?.replace("@pmd.local", "") ?? "-"}</Text>
              <Text style={s.meta}>{roleLabel[viewer.role] ?? viewer.role} • {viewer.area || "Semua Area"}</Text>
              <View style={s.photoActions}>
                <TouchableOpacity onPress={pickPhoto} disabled={photoBusy}>
                  <Text style={s.photoLink}>{photoBusy ? "Memproses..." : viewer.image ? "Ganti foto" : "Pasang foto"}</Text>
                </TouchableOpacity>
                {viewer.image ? (
                  <TouchableOpacity onPress={removePhoto} disabled={photoBusy}>
                    <Text style={s.photoRemove}>Hapus</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          <View style={s.profileMeta}>
            <Info label="ID Karyawan" value={`@${viewer.email?.replace("@pmd.local", "") ?? "-"}`} />
            <Info label="Peran" value={roleLabel[viewer.role] ?? viewer.role} />
            <Info label="Area Kerja" value={viewer.area || "Semua Area"} />
            <Info label="Status Akun" value="Aktif" last />
          </View>
        </View>

        {/* Menu akun */}
        <View style={s.panel}>
          <View style={s.panelHead}><Text style={s.panelTitle}>Pengaturan Akun</Text></View>
          <View style={{ paddingVertical: 4 }}>
            <MenuRow icon="bell" label="Notifikasi" desc="Pesan supervisor & sistem" onPress={() => router.push("/notifikasi" as any)} count={unread ?? 0} />
            <MenuRow icon="key" label="Ganti Password" desc="Perbarui password akunmu" onPress={() => router.push("/ganti-password" as any)} />
            <MenuRow icon="logout" label="Keluar dari aplikasi" desc="Akhiri sesi di perangkat ini" onPress={doLogout} />
          </View>
        </View>
      </View>

      <View style={s.cols}>
        {/* Tentang */}
        <View style={s.panel}>
          <View style={s.panelHead}><Text style={s.panelTitle}>Tentang Aplikasi</Text></View>
          <View style={s.panelBody}>
            <View style={s.aboutHead}>
              <Image source={require("../../assets/logo.png")} style={s.logo} resizeMode="contain" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.appName}>PMD Ecosystem 4.0</Text>
                <Text style={s.appVersion}>Versi v{APP_VERSION}</Text>
                {NATIVE_VERSION && NATIVE_VERSION !== APP_VERSION ? (
                  <Text style={s.appVersion}>Build terpasang: v{NATIVE_VERSION}</Text>
                ) : null}
              </View>
            </View>
            <Text style={s.desc}>
              Aplikasi resmi internal CV Prima Mandiri Distribusi untuk mendukung kegiatan sales lapangan &
              telemarketing: kunjungan toko, SPK, piutang, dan monitoring.
            </Text>
          </View>
        </View>

        {/* Informasi */}
        <View style={s.panel}>
          <View style={s.panelHead}><Text style={s.panelTitle}>Informasi</Text></View>
          <View style={s.panelBody}>
            <Info label="Pengembang" value="NB Projects" />
            <Info label="Tahun Rilis" value="2026" />
            <Info label="Perusahaan" value="CV Prima Mandiri Distribusi" />
            <Info label="Platform" value="Web" last />
          </View>
        </View>
      </View>

      {/* Lisensi */}
      <View style={[s.panel, s.panelWide]}>
        <View style={s.panelHead}><Text style={s.panelTitle}>Lisensi & Hak Cipta</Text></View>
        <View style={s.panelBody}>
          <Text style={s.license}>
            © 2026 CV Prima Mandiri Distribusi. Hak cipta dan kepemilikan kode sumber sepenuhnya milik perusahaan.
            Dilarang menggandakan atau mendistribusikan tanpa izin tertulis.
          </Text>
          <Text style={s.license}>PMD Ecosystem 4.0 adalah perangkat lunak internal perusahaan.</Text>
          <Text style={s.license}>
            Penggunaan hanya diperuntukkan bagi karyawan CV Prima Mandiri Distribusi yang berwenang.
            Seluruh data toko, kunjungan, dan piutang bersifat rahasia.
          </Text>
        </View>
      </View>

      <View style={s.devBar}>
        <Image source={require("../../assets/nb-projects.png")} style={s.devLogo} resizeMode="contain" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.devName}>NB Projects</Text>
          <Text style={s.devSub}>Dikembangkan oleh Bagus Triawan Isa Putra</Text>
        </View>
        <View style={s.versionChip}><Text style={s.versionChipText}>v{APP_VERSION}</Text></View>
      </View>

      <TouchableOpacity style={[s.logoutBtn, loggingOut && { opacity: 0.6 }]} onPress={doLogout} disabled={loggingOut}>
        <AppIcon name="logout" size={15} color={A.red} style={{ marginRight: 6 }} />
        <Text style={s.logoutText}>{loggingOut ? "Keluar..." : "Keluar"}</Text>
      </TouchableOpacity>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  cols: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  panel: { flexBasis: 420, flexGrow: 1, minWidth: 300, backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 20, overflow: "hidden", shadowColor: "#1C2033", shadowOpacity: 0.06, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } },
  panelWide: { flexBasis: "auto" as any, flexGrow: 0 },
  panelHead: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  panelTitle: { fontSize: 16, fontWeight: "700", color: A.ink, letterSpacing: -0.3 },
  panelBody: { padding: 20, paddingTop: 12 },

  profileBody: { flexDirection: "row", alignItems: "center", padding: 20 },
  profileMeta: { borderTopWidth: 1, borderTopColor: A.borderSoft, paddingHorizontal: 20, paddingVertical: 4 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: A.ink, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 72, height: 72, borderRadius: 36, backgroundColor: A.surfaceAlt },
  avatarText: { fontSize: 24, fontWeight: "700", color: "#fff" },
  avatarBadge: {
    position: "absolute", right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: A.navy, borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 18, letterSpacing: -0.4, fontWeight: "700", color: A.ink },
  meta: { fontSize: 13, color: A.muted, marginTop: 2 },
  photoActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  photoLink: { fontSize: 12.5, fontWeight: "700", color: A.ink },
  photoRemove: { fontSize: 12.5, fontWeight: "700", color: A.red },

  menuRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft, gap: 10,
  },
  menuIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: A.brandSoft, borderWidth: 1, borderColor: A.brandBorder,
    alignItems: "center", justifyContent: "center",
  },
  menuLabel: { fontSize: 14, fontWeight: "700", color: A.ink },
  menuDesc: { fontSize: 12.5, color: A.muted, marginTop: 1 },
  menuBadge: { backgroundColor: A.red, borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  menuBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  aboutHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logo: { width: 44, height: 44, borderRadius: 9, backgroundColor: A.surfaceAlt },
  appName: { fontSize: 15, fontWeight: "700", color: A.ink },
  appVersion: { fontSize: 12.5, color: A.muted, marginTop: 2 },
  desc: { fontSize: 13, color: A.muted, lineHeight: 20 },

  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  infoLabel: { fontSize: 13, color: A.muted },
  infoValue: { fontSize: 13, fontWeight: "700", color: A.ink, flexShrink: 1, textAlign: "right" },

  license: { fontSize: 12.5, color: A.muted, lineHeight: 19, marginBottom: 6 },

  devBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 20, padding: 16,
  },
  devLogo: { width: 34, height: 34 },
  devName: { fontSize: 14, fontWeight: "700", color: A.ink },
  devSub: { fontSize: 12.5, color: A.muted, marginTop: 1 },
  versionChip: { backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  versionChipText: { fontSize: 11.5, color: A.muted, fontWeight: "700" },

  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    alignSelf: "flex-start",
    backgroundColor: A.redSoft, borderWidth: 0,
    borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11,
  },
  logoutText: { color: A.red, fontSize: 13.5, fontWeight: "700" },
});
