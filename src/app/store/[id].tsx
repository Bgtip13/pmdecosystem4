import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import * as Location from "expo-location";
import { api } from "../../../convex/_generated/api";
import CleanAlert from "../../components/CleanAlert";
import { toFriendlyError } from "../../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";

export default function StoreDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer) as any;
  const store = useQuery(api.stores.getStore, { storeId: id as any }) as any;
  const reqStatus = useQuery(api.locationRequests.getStoreRequestStatus, { storeId: id as any }) as any;
  const startVisit = useMutation(api.visits.startVisit);
  const requestLocationUpdate = useMutation(api.locationRequests.requestLocationUpdate);
  const [busy, setBusy] = useState(false);

  // ===== Popup bersih (CleanAlert) =====
  const [popup, setPopup] = useState<{
    title: string;
    message: string;
    type?: "info" | "success" | "error";
    onDone?: () => void;
  } | null>(null);
  const show = (title: string, message: string, type: "info" | "success" | "error" = "info", onDone?: () => void) =>
    setPopup({ title, message, type, onDone });
  const closePop = () => {
    const d = popup?.onDone;
    setPopup(null);
    d?.();
  };

  if (!isAuthenticated || !viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const canEdit = viewer.role === "field" || viewer.role === "supervisor";

  const doCheckin = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi untuk check-in.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await startVisit({ storeId: id as any, lat: pos.coords.latitude, lng: pos.coords.longitude });
      show("Check-in Berhasil ✅", "Kunjungan dimulai. Lanjutkan isi SPK & foto di layar kunjungan.", "success", () => router.replace("/spk-sales"));
    } catch (e: any) {
      show("Check-in Gagal", toFriendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const doRequestLocation = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await requestLocationUpdate({ storeId: id as any, lat: pos.coords.latitude, lng: pos.coords.longitude });
      show("Usulan Terkirim ✅", "Koordinat baru menunggu persetujuan supervisor.", "success");
    } catch (e: any) {
      show("Gagal", toFriendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const locBadge = () => {
    if (reqStatus?.status === "pending") return { txt: "⏳ Menunggu persetujuan lokasi", style: styles.badgeWait };
    if (reqStatus?.status === "approved" || store?.latSource === "approved") return { txt: "✅ Lokasi aktif (disetujui)", style: styles.badgeOk };
    if (store?.lat) return { txt: "📍 Ada koordinat", style: styles.badgeOk };
    return { txt: "📍 Belum diverifikasi", style: styles.badgeWarn };
  };
  const b = locBadge();

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/spk-sales"); }}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
      </View>

      {store === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : !store ? (
        <View style={styles.center}><Text>Toko tidak ditemukan.</Text></View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.name}>{store.name}</Text>
          <Text style={[styles.badge, b.style]}>{b.txt}</Text>

          <View style={styles.infoCard}>
            {store.address ? (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Alamat</Text><Text style={styles.infoValue}>{store.address}</Text></View>
            ) : null}
            {store.phone ? (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>No. HP</Text><Text style={styles.infoValue}>{store.phone}</Text></View>
            ) : null}
            {store.pic ? (
              <View style={styles.infoRow}><Text style={styles.infoLabel}>PIC</Text><Text style={styles.infoValue}>{store.pic}</Text></View>
            ) : null}
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Area</Text><Text style={styles.infoValue}>{store.area}</Text></View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Koordinat</Text>
              <Text style={styles.infoValue}>
                {store.lat ? `${store.lat.toFixed(6)}, ${store.lng?.toFixed(6)}` : "Belum ada"}
              </Text>
            </View>
          </View>

          {canEdit ? (
            <TouchableOpacity style={styles.btnOutline} onPress={doRequestLocation} disabled={busy || reqStatus?.status === "pending"}>
              <Text style={styles.btnOutlineText}>
                {reqStatus?.status === "pending" ? "⏳ Menunggu persetujuan..." : "📍 Perbarui Lokasi Toko"}
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.note}>Check-in mengharuskan kamu berada dalam radius 200 m dari toko.</Text>
          <TouchableOpacity style={[styles.btnCheckin, busy && { opacity: 0.6 }]} onPress={doCheckin} disabled={busy}>
            <Text style={styles.btnText}>{busy ? "Mengecek GPS..." : "📍 Check-in di Toko Ini"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <CleanAlert
        visible={popup !== null}
        title={popup?.title ?? ""}
        message={popup?.message ?? ""}
        type={popup?.type ?? "info"}
        onClose={closePop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingBottom: 10, paddingHorizontal: 20 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  body: { padding: 20 },
  name: { fontSize: 22, fontWeight: "800", color: "#111" },
  badge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8, fontSize: 12, fontWeight: "800", overflow: "hidden" },
  badgeOk: { backgroundColor: "#DCFAE6", color: "#067647" },
  badgeWarn: { backgroundColor: "#FEF0C7", color: "#B54708" },
  badgeWait: { backgroundColor: "#E0F2FE", color: "#175CD3" },
  infoCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: "#EEF0F3" },
  infoRow: { marginBottom: 12 },
  infoLabel: { fontSize: 12, color: GRAY, fontWeight: "600", marginBottom: 2 },
  infoValue: { fontSize: 15, color: "#111" },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 16 },
  btnOutlineText: { color: RED, fontSize: 15, fontWeight: "700" },
  note: { fontSize: 13, color: GRAY, marginTop: 16, textAlign: "center" },
  btnCheckin: { backgroundColor: RED, borderRadius: 14, padding: 18, alignItems: "center", marginTop: 10 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
