import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as Location from "expo-location";
import { api } from "../../../convex/_generated/api";
import { theme } from "../../lib/theme";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;

export default function LuarJadwal() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const adHoc = useMutation(api.jadwal.adHocCheckIn);

  // tunggu 500 ms setelah berhenti mengetik, baru cari ke server
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 500);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery(
    api.jadwal.searchStores,
    qDeb.length >= 2 ? { q: qDeb, limit: 20 } : "skip"
  ) as any;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/jadwal" as any);
  };

  const runCheckIn = async (store: any) => {
    setBusyId(store._id);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi untuk check-in.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const isMock = !!((pos as any).mocked);

      const res: any = await adHoc({
        storeId: store._id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        mock: isMock,
      });

      Alert.alert(
        res?.diLuarRadius ? "Check-in tercatat (di luar radius)" : "Check-in berhasil ✅",
        (res?.diLuarRadius ? `Kamu ${res?.jarakM ?? "?"} m dari toko. ` : "") +
          "Kunjungan luar jadwal dimulai. Lanjutkan isi SPK & foto.",
        [{ text: "Isi SPK", onPress: () => router.push(`/visit/${res.visitId}` as any) }]
      );
    } catch (e: any) {
      Alert.alert("Gagal check-in", toFriendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const onPick = (store: any) => {
    if (store.sudahDikunjungi) {
      Alert.alert(
        "Sudah dikunjungi bulan ini",
        `"${store.name}" sudah dikunjungi ${store.kunjunganBulanIni}x bulan ini. Aturannya 1 toko 1x per bulan.`
      );
      return;
    }
    Alert.alert(
      "Kunjungan luar jadwal?",
      `Mulai kunjungan ke "${store.name}" sekarang? Toko ini tidak ada di jadwal hari ini.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Check-In", onPress: () => runCheckIn(store) },
      ]
    );
  };

  const renderItem = ({ item }: any) => {
    const busy = busyId === item._id;
    return (
      <TouchableOpacity
        style={[styles.card, item.sudahDikunjungi && { opacity: 0.55 }]}
        activeOpacity={0.85}
        disabled={busy}
        onPress={() => onPick(item)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: "#F2F4F7" }]}>
              <Text style={[styles.badgeText, { color: GRAY }]}>{item.area}</Text>
            </View>
            {item.sudahDikunjungi ? (
              <View style={[styles.badge, { backgroundColor: "#FEE4E2", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: "#B42318" }]}>sudah dikunjungi</Text>
              </View>
            ) : null}
            {!item.lat ? (
              <View style={[styles.badge, { backgroundColor: "#FEF0C7", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: "#B54708" }]}>tanpa koordinat</Text>
              </View>
            ) : null}
          </View>
          {item.address ? <Text style={styles.addr} numberOfLines={2}>{item.address}</Text> : null}
        </View>
        {busy ? <ActivityIndicator size="small" color={RED} /> : <Text style={styles.arrow}>›</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Kunjungan Luar Jadwal</Text>
        <Text style={styles.meta}>Toko di luar jadwal hari ini. Tetap 1 toko 1x per bulan.</Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama toko (min. 2 huruf)…"
          placeholderTextColor="#98A2B3"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {qDeb.length < 2 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Ketik minimal 2 huruf</Text>
          <Text style={styles.emptySub}>Pencarian baru dijalankan setelah itu, biar hemat.</Text>
        </View>
      ) : results === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : (results as any[]).length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tidak ada toko yang cocok</Text>
          <Text style={styles.emptySub}>Kalau tokonya baru, daftarkan dulu lewat tombol + di daftar jadwal.</Text>
        </View>
      ) : (
        <FlatList
          data={results as any[]}
          keyExtractor={(it: any) => it._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 17 },

  searchBox: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink },

  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  name: { fontSize: 15, fontWeight: "800", color: C.ink },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 5 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  addr: { fontSize: 11, color: GRAY, marginTop: 4, lineHeight: 16 },
  arrow: { fontSize: 22, color: "#98A2B3", fontWeight: "800", marginLeft: 6 },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center" },
  emptySub: { fontSize: 13, color: GRAY, lineHeight: 19, textAlign: "center", marginTop: 8 },
});
