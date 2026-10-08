import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";

export default function GantiPassword() {
  const router = useRouter();
  const changePwd = useAction(api.users.changeMyPassword);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSave = pw.length >= 6 && pw === pw2 && !busy;

  // Kekuatan sederhana: panjang + campuran huruf & angka
  const strength = pw.length === 0 ? 0 : pw.length < 6 ? 1 : /[A-Za-z]/.test(pw) && /\d/.test(pw) ? (pw.length >= 10 ? 3 : 2) : 1;
  const strengthLabel = ["", "Lemah", "Cukup", "Kuat"][strength];
  const strengthColor = ["#D0D5DD", RED, "#B54708", GREEN][strength];

  const onSave = async () => {
    setErr("");
    if (pw.length < 6) { setErr("Password minimal 6 karakter."); return; }
    if (pw !== pw2) { setErr("Konfirmasi password berbeda."); return; }
    setBusy(true);
    try {
      await changePwd({ newPassword: pw });
      Alert.alert("Berhasil ✅", "Password kamu sudah diganti.");
      router.back();
    } catch (e: any) {
      setErr(toFriendlyError(e));
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
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputFlex}
              value={pw}
              onChangeText={(t) => { setPw(t); setErr(""); }}
              placeholder="Minimal 6 karakter"
              placeholderTextColor="#98A2B3"
              secureTextEntry={!show1}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShow1((s) => !s)}>
              <Text style={styles.eyeText}>{show1 ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          {pw.length > 0 ? (
            <View style={styles.meterRow}>
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.meterBar, { backgroundColor: i <= strength ? strengthColor : "#EAECF0" }]}
                />
              ))}
              <Text style={[styles.meterText, { color: strengthColor }]}>{strengthLabel}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>ULANGI PASSWORD BARU</Text>
          <View style={[styles.inputRow, mismatch && styles.inputRowBad]}>
            <TextInput
              style={styles.inputFlex}
              value={pw2}
              onChangeText={(t) => { setPw2(t); setErr(""); }}
              placeholder="Ketik ulang password"
              placeholderTextColor="#98A2B3"
              secureTextEntry={!show2}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShow2((s) => !s)}>
              <Text style={styles.eyeText}>{show2 ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          {mismatch ? <Text style={styles.warn}>Konfirmasi belum sama.</Text> : null}
          {pw2.length > 0 && !mismatch && pw.length >= 6 ? (
            <Text style={styles.ok}>✓ Kedua password sudah sama.</Text>
          ) : null}

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Text style={styles.note}>Hindari pmd123 — pilih password yang hanya kamu yang tahu.</Text>
        </View>

        <TouchableOpacity
          style={[styles.btnPrimary, !canSave && styles.btnOff]}
          onPress={onSave}
          disabled={!canSave}
        >
          <Text style={styles.btnText}>{busy ? "Menyimpan..." : "Simpan Password Baru"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F0D9D5" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#EEF0F3" },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12 },
  inputRowBad: { borderColor: "#FECDCA", backgroundColor: "#FFF5F4" },
  inputFlex: { flex: 1, padding: 13, fontSize: 15, color: "#111" },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  eyeText: { fontSize: 16 },
  meterRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  meterBar: { flex: 1, height: 4, borderRadius: 2, marginRight: 4 },
  meterText: { fontSize: 11, fontWeight: "800", marginLeft: 6, minWidth: 44, textAlign: "right" },
  warn: { fontSize: 12, color: "#B42318", fontWeight: "700", marginTop: 6 },
  ok: { fontSize: 12, color: GREEN, fontWeight: "700", marginTop: 6 },
  err: { fontSize: 12, color: "#B42318", fontWeight: "700", marginTop: 10, backgroundColor: "#FEF3F2", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 10, padding: 10 },
  note: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center", marginTop: 20 },
  btnOff: { backgroundColor: "#F2A9A3" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
