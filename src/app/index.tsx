import { useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import BrandMark from "../components/BrandMark";
import LoadingScreen from "../components/LoadingScreen";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
import { ROLE_LABEL } from "../lib/roles";
import { loginAlreadyLogged, markLoginLogged } from "../lib/sessionLog";

export default function Index() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer) as any;
  const record = useMutation(api.activity.record);

  // Catat login di APK (sekali per sesi aplikasi; web dicatat oleh DesktopShell).
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!isAuthenticated || !viewer?.role || viewer?.mustChangePassword) return;
    if (loginAlreadyLogged()) return;
    markLoginLogged();
    record({
      action: "auth.login",
      summary: `Login ke aplikasi HP (${ROLE_LABEL[viewer.role] ?? viewer.role})`,
    }).catch(() => {});
  }, [isAuthenticated, viewer?.role, viewer?.mustChangePassword]);

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return <LoadingScreen />;
  }
  if (!isAuthenticated) return <Login />;
  if (viewer?.mustChangePassword) return <ChangePassword />;
  return <Redirect href="/beranda" />;
}

function Login() {
  const C = useColors();
  const styles = useStyles(createStyles);
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Dekorasi */}
      <View style={[styles.deco, styles.decoBig]} />
      <View style={[styles.deco, styles.decoSmall]} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <BrandMark size={132} style={{ alignSelf: "center" }} />

        <View style={styles.headWrap}>
          <Text style={styles.title}>PMD Ecosystem 4.0</Text>
          <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Aplikasi Internal • CV Prima Mandiri Distribusi</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>ID Karyawan</Text>
          <TextInput
            style={styles.input}
            placeholder="contoh: bagus"
            placeholderTextColor={C.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={C.inkFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? (
            <View style={styles.errorBox}>
              <AppIcon name="warn" size={15} color={C.status.danger.fg} style={{ marginRight: 6 }} />
              <Text style={[styles.error, { flex: 1, textAlign: "left" }]}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, busy && { opacity: 0.6 }]}
            onPress={doLogin}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{busy ? "Memproses..." : "Masuk"}</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>Gunakan ID & password yang diberikan oleh admin.</Text>
        </View>

        <Text style={styles.footer}>© 2026 PMD Ecosystem • v4.0.4</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChangePassword() {
  const C = useColors();
  const styles = useStyles(createStyles);
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.deco, styles.decoBig]} />
      <View style={[styles.deco, styles.decoSmall]} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <BrandMark size={88} style={{ alignSelf: "center", marginBottom: 6 }} />
        <Text style={styles.title}>Ganti Password</Text>
        <Text style={styles.subtitle}>Kamu wajib mengganti password sebelum lanjut.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Password baru</Text>
          <TextInput style={styles.input} placeholder="Minimal 6 karakter" placeholderTextColor={C.inkFaint}
            secureTextEntry value={pw1} onChangeText={setPw1} />

          <Text style={styles.label}>Ulangi password baru</Text>
          <TextInput style={styles.input} placeholder="Ketik ulang" placeholderTextColor={C.inkFaint}
            secureTextEntry value={pw2} onChangeText={setPw2} />

          {error ? (
            <View style={styles.errorBox}>
              <AppIcon name="warn" size={15} color={C.status.danger.fg} style={{ marginRight: 6 }} />
              <Text style={[styles.error, { flex: 1, textAlign: "left" }]}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, busy && { opacity: 0.6 }]}
            onPress={save}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{busy ? "Menyimpan..." : "Simpan Password"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  deco: { position: "absolute", backgroundColor: C.decoTint, borderRadius: 999 },
  decoBig: { width: 320, height: 320, top: -130, right: -120 },
  decoSmall: { width: 200, height: 200, bottom: -80, left: -90 },

  body: { flexGrow: 1, justifyContent: "center", padding: 28, paddingVertical: 60 },
  logo: { width: 132, height: 132, alignSelf: "center" },
  logoSmall: { width: 88, height: 88, alignSelf: "center", marginBottom: 6 },

  headWrap: { alignItems: "center", marginTop: 10, marginBottom: 22 },
  title: { fontSize: 24, fontWeight: "900", color: C.ink0, textAlign: "center", letterSpacing: 0.2 },
  subtitle: { fontSize: 14, color: C.inkMuted, marginTop: 4, textAlign: "center" },
  pill: { backgroundColor: C.card, borderWidth: 1, borderColor: C.borderTint2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 12 },
  pillText: { fontSize: 11, color: C.primaryDark, fontWeight: "700" },

  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.hairline2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  label: { fontSize: 13, fontWeight: "700", color: C.inkSoft, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: C.surfaceAlt3, borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 14, fontSize: 16, marginBottom: 14, color: C.ink0 },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: C.status.danger.bg, borderWidth: 1, borderColor: C.status.danger.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  error: { color: C.status.danger.fg, fontSize: 13, fontWeight: "700" },
  btn: { backgroundColor: C.primary, borderRadius: 14, padding: 17, alignItems: "center", marginTop: 2, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  btnText: { color: C.onPrimary, fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  hint: { fontSize: 12, color: C.inkFaint, textAlign: "center", marginTop: 14, lineHeight: 17 },
  footer: { fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 26 },
});
