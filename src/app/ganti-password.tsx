import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";

export default function GantiPassword() {
  const router = useRouter();
  const changePwd = useAction(api.users.changeMyPassword);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    if (pw.length < 6) {
      Alert.alert("Password Lemah", "Minimal 6 karakter.");
      return;
    }
    if (pw !== pw2) {
      Alert.alert("Tidak Cocok", "Konfirmasi password berbeda.");
      return;
    }
    setBusy(true);
    try {
      await changePwd({ newPassword: pw });
      Alert.alert("Berhasil ✅", "Password kamu sudah diganti.");
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ganti Password</Text>
      </View>

      <View style={{ padding: 16 }}>
        <View style={styles.card}>
          <Text style={styles.label}>PASSWORD BARU</Text>
          <TextInput
            style={styles.input}
            value={pw}
            onChangeText={setPw}
            placeholder="Minimal 6 karakter"
            secureTextEntry
            autoCapitalize="none"
          />
          <Text style={styles.label}>ULANGI PASSWORD BARU</Text>
          <TextInput
            style={styles.input}
            value={pw2}
            onChangeText={setPw2}
            placeholder="Ketik ulang password"
            secureTextEntry
            autoCapitalize="none"
          />
          <Text style={styles.note}>Hindari pmd123 — pilih password yang hanya kamu yang tahu.</Text>
        </View>

        <TouchableOpacity style={[styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={onSave} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Menyimpan..." : "Simpan Password Baru"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#EEF0F3" },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 13, fontSize: 15, color: "#111" },
  note: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center", marginTop: 20 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
