import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  Image, TextInput, Alert, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SpkStatusBadge, ReviewNoteBox } from "../../components/SpkWorkflow";
import { TOP_PAD } from "../../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";

const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };
const MET_OPTIONS: { key: string; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "karyawan", label: "Karyawan" },
  { key: "pic", label: "PIC" },
  { key: "keluarga", label: "Keluarga" },
  { key: "toko_tutup", label: "Toko Tutup" },
];
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const REASON_OPTIONS: { key: string; label: string }[] = [
  { key: "stok_cukup", label: "Stok cukup" },
  { key: "baru_order", label: "Baru order" },
  { key: "kalah_harga", label: "Kalah harga" },
  { key: "harga_dipelajari", label: "Harga dipelajari" },
  { key: "owner_tidak_ada", label: "Owner tidak ada" },
  { key: "piutang", label: "Ada piutang" },
];

export default function VisitDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.visits.getVisitDetail, { visitId: id as any }) as any;
  const closeVisit = useMutation(api.visits.supervisorCloseVisit);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);   // ← BARU: popup review

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

  // ===== FASE 1: status pekerjaan kunjungan =====
  const wf = (v.workflowStatus ?? "INPG") as string;
  const isSuper = viewer?.role === "supervisor";
  const isOwnerOfVisit = viewer?._id === v.salesId;
  const canEdit = v.status === "done" && wf === "INPG" && (isSuper || isOwnerOfVisit);
  const canClose = isSuper && v.status === "done" && wf === "INPG";

  // ← BARU: buka popup review dulu, baru CLSD
  const openReview = () => { setNote(""); setReviewOpen(true); };

  const confirmClose = async () => {
    setBusy(true);
    try {
      await closeVisit({ visitId: v._id, reviewNote: note.trim() || undefined });
      setReviewOpen(false);
      setNote("");
      Alert.alert("Beres", "Kunjungan sudah disetujui (CLSD).");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

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
          <SpkStatusBadge status={wf} size={12} style={{ marginRight: 8, marginBottom: 4 }} />
          <View style={styles.chip}><Text style={styles.chipText}>{MET_LABEL[v.metWith] ?? "-"}</Text></View>
          {store?.area ? <View style={styles.chipArea}><Text style={styles.chipText}>{store.area}</Text></View> : null}
          {v.noDebt ? (
            <View style={[styles.chip, styles.chipGreen]}><Text style={styles.chipText}>Tidak Ada Piutang</Text></View>
          ) : null}
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
          {v.metWith === "toko_tutup" ? (
            <Text style={styles.emptySmall}>Toko tutup — tidak ada transaksi pembayaran.</Text>
          ) : v.noDebt ? (
            <>
              <Row label="Status" value="Tidak ada piutang" />
              <Row label="Keterangan" value="Toko tidak punya tagihan tersisa" />
            </>
          ) : v.paid ? (
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
          {v.metWith === "toko_tutup" ? (
            <Text style={styles.emptySmall}>Toko tutup — tidak ada transaksi order.</Text>
          ) : v.ordered ? (
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

        {v.metWith !== "toko_tutup" && v.productTrend ? (
          <View style={styles.card}><Text style={styles.cardTitle}>📈 Trend Produk</Text><Text style={styles.para}>{v.productTrend}</Text></View>
        ) : null}
        {v.notes ? (
          <View style={styles.card}><Text style={styles.cardTitle}>📝 Keterangan</Text><Text style={styles.para}>{v.notes}</Text></View>
        ) : null}

        {v.metWith !== "toko_tutup" ? (
          <>
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
          </>
        ) : null}

        <Text style={styles.photoTitle}>Foto Selfie</Text>
        {data.photoSelfieUrl ? (
          <Image source={{ uri: data.photoSelfieUrl }} style={styles.photoSelfie} />
        ) : (
          <Text style={styles.emptySmall}>Tidak ada foto selfie.</Text>
        )}

        <ReviewNoteBox note={v.reviewNote} reviewerName={data.reviewerName} />

        {/* ===== #9: tinggal Edit & Setujui ===== */}
        {v.status === "done" && wf === "INPG" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hasil Kunjungan</Text>
            <Text style={styles.hint}>
              {isSuper
                ? "Tutup dengan Setujui supaya sales tidak bisa mengedit lagi."
                : "Kamu masih bisa mengoreksi hasil ini selama belum disetujui supervisor."}
            </Text>

            <View style={styles.btnRow}>
              {canEdit ? (
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setEditOpen(true)}>
                  <Text style={[styles.btnText, { color: "#175CD3" }]}>Edit hasil kunjungan</Text>
                </TouchableOpacity>
              ) : null}

              {canClose ? (
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openReview}>
                  <Text style={styles.btnText}>Setujui</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {editOpen ? (
        <EditHasilModal v={v} onClose={() => setEditOpen(false)} />
      ) : null}

      {/* ===== #9: popup review (opsional) sebelum CLSD ===== */}
      {reviewOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) setReviewOpen(false); }}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Setujui kunjungan?</Text>
                <TouchableOpacity onPress={() => setReviewOpen(false)} disabled={busy}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.hint}>
                Setelah disetujui (CLSD), sales tidak bisa mengedit lagi dan kunjungan tidak bisa dibuka kembali.
              </Text>

              <Text style={styles.fieldLabel}>SARAN / REVIEW (OPSIONAL)</Text>
              <TextInput
                style={styles.input}
                placeholder="mis. besok follow up lagi / sudah cukup"
                placeholderTextColor="#98A2B3"
                value={note}
                onChangeText={setNote}
                multiline
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setReviewOpen(false)} disabled={busy}>
                  <Text style={[styles.btnText, { color: GRAY }]}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]} onPress={confirmClose} disabled={busy}>
                  <Text style={styles.btnText}>{busy ? "Memproses…" : "Ya, Setujui"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ===== MODAL KOREKSI HASIL (sales pemilik & supervisor, hanya saat INPG) =====
function EditHasilModal({ v, onClose }: { v: any; onClose: () => void }) {
  const editVisit = useMutation(api.visits.editVisitResult);
  const [busy, setBusy] = useState(false);

  const [metWith, setMetWith] = useState<string>(v.metWith ?? "owner");
  const [payMode, setPayMode] = useState<string>(
    v.noDebt ? "noDebt" : v.paid ? "paid" : v.promiseDate ? "promise" : "none"
  );
  const [paidAmount, setPaidAmount] = useState<string>(v.paidAmount != null ? String(v.paidAmount) : "");
  const [payMethod, setPayMethod] = useState<string>(v.payMethod ?? "tunai");
  const [promiseDate, setPromiseDate] = useState<string>(v.promiseDate ?? "");
  const [orderMode, setOrderMode] = useState<string>(v.ordered ? "yes" : v.noOrderReason ? "no" : "none");
  const [noOrderReason, setNoOrderReason] = useState<string>(v.noOrderReason ?? "stok_cukup");
  const [notes, setNotes] = useState<string>(v.notes ?? "");

  const isTutup = metWith === "toko_tutup";

  const save = async () => {
    if (!isTutup && payMode === "promise" && !promiseDate.trim()) {
      Alert.alert("Tanggal belum diisi", "Isi tanggal janji bayar (contoh 2026-09-25).");
      return;
    }
    setBusy(true);
    try {
      await editVisit({
        visitId: v._id,
        metWith: metWith as any,
        noDebt: isTutup ? undefined : payMode === "noDebt",
        paid: isTutup ? undefined : payMode === "paid",
        paidAmount: !isTutup && payMode === "paid" ? (Number(paidAmount.replace(/[^\d]/g, "")) || 0) : undefined,
        payMethod: !isTutup && payMode === "paid" ? (payMethod as any) : undefined,
        promiseDate: !isTutup && payMode === "promise" ? promiseDate.trim() : undefined,
        ordered: isTutup ? undefined : orderMode === "yes",
        orderItems: orderMode === "yes" ? (v.orderItems ?? []) : undefined,
        noOrderReason: !isTutup && orderMode === "no" ? (noOrderReason as any) : undefined,
        // dipertahankan supaya tidak ikut terhapus saat koreksi
        productTrend: v.productTrend,
        productSearched: v.productSearched,
        notes: notes.trim() || undefined,
      });
      Alert.alert("Tersimpan", "Koreksi hasil kunjungan tersimpan dan masih menunggu review SPV.");
      onClose();
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ on, label, onPress }: any) => (
    <TouchableOpacity style={[styles.pick, on && styles.pickOn]} onPress={onPress}>
      <Text style={[styles.pickText, on && styles.pickTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Edit hasil kunjungan</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 10 }}>
            <Text style={styles.fieldLabel}>Bertemu siapa</Text>
            <View style={styles.pickRow}>
              {MET_OPTIONS.map((m) => (
                <Chip key={m.key} label={m.label} on={metWith === m.key} onPress={() => setMetWith(m.key)} />
              ))}
            </View>

            {!isTutup ? (
              <>
                <Text style={styles.fieldLabel}>Pembayaran</Text>
                <View style={styles.pickRow}>
                  <Chip label="Tidak ada piutang" on={payMode === "noDebt"} onPress={() => setPayMode("noDebt")} />
                  <Chip label="Bayar" on={payMode === "paid"} onPress={() => setPayMode("paid")} />
                  <Chip label="Janji bayar" on={payMode === "promise"} onPress={() => setPayMode("promise")} />
                </View>

                {payMode === "paid" ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Nominal bayar (contoh 500000)"
                      placeholderTextColor="#98A2B3"
                      keyboardType="numeric"
                      value={paidAmount}
                      onChangeText={setPaidAmount}
                    />
                    <View style={styles.pickRow}>
                      <Chip label="Tunai" on={payMethod === "tunai"} onPress={() => setPayMethod("tunai")} />
                      <Chip label="Transfer" on={payMethod === "transfer"} onPress={() => setPayMethod("transfer")} />
                    </View>
                  </>
                ) : null}

                {payMode === "promise" ? (
                  <TextInput
                    style={styles.input}
                    placeholder="Tanggal janji bayar (2026-09-25)"
                    placeholderTextColor="#98A2B3"
                    value={promiseDate}
                    onChangeText={setPromiseDate}
                  />
                ) : null}

                <Text style={styles.fieldLabel}>Order</Text>
                <View style={styles.pickRow}>
                  <Chip label="Order" on={orderMode === "yes"} onPress={() => setOrderMode("yes")} />
                  <Chip label="Tidak order" on={orderMode === "no"} onPress={() => setOrderMode("no")} />
                </View>

                {orderMode === "no" ? (
                  <View style={styles.pickRow}>
                    {REASON_OPTIONS.map((r) => (
                      <Chip key={r.key} label={r.label} on={noOrderReason === r.key} onPress={() => setNoOrderReason(r.key)} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.hint}>Toko tutup — bagian pembayaran &amp; order otomatis dikosongkan.</Text>
            )}

            <Text style={styles.fieldLabel}>Keterangan</Text>
            <TextInput
              style={styles.input}
              placeholder="Catatan kunjungan"
              placeholderTextColor="#98A2B3"
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <Text style={styles.hint}>
              Daftar produk order &amp; foto tidak ikut diubah di sini — keduanya tetap seperti saat check-out.
            </Text>
          </ScrollView>

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={onClose} disabled={busy}>
              <Text style={[styles.btnText, { color: GRAY }]}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]} onPress={save} disabled={busy}>
              <Text style={styles.btnText}>{busy ? "Menyimpan…" : "Simpan koreksi"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8F9FB" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: TOP_PAD, paddingBottom: 10, paddingHorizontal: 20 },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 17, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: "#111" },
  chipRow: { flexDirection: "row", marginTop: 8, flexWrap: "wrap", alignItems: "center" },
  chip: { backgroundColor: "#FEE4E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4 },
  chipArea: { backgroundColor: "#E0F2FE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 },
  chipGreen: { backgroundColor: "#DCFAE6" },
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
  hint: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 8, marginTop: 6 },
  input: {
    borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 10,
    minHeight: 44, fontSize: 14, color: "#111", backgroundColor: "#FCFCFD",
    textAlignVertical: "top", marginBottom: 8,
  },
  fieldLabel: { fontSize: 12, fontWeight: "900", color: "#475467", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  pickRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  pick: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: "#fff" },
  pickOn: { backgroundColor: RED, borderColor: RED },
  pickText: { fontSize: 12, fontWeight: "700", color: "#344054" },
  pickTextOn: { color: "#fff" },
  btnRow: { flexDirection: "row", marginTop: 12, flexWrap: "wrap" },
  btn: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: "center", marginRight: 8, marginBottom: 8 },
  btnPrimary: { backgroundColor: GREEN },
  btnOutline: { backgroundColor: "#F8F9FB", borderWidth: 1, borderColor: "#D0D5DD" },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  modalWrap: { flex: 1, backgroundColor: "rgba(16,24,40,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 24 },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontSize: 17, fontWeight: "900", color: "#111" },
  modalClose: { fontSize: 20, color: GRAY, fontWeight: "800", paddingHorizontal: 6 },
  modalBtnRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
});
