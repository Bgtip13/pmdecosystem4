import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const AREAS = ["SOLO", "DIY", "SEMARANG"];

export default function EditToko() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const store = useQuery(api.stores.getStore, { storeId: id as any }) as any;
  const updateStore = useMutation(api.stores.updateStore);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pic, setPic] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [area, setArea] = useState("SOLO");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store) return;
    setName(store.name ?? "");
    setPhone(store.phone ?? "");
    setPic(store.pic ?? "");
    setAddress(store.address ?? "");
    setLat(store.lat != null ? String(store.lat) : "");
    setLng(store.lng != null ? String(store.lng) : "");
    setArea(store.area ?? "SOLO");
    setStatus(store.status ?? "active");
  }, [store]);

  if (!store) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  const onSave = async () => {
    const latV = lat.trim() === "" ? undefined : parseFloat(lat.replace(",", "."));
    const lngV = lng.trim() === "" ? undefined : parseFloat(lng.replace(",", "."));
    if ((latV === undefined) !== (lngV === undefined)) {
      Alert.alert("Koordinat", "Isi latitude & longitude sekaligus, atau kosongkan keduanya.");
      return;
    }
    if (latV !== undefined && (isNaN(latV) || latV < -90 || latV > 90)) {
      Alert.alert("Latitude", "Nilai tidak valid (rentang -90 s.d. 90).");
      return;
    }
    if (lngV !== undefined && (isNaN(lngV) || lngV < -180 || lngV > 180)) {
      Alert.alert("Longitude", "Nilai tidak valid (rentang -180 s.d. 180).");
      return;
    }
    setSaving(true);
    try {
      await updateStore({
        storeId: id as any,
        name,
        phone,
        pic,
        address,
        lat: latV,
        lng: lngV,
        area: area as any,
        status: status as any,
      });
      Alert.alert("Tersimpan ✅", "Data toko diperbarui.");
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Toko</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.label}>NAMA TOKO *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nama toko" />

        <Text style={styles.label}>AREA *</Text>
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

        <Text style={styles.label}>NO HP</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="No HP toko" keyboardType="phone-pad" />

        <Text style={styles.label}>PIC</Text>
        <TextInput style={styles.input} value={pic} onChangeText={setPic} placeholder="Nama PIC" />

        <Text style={styles.label}>ALAMAT *</Text>
        <TextInput style={[styles.input, styles.inputMultiline]} value={address} onChangeText={setAddress} placeholder="Alamat lengkap" multiline />

        <Text style={styles.label}>KOORDINAT (LAT, LNG)</Text>
        <View style={{ flexDirection: "row" }}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} value={lat} onChangeText={setLat} placeholder="Lat, cth: -7.6000" keyboardType="numbers-and-punctuation" />
          <TextInput style={[styles.input, { flex: 1 }]} value={lng} onChangeText={setLng} placeholder="Lng, cth: 110.8800" keyboardType="numbers-and-punctuation" />
        </View>

        <Text style={styles.label}>STATUS</Text>
        <View style={styles.chipRow}>
          {[["active", "Aktif"], ["disabled", "Nonaktif"]].map(([k, lbl]: any) => {
            const on = status === k;
            return (
              <TouchableOpacity key={k} style={[styles.chip, on && k === "active" && styles.chipActive, on && k === "disabled" && styles.chipDisable]} onPress={() => setStatus(k)}>
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.note}>
          {status === "disabled" ? "Toko nonaktif tidak bisa di-check-in oleh sales dan tidak muncul di daftar kunjungan." : "Toko aktif muncul di daftar kunjungan sales."}
        </Text>
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
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 13, fontSize: 15, color: "#111" },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipDisable: { backgroundColor: "#475467", borderColor: "#475467" },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  note: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
