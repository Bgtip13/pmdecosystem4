import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Image, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { api } from "../../../convex/_generated/api";
import { SpkStatusBadge, ReviewNoteBox } from "../../components/SpkWorkflow";
import { theme } from "../../lib/theme";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = "#067647";

const RESULTS: { key: string; label: string }[] = [
  { key: "order_masuk", label: "Order masuk" },
  { key: "plan_order", label: "Plan order" },
  { key: "belum_order", label: "Belum order" },
  { key: "tidak_potensi", label: "Tidak potensi" },
  { key: "history_jelek", label: "History pembayaran jelek" },
  { key: "no_respon", label: "No respon" },
  { key: "tutup_permanen", label: "Toko tutup permanen" },
  { key: "toko_ganti_nama", label: "Toko ganti nama" },
  { key: "kalah_harga", label: "Kalah harga" },
  { key: "kebutuhan_pribadi", label: "Kebutuhan pribadi" },
  { key: "pengambilan_retail", label: "Pengambilan retail" },
];
// label lama tetap dibaca supaya riwayat lama tidak tampil mentah
const RESULT_LABEL: any = {
  ...RESULTS.reduce((m, r) => ({ ...m, [r.key]: r.label }), {}),
  belum_ambil: "Belum ambil (lama)",
  stok_cukup: "Stok masih cukup (lama)",
  ganti_nama: "Toko ganti nama (lama)",
};

const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));
const fmtDateTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

export default function TokoAktifDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.activeStores.getTask, { taskId: id as any }) as any;
  const trail = useQuery(api.activeStores.getAuditTrail, { taskId: id as any }) as any; // ← BARU

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const markCall = useMutation(api.activeStores.markCall);
  const saveResult = useMutation(api.activeStores.saveResult);
  const closeTask = useMutation(api.activeStores.supervisorClose);
  const reopenTask = useMutation(api.activeStores.supervisorReopen);

  const [identification, setIdentification] = useState("");
  const [result, setResult] = useState("");
  const [planDate, setPlanDate] = useState("");
  const [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [shot, setShot] = useState<{ uri: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Isi form sekali dari data yang sudah ada (kalau pernah disimpan / INPG)
  useEffect(() => {
    const t = data?.task;
    if (!t || prefilled) return;
    setIdentification(t.identification ?? "");
    setResult(t.result ?? "");
    setPlanDate(t.plannedOrderDate ?? "");
    setNote(t.note ?? "");
    setReviewNote(t.reviewNote ?? "");
    setPrefilled(true);
  }, [data, prefilled]);

  const back = () => { if (router.canGoBack()) router.back(); else router.replace("/toko-aktif" as any); };

  if (data === undefined || viewer === undefined) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Data tidak ditemukan.</Text>
        <TouchableOpacity style={styles.btnBack} onPress={back}><Text style={styles.btnBackText}>Kembali</Text></TouchableOpacity>
      </View>
    );
  }

  const t = data.task;
  const wf = (t.workflowStatus ?? "OPEN") as string;
  const isSuper = viewer?.role === "supervisor";
  const isOwner = viewer?.role === "owner";
  const bisaEdit = !isOwner && wf !== "CLSD";

  // ===== Upload bukti chat WA =====
  const pickProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin Galeri", "Aktifkan izin galeri untuk memilih bukti chat WA.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    setShot({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  };

  const uploadProof = async (): Promise<string> => {
    if (!shot) throw new Error("Belum ada bukti yang dipilih.");
    const url = await generateUploadUrl();
    const file = new File(shot.uri);
    const up = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": shot.mime },
      body: file,
    });
    if (!up.ok) throw new Error("Upload bukti gagal (" + up.status + ").");
    const json: any = await up.json();
    return json.storageId;
  };

  // ===== Tahap 1: tandai sedang dihubungi =====
  const onCall = async () => {
    try {
      await markCall({ taskId: t._id });
      Alert.alert("Tercatat", "Toko ini ditandai sedang dihubungi. Statusnya masih OPEN sampai hasilnya disimpan.");
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    }
  };

  // ===== Tahap 2: simpan hasil → INPG =====
  const onSave = async () => {
    if (!result) { Alert.alert("Hasil", "Pilih hasil follow-up dulu."); return; }
    if (identification.trim().length < 3) { Alert.alert("Identifikasi", "Isi identifikasi dulu (minimal 3 karakter)."); return; }
    if (!shot && !t.chatProof) { Alert.alert("Bukti chat WA", "Lampirkan bukti chat WhatsApp dulu."); return; }
    if (result === "plan_order" && !/^\d{2}-\d{2}-\d{4}$/.test(planDate.trim())) {
      Alert.alert("Tanggal", "Isi tanggal rencana order dengan format DD-MM-YYYY.");
      return;
    }
    setBusy(true);
    try {
      let chatProof = t.chatProof ?? "";
      if (shot) chatProof = await uploadProof();
      await saveResult({
        taskId: t._id,
        identification: identification.trim(),
        chatProof,
        result: result as any,
        plannedOrderDate: result === "plan_order" ? planDate.trim() : undefined,
        note: note.trim() || undefined,
      });
      setShot(null);
      Alert.alert("Tersimpan", "Tersimpan — menunggu review supervisor.");
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const onClose = () => {
    Alert.alert("Setujui tugas ini? (CLSD)", `FU Toko "${t.storeName}" akan dikunci. Petugas tidak bisa mengedit lagi.`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya, CLSD",
        onPress: async () => {
          try {
            await closeTask({ taskId: t._id, reviewNote: reviewNote.trim() || undefined });
            Alert.alert("Beres", "Tugas sudah CLSD.");
          } catch (e: any) {
            Alert.alert("Gagal", toFriendlyError(e));
          }
        },
      },
    ]);
  };

  // ← BARU: alasan diambil dari kotak SARAN / REVIEW & ikut dikirim ke petugas
  const onReopen = () => {
    const reason = reviewNote.trim();
    Alert.alert(
      "Buka kembali?",
      `Tugas kembali ke OPEN. Identifikasi & bukti chat tetap tersimpan.` +
        (reason ? `\n\nAlasan yang dikirim ke petugas:\n"${reason}"` : `\n\n(Tulis di kotak SARAN/REVIEW kalau mau memberi alasan.)`),
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Buka",
          onPress: async () => {
            try {
              await reopenTask({ taskId: t._id, reason: reason || undefined });
              Alert.alert("Dibuka", "Tugas kembali ke OPEN & petugas diberi tahu.");
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  const proofUri = shot?.uri ?? data.chatProofUrl ?? null;

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>FU Toko</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.storeName}>{t.storeName}</Text>
        <View style={styles.chipRow}>
          <SpkStatusBadge status={wf} />
          {t.area ? <View style={styles.srcChip}><Text style={styles.srcText}>{t.area}</Text></View> : null}
          {t.sourceStatus ? <View style={styles.srcChip}><Text style={styles.srcText} numberOfLines={1}>{t.sourceStatus}</Text></View> : null}
        </View>

        {/* ===== Data dari sheet ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Data Toko (dari sheet)</Text>
          <Row label="Target" value={rupiah(t.target)} />
          <Row label="Kelas toko" value={t.storeClass ?? "-"} />
          <Row label="Kelas bayar" value={t.paymentClass ?? "-"} />
          <Row label="Status sheet" value={t.sourceStatus ?? "-"} />
          <Row label="Periode" value={t.monthKey ?? "-"} />
        </View>

        {/* ===== Progres ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Progres</Text>
          <Row label="Jumlah dihubungi" value={`${t.callCount ?? 0}×`} />
          <Row label="Terakhir call" value={t.calledAt ? `${fmtDateTime(t.calledAt)} • ${data.calledByName || "-"}` : "Belum pernah"} />
          <Row label="Hasil" value={t.result ? (RESULT_LABEL[t.result] ?? t.result) : "-"} />
          {t.result === "plan_order" ? <Row label="Rencana order" value={t.plannedOrderDate ?? "-"} /> : null}
          <Row label="Disimpan oleh" value={t.doneAt ? `${data.doneByName || "-"} • ${fmtDateTime(t.doneAt)}` : "-"} />
          <Row label="Direview" value={t.reviewedAt ? `${data.reviewerName || "-"} • ${fmtDateTime(t.reviewedAt)}` : "-"} />
        </View>

        {t.identification ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Identifikasi</Text>
            <Text style={styles.para}>{t.identification}</Text>
          </View>
        ) : null}
        {t.note ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Catatan</Text>
            <Text style={styles.para}>{t.note}</Text>
          </View>
        ) : null}
        <ReviewNoteBox note={t.reviewNote} reviewerName={data.reviewerName} style={{ marginTop: 12 }} />

        {/* ===== Bukti chat WA ===== */}
        {proofUri ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Bukti Chat WhatsApp</Text>
            <Image source={{ uri: proofUri }} style={styles.photo} resizeMode="contain" />
          </View>
        ) : null}

        {/* ===== Tahap 1: Call ===== */}
        {bisaEdit ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>1. Hubungi tokonya</Text>
            <Text style={styles.hint}>
              Tekan Call kalau toko sedang kamu hubungi. Statusnya tetap OPEN, jadi boleh dilanjut besok.
            </Text>
            <TouchableOpacity style={styles.callBtn} onPress={onCall}>
              <Text style={styles.callBtnText}>📞 Call sekarang</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ===== Tahap 2: isi hasil ===== */}
        {bisaEdit ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>2. Isi Hasil</Text>

            <Text style={styles.label}>IDENTIFIKASI *</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={identification}
              onChangeText={setIdentification}
              placeholder="mis. owner bilang tunggu minggu depan, stok masih banyak, minta harga khusus"
              multiline
            />

            <Text style={styles.label}>BUKTI CHAT WHATSAPP *</Text>
            {shot ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Image source={{ uri: shot.uri }} style={styles.thumb} />
                <TouchableOpacity style={{ marginLeft: 12 }} onPress={() => setShot(null)}>
                  <Text style={styles.removeText}>✕ Batalkan pilihan ini</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity style={styles.shotBtn} onPress={pickProof}>
              <Text style={styles.shotBtnText}>{shot ? "🖼 Ganti foto bukti" : "🖼 Pilih foto bukti chat WA"}</Text>
            </TouchableOpacity>
            {!shot && t.chatProof ? (
              <Text style={styles.hint}>Bukti yang lama tetap dipakai kalau kamu tidak memilih foto baru.</Text>
            ) : null}

            <Text style={styles.label}>HASIL *</Text>
            <View style={styles.chipWrap}>
              {RESULTS.map((r) => {
                const on = result === r.key;
                return (
                  <TouchableOpacity key={r.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setResult(r.key)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {result === "plan_order" ? (
              <>
                <Text style={styles.label}>TANGGAL RENCANA ORDER * (DD-MM-YYYY)</Text>
                <TextInput
                  style={styles.input}
                  value={planDate}
                  onChangeText={setPlanDate}
                  placeholder="contoh: 24-06-2026"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : null}

            <Text style={styles.label}>CATATAN (OPSIONAL)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={note}
              onChangeText={setNote}
              placeholder="Tambahan info untuk supervisor"
              multiline
            />

            <TouchableOpacity
              style={[styles.saveBtn, busy && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={busy}
            >
              <Text style={styles.saveBtnText}>{busy ? "Menyimpan..." : "Simpan hasil"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ===== Review supervisor ===== */}
        {isSuper && !isOwner ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review Supervisor</Text>
            <Text style={styles.label}>
              {wf === "CLSD" ? "ALASAN BUKA KEMBALI (OPSIONAL)" : "SARAN / REVIEW (OPSIONAL)"}
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder="mis. besok follow up lagi / sudah cukup, tutup"
              multiline
            />
            <View style={styles.actRow}>
              {wf !== "CLSD" ? (
                <TouchableOpacity style={[styles.actBtn, styles.actBtnGreen]} onPress={onClose}>
                  <Text style={[styles.actBtnText, { color: GREEN }]}>Setujui (CLSD)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actBtn} onPress={onReopen}>
                  <Text style={styles.actBtnText}>Buka Kembali</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        {/* ===== BARU: Riwayat Aksi (audit) ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Riwayat Aksi</Text>
          {trail === undefined ? (
            <ActivityIndicator size="small" color={RED} style={{ marginVertical: 6 }} />
          ) : (trail ?? []).length === 0 ? (
            <Text style={styles.hint}>Belum ada aktivitas tercatat.</Text>
          ) : (
            (trail as any[]).map((a: any, i: number) => (
              <View key={a._id} style={styles.trailRow}>
                <View style={styles.trailCol}>
                  <View style={styles.trailDot} />
                  {i < trail.length - 1 ? <View style={styles.trailLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 10 }}>
                  <Text style={styles.trailText}>{a.summary}</Text>
                  <Text style={styles.trailMeta}>{a.actorName || "-"} • {fmtDateTime(a.createdAt)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 4 },

  storeName: { fontSize: 21, fontWeight: "800", color: C.ink },
  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 8 },
  srcChip: { backgroundColor: "#F2F4F7", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6, marginBottom: 3 },
  srcText: { fontSize: 10, fontWeight: "800", color: "#475467" },

  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginTop: 12, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 14, fontWeight: "800", color: C.ink, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowLabel: { fontSize: 13, color: GRAY, flex: 1 },
  rowValue: { fontSize: 13, color: C.ink, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  para: { fontSize: 14, color: C.inkSoft, lineHeight: 20 },
  hint: { fontSize: 12, color: GRAY, lineHeight: 17, marginTop: 2 },

  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 12, fontSize: 15, color: C.ink },

  chipWrap: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  chipTextOn: { color: "#fff" },

  callBtn: { backgroundColor: C.status.info.bg, borderWidth: 1, borderColor: C.status.info.border, borderRadius: R.md, padding: 13, alignItems: "center", marginTop: 10 },
  callBtnText: { color: C.status.info.fg, fontWeight: "800", fontSize: 14 },
  shotBtn: { backgroundColor: C.status.danger.bg, borderWidth: 1, borderColor: C.status.danger.border, borderRadius: R.md, padding: 14, alignItems: "center" },
  shotBtnText: { color: C.primaryDark, fontWeight: "800", fontSize: 14 },
  thumb: { width: 84, height: 84, borderRadius: 12 },
  removeText: { color: RED, fontWeight: "700", fontSize: 13 },
  photo: { width: "100%", height: 300, borderRadius: 12, marginTop: 4, backgroundColor: C.surfaceAlt },

  saveBtn: { backgroundColor: C.primary, borderRadius: R.md, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  actRow: { flexDirection: "row", marginTop: 12 },
  actBtn: { backgroundColor: C.status.neutral.bg, borderRadius: R.xs, paddingHorizontal: 12, paddingVertical: 9, marginRight: 8 },
  actBtnGreen: { backgroundColor: "#DCFAE6" },
  actBtnText: { fontSize: 12, fontWeight: "800", color: C.inkSoft },

  // ← BARU: timeline audit
  trailRow: { flexDirection: "row", marginTop: 8 },
  trailCol: { width: 18, alignItems: "center" },
  trailDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary, marginTop: 4 },
  trailLine: { flex: 1, width: 2, backgroundColor: C.divider, marginTop: 2 },
  trailText: { fontSize: 13, color: C.ink, fontWeight: "600", lineHeight: 18 },
  trailMeta: { fontSize: 11, color: GRAY, marginTop: 2 },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginBottom: 6 },
  btnBack: { backgroundColor: RED, borderRadius: R.md, paddingHorizontal: 26, paddingVertical: 12, marginTop: 10 },
  btnBackText: { color: "#fff", fontWeight: "800" },
});
