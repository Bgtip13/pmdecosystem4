import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import BrandMark from "../components/BrandMark";
import { A, FONT } from "../components/desktop/tokens";

// Khusus WEB — login merah-putih. APK tetap memakai index.tsx.
export default function IndexWeb() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer) as any;

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingTile}>
          <BrandMark size={52} />
        </View>
        <IOSSpinner size="large" color={A.brand} style={{ marginTop: 18 }} />
        <Text style={styles.loadingText}>Menyiapkan PMD Ecosystem…</Text>
      </View>
    );
  }
  if (!isAuthenticated) return <Login />;
  if (viewer?.mustChangePassword) return <ChangePassword />;
  return <Redirect href="/beranda" />;
}

function BrandPanel() {
  return (
    <LinearGradient
      colors={["#5E150E", "#8E2418", "#C3281C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.brandPanel}
    >
      <View style={styles.brandTopRow}>
        <View style={styles.logoTile}>
          <BrandMark size={33} />
        </View>
        <View>
          <Text style={styles.brandName}>PMD ECOSYSTEM 4.0</Text>
          <Text style={styles.brandSub}>Prima Mandiri Distribusi</Text>
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={styles.heroTag}>
          <View style={styles.heroTagDot} />
          <Text style={styles.heroTagText}>SISTEM OPERASIONAL INTERNAL</Text>
        </View>
        <Text style={styles.heroTitle}>Satu tempat untuk{`\n`}seluruh operasional.</Text>
        <Text style={styles.heroDesc}>
          Pantau kunjungan sales, SPK, follow-up piutang, dan pencapaian area
          dalam satu dasbor yang ringkas.
        </Text>

        <View style={styles.heroList}>
          <HeroPoint text="Monitoring kunjungan & target harian" />
          <HeroPoint text="Antrean follow-up piutang dan orderan" />
          <HeroPoint text="Laporan PCP, ekspedisi, dan FU toko" />
        </View>
      </View>

      <View style={styles.brandFootRow}>
        <Text style={styles.brandFoot}>© 2026 CV Prima Mandiri Distribusi</Text>
        <View style={styles.securePill}>
          <AppIcon name="shield" size={11} color="#FFD9D4" />
          <Text style={styles.secureText}>Akses internal</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function HeroPoint({ text }: { text: string }) {
  return (
    <View style={styles.heroItem}>
      <View style={styles.heroCheck}>
        <AppIcon name="check" size={10} color="#FFFFFF" />
      </View>
      <Text style={styles.heroItemText}>{text}</Text>
    </View>
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
  center: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: A.page, padding: 24,
    ...(Platform.OS === "web" ? ({ minHeight: "100vh" } as any) : {}),
  },
  loadingTile: {
    width: 74, height: 74, borderRadius: 18,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.brandBorder,
    alignItems: "center", justifyContent: "center",
  },
  loadingLogo: { width: 52, height: 52 },
  loadingText: { color: A.muted, fontSize: 11.5, marginTop: 10, fontWeight: "600", fontFamily: FONT },

  wrap: {
    flex: 1, backgroundColor: "#EFE8E4",
    justifyContent: "center", alignItems: "center", padding: 24,
    ...(Platform.OS === "web" ? ({ minHeight: "100vh" } as any) : {}),
  },
  card: {
    width: "100%", maxWidth: 1000,
    flexDirection: "row",
    backgroundColor: A.surface,
    borderWidth: 1, borderColor: A.border,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#3B1D16", shadowOpacity: 0.16, shadowRadius: 40,
    shadowOffset: { width: 0, height: 18 }, elevation: 8,
  },
  cardCompact: { maxWidth: 440, flexDirection: "column", borderRadius: 14 },

  // ===== Panel merek =====
  brandPanel: {
    width: "47%",
    padding: 34,
    justifyContent: "space-between",
  },
  brandTopRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  logoTile: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: 33, height: 33 },
  brandName: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 1, fontFamily: FONT },
  brandSub: { fontSize: 10, color: "#F3C8C2", marginTop: 3, fontFamily: FONT },

  heroTag: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.26)",
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 16,
  },
  heroTagDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFC9C2" },
  heroTagText: { fontSize: 8, fontWeight: "800", color: "#FFE4E0", letterSpacing: 1, fontFamily: FONT },
  heroTitle: { fontSize: 30, fontWeight: "800", color: "#FFFFFF", lineHeight: 39, letterSpacing: -0.9, fontFamily: FONT },
  heroDesc: { fontSize: 12, color: "#F7D6D1", marginTop: 14, lineHeight: 19, maxWidth: 340, fontFamily: FONT },
  heroList: { marginTop: 22, gap: 9 },
  heroItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroCheck: {
    width: 17, height: 17, borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  heroItemText: { fontSize: 11, color: "#FFE7E3", fontWeight: "500", fontFamily: FONT },

  brandFootRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  brandFoot: { fontSize: 9, color: "#E8B6AF", fontFamily: FONT },
  securePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.16)", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  secureText: { fontSize: 8, color: "#FFD9D4", fontWeight: "700", fontFamily: FONT },

  // ===== Form =====
  form: { flexGrow: 1, justifyContent: "center", padding: 46, paddingVertical: 52 },
  formCompact: { padding: 26, paddingVertical: 30 },
  formEyebrow: { fontSize: 8.5, fontWeight: "800", color: A.brand, letterSpacing: 1.4, marginBottom: 8, fontFamily: FONT },
  formTitle: { fontSize: 24, fontWeight: "800", color: A.ink, letterSpacing: -0.6, fontFamily: FONT },
  formSub: { fontSize: 11.5, color: A.muted, marginTop: 6, marginBottom: 24, lineHeight: 17, fontFamily: FONT },

  label: {
    fontSize: 9, fontWeight: "800", color: A.inkSoft,
    letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: FONT,
  },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  labelAction: { fontSize: 9.5, fontWeight: "700", color: A.brand, marginBottom: 6, fontFamily: FONT },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
    borderRadius: 8, paddingHorizontal: 11, marginBottom: 15,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, paddingVertical: 11, fontSize: 12.5, color: A.ink,
    outlineStyle: "none", fontFamily: FONT,
  } as any,

  errorBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.brandSoft, borderWidth: 1, borderColor: A.brandBorder,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 13,
  },
  error: { color: A.red, fontSize: 10.5, fontWeight: "600", flex: 1, lineHeight: 15, fontFamily: FONT },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: A.brand, borderRadius: 9,
    paddingVertical: 12, marginTop: 4,
  },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.2, fontFamily: FONT },
  formDivider: { height: 1, backgroundColor: A.borderSoft, marginTop: 22, marginBottom: 14 },
  formHint: { fontSize: 10, color: A.muted, textAlign: "center", lineHeight: 16, fontFamily: FONT },
  formFoot: { fontSize: 8.5, color: A.mutedSoft, textAlign: "center", marginTop: 12, fontFamily: FONT },

  compactBrand: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: A.cream, borderWidth: 1, borderColor: A.brandBorder,
    borderRadius: 10, padding: 10, marginBottom: 22,
  },
  compactLogoTile: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  compactLogo: { width: 30, height: 30 },
  compactBrandName: { fontSize: 11.5, fontWeight: "800", color: A.ink, letterSpacing: 0.2, fontFamily: FONT },
  compactBrandSub: { fontSize: 8.5, color: A.muted, marginTop: 1, fontFamily: FONT },
});
