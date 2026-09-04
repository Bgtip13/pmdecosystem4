import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as Location from "expo-location";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";

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
        area: viewer.role === "supervisor" ? area : undefined,
      });

      Alert.alert("Berhasil ✅", "Toko baru terdaftar.", [
        { text: "OK", onPress: () => router.replace("/beranda") },
      ]);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
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
        <TextInput style={styles.input} placeholder="Nama toko" value={name} onChangeText={setName} />

        <Text style={styles.label}>No. HP *</Text>
        <TextInput style={styles.input} placeholder="contoh: 0812xxxx" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <Text style={styles.label}>Alamat *</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Alamat lengkap toko" multiline value={address} onChangeText={setAddress} />

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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14 },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 6 },
  label: { fontSize: 13, fontWeight: "700", color: "#344054", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 13, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9, marginRight: 8, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 14, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  noteBox: { backgroundColor: "#FFF7ED", borderRadius: 10, padding: 12, marginTop: 16 },
  noteText: { fontSize: 13, color: "#B54708", lineHeight: 18 },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center", marginTop: 20 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
