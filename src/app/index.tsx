import { useState } from "react";
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";

export default function Index() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer) as any;

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={RED} />
      </View>
    );
  }
  if (!isAuthenticated) return <Login />;
  if (viewer?.mustChangePassword) return <ChangePassword />;
  return <Redirect href="/beranda" />;
}

function Login() {
  const { signIn } = useAuthActions();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    if (!username.trim() || !password) { setError("ID dan password wajib diisi."); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("email", username.trim().toLowerCase() + "@pmd.local");
      form.append("password", password);
      form.append("flow", "signIn");
      await signIn("password", form);
    } catch (e: any) {
      setError("ID atau password salah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.logo}>PMD</Text>
            <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>PMD Ecosystem 4.0</Text>
      <TextInput style={styles.input} placeholder="ID (contoh: bagus)"
        autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry
        value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={doLogin} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Memproses..." : "Masuk"}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function ChangePassword() {
  const changeMyPassword = useAction(api.users.changeMyPassword);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw1.length < 6) { setError("Password minimal 6 karakter."); return; }
    if (pw1 !== pw2) { setError("Konfirmasi password tidak sama."); return; }
    setBusy(true); setError("");
    try {
      await changeMyPassword({ newPassword: pw1 });
    } catch (e: any) {
      setError("Gagal menyimpan. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Ganti Password</Text>
      <Text style={styles.subtitle}>Kamu wajib mengganti password sebelum lanjut.</Text>
      <TextInput style={styles.input} placeholder="Password baru" secureTextEntry value={pw1} onChangeText={setPw1} />
      <TextInput style={styles.input} placeholder="Ulangi password baru" secureTextEntry value={pw2} onChangeText={setPw2} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Menyimpan..." : "Simpan Password"}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
    logo: { width: 104, height: 104, alignSelf: "center", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 8, color: "#111" },
  subtitle: { fontSize: 14, textAlign: "center", color: GRAY, marginTop: 4, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12, backgroundColor: "#F9FAFB" },
  btn: { backgroundColor: RED, borderRadius: 10, padding: 16, alignItems: "center", marginTop: 6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: RED, textAlign: "center", marginBottom: 8 },
});
