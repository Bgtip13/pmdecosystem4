import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import * as Location from "expo-location";
import { api } from "../../../convex/_generated/api";
import CleanAlert from "../../components/CleanAlert";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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

  // ===== Lokasi user (refresh GPS) =====
  const [loc, setLoc] = useState<{ lat: number; lng: number; at: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsErr, setGpsErr] = useState("");

  const refreshUserLoc = async () => {
    setGpsBusy(true);
    setGpsErr("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi untuk melihat GPS.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() });
    } catch (e: any) {
      setGpsErr(e?.message ?? "Gagal mengambil lokasi.");
    } finally {
      setGpsBusy(false);
    }
  };

  useEffect(() => { refreshUserLoc(); }, []);

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

  const dist =
    loc && store?.lat != null && store?.lng != null
      ? Math.round(haversine(loc.lat, loc.lng, store.lat, store.lng))
      : null;

  // ← BARU: chip Reset koordinat — hanya tampil kalau memang perlu
  const pendingLoc = reqStatus?.status === "pending";
  const perluReset = !!store && (!store.lat || (dist != null && dist > 200));

  const doCheckin = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi untuk check-in.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const isMock = !!((pos as any).mocked);
      await startVisit({ storeId: id as any, lat: pos.coords.latitude, lng: pos.coords.longitude, mock: isMock });
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
              <View style={styles.coordRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Koordinat Toko</Text>
                  <Text style={styles.infoValue}>
                    {store.lat ? `${store.lat.toFixed(6)}, ${store.lng?.toFixed(6)}` : "Belum ada"}
                  </Text>
                </View>
                {canEdit && perluReset ? (
                  <TouchableOpacity
                    style={[styles.resetBtn, pendingLoc && styles.resetBtnOff]}
                    onPress={doRequestLocation}
                    disabled={busy || pendingLoc}
                  >
                    <Text style={[styles.resetBtnText, pendingLoc && { color: GRAY }]}>
                      {pendingLoc ? "Menunggu" : "Reset"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {canEdit ? (
            <>
              {/* ===== LOKASI USER + JARAK KE TOKO ===== */}
              <View style={styles.gpsCard}>
                <View style={styles.gpsHead}>
                  <Text style={styles.gpsTitle}>📍 Lokasi Kamu</Text>
                  <TouchableOpacity style={styles.gpsRefresh} onPress={refreshUserLoc} disabled={gpsBusy}>
                    <Text style={styles.gpsRefreshText}>{gpsBusy ? "…" : "🔄 Refresh"}</Text>
                  </TouchableOpacity>
                </View>

                {gpsErr ? <Text style={styles.gpsErr}>{gpsErr}</Text> : null}

                {loc ? (
                  <>
                    <View style={styles.gpsRow}>
                      <Text style={styles.gpsLabel}>Lat, Lng Kamu</Text>
                      <Text style={styles.gpsValue}>{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}</Text>
                    </View>
                    <View style={styles.gpsRow}>
                      <Text style={styles.gpsLabel}>Waktu Ambil</Text>
                      <Text style={styles.gpsValue}>{new Date(loc.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Text>
                    </View>
                    {dist != null ? (
                      <>
                        <View style={styles.gpsRow}>
                          <Text style={styles.gpsLabel}>Lat, Lng Toko</Text>
                          <Text style={styles.gpsValue}>{store.lat.toFixed(6)}, {store.lng.toFixed(6)}</Text>
                        </View>
                        <View style={styles.gpsRow}>
                          <Text style={styles.gpsLabel}>Selisih Jarak</Text>
                          <Text style={[styles.gpsValue, { color: dist <= 200 ? GREEN : RED, fontWeight: "800" }]}>
                            {dist.toLocaleString("id-ID")} m {dist <= 200 ? "✓" : "✗ (> 200 m)"}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.gpsNote}>Toko belum punya koordinat — jarak tidak bisa dihitung.</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.gpsNote}>{gpsBusy ? "Mendapatkan lokasi..." : "Tekan 🔄 Refresh untuk ambil lokasi."}</Text>
                )}
              </View>
            </>
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
  topbar: { backgroundColor: "#fff", paddingTop: TOP_PAD, paddingBottom: 10, paddingHorizontal: 20 },
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
  // ← BARU: baris koordinat + chip Reset
  coordRow: { flexDirection: "row", alignItems: "center" },
  resetBtn: { marginLeft: 10, backgroundColor: "#FDE8E6", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  resetBtnOff: { backgroundColor: "#F2F4F7", borderColor: "#D0D5DD" },
  resetBtnText: { fontSize: 12, color: RED, fontWeight: "800" },
  // ===== Style kartu GPS user =====
  gpsCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginTop: 16, borderWidth: 1, borderColor: "#EEF0F3" },
  gpsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  gpsTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  gpsRefresh: { backgroundColor: "#FDE8E6", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  gpsRefreshText: { color: RED, fontSize: 12, fontWeight: "800" },
  gpsErr: { fontSize: 12, color: RED, marginBottom: 6, fontWeight: "600" },
  gpsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0F0F0" },
  gpsLabel: { fontSize: 12, color: GRAY, fontWeight: "600", flex: 1 },
  gpsValue: { fontSize: 13, color: "#111", fontWeight: "700", flex: 2, textAlign: "right" },
  gpsNote: { fontSize: 12, color: GRAY, fontStyle: "italic", marginTop: 4 },
  note: { fontSize: 13, color: GRAY, marginTop: 16, textAlign: "center" },
  btnCheckin: { backgroundColor: RED, borderRadius: 14, padding: 18, alignItems: "center", marginTop: 10 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
