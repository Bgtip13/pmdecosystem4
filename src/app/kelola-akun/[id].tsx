import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toFriendlyError } from "../../lib/msg";
import AppIcon from "../../components/AppIcon";
import { theme } from "../../lib/theme";
import { TOP_PAD } from "../../lib/layout";

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
const GREEN = C.status.success.fg;
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const ROLES = [
  ["owner", "Owner"],
  ["field", "Sales Lapangan"],
  ["telemarketing", "Telemarketing"],
  ["supervisor", "Supervisor"],
];
// Role yang tidak terikat area tertentu
const NO_AREA_ROLES = ["supervisor", "owner"];

export default function EditAkun() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const updateUser = useMutation(api.users.updateUserRoleArea);
  const resetPwd = useAction(api.users.adminResetPassword);
  const deleteUser = useMutation(api.users.deleteUserByAdmin);

  const [role, setRole] = useState("field");
  const [area, setArea] = useState("SOLO");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const list = useQuery(api.users.listUsersManage, {}) as any;
  const target = (list ?? []).find((u: any) => u._id === id);

  useEffect(() => {
    if (!target) return;
    setRole(target.role);
    setArea(target.area ?? "SOLO");
  }, [target]);

  if (!target) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const isSelf = viewer?._id === id;
  const username = (target.email ?? "").replace(/@pmd\.local$/i, "");
  const noArea = NO_AREA_ROLES.includes(role);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateUser({
        userId: id as any,
        role: role as any,
        area: noArea ? undefined : (area as any),
      });
      Alert.alert("Tersimpan", "Peran & area akun diperbarui.");
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    Alert.alert("Reset Password?", `${target.name} akan kembali login dengan pmd123 dan wajib mengganti password di login berikutnya.`, [
      { text: "Batal", style: "cancel" },
      { text: "Ya, Reset", style: "destructive", onPress: async () => {
          setResetting(true);
          try {
            await resetPwd({ username, newPassword: "pmd123" });
            Alert.alert("Berhasil", "Password direset ke pmd123.");
          } catch (e: any) {
            Alert.alert("Gagal", toFriendlyError(e));
          } finally {
            setResetting(false);
          }
        } },
    ]);
  };

  const onDeleteAccount = () => {
    Alert.alert(
      "Hapus Akun Permanen?",
      `Akun ${target.name} akan dihapus & tidak bisa login lagi. Riwayat kunjungan lama tetap tersimpan. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Hapus",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteUser({ userId: id as any });
              Alert.alert("Terhapus", "Akun telah dihapus.");
              router.back();
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="back" size={16} color={RED} style={{ marginRight: 4 }} />
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Akun</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(target.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={styles.name}>{target.name}</Text>
            <Text style={styles.email}>{target.email?.replace("@pmd.local", "") ?? "-"}</Text>
            {target.mustChangePassword ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <AppIcon name="warn" size={12} color="#B54708" style={{ marginRight: 4 }} />
                <Text style={styles.mustText}>Sedang wajib ganti password</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>PERAN</Text>
        <View style={styles.chipRow}>
          {ROLES.map(([k, lbl]: any) => {
            const on = role === k;
            const disabled = isSelf && k !== "supervisor";
            return (
              <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive, disabled && styles.chipDisabled]} onPress={() => !disabled && setRole(k)} disabled={disabled}>
                <Text style={[styles.chipText, on && styles.chipTextActive, disabled && styles.chipTextDisabled]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {isSelf ? <Text style={styles.note}>Kamu tidak bisa menurunkan peranmu sendiri dari Supervisor.</Text> : null}

        {noArea ? (
          <Text style={styles.note}>
            {role === "owner"
              ? "Owner adalah akun pemilik perusahaan — melihat semua data, tanpa aksi operasional, dan tidak terikat area."
                : "Supervisor melihat semua area — tidak terikat area tertentu."}
          </Text>
        ) : (
          <>
            <Text style={styles.label}>AREA</Text>
            <View style={styles.chipRow}>
              {AREAS.map((a) => {
                const on = area === a;
                return (
                  <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setArea(a)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>RESET PASSWORD</Text>
        {isSelf ? (
          <Text style={styles.note}>Untuk akunmu sendiri, gunakan menu Ganti Password di layar Akun.</Text>
        ) : (
          <View style={styles.resetCard}>
            <Text style={styles.resetDesc}>
              Kembalikan password ke <Text style={{ fontWeight: "800" }}>pmd123</Text> & wajibkan ganti saat login berikutnya.
            </Text>
            <TouchableOpacity style={[styles.btnReset, resetting && { opacity: 0.6 }]} onPress={onReset} disabled={resetting}>
              <AppIcon name="key" size={15} color="#912018" style={{ marginRight: 6 }} />
              <Text style={styles.btnResetText}>{resetting ? "Mereset..." : "Reset Password"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isSelf ? (
          <>
            <Text style={styles.label}>HAPUS AKUN</Text>
            <View style={styles.deleteCard}>
              <Text style={styles.resetDesc}>
                Menghapus akun ini secara permanen beserta semua sesi loginnya.
              </Text>
              <TouchableOpacity style={[styles.btnDelete, deleting && { opacity: 0.6 }]}
                onPress={onDeleteAccount} disabled={deleting}>
                <AppIcon name="trash" size={15} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnDeleteText}>{deleting ? "Menghapus..." : "Hapus Akun Permanen"}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
          <Text style={styles.btnText}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surface, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 4 },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 16, borderWidth: 1, borderColor: C.border, ...SHADOW },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 20, fontWeight: "800", color: RED },
  name: { fontSize: 16, fontWeight: "800", color: C.ink },
  email: { fontSize: 13, color: GRAY, marginTop: 2 },
  mustText: { fontSize: 12, fontWeight: "700", color: C.status.warning.fg },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8, marginBottom: 6, backgroundColor: C.surface },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 13, color: C.inkSoft, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  chipTextDisabled: { color: GRAY },
  note: { fontSize: 12, color: GRAY, marginTop: 8, lineHeight: 17 },
  resetCard: { backgroundColor: C.status.warning.bg, borderWidth: 1, borderColor: C.status.warning.border, borderRadius: R.md, padding: 14 },
  resetDesc: { fontSize: 13, color: C.status.warning.fg, lineHeight: 18 },
  btnReset: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.chip.danger.bg, borderRadius: R.md, padding: 14, marginTop: 12 },
  btnResetText: { color: "#912018", fontWeight: "800", fontSize: 14 },
  deleteCard: { backgroundColor: C.status.danger.bg, borderWidth: 1, borderColor: C.status.danger.border, borderRadius: R.md, padding: 14 },
  btnDelete: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: RED, borderRadius: R.md, padding: 14, marginTop: 12 },
  btnDeleteText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
  btnPrimary: { backgroundColor: RED, borderRadius: R.md, padding: 17, alignItems: "center", ...SHADOW },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

