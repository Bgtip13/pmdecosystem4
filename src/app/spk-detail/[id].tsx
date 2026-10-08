import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Image, TextInput, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SpkStatusBadge, ReviewNoteBox } from "../../components/SpkWorkflow";
import { TOP_PAD } from "../../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const BLUE = "#175CD3";

const HASIL: any = {
  janji_bayar: { label: "Janji Bayar", color: ORANGE, bg: "#FEF0C7" },
  lunas: { label: "Lunas", color: GREEN, bg: "#DCFAE6" },
  cicil: { label: "Cicil", color: BLUE, bg: "#E0F2FE" },
  no_respon: { label: "Tidak ada respon", color: GRAY, bg: "#F2F4F7" },
};

const rupiah = (n?: number) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const fmtTgl = (d?: string) => (d ? d : "-");

export default function SpkDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.piutang.getTaskDetail, { taskId: id as any }) as any;
  const closeTask = useMutation(api.piutang.supervisorCloseTask);
  const reopenTask = useMutation(api.piutang.supervisorReopenTask);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const back = () => { if (router.canGoBack()) router.back(); else router.replace("/spk"); };

  if (data === undefined) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.btnBack} onPress={back}>
          <Text style={styles.btnBackText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const t = data.task;
  const hasil = HASIL[t.hasil] ?? { label: t.hasil ?? "-", color: GRAY, bg: "#F2F4F7" };

  // ===== FASE 1: status pekerjaan =====
  const wf = (t.workflowStatus ?? "OPEN") as string;
  const isSuper = viewer?.role === "supervisor";
  const canClose = isSuper && wf === "INPG";
  const canReopen = isSuper && wf === "CLSD";

  const doClose = () => {
    Alert.alert(
      "Setujui tugas ini? (CLSD)",
      "Setelah CLSD, petugas tidak bisa mengedit lagi dan tugas pindah ke Riwayat.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, CLSD",
          onPress: async () => {
            setBusy(true);
            try {
              await closeTask({ taskId: t._id, reviewNote: note.trim() || undefined });
              setNote("");
              Alert.alert("Beres", "Tugas sudah CLSD.");
            } catch (e: any) {
              Alert.alert("Gagal", e?.message ?? "Coba lagi.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const doReopen = () => {
    Alert.alert(
      "Buka kembali ke OPEN?",
      "Isian hasil akan dikosongkan dan tugas kembali muncul di daftar SPK hari ini.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Buka",
          onPress: async () => {
            setBusy(true);
            try {
              await reopenTask({ taskId: t._id });
              Alert.alert("Dibuka", "Tugas kembali ke OPEN.");
            } catch (e: any) {
              Alert.alert("Gagal", e?.message ?? "Coba lagi.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Detail Follow-up</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={styles.nameRow}>
          <Text style={styles.storeName} numberOfLines={2}>{t.storeName}</Text>
          <SpkStatusBadge status={wf} size={12} style={{ marginLeft: 10, marginTop: 4 }} />
        </View>
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
          <Row label="Retur" value={rupiah(t.retur)} />
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
          <Row label="Diisi pada" value={t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"} />
          {wf === "CLSD" ? (
            <>
              <Row label="Disetujui oleh" value={data.reviewerName || "-"} />
              <Row
                label="Disetujui pada"
                value={t.reviewedAt ? new Date(t.reviewedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"}
              />
            </>
          ) : null}
        </View>

        <ReviewNoteBox note={t.reviewNote} reviewerName={data.reviewerName} />

        {/* ===== REVIEW SUPERVISOR (FASE 1) ===== */}
        {isSuper ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review Supervisor</Text>

            {wf === "OPEN" ? (
              <Text style={styles.hint}>
                Petugas belum mengisi hasil. Tugas ini belum bisa ditutup (CLSD).
              </Text>
            ) : null}

            {wf === "INPG" ? (
              <>
                <Text style={styles.hint}>
                  Isian sudah masuk. Tambahkan saran (opsional), lalu tutup dengan CLSD.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Saran / review untuk petugas (opsional)"
                  placeholderTextColor="#98A2B3"
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </>
            ) : null}

            {wf === "CLSD" ? (
              <Text style={styles.hint}>
                Sudah disetujui. Kalau ada yang salah, buka kembali ke OPEN supaya bisa dikerjakan ulang.
              </Text>
            ) : null}

            <View style={styles.btnRow}>
              {canClose ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                  onPress={doClose}
                  disabled={busy}
                >
                  <Text style={styles.btnText}>{busy ? "Memproses…" : "Setujui (CLSD)"}</Text>
                </TouchableOpacity>
              ) : null}

              {canReopen ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, busy && styles.btnDisabled]}
                  onPress={doReopen}
                  disabled={busy}
                >
                  <Text style={[styles.btnText, { color: RED }]}>Buka Kembali (OPEN)</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
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
  topbar: { backgroundColor: "#fff", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 12 },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  storeName: { fontSize: 22, fontWeight: "800", color: "#111", flexShrink: 1 },
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
  hint: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 10,
    minHeight: 70, textAlignVertical: "top", fontSize: 14, color: "#111",
    backgroundColor: "#FCFCFD",
  },
  btnRow: { flexDirection: "row", marginTop: 12, flexWrap: "wrap" },
  btn: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: "center", marginRight: 8, marginBottom: 8 },
  btnPrimary: { backgroundColor: GREEN },
  btnGhost: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA" },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 16 },
  btnBack: { backgroundColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30 },
  btnBackText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
