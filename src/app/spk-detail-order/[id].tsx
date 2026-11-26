import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SpkStatusBadge, ReviewNoteBox } from "../../components/SpkWorkflow";
import { TOP_PAD } from "../../lib/layout";

import { useColors, useStyles } from "../../lib/themeContext";
import type { Colors } from "../../lib/colors";
const makeHASIL = (C: Colors): any => (
  {
  order_masuk: { label: "Order masuk", color: C.status.success.fg, bg: C.chip.success.bg },
  order_tambah: { label: "Order tambahan", color: C.status.info.fg, bg: C.chip.info.bg },
  tidak_order: { label: "Tidak order", color: C.primary, bg: C.chip.danger.bg },
  no_respon: { label: "No respon", color: C.inkMuted, bg: C.status.neutral.bg },
}
);
const REASON: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const MET: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };

export default function SpkDetailOrder() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const HASIL = makeHASIL(C);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.orderFollowups.getTaskDetail, { taskId: id as any }) as any;
  const closeTask = useMutation(api.orderFollowups.supervisorCloseTask);
  const reopenTask = useMutation(api.orderFollowups.supervisorReopen);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const back = () => { if (router.canGoBack()) router.back(); else router.replace("/spk"); };

  if (data === undefined) {
    return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;
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
  const hasil = HASIL[t.hasil] ?? { label: t.hasil ?? "-", color: C.inkMuted, bg: C.status.neutral.bg };
  const jmlOrder = t.orderItems?.length ?? 0;

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
        <TouchableOpacity onPress={back}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Detail Follow-up Orderan</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={styles.nameRow}>
          <Text style={styles.storeName} numberOfLines={2}>{t.storeName}</Text>
          <SpkStatusBadge status={wf} size={12} style={{ marginLeft: 10, marginTop: 4 }} />
        </View>
        <Text style={styles.meta}>📍 {t.area}{t.day ? ` • Jadwal ${t.day}` : ""}</Text>

        <View style={[styles.hasilBox, { backgroundColor: hasil.bg }]}>
          <Text style={[styles.hasilText, { color: hasil.color }]}>{hasil.label}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kunjungan Sumber (H-1)</Text>
          <Row label="Dikunjungi oleh" value={t.salesName || "-"} />
          <Row label="Tanggal kunjungan" value={t.visitDay || "-"} />
          <Row label="Jumlah kunjungan" value={t.visitCount != null ? `${t.visitCount}×` : "-"} />
          <Row
            label="Hasil kunjungan"
            value={t.ordered ? `Order ${jmlOrder} produk` : t.visitReason ? (REASON[t.visitReason] ?? t.visitReason) : "Tidak order"}
          />
          <Row label="Bertemu" value={t.visitMetWith ? (MET[t.visitMetWith] ?? t.visitMetWith) : "-"} />
        </View>

        {t.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Catatan</Text>
            <Text style={styles.notes}>{t.notes}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Screenshot WhatsApp</Text>
          {data.photoUrl ? (
            <Image source={{ uri: data.photoUrl }} style={styles.photo} resizeMode="contain" />
          ) : (
            <Text style={styles.notes}>Tidak ada lampiran.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Keterangan</Text>
          <Row label="Dikerjakan oleh" value={data.salesName || "-"} />
          <Row
            label="Diisi pada"
            value={t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"}
          />
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
                  placeholderTextColor={C.inkFaint}
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
                  <Text style={[styles.btnText, { color: C.primary }]}>Buka Kembali (OPEN)</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const C = useColors();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: C.surfaceTint,
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 8 },
  storeName: { fontSize: 22, fontWeight: "800", color: C.ink0, flexShrink: 1 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 4 },
  hasilBox: { borderRadius: 12, padding: 14, marginTop: 14 },
  hasilText: { fontSize: 16, fontWeight: "900" },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 14, borderWidth: 1, borderColor: C.divider },
  cardTitle: { fontSize: 14, fontWeight: "800", color: C.ink0, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.status.neutral.bg },
  rowLabel: { fontSize: 13, color: C.inkMuted },
  rowValue: { fontSize: 14, color: C.inkSoft, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  notes: { fontSize: 14, color: C.inkSoft, lineHeight: 20 },
  photo: { width: "100%", height: 300, borderRadius: 12, marginTop: 6, backgroundColor: C.status.neutral.bg },
  hint: { fontSize: 13, color: C.inkMuted, lineHeight: 19, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 10, padding: 10,
    minHeight: 70, textAlignVertical: "top", fontSize: 14, color: C.ink0,
    backgroundColor: C.surfaceAlt6,
  },
  btnRow: { flexDirection: "row", marginTop: 12, flexWrap: "wrap" },
  btn: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: "center", marginRight: 8, marginBottom: 8 },
  btnPrimary: { backgroundColor: C.status.success.fg },
  btnGhost: { backgroundColor: C.dangerTint, borderWidth: 1, borderColor: C.status.danger.border },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: C.onPrimary, fontWeight: "800", fontSize: 14 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink3, marginBottom: 16 },
  btnBack: { backgroundColor: C.primary, borderRadius: 12, padding: 14, paddingHorizontal: 30 },
  btnBackText: { color: C.onPrimary, fontWeight: "800", fontSize: 15 },
});
