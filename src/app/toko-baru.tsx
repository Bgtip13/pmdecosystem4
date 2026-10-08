import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as Location from "expo-location";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R, shadow: SH } = theme;

const RED = C.primary;
const GRAY = C.inkMuted;

export default function TokoBaru() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const addStore = useMutation(api.stores.addStore);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  const doSave = async () => {
    if (!name.trim()) return Alert.alert("Lengkapi Data", "Nama toko wajib diisi.");
    if (!address.trim()) return Alert.alert("Lengkapi Data", "Alamat wajib diisi.");
    if (viewer.role === "supervisor" && !area) return Alert.alert("Lengkapi Data", "Pilih area toko.");

    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi (GPS) untuk mendaftarkan toko di lokasi.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      await addStore({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        // supervisor memilih area; sales memakai area akunnya (server yang menentukan)
        area: viewer.role === "supervisor" ? (area as "SOLO" | "DIY" | "SEMARANG") : undefined,
      });

      Alert.alert("Berhasil ✅", "Toko baru terdaftar.", [
        { text: "OK", onPress: () => router.replace("/beranda") },
      ]);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? toFriendlyError(e) ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ label, active, onPress }: any) => (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Daftarkan Toko Baru</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.label}>Nama toko *</Text>
        <TextInput style={styles.input} placeholder="Nama toko" placeholderTextColor={C.inkFaint} value={name} onChangeText={setName} />

        <Text style={styles.label}>No. HP *</Text>
        <TextInput style={styles.input} placeholder="contoh: 0812xxxx" placeholderTextColor={C.inkFaint} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <Text style={styles.label}>Alamat *</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Alamat lengkap toko" placeholderTextColor={C.inkFaint} multiline value={address} onChangeText={setAddress} />

        {viewer.role === "supervisor" ? (
          <>
            <Text style={styles.label}>Area *</Text>
            <View style={styles.chipRow}>
              {["SOLO", "DIY", "SEMARANG"].map((a) => (
                <Chip key={a} label={a} active={area === a} onPress={() => setArea(a)} />
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            📍 Saat menyimpan, posisi GPS kamu saat ini akan dipakai sebagai koordinat toko. Pastikan kamu berada di lokasi toko.
          </Text>
        </View>

        <TouchableOpacity style={[styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={doSave} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Mendeteksi GPS..." : "📍 Simpan & Daftarkan"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: SH.elevation,
  },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 6 },

  label: { fontSize: 12, fontWeight: "800", color: C.inkSoft, marginBottom: 6, marginTop: 14, letterSpacing: 0.3, textTransform: "uppercase" },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md,
    padding: 13, fontSize: 15, color: C.ink,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },

  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 18, paddingVertical: 9, marginRight: 8, backgroundColor: C.surface },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 14, color: C.inkSoft, fontWeight: "700" },
  chipTextActive: { color: "#fff" },

  noteBox: { backgroundColor: C.status.warning.bg, borderWidth: 1, borderColor: C.status.warning.border, borderRadius: R.md, padding: 12, marginTop: 18 },
  noteText: { fontSize: 13, color: C.status.warning.fg, lineHeight: 18 },

  btnPrimary: {
    backgroundColor: RED, borderRadius: R.md, padding: 17, alignItems: "center", marginTop: 22,
    shadowColor: RED, shadowOpacity: 0.25, shadowRadius: 10, elevation: 3,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
