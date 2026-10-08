import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";


const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const VIEW_ROLES = ["supervisor", "owner", "field", "telemarketing"];

export default function EditToko() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
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

  const role = viewer?.role;
  const canEdit = role === "supervisor";
  const allowed = VIEW_ROLES.includes(role);

  if (!store || !viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Akses khusus</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const doPatch = async (payload: any) => {
    await updateStore({
      storeId: id as any,
      name: name.trim() || store.name,
      phone,
      pic,
      address: address.trim() || store.address,
      lat: payload.lat,
      lng: payload.lng,
      area: area as any,
      status: payload.status,
    });
  };

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
    if (!name.trim()) { Alert.alert("Nama", "Nama toko wajib diisi."); return; }
    if (!address.trim()) { Alert.alert("Alamat", "Alamat wajib diisi."); return; }
    setSaving(true);
    try {
      await doPatch({ lat: latV, lng: lngV, status });
      Alert.alert("Tersimpan ✅", "Data toko diperbarui.");
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const quickToggle = (next: string) => {
    const turningOff = next === "disabled";
    Alert.alert(
      turningOff ? "Nonaktifkan Toko?" : "Aktifkan Toko?",
      turningOff
        ? `"${store.name}" tidak akan muncul di daftar kunjungan sales & tidak bisa di-check-in. Lanjutkan?`
        : `"${store.name}" akan aktif kembali dan muncul di daftar kunjungan sales. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: turningOff ? "Ya, Nonaktifkan" : "Ya, Aktifkan",
          style: turningOff ? "destructive" : "default",
          onPress: async () => {
            setSaving(true);
            try {
              await doPatch({ lat: store.lat, lng: store.lng, status: next });
              setStatus(next);
              Alert.alert("Selesai", turningOff ? "Toko dinonaktifkan." : "Toko diaktifkan.");
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const inputStyle = [styles.input, !canEdit && styles.inputReadonly];

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{canEdit ? "Edit Toko" : "Detail Toko"}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: canEdit ? 150 : 40 }}>
        {!canEdit ? (
          <View style={styles.viewBanner}>
            <Text style={styles.viewBannerText}>👀 Mode lihat — perubahan data toko hanya bisa dilakukan supervisor.</Text>
          </View>
        ) : status === "disabled" ? (
          <View style={styles.offBanner}>
            <Text style={styles.offBannerText}>Toko ini NONAKTIF — tidak muncul di daftar kunjungan sales.</Text>
          </View>
        ) : null}

        <Text style={styles.label}>NAMA TOKO *</Text>
        <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Nama toko" editable={canEdit} />

        <Text style={styles.label}>AREA *</Text>
        {canEdit ? (
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
        ) : (
          <Text style={styles.readValue}>{area || "-"}</Text>
        )}

        <Text style={styles.label}>NO HP</Text>
        <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="No HP toko" keyboardType="phone-pad" editable={canEdit} />

        <Text style={styles.label}>PIC</Text>
        <TextInput style={inputStyle} value={pic} onChangeText={setPic} placeholder="Nama PIC" editable={canEdit} />

        <Text style={styles.label}>ALAMAT *</Text>
        <TextInput style={[inputStyle, styles.inputMultiline]} value={address} onChangeText={setAddress} placeholder="Alamat lengkap" multiline editable={canEdit} />

        <Text style={styles.label}>KOORDINAT (LAT, LNG)</Text>
        <View style={{ flexDirection: "row" }}>
          <TextInput style={[inputStyle, { flex: 1, marginRight: 8 }]} value={lat} onChangeText={setLat} placeholder="Lat, cth: -7.6000" keyboardType="numbers-and-punctuation" editable={canEdit} />
          <TextInput style={[inputStyle, { flex: 1 }]} value={lng} onChangeText={setLng} placeholder="Lng, cth: 110.8800" keyboardType="numbers-and-punctuation" editable={canEdit} />
        </View>

        <Text style={styles.label}>STATUS</Text>
        {canEdit ? (
          <>
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
              {status === "disabled"
                ? "Toko nonaktif tidak bisa di-check-in oleh sales dan tidak muncul di daftar kunjungan."
                : "Toko aktif muncul di daftar kunjungan sales."}
            </Text>
          </>
        ) : (
          <View style={[styles.readChip, { backgroundColor: status === "active" ? "#DCFAE6" : "#F2F4F7", alignSelf: "flex-start" }]}>
            <Text style={[styles.readChipText, { color: status === "active" ? GREEN : GRAY }]}>
              {status === "active" ? "✓ Aktif" : "Nonaktif"}
            </Text>
          </View>
        )}

        {canEdit ? (
          status === "active" ? (
            <TouchableOpacity style={[styles.btnDanger, saving && { opacity: 0.6 }]} onPress={() => quickToggle("disabled")} disabled={saving}>
              <Text style={styles.btnDangerText}>{saving ? "Menyimpan..." : "✕ Nonaktifkan Toko"}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btnRestore, saving && { opacity: 0.6 }]} onPress={() => quickToggle("active")} disabled={saving}>
              <Text style={styles.btnRestoreText}>{saving ? "Menyimpan..." : "✓ Aktifkan Toko"}</Text>
            </TouchableOpacity>
          )
        ) : null}
      </ScrollView>

      {canEdit ? (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
            <Text style={styles.btnText}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 13, fontSize: 15, color: "#111" },
  inputReadonly: { backgroundColor: "#F9FAFB", color: "#475467" },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipDisable: { backgroundColor: "#475467", borderColor: "#475467" },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  readValue: { fontSize: 15, color: "#111", fontWeight: "600", paddingVertical: 4 },
  readChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  readChipText: { fontSize: 12, fontWeight: "800" },
  note: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },
  viewBanner: { backgroundColor: "#E0F2FE", borderRadius: 10, borderWidth: 1, borderColor: "#BAE6FD", padding: 12, marginBottom: 6 },
  viewBannerText: { color: "#026AA2", fontSize: 13, fontWeight: "700" },
  offBanner: { backgroundColor: "#FFF1F0", borderRadius: 10, borderWidth: 1, borderColor: "#FECDCA", padding: 12, marginBottom: 6 },
  offBannerText: { color: "#B42318", fontSize: 13, fontWeight: "700" },
  btnDanger: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 18 },
  btnDangerText: { color: "#B42318", fontWeight: "800", fontSize: 14 },
  btnRestore: { backgroundColor: "#DCFAE6", borderWidth: 1, borderColor: "#ABEFC6", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 18 },
  btnRestoreText: { color: GREEN, fontWeight: "800", fontSize: 14 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333", textAlign: "center" },
});
