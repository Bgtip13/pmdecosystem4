import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import BrandMark from "../components/BrandMark";
import LoadingScreen from "../components/LoadingScreen";
import { A, FONT } from "../components/desktop/tokens";

// Khusus WEB — login merah-putih. APK tetap memakai index.tsx.
export default function IndexWeb() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer) as any;

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return <LoadingScreen />;
  }
  if (!isAuthenticated) return <Login />;
  if (viewer?.mustChangePassword) return <ChangePassword />;
  return <Redirect href="/beranda" />;
}

function BrandPanel() {
  return (
    <LinearGradient
      colors={["#ECEBFB", "#E4EEF7", "#DDF1F3"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.brandPanel}
    >
      <View style={styles.brandTopRow}>
        <View style={styles.logoTile}>
          <BrandMark size={30} />
        </View>
        <View>
          <Text style={styles.brandName}>PMD Ecosystem 4.0</Text>
          <Text style={styles.brandSub}>Prima Mandiri Distribusi</Text>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={styles.heroTitle}>Seluruh operasional,{`\n`}satu layar yang tenang.</Text>
        <Text style={styles.heroDesc}>
          Pantau kunjungan sales, SPK, follow-up piutang, dan pencapaian area. Setiap perubahan tercatat otomatis.
        </Text>

        {/* pratinjau dekoratif dashboard */}
        <View style={styles.previewWrap}>
          <View style={[styles.previewCard, { width: 230 }]}>
            <View style={styles.previewHead}>
              <View style={[styles.previewIcon, { backgroundColor: "#EFECFD" }]}><AppIcon name="list" size={13} color="#6A55D8" /></View>
              <Text style={styles.previewLabel}>Aktivitas tim hari ini</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={styles.previewNum}>128</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
                {[10, 16, 12, 22, 18, 26, 30].map((h, i) => (
                  <View key={i} style={{ width: 6, height: h, borderRadius: 2, backgroundColor: "#14161B", opacity: i === 6 ? 1 : 0.25 }} />
                ))}
              </View>
            </View>
          </View>
          <View style={[styles.previewCard, { width: 270, marginLeft: 38, marginTop: -6 }]}>
            <Text style={styles.previewLabel}>Menunggu Anda</Text>
            {[["Usulan lokasi toko", "Tinjau", "#FFF1DB", "#B25E09"], ["Pengajuan jadwal", "Tinjau", "#EFECFD", "#6A55D8"]].map((r, i) => (
              <View key={i} style={styles.previewRow}>
                <Text style={styles.previewRowText}>{r[0]}</Text>
                <View style={[styles.previewPill, { backgroundColor: r[2] }]}><Text style={[styles.previewPillText, { color: r[3] }]}>{r[1]}</Text></View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.brandFootRow}>
        <Text style={styles.brandFoot}>© 2026 CV Prima Mandiri Distribusi</Text>
        <View style={styles.securePill}>
          <AppIcon name="shield" size={11} color="#3A3F4C" />
          <Text style={styles.secureText}>Akses internal</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function Login() {
  const { signIn } = useAuthActions();
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [username, setUsername] = useState(() => {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem("pmd.lastId") ?? "" : "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("pmd.login.logged"); } catch {}
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem("pmd.lastId", username.trim().toLowerCase());
      } catch {}
    } catch (e: any) {
      setError("ID atau password salah. Periksa kembali lalu coba lagi.");
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        {!compact ? <BrandPanel /> : null}

        <ScrollView
          contentContainerStyle={[styles.form, compact && styles.formCompact]}
          keyboardShouldPersistTaps="handled"
        >
          {compact ? (
            <View style={styles.compactBrand}>
              <View style={styles.compactLogoTile}>
                <BrandMark size={30} />
              </View>
              <View>
                <Text style={styles.compactBrandName}>PMD Ecosystem 4.0</Text>
                <Text style={styles.compactBrandSub}>Prima Mandiri Distribusi</Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.formEyebrow}>SELAMAT DATANG</Text>
          <Text style={styles.formTitle}>Masuk ke akun Anda</Text>
          <Text style={styles.formSub}>Gunakan ID karyawan dan password yang diberikan admin.</Text>

          <Text style={styles.label}>ID Karyawan</Text>
          <View style={styles.inputWrap}>
            <AppIcon name="user" size={15} color={A.mutedSoft} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="contoh: bagus"
              placeholderTextColor={A.mutedSoft}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              onSubmitEditing={doLogin}
            />
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Password</Text>
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.labelAction}>{showPassword ? "Sembunyikan" : "Lihat"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrap}>
            <AppIcon name="lock" size={15} color={A.mutedSoft} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Masukkan password"
              placeholderTextColor={A.mutedSoft}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={doLogin}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <AppIcon name="warn" size={14} color={A.red} style={{ marginRight: 6 }} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, busy && { opacity: 0.7 }]}
            onPress={doLogin}
            disabled={busy}
            activeOpacity={0.88}
          >
            <Text style={styles.btnText}>{busy ? "Memverifikasi…" : "Masuk ke Dashboard"}</Text>
            {!busy ? <AppIcon name="chevron" size={15} color="#fff" style={{ marginLeft: 7 }} /> : null}
          </TouchableOpacity>

          <View style={styles.formDivider} />
          <Text style={styles.formHint}>
            Lupa password? Hubungi supervisor atau admin untuk reset akun.
          </Text>
          <Text style={styles.formFoot}>PMD Ecosystem v4.0.4 • Akses terbatas</Text>
        </ScrollView>
      </View>
    </View>
  );
}

function ChangePassword() {
  const changeMyPassword = useAction(api.users.changeMyPassword);
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
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
    <View style={styles.wrap}>
      <View style={[styles.card, compact && styles.cardCompact]}>
        {!compact ? <BrandPanel /> : null}
        <ScrollView contentContainerStyle={[styles.form, compact && styles.formCompact]} keyboardShouldPersistTaps="handled">
          <Text style={styles.formEyebrow}>KEAMANAN AKUN</Text>
          <Text style={styles.formTitle}>Ganti password</Text>
          <Text style={styles.formSub}>Kamu wajib mengganti password sebelum melanjutkan.</Text>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Password baru</Text>
            <TouchableOpacity onPress={() => setShow((v) => !v)}>
              <Text style={styles.labelAction}>{show ? "Sembunyikan" : "Lihat"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrap}>
            <AppIcon name="lock" size={15} color={A.mutedSoft} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Minimal 6 karakter"
              placeholderTextColor={A.mutedSoft}
              secureTextEntry={!show}
              value={pw1}
              onChangeText={setPw1}
            />
          </View>

          <Text style={styles.label}>Ulangi password baru</Text>
          <View style={styles.inputWrap}>
            <AppIcon name="lock" size={15} color={A.mutedSoft} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ketik ulang password"
              placeholderTextColor={A.mutedSoft}
              secureTextEntry={!show}
              value={pw2}
              onChangeText={setPw2}
              onSubmitEditing={save}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <AppIcon name="warn" size={14} color={A.red} style={{ marginRight: 6 }} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, busy && { opacity: 0.7 }]}
            onPress={save}
            disabled={busy}
            activeOpacity={0.88}
          >
            <Text style={styles.btnText}>{busy ? "Menyimpan…" : "Simpan password"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: A.page },
  card: {
    width: "100%", maxWidth: 1080, minHeight: 600, flexDirection: "row", overflow: "hidden",
    backgroundColor: A.surface, borderRadius: 32, borderWidth: 1, borderColor: A.border,
    shadowColor: "#1C2033", shadowOpacity: 0.12, shadowRadius: 50, shadowOffset: { width: 0, height: 24 },
  },
  cardCompact: { maxWidth: 480, minHeight: 0, flexDirection: "column", borderRadius: 26 },

  // Panel kiri
  brandPanel: { flex: 1.05, padding: 36 },
  brandTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoTile: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 15, fontWeight: "800", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  brandSub: { fontSize: 12, color: A.muted, marginTop: 2, fontFamily: FONT },
  heroTitle: { fontSize: 32, fontWeight: "800", color: A.ink, letterSpacing: -1.2, lineHeight: 38, fontFamily: FONT },
  heroDesc: { fontSize: 14, color: A.inkSoft, lineHeight: 22, marginTop: 14, maxWidth: 380, fontFamily: FONT },
  previewWrap: { marginTop: 34 },
  previewCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 14, shadowColor: "#1C2033", shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewIcon: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  previewLabel: { fontSize: 12, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  previewNum: { fontSize: 30, fontWeight: "800", color: A.ink, letterSpacing: -1, fontFamily: FONT },
  previewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, backgroundColor: "#F6F7FA", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  previewRowText: { fontSize: 12, fontWeight: "600", color: A.ink, fontFamily: FONT },
  previewPill: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  previewPillText: { fontSize: 10.5, fontWeight: "800", fontFamily: FONT },
  brandFootRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandFoot: { fontSize: 11.5, color: A.muted, fontFamily: FONT },
  securePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  secureText: { fontSize: 11, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },

  // Form
  form: { flexGrow: 1, justifyContent: "center", padding: 48, minWidth: 380 },
  formCompact: { padding: 26, minWidth: 0 },
  compactBrand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  compactLogoTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.border, alignItems: "center", justifyContent: "center" },
  compactBrandName: { fontSize: 15, fontWeight: "800", color: A.ink, fontFamily: FONT },
  compactBrandSub: { fontSize: 12, color: A.muted, fontFamily: FONT },
  formEyebrow: { fontSize: 11.5, fontWeight: "800", color: A.muted, letterSpacing: 1, fontFamily: FONT },
  formTitle: { fontSize: 28, fontWeight: "800", color: A.ink, letterSpacing: -1, marginTop: 6, fontFamily: FONT },
  formSub: { fontSize: 13.5, color: A.muted, marginTop: 6, marginBottom: 26, lineHeight: 20, fontFamily: FONT },
  label: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, marginBottom: 7, marginTop: 4, fontFamily: FONT },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  labelAction: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, marginBottom: 7, fontFamily: FONT },
  inputWrap: { flexDirection: "row", alignItems: "center", height: 48, borderRadius: 14, borderWidth: 1, borderColor: A.border, backgroundColor: A.surfaceAlt, paddingHorizontal: 14, marginBottom: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14.5, color: A.ink, fontFamily: FONT, padding: 0, outlineStyle: "none" } as any,
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: A.redSoft, borderRadius: 12, padding: 12, marginBottom: 14 },
  error: { flex: 1, fontSize: 12.5, color: A.red, fontWeight: "600", fontFamily: FONT },
  btn: { height: 50, borderRadius: 14, backgroundColor: A.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 6 },
  btnText: { color: "#fff", fontSize: 14.5, fontWeight: "800", fontFamily: FONT },
  formDivider: { height: 1, backgroundColor: A.borderSoft, marginTop: 26, marginBottom: 16 },
  formHint: { fontSize: 12.5, color: A.muted, lineHeight: 19, fontFamily: FONT },
  formFoot: { fontSize: 11.5, color: A.mutedSoft, marginTop: 10, fontFamily: FONT },
});
