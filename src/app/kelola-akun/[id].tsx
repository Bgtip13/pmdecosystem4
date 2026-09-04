import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const ROLES = [
  ["field", "Sales Lapangan"],
  ["telemarketing", "Telemarketing"],
  ["supervisor", "Supervisor"],
];

export default function EditAkun() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const updateUser = useMutation(api.users.updateUserRoleArea);
  const resetPwd = useAction(api.users.adminResetPassword);

  const [role, setRole] = useState("field");
  const [area, setArea] = useState("SOLO");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

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

  const onSave = async () => {
    setSaving(true);
    try {
      await updateUser({ userId: id as any, role: role as any, area: role === "supervisor" ? undefined : (area as any) });
      Alert.alert("Tersimpan ✅", "Peran & area akun diperbarui.");
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
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
            Alert.alert("Berhasil ✅", "Password direset ke pmd123.");
          } catch (e: any) {
            Alert.alert("Gagal", e?.message ?? "Coba lagi.");
          } finally {
            setResetting(false);
          }
        } },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
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
              <Text style={styles.mustText}>⚠ Sedang wajib ganti password</Text>
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

        {role === "supervisor" ? (
          <Text style={styles.note}>Supervisor melihat semua area — tidak terikat area tertentu.</Text>
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
              <Text style={styles.btnResetText}>{resetting ? "Mereset..." : "🔑 Reset Password"}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#EEF0F3" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFE4E6", justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 20, fontWeight: "800", color: RED },
  name: { fontSize: 16, fontWeight: "800", color: "#111" },
  email: { fontSize: 13, color: GRAY, marginTop: 2 },
  mustText: { fontSize: 12, fontWeight: "700", color: "#B54708", marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  chipTextDisabled: { color: GRAY },
  note: { fontSize: 12, color: GRAY, marginTop: 8, lineHeight: 17 },
  resetCard: { backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FEDF89", borderRadius: 14, padding: 14 },
  resetDesc: { fontSize: 13, color: "#B54708", lineHeight: 18 },
  btnReset: { backgroundColor: "#FFE4E6", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 12 },
  btnResetText: { color: "#912018", fontWeight: "800", fontSize: 14 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
