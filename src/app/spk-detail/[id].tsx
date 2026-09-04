import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const BLUE = "#175CD3";

const HASIL: any = {
  janji_bayar: { label: "Janji Bayar", color: ORANGE, bg: "#FEF0C7" },
  lunas: { label: "Lunas", color: GREEN, bg: "#DCFAE6" },
  cicil: { label: "Cicil", color: BLUE, bg: "#E0F2FE" },
};

const rupiah = (n?: number) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const fmtTgl = (d?: string) => (d ? d : "-");

export default function SpkDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const data = useQuery(api.piutang.getTaskDetail, { taskId: id as any }) as any;

  if (data === undefined) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.btnBack} onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/spk"); }}>
          <Text style={styles.btnBackText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const t = data.task;
  const hasil = HASIL[t.hasil] ?? { label: t.hasil ?? "-", color: GRAY, bg: "#F2F4F7" };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/spk"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Detail Follow-up</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.storeName}>{t.storeName}</Text>
        <Text style={styles.meta}>📍 {t.area} {t.tanggal ? `• Data ${t.tanggal}` : ""}</Text>

        {/* Hasil */}
        <View style={[styles.hasilBox, { backgroundColor: hasil.bg }]}>
          <Text style={[styles.hasilText, { color: hasil.color }]}>
            {t.hasil === "janji_bayar" && t.promiseDate ? `📅 Janji Bayar ${fmtTgl(t.promiseDate)}` : hasil.label}
          </Text>
          {t.payMethod ? <Text style={[styles.hasilSub, { color: hasil.color }]}>Metode: {t.payMethod === "tunai" ? "Tunai" : "Transfer"}</Text> : null}
        </View>

        {/* Angka */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data Piutang</Text>
          <Row label="Total Tagihan" value={rupiah(t.total)} />
          <Row label="Sisa Piutang" value={rupiah(t.piutang)} bold />
          <Row label="Sudah Dibayar (Cicil)" value={rupiah(t.cicil)} />
          <Row label="Usia" value={t.usia != null ? t.usia + " hari" : "-"} />
        </View>

        {/* Catatan */}
        {t.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Catatan</Text>
            <Text style={styles.notes}>{t.notes}</Text>
          </View>
        ) : null}

        {/* Screenshot WA */}
        {data.photoUrl ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Screenshot WhatsApp</Text>
            <Image source={{ uri: data.photoUrl }} style={styles.photo} resizeMode="contain" />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Keterangan</Text>
          <Row label="Dikerjakan oleh" value={data.salesName || "-"} />
          <Row label="Selesai pada" value={t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"} />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: "900", color: "#111" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  storeName: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 8 },
  meta: { fontSize: 13, color: GRAY, marginTop: 4 },
  hasilBox: { borderRadius: 12, padding: 14, marginTop: 14 },
  hasilText: { fontSize: 16, fontWeight: "900" },
  hasilSub: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 14, borderWidth: 1, borderColor: "#EEF0F3" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F2F4F7" },
  rowLabel: { fontSize: 13, color: GRAY },
  rowValue: { fontSize: 14, color: "#344054", fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  notes: { fontSize: 14, color: "#344054", lineHeight: 20 },
  photo: { width: "100%", height: 300, borderRadius: 12, marginTop: 6, backgroundColor: "#F2F4F7" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 16 },
  btnBack: { backgroundColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30 },
  btnBackText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
