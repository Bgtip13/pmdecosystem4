import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";

const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};

export default function VisitDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const data = useQuery(api.visits.getVisitDetail, { visitId: id as any }) as any;

  if (data === undefined) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!data) {
    return <View style={styles.center}><Text>Data tidak ditemukan.</Text></View>;
  }

  const v = data.visit;
  const store = data.store;
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

  const Row = ({ label, value }: any) =>
    value ? (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.name}>{store?.name ?? "Toko terhapus"}</Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}><Text style={styles.chipText}>{MET_LABEL[v.metWith] ?? "-"}</Text></View>
          {store?.area ? <View style={styles.chipArea}><Text style={styles.chipText}>{store.area}</Text></View> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>⏱ Waktu Kunjungan</Text>
          <Row label="Sales" value={data.salesName} />
          <Row label="Tanggal" value={v.checkinAt ? fmtDate(v.checkinAt) : null} />
          <Row label="Check-in" value={v.checkinAt ? fmtTime(v.checkinAt) : null} />
          <Row label="Check-out" value={v.checkoutAt ? fmtTime(v.checkoutAt) : null} />
          <Row label="Durasi" value={v.durationMin != null ? `${v.durationMin} menit` : null} />
          <Row label="Koordinat masuk" value={v.checkinLat ? `${v.checkinLat.toFixed(6)}, ${v.checkinLng?.toFixed(6)}` : null} />
          <Row label="Koordinat keluar" value={v.checkoutLat ? `${v.checkoutLat.toFixed(6)}, ${v.checkoutLng?.toFixed(6)}` : null} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Pembayaran</Text>
          {v.paid ? (
            <>
              <Row label="Status" value="Bayar" />
              <Row label="Nominal" value={rupiah(v.paidAmount ?? 0)} />
              <Row label="Metode" value={v.payMethod === "tunai" ? "Tunai" : v.payMethod === "transfer" ? "Transfer" : null} />
            </>
          ) : v.promiseDate ? (
            <Row label="Janji bayar" value={v.promiseDate} />
          ) : (
            <Text style={styles.emptySmall}>Tidak ada data pembayaran.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📦 Order</Text>
          {v.ordered ? (
            (v.orderItems ?? []).length ? (
              v.orderItems.map((it: any, i: number) => (
                <Text key={i} style={styles.listItem}>• {it.product}{it.qty ? ` (${it.qty})` : ""}</Text>
              ))
            ) : (
              <Text style={styles.emptySmall}>Order tanpa produk tercatat.</Text>
            )
          ) : v.noOrderReason ? (
            <Row label="Alasan tidak order" value={REASON_LABEL[v.noOrderReason] ?? v.noOrderReason} />
          ) : (
            <Text style={styles.emptySmall}>Tidak ada data order.</Text>
          )}
        </View>

        {v.productTrend ? (
          <View style={styles.card}><Text style={styles.cardTitle}>📈 Trend Produk</Text><Text style={styles.para}>{v.productTrend}</Text></View>
        ) : null}
        {v.notes ? (
          <View style={styles.card}><Text style={styles.cardTitle}>📝 Keterangan</Text><Text style={styles.para}>{v.notes}</Text></View>
        ) : null}

        <Text style={styles.photoTitle}>Foto Stok</Text>
        {data.photoStockUrls?.filter(Boolean).length ? (
          <View style={styles.photoRow}>
            {data.photoStockUrls.filter(Boolean).map((u: string, i: number) => (
              <Image key={i} source={{ uri: u }} style={styles.photoBig} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptySmall}>Tidak ada foto stok.</Text>
        )}

        <Text style={styles.photoTitle}>Foto Selfie</Text>
        {data.photoSelfieUrl ? (
          <Image source={{ uri: data.photoSelfieUrl }} style={styles.photoSelfie} />
        ) : (
          <Text style={styles.emptySmall}>Tidak ada foto selfie.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingBottom: 10, paddingHorizontal: 20 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 17, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: "#111" },
  chipRow: { flexDirection: "row", marginTop: 8 },
  chip: { backgroundColor: "#FEE4E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 },
  chipArea: { backgroundColor: "#E0F2FE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "800", color: "#333" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 14, borderWidth: 1, borderColor: "#EEF0F3" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  rowLabel: { fontSize: 13, color: GRAY, flex: 1 },
  rowValue: { fontSize: 13, color: "#111", fontWeight: "600", flex: 2, textAlign: "right" },
  para: { fontSize: 14, color: "#344054", lineHeight: 20 },
  listItem: { fontSize: 14, color: "#344054", marginBottom: 4 },
  emptySmall: { fontSize: 13, color: GRAY, fontStyle: "italic" },
  photoTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 18, marginBottom: 8 },
  photoRow: { flexDirection: "row", flexWrap: "wrap" },
  photoBig: { width: 160, height: 160, borderRadius: 14, marginRight: 10, marginBottom: 10 },
  photoSelfie: { width: 160, height: 160, borderRadius: 14 },
});
