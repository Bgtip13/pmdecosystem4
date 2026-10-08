import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as Location from "expo-location";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import { theme } from "../../lib/theme";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = "#067647";
const RADIUS_WARN_M = 200;   // harus sama dengan RADIUS_M di convex/jadwal.ts

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko tutup" };

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtTime = (ms?: number | null) => (ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-");
const rupiah = (n: any) => (n == null ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));

function hariDari(dk: string) {
  if (!dk) return "-";
  const [y, m, d] = dk.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function tglDari(dk: string) {
  if (!dk) return "-";
  const [y, m, d] = dk.split("-").map(Number);
  return `${pad2(d)}-${pad2(m)}-${y}`;
}
function fmtTanggal(dk: string) {
  return `${hariDari(dk)}, ${tglDari(dk)}`;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const Rr = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * Rr * Math.asin(Math.sqrt(a));
}

export default function JadwalKartu() {
  const router = useRouter();
  const { id, dk } = useLocalSearchParams<{ id: string; dk?: string }>();

  const data = useQuery(api.jadwal.getCard, { scheduleId: id as any }) as any;
  const dayList = useQuery(api.jadwal.listDay, { dateKey: dk ?? undefined } as any) as any;
  const checkIn = useMutation(api.jadwal.checkIn);
  const requestLocationUpdate = useMutation(api.locationRequests.requestLocationUpdate);

  // storeId belum ada saat data dimuat → query di-skip dulu (aman, hook tetap urut)
  const storeId = (data as any)?.store?._id;
  const reqStatus = useQuery(
    api.locationRequests.getStoreRequestStatus,
    storeId ? ({ storeId } as any) : "skip"
  ) as any;

  const [busy, setBusy] = useState(false);
  const [anda, setAnda] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErr, setGpsErr] = useState("");

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/jadwal" as any);
  };

  // Ambil posisi sendiri sekali (untuk baris "Longlat anda" + perkiraan jarak)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setGpsErr("Izin lokasi belum aktif."); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setAnda({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch (e: any) {
        setGpsErr(e?.message ?? "Gagal mengambil lokasi.");
      }
    })();
  }, []);

  if (data === undefined) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Jadwal tidak ditemukan.</Text>
        <TouchableOpacity style={styles.btnBack} onPress={back}><Text style={styles.btnBackText}>Kembali</Text></TouchableOpacity>
      </View>
    );
  }

  const s = data.schedule;
  const store = data.store;
  const status = String(s.status);
  const sudahSelesai = status === "DONE";
  const sedangBerjalan = status === "ONGOING" && s.visitId;

  // Baris tetangga untuk tombol pindah toko
  const rows: any[] = dayList?.rows ?? [];
  const idx = rows.findIndex((r: any) => r._id === s._id);
  const prev = idx > 0 ? rows[idx - 1] : null;
  const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null;

  const mine = rows.find((r: any) => r._id === s._id);
  const checkinAt = (s as any).checkinAt ?? mine?.checkinAt ?? null;
  const checkoutAt = (s as any).checkoutAt ?? mine?.checkoutAt ?? null;

  const jarakM =
    anda && store?.lat != null && store?.lng != null
      ? Math.round(haversine(anda.lat, anda.lng, store.lat, store.lng))
      : null;
  const diLuarRadius = jarakM != null && jarakM > RADIUS_WARN_M;

  const openMaps = () => {
    if (store?.lat == null || store?.lng == null) { Alert.alert("Maps", "Toko ini belum punya koordinat."); return; }
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`);
  };

  // ===== CHECK-IN (server menolak kalau di luar radius) =====
  const doCheckIn = async () => {
    setBusy(true);
    try {
      const { status: st } = await Location.requestForegroundPermissionsAsync();
      if (st !== "granted") throw new Error("Aktifkan izin lokasi untuk check-in.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const isMock = !!((pos as any).mocked);

      const res: any = await checkIn({
        scheduleId: s._id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        mock: isMock,
      });

      Alert.alert("Check-in berhasil ✅", "Kunjungan dimulai. Lanjutkan isi SPK & foto.", [
        { text: "Isi SPK", onPress: () => router.push(`/visit/${res.visitId}` as any) },
      ]);
    } catch (e: any) {
      Alert.alert("Gagal check-in", toFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // ===== AJUKAN RESET LONGLAT (untuk posisi toko yang salah) =====
  const doResetLonglat = async () => {
    setBusy(true);
    try {
      const { status: st } = await Location.requestForegroundPermissionsAsync();
      if (st !== "granted") throw new Error("Aktifkan izin lokasi.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await requestLocationUpdate({
        storeId: (store as any)._id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      Alert.alert("Usulan terkirim ✅", "Koordinat baru menunggu persetujuan supervisor.");
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ label, value, color, last }: any) => (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : null]} numberOfLines={2}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* ===== HEADER ===== */}
      <View style={styles.topbar}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={back} hitSlop={8}>
            <Text style={styles.backText}>‹ Kembali</Text>
          </TouchableOpacity>
          <View style={styles.areaBadge}>
            <Text style={styles.areaBadgeText}>{s.area}</Text>
          </View>
        </View>
        <Text style={styles.title}>Detail SPK</Text>
        <Text style={styles.meta}>
          {s.salesId ? "Sales terjadwal" : "Sales belum dipetakan"} • {fmtTanggal(s.dateKey)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* ===== Kepala SPK (Hari / Tanggal / No. SPK + Check-In/Out) ===== */}
        <View style={styles.headCard}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.headCell}>
                <Text style={styles.headLabel}>Hari</Text>
                <Text style={styles.headValue}>{hariDari(s.dateKey)}</Text>
              </View>
              <View style={styles.headCell}>
                <Text style={styles.headLabel}>Tanggal</Text>
                <Text style={styles.headValue}>{tglDari(s.dateKey)}</Text>
              </View>
              <View style={[styles.headCell, styles.headCellLast]}>
                <Text style={styles.headLabel}>No. SPK</Text>
                <Text style={styles.headValue} numberOfLines={1}>{s.noSpk ?? "-"}</Text>
              </View>
            </View>

            <View style={styles.headDivider} />

            <View style={{ width: 100 }}>
              <View style={styles.headCell}>
                <Text style={styles.headLabel}>Check-In</Text>
                <Text style={styles.headValue}>{fmtTime(checkinAt)}</Text>
              </View>
              <View style={[styles.headCell, styles.headCellLast]}>
                <Text style={styles.headLabel}>Check-Out</Text>
                <Text style={styles.headValue}>{fmtTime(checkoutAt)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ===== Data toko ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DATA TOKO</Text>
          <Text style={styles.storeName}>{s.storeName}</Text>

          <Row
            label="Tagihan Toko (umur)"
            value={data.piutang == null ? "-" : `${rupiah(data.piutang)}${data.usia != null ? `  •  ${data.usia} hari` : ""}`}
            color={data.piutang == null ? GRAY : "#B42318"}
          />
          <Row label="Omset Bln ini" value={rupiah(s.act)} />
          <Row label="Target" value={rupiah(s.target)} last />
        </View>

        {/* ===== Lokasi ===== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>LOKASI</Text>
          <Row
            label="Longlat toko"
            value={store?.lat != null && store?.lng != null ? `${store.lat.toFixed(5)}, ${store.lng.toFixed(5)}` : "-"}
          />
          <Row
            label="Longlat anda"
            value={anda ? `${anda.lat.toFixed(5)}, ${anda.lng.toFixed(5)}${jarakM != null ? `  •  ${jarakM} m` : ""}` : (gpsErr || "mengambil…")}
            last={!store?.address}
          />
          {store?.address ? <Text style={styles.addr}>{store.address}</Text> : null}

          <View style={styles.actRow}>
            <TouchableOpacity style={styles.smallBtn} onPress={openMaps}>
              <AppIcon name="location" size={14} color={C.status.info.fg} style={{ marginRight: 5 }} />
              <Text style={[styles.smallBtnText, { color: C.status.info.fg }]}>Buka Maps</Text>
            </TouchableOpacity>
            {diLuarRadius ? (
              <View style={[styles.badge, { backgroundColor: "#FEF0C7", marginLeft: 8 }]}>
                <Text style={[styles.badgeText, { color: "#B54708" }]}>Di luar radius</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ===== Peringatan / status ===== */}
        {data.schedule.storeMissing ? (
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.warnTitle}>Nama toko belum terhubung</Text>
            <Text style={styles.warnText}>
              Nama di sheet JADWAL tidak sama persis dengan master toko, jadi SPK belum bisa diisi.
              Samakan namanya, lalu supervisor tekan tombol tarik ulang.
            </Text>
          </View>
        ) : null}

        {data.lockedThisMonth ? (
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.warnTitle}>Sudah dikunjungi bulan ini</Text>
            <Text style={styles.warnText}>
              Aturannya 1 toko 1x per bulan. Kunjungan terakhir:{" "}
              {MET_LABEL[data.lastVisit?.metWith] ?? "-"} pada {fmtTime(data.lastVisit?.checkinAt)}.
            </Text>
          </View>
        ) : null}

        {data.canRevisit ? (
          <View style={[styles.card, { backgroundColor: "#FFFAEB", borderColor: "#FEDF89" }]}>
            <Text style={[styles.warnTitle, { color: "#B54708" }]}>Kunjungan ulang diizinkan</Text>
            <Text style={[styles.warnText, { color: "#B54708" }]}>
              Kunjungan sebelumnya berakhir "Toko tutup", jadi toko ini boleh dikunjungi lagi bulan ini.
            </Text>
          </View>
        ) : null}

        {/* ===== Aksi ===== */}
        {sudahSelesai ? (
          <View style={styles.card}>
            <Text style={styles.doneTitle}>Kunjungan selesai ✓</Text>
            <Text style={styles.warnText}>Hasil SPK-nya bisa dilihat di Riwayat Kunjungan.</Text>
          </View>
        ) : sedangBerjalan ? (
          <TouchableOpacity style={styles.bigBtn} onPress={() => router.push(`/visit/${s.visitId}` as any)}>
            <Text style={styles.bigBtnText}>Lanjut Isi SPK & Foto</Text>
          </TouchableOpacity>
        ) : data.lockedThisMonth || data.schedule.storeMissing ? null : diLuarRadius ? (
          /* Di luar radius → Check-In dikunci, sediakan jalan keluar: ajukan reset longlat */
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.warnTitle}>Di luar radius toko</Text>
            <Text style={styles.warnText}>
              Kamu {jarakM} m dari toko (batas {RADIUS_WARN_M} m), jadi Check-In belum bisa dilakukan.
              Kalau posisi toko di peta memang salah, ajukan koordinat baru — supervisor yang menyetujui.
            </Text>
            <View style={styles.actRow}>
              <TouchableOpacity
                style={[styles.smallBtn, busy && { opacity: 0.5 }]}
                onPress={doResetLonglat}
                disabled={busy}
              >
                <AppIcon name="refresh" size={13} color={C.status.info.fg} style={{ marginRight: 5 }} />
                <Text style={[styles.smallBtnText, { color: C.status.info.fg }]}>Reset longlat</Text>
              </TouchableOpacity>
              {reqStatus?.status === "pending" ? (
                <Text style={styles.reqText}>Menunggu supervisor</Text>
              ) : null}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.bigBtn, busy && { opacity: 0.6 }]}
            onPress={doCheckIn}
            disabled={busy}
          >
            <Text style={styles.bigBtnText}>{busy ? "Mengambil lokasi…" : "Check-In"}</Text>
          </TouchableOpacity>
        )}

        {/* ===== Pindah toko (bukan urutan wajib) ===== */}
        {rows.length > 1 ? (
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, !prev && { opacity: 0.4 }]}
              disabled={!prev}
              onPress={() => prev && router.replace(`/jadwal/${prev._id}?dk=${s.dateKey}` as any)}
            >
              <Text style={styles.navBtnText}>‹ Toko lain</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, !next && { opacity: 0.4 }]}
              disabled={!next}
              onPress={() => next && router.replace(`/jadwal/${next._id}?dk=${s.dateKey}` as any)}
            >
              <Text style={styles.navBtnText}>Toko lain ›</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backText: { color: RED, fontSize: 15, fontWeight: "800" },
  areaBadge: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  areaBadgeText: { fontSize: 11, fontWeight: "800", color: GRAY },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, marginTop: 6 },
  meta: { fontSize: 12, color: GRAY, marginTop: 2 },

  headCard: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: C.border },
  headRow: { flexDirection: "row" },
  headDivider: { width: 1, backgroundColor: C.divider, marginHorizontal: 12 },
  headCell: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  headCellLast: { borderBottomWidth: 0, paddingBottom: 0 },
  headLabel: { fontSize: 11, color: GRAY, fontWeight: "700" },
  headValue: { fontSize: 12.5, fontWeight: "800", color: C.ink, marginLeft: 10 },

  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginTop: 12, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontSize: 10, fontWeight: "900", color: GRAY, letterSpacing: 0.6, marginBottom: 4 },
  storeName: { fontSize: 18, fontWeight: "800", color: C.ink, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowLabel: { fontSize: 12, color: GRAY, flex: 1 },
  rowValue: { fontSize: 13, color: C.ink, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  addr: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },

  actRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  smallBtn: { flexDirection: "row", alignItems: "center", backgroundColor: C.status.info.bg, borderWidth: 1, borderColor: C.status.info.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { fontSize: 12, fontWeight: "800" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  reqText: { fontSize: 11, fontWeight: "700", color: GRAY, marginLeft: 10 },

  warnCard: { backgroundColor: "#FEF3F2", borderColor: "#FECDCA" },
  warnTitle: { fontSize: 14, fontWeight: "800", color: "#B42318" },
  warnText: { fontSize: 12, color: "#B42318", lineHeight: 18, marginTop: 4 },
  doneTitle: { fontSize: 15, fontWeight: "800", color: GREEN },

  bigBtn: { backgroundColor: C.primary, borderRadius: R.md, paddingVertical: 15, alignItems: "center", marginTop: 16 },
  bigBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  navRow: { flexDirection: "row", marginTop: 14 },
  navBtn: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingVertical: 11, alignItems: "center", marginHorizontal: 4 },
  navBtnText: { fontSize: 13, fontWeight: "800", color: C.inkSoft },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginBottom: 8 },
  btnBack: { backgroundColor: RED, borderRadius: R.md, paddingHorizontal: 26, paddingVertical: 12 },
  btnBackText: { color: "#fff", fontWeight: "800" },
});
