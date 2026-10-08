import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Alert, Image, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { api } from "../../../convex/_generated/api";
import CleanAlert from "../../components/CleanAlert";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";

const rupiah = (n?: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));

const MET_LIST = [
  { key: "owner", label: "Owner" },
  { key: "karyawan", label: "Karyawan" },
  { key: "pic", label: "PIC" },
  { key: "keluarga", label: "Keluarga" },
  { key: "toko_tutup", label: "Toko Tutup" },
];
const REASON_LIST = [
  { key: "stok_cukup", label: "Stok masih cukup" },
  { key: "baru_order", label: "Baru order trip lalu" },
  { key: "kalah_harga", label: "Kalah harga" },
  { key: "harga_dipelajari", label: "Harga masih dipelajari" },
  { key: "owner_tidak_ada", label: "Owner tidak di tempat" },
  { key: "piutang", label: "Masih ada piutang" },
];
const PAY_LIST = [
  { key: "Y", label: "Ya, bayar" },
  { key: "T", label: "Tidak / janji bayar" },
  { key: "N", label: "Tidak ada piutang" },
];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// ===== Dropdown pilihan (modal) =====
function Dropdown({ label, value, options, onChange }: any) {
  const [open, setOpen] = useState(false);
  const sel = options.find((o: any) => o.key === value);
  return (
    <>
      <TouchableOpacity style={styles.ddBtn} onPress={() => setOpen(true)}>
        <Text style={[styles.ddText, !sel && { color: GRAY }]}>
          {sel ? sel.label : "Pilih..."}
        </Text>
        <Text style={styles.ddArrow}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.ddBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.ddSheet}>
            <Text style={styles.ddTitle}>{label}</Text>
            {options.map((o: any) => {
              const on = value === o.key;
              return (
                <TouchableOpacity key={o.key} style={[styles.ddOpt, on && styles.ddOptOn]}
                  onPress={() => { onChange(o.key); setOpen(false); }}>
                  <Text style={[styles.ddOptText, on && styles.ddOptTextOn]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function VisitScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.users.viewer) as any;
  const visit = useQuery(api.visits.getVisit, { visitId: id as any }) as any;
  const store = useQuery(api.stores.getStore, visit ? { storeId: visit.storeId as any } : "skip");
  // ===== PREVIEW PIUTANG TOKO (data sama dengan tab SPK Admin) =====
  const piutangPrev = useQuery(
    api.piutang.getPiutangPreview,
    store ? { storeName: store.name, area: store.area } : "skip"
  ) as any;
  const finishVisit = useMutation(api.visits.finishVisit);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [metWith, setMetWith] = useState("");
  const [paid, setPaid] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [promiseDate, setPromiseDate] = useState<Date | null>(null);
  const [showCal, setShowCal] = useState(false);
  const [calCursor, setCalCursor] = useState(new Date());
  const [ordered, setOrdered] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [noOrderReason, setNoOrderReason] = useState("");
  const [trend, setTrend] = useState("");
  const [productSearched, setProductSearched] = useState("");
  const [notes, setNotes] = useState("");
  const [stockPhotos, setStockPhotos] = useState<{ uri: string; mime: string }[]>([]);
  const [selfie, setSelfie] = useState<{ uri: string; mime: string } | null>(null);
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

  if (!isAuthenticated || !viewer || visit === undefined) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!visit || visit.status !== "ongoing") {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Kunjungan sudah selesai.</Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => router.replace("/beranda")}>
          <Text style={styles.btnText}>Kembali ke Beranda</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isTutup = metWith === "toko_tutup";

  const elapsed = Math.max(0, now - visit.checkinAt);
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, "0");
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
  const overdue = elapsed >= 30 * 60 * 1000; // lewat 30 menit

  const fmtDate = (d: Date | null) =>
    d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "Pilih tanggal janji bayar";

  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Pilih opsi bayar; kalau "Tidak ada piutang", bersihkan field yang tidak perlu
  const setPaidOpt = (k: string) => {
    setPaid(k);
    if (k === "N") {
      setPaidAmount("");
      setPayMethod("");
      setPromiseDate(null);
    }
  };

  const pickImage = async (source: "camera" | "gallery", kind: "stock" | "selfie") => {
    try {
      let res;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== "granted") { show("Izin Kamera", "Aktifkan izin kamera.", "error"); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] as any, quality: 0.6 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") { show("Izin Galeri", "Aktifkan izin galeri.", "error"); return; }
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.6 });
      }
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const item = { uri: a.uri, mime: a.mimeType ?? "image/jpeg" };
      if (kind === "selfie") setSelfie(item);
      else {
        if (stockPhotos.length >= 2) { show("Maksimal", "Foto stok maksimal 2.", "info"); return; }
        setStockPhotos([...stockPhotos, item]);
      }
    } catch (e) {
      show("Gagal", "Tidak dapat mengambil foto.", "error");
    }
  };

  const askSource = (kind: "stock" | "selfie") => {
    Alert.alert(kind === "stock" ? "Foto Stok" : "Foto Selfie", "Pilih sumber foto", [
      { text: "Batal", style: "cancel" },
      { text: "📁 Galeri", onPress: () => pickImage("gallery", kind) },
      { text: "📷 Kamera", onPress: () => pickImage("camera", kind) },
    ]);
  };

  const uploadOne = async (uri: string, mime: string): Promise<string> => {
    const url = await generateUploadUrl();
    const file = new File(uri);
    const up = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": mime || "image/jpeg" },
      body: file,
    });
    if (!up.ok) throw new Error("Upload foto gagal (" + up.status + ").");
    const json: any = await up.json();
    return json.storageId;
  };

  const addProduct = () => setProducts([...products, ""]);
  const updProduct = (idx: number, v: string) => setProducts(products.map((p, i) => (i === idx ? v : p)));
  const delProduct = (idx: number) => setProducts(products.filter((_, i) => i !== idx));

  const doCheckout = async () => {
    if (!metWith) { show("Lengkapi SPK", "Pilih 'Bertemu dengan'.", "info"); return; }

    if (isTutup) {
      // Toko tutup → hanya selfie yang wajib
      if (!selfie) { show("Foto Selfie", "Foto selfie wajib diambil untuk toko tutup.", "info"); return; }
    } else {
      // ===== Validasi lengkap (bukan toko tutup) =====
      if (!paid) { show("Lengkapi SPK", "Pilih Bayar Ya / Tidak / Tidak ada piutang.", "info"); return; }
      if (paid === "Y") {
        const amt = parseInt(paidAmount.replace(/\./g, ""), 10);
        if (!amt || amt <= 0) { show("Lengkapi SPK", "Isi nominal bayar.", "info"); return; }
        if (!payMethod) { show("Lengkapi SPK", "Pilih metode bayar.", "info"); return; }
      } else if (paid === "T") {
        if (!promiseDate) { show("Lengkapi SPK", "Pilih tanggal janji bayar.", "info"); return; }
      }
      if (!ordered) { show("Lengkapi SPK", "Pilih Order Ya / Tidak.", "info"); return; }
      if (ordered === "Y") {
        const clean = products.map((p) => p.trim()).filter(Boolean);
        if (clean.length === 0) { show("Lengkapi SPK", "Tambah minimal 1 produk order.", "info"); return; }
      } else {
        if (!noOrderReason) { show("Lengkapi SPK", "Pilih alasan tidak order.", "info"); return; }
      }
      if (!trend.trim()) { show("Lengkapi SPK", "Isi trend produk (wajib).", "info"); return; }
      if (stockPhotos.length === 0) { show("Foto Stok", "Foto stok minimal 1 (wajib).", "info"); return; }
      if (!selfie) { show("Foto Selfie", "Foto selfie wajib diambil.", "info"); return; }
    }

    setBusy(true);
    try {
      // Toko tutup → cukup upload selfie; lainnya tidak
      let stockIds: string[] = [];
      if (!isTutup && stockPhotos.length > 0) {
        stockIds = await Promise.all(stockPhotos.map((p) => uploadOne(p.uri, p.mime)));
      }
      const selfieId = await uploadOne(selfie!.uri, selfie!.mime);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Aktifkan izin lokasi untuk check-out.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const isMock = !!((pos as any).mocked);

      const cleanProducts = products.map((p) => p.trim()).filter(Boolean);

      await finishVisit({
        visitId: id as any,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        mock: isMock,
        metWith: metWith as any,
        paid: !isTutup && (paid === "Y" || paid === "N") ? true : !isTutup && paid === "T" ? false : undefined,
        noDebt: !isTutup && paid === "N" ? true : undefined,
        paidAmount: !isTutup && paid === "Y" ? parseInt(paidAmount.replace(/\./g, ""), 10) : undefined,
        payMethod: !isTutup && paid === "Y" ? (payMethod as any) : undefined,
        promiseDate: !isTutup && paid === "T" && promiseDate ? toISODate(promiseDate) : undefined,
        ordered: !isTutup && ordered === "Y" ? true : !isTutup && ordered === "T" ? false : undefined,
        orderItems: !isTutup && ordered === "Y" ? cleanProducts.map((p) => ({ product: p })) : undefined,
        noOrderReason: !isTutup && ordered === "T" ? (noOrderReason as any) : undefined,
        productTrend: !isTutup ? (trend.trim() || undefined) : undefined,
        productSearched: !isTutup ? (productSearched.trim() || undefined) : undefined,
        notes: notes.trim() || undefined,
        photoStock: stockIds.length ? stockIds : undefined,
        photoSelfie: selfieId,
      });

      show("Check-out Berhasil ✅", "Data kunjungan tersimpan.", "success", () => router.replace("/beranda"));
    } catch (e: any) {
      show("Check-out Gagal", toFriendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ active, onPress, label }: any) => (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.storeName} numberOfLines={1}>{store?.name ?? "Memuat..."}</Text>
          <Text style={[styles.timer, overdue && styles.timerWarn]}>⏱ {mm}:{ss}</Text>
          {overdue ? (
            <Text style={styles.overdueNote}>⏰ Sudah lebih dari 30 menit — segera selesaikan & check-out!</Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        <Text style={styles.section}>Bertemu dengan *</Text>
        <Dropdown label="Bertemu dengan siapa?" value={metWith} options={MET_LIST} onChange={setMetWith} />

        {/* ===== MODE TOKO TUTUP: semua disembunyikan, cukup selfie ===== */}
        {isTutup ? (
          <View style={styles.tutupCard}>
            <Text style={styles.tutupTitle}>🏪 Toko Tutup</Text>
            <Text style={styles.tutupText}>
              Toko sedang tutup. Form SPK tidak perlu diisi — cukup ambil foto selfie di depan toko lalu selesaikan kunjungan.
            </Text>
          </View>
        ) : (
          <>
            {/* ===== PREVIEW PIUTANG TOKO ===== */}
            <Text style={styles.section}>Piutang Toko</Text>
            {piutangPrev === undefined ? (
              <View style={styles.piutangCard}>
                <Text style={styles.piutangMuted}>Mengecek data piutang…</Text>
              </View>
            ) : piutangPrev?.found && (piutangPrev.piutang ?? 0) > 0 ? (
              <View style={[styles.piutangCard, styles.piutangHas]}>
                <Text style={styles.piutangBig}>{rupiah(piutangPrev.piutang)}</Text>
                <Text style={styles.piutangSub}>
                  Sisa tagihan • Usia {piutangPrev.usia != null ? piutangPrev.usia + " hari" : "-"} • {piutangPrev.area}
                </Text>
                <Text style={styles.piutangHint}>Data dari SPK Admin (Google Sheets).</Text>
              </View>
            ) : piutangPrev?.found ? (
              <TouchableOpacity
                style={[styles.piutangCard, styles.piutangNone]}
                onPress={() => setPaidOpt("N")}
              >
                <Text style={[styles.piutangBig, { color: GREEN }]}>✓ Tidak ada piutang</Text>
                <Text style={styles.piutangSub}>Toko tidak punya tagihan tersisa. Ketuk untuk memilih opsi "Tidak ada piutang".</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.piutangCard, styles.piutangNone]}
                onPress={() => setPaidOpt("N")}
              >
                <Text style={[styles.piutangBig, { color: GREEN }]}>Tidak ditemukan di data piutang</Text>
                <Text style={styles.piutangSub}>Ketuk untuk memilih "Tidak ada piutang" di opsi bayar.</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.section}>Bayar *</Text>
            <Dropdown label="Apakah toko bayar?" value={paid} options={PAY_LIST} onChange={setPaidOpt} />

            {paid === "Y" ? (
              <View style={styles.card}>
                <Text style={styles.label}>Nominal bayar (Rp) *</Text>
                <TextInput style={styles.input} keyboardType="number-pad" placeholder="contoh: 1500000"
                  value={paidAmount} onChangeText={(t) => setPaidAmount(t.replace(/[^0-9]/g, ""))} />
                <Text style={styles.label}>Metode *</Text>
                <View style={styles.chipRow}>
                  <Chip active={payMethod === "tunai"} onPress={() => setPayMethod("tunai")} label="Tunai" />
                  <Chip active={payMethod === "transfer"} onPress={() => setPayMethod("transfer")} label="Transfer" />
                </View>
              </View>
            ) : null}

            {paid === "T" ? (
              <View style={styles.card}>
                <Text style={styles.label}>Janji bayar tanggal *</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => { setShowCal(!showCal); setCalCursor(promiseDate ?? new Date()); }}>
                  <Text style={styles.dateText}>📅 {fmtDate(promiseDate)}</Text>
                </TouchableOpacity>
                {showCal ? (
                  <View style={styles.calBox}>
                    <View style={styles.calHead}>
                      <TouchableOpacity onPress={() => setCalCursor(new Date(y, m - 1, 1))}><Text style={styles.calNav}>‹</Text></TouchableOpacity>
                      <Text style={styles.calTitle}>{MONTHS[m]} {y}</Text>
                      <TouchableOpacity onPress={() => setCalCursor(new Date(y, m + 1, 1))}><Text style={styles.calNav}>›</Text></TouchableOpacity>
                    </View>
                    <View style={styles.calDowRow}>{DOW.map((d) => <Text key={d} style={styles.calDow}>{d}</Text>)}</View>
                    <View style={styles.calGrid}>
                      {cells.map((day, i) =>
                        day === null ? (
                          <View key={"e" + i} style={styles.calCell} />
                        ) : (
                          <TouchableOpacity
                            key={day}
                            style={[styles.calCell,
                              promiseDate && day === promiseDate.getDate() && m === promiseDate.getMonth() && y === promiseDate.getFullYear()
                                ? styles.calCellActive : null]}
                            onPress={() => { setPromiseDate(new Date(y, m, day)); setShowCal(false); }}
                          >
                            <Text style={styles.calDay}>{day}</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {paid === "N" ? (
              <View style={[styles.card, { backgroundColor: "#F6FEF9" }]}>
                <Text style={[styles.label, { color: GREEN }]}>✓ Tidak ada piutang untuk toko ini.</Text>
              </View>
            ) : null}

            <Text style={styles.section}>Order *</Text>
            <Dropdown label="Apakah toko order?" value={ordered}
              options={[
                { key: "Y", label: "Ya, order" },
                { key: "T", label: "Tidak order" },
              ]}
              onChange={setOrdered} />

            {ordered === "Y" ? (
              <View style={styles.card}>
                <Text style={styles.label}>List order (nama produk) *</Text>
                {products.map((p, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nama produk (ketik bebas)"
                      value={p} onChangeText={(t) => updProduct(idx, t)} />
                    <TouchableOpacity onPress={() => delProduct(idx)} style={styles.delBtn}>
                      <Text style={styles.delText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addBtn} onPress={addProduct}>
                  <Text style={styles.addText}>+ Tambah produk</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {ordered === "T" ? (
              <View style={styles.card}>
                <Text style={styles.label}>Alasan tidak order *</Text>
                <View style={styles.chipRow}>
                  {REASON_LIST.map((r) => (
                    <Chip key={r.key} active={noOrderReason === r.key} onPress={() => setNoOrderReason(r.key)} label={r.label} />
                  ))}
                </View>
              </View>
            ) : null}

            <Text style={styles.section}>Trend produk *</Text>
            <TextInput style={[styles.input, styles.multiline]} placeholder="Catatan trend produk di toko ini"
              multiline value={trend} onChangeText={setTrend} />
            <Text style={styles.section}>Produk baru yang dicari</Text>
            <TextInput style={[styles.input, styles.multiline]} placeholder="Produk baru yang sedang dicari pelanggan (jika ada)"
              multiline value={productSearched} onChangeText={setProductSearched} />
            <Text style={styles.section}>Keterangan</Text>
            <TextInput style={[styles.input, styles.multiline]} placeholder="Keterangan kunjungan..."
              multiline value={notes} onChangeText={setNotes} />

            <Text style={styles.section}>Foto stok * <Text style={styles.optNote}>(1 wajib, maks 2)</Text></Text>
            <View style={styles.photoRow}>
              {stockPhotos.map((p, i) => (
                <View key={i} style={styles.thumbBox}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} />
                  <TouchableOpacity style={styles.thumbDel} onPress={() => setStockPhotos(stockPhotos.filter((_, x) => x !== i))}>
                    <Text style={styles.thumbDelText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {stockPhotos.length < 2 ? (
                <TouchableOpacity style={styles.photoAdd} onPress={() => askSource("stock")}>
                  <Text style={styles.photoAddText}>+ Foto</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}

        {/* ===== FOTO SELFIE: satu-satunya wajib kalau Toko Tutup ===== */}
        <Text style={styles.section}>Foto selfie *</Text>
        <View style={styles.photoRow}>
          {selfie ? (
            <View style={styles.thumbBox}>
              <Image source={{ uri: selfie.uri }} style={styles.thumb} />
              <TouchableOpacity style={styles.thumbDel} onPress={() => setSelfie(null)}>
                <Text style={styles.thumbDelText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoAdd} onPress={() => askSource("selfie")}>
              <Text style={styles.photoAddText}>+ Selfie</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={doCheckout} disabled={busy}>
          <Text style={styles.btnText}>
            {busy ? "Mengunggah & Menyimpan..." : isTutup ? "Selesai (Toko Tutup)" : "✅ Check-out & Simpan"}
          </Text>
        </TouchableOpacity>
      </View>

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
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  backText: { fontSize: 30, color: RED, fontWeight: "700", marginTop: -4 },
  storeName: { fontSize: 17, fontWeight: "800", color: "#111" },
  timer: { fontSize: 15, color: GREEN, fontWeight: "800", marginTop: 2 },
  timerWarn: { color: "#B54708" },
  overdueNote: { fontSize: 12, color: "#B54708", fontWeight: "700", marginTop: 3 },
  section: { fontSize: 14, fontWeight: "800", color: "#111", marginTop: 18, marginBottom: 8 },
  optNote: { fontSize: 12, color: GRAY, fontWeight: "400" },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  ddBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  ddText: { fontSize: 15, color: "#111", fontWeight: "600" },
  ddArrow: { fontSize: 14, color: GRAY },
  ddBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  ddSheet: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 30 },
  ddTitle: { fontSize: 14, fontWeight: "800", color: GRAY, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  ddOpt: { paddingVertical: 13, paddingHorizontal: 8, borderRadius: 10 },
  ddOptOn: { backgroundColor: "#FEE4E2" },
  ddOptText: { fontSize: 15, color: "#111" },
  ddOptTextOn: { color: RED, fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  label: { fontSize: 13, fontWeight: "700", color: "#344054", marginTop: 6, marginBottom: 6 },
  input: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 8 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  dateBtn: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 14, marginBottom: 8 },
  dateText: { fontSize: 15, color: "#111" },
  itemRow: { flexDirection: "row", alignItems: "center" },
  delBtn: { padding: 10, marginLeft: 6 },
  delText: { color: RED, fontWeight: "800", fontSize: 16 },
  addBtn: { paddingVertical: 10 },
  addText: { color: RED, fontWeight: "700", fontSize: 14 },
  calBox: { borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: "#fff" },
  calHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  calNav: { fontSize: 24, color: RED, fontWeight: "700", paddingHorizontal: 8 },
  calTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  calDowRow: { flexDirection: "row" },
  calDow: { width: "14.28%", textAlign: "center", fontSize: 11, color: GRAY, fontWeight: "700", paddingVertical: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", paddingVertical: 6 },
  calCellActive: { backgroundColor: RED, borderRadius: 20 },
  calDay: { fontSize: 13, color: "#111" },
  // ===== Style preview piutang =====
  piutangCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#EEF0F3" },
  piutangHas: { borderColor: "#FECDCA", backgroundColor: "#FFF7F5" },
  piutangNone: { borderColor: "#ABEFC6", backgroundColor: "#F6FEF9" },
  piutangBig: { fontSize: 18, fontWeight: "900", color: RED },
  piutangSub: { fontSize: 13, color: "#B42318", marginTop: 3, fontWeight: "600" },
  piutangHint: { fontSize: 11, color: GRAY, marginTop: 6, fontStyle: "italic" },
  piutangMuted: { fontSize: 13, color: GRAY },
  // ===== Style toko tutup =====
  tutupCard: { backgroundColor: "#FFF1F0", borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: "#FECDCA" },
  tutupTitle: { fontSize: 15, fontWeight: "800", color: "#B42318" },
  tutupText: { fontSize: 13, color: "#B42318", marginTop: 4, lineHeight: 18 },
  photoRow: { flexDirection: "row", flexWrap: "wrap" },
  thumbBox: { width: 84, height: 84, marginRight: 10, marginBottom: 10 },
  thumb: { width: 84, height: 84, borderRadius: 12 },
  thumbDel: { position: "absolute", top: -6, right: -6, backgroundColor: RED, borderRadius: 10, padding: 4 },
  thumbDelText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  photoAdd: { width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderColor: RED, borderStyle: "dashed", justifyContent: "center", alignItems: "center", marginRight: 10, marginBottom: 10 },
  photoAddText: { color: RED, fontWeight: "700", fontSize: 12 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 18, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 16 },
});
