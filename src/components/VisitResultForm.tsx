// Formulir hasil kunjungan LENGKAP (sama isinya dengan saat sales mengisi SPK di layar check-out).
// Dipakai oleh: Edit hasil kunjungan (mobile & web) dan Tambah kunjungan manual (supervisor).
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform } from "react-native";
import { useMutation } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { api } from "../../convex/_generated/api";
import DatePickerModal from "./DatePickerModal";

import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
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

export type VisitResultValues = {
  metWith: string;
  paid?: boolean;
  noDebt?: boolean;
  paidAmount?: number;
  payMethod?: "tunai" | "transfer";
  promiseDate?: string;
  ordered?: boolean;
  orderItems?: { product: string }[];
  noOrderReason?: string;
  productTrend?: string;
  productSearched?: string;
  notes?: string;
  photoStock?: string[];
  photoSelfie?: string;
};

type Photo = { id?: string; url?: string | null; uri?: string; mime?: string };

type Props = {
  initial?: any; // dokumen kunjungan (untuk edit); kosong = isian baru
  photoStockUrls?: (string | null)[];
  photoSelfieUrl?: string | null;
  requirePhotos?: boolean; // true: foto stok & selfie wajib (kecuali toko tutup: selfie saja)
  submitLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (v: VisitResultValues) => Promise<void> | void;
  maxHeight?: number;
};

export default function VisitResultForm({
  initial, photoStockUrls, photoSelfieUrl, requirePhotos, submitLabel, busy, onCancel, onSubmit, maxHeight = 460,
}: Props) {
  const C = useColors();
  const s = useStyles(createS);
  const v = initial ?? {};
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [metWith, setMetWith] = useState<string>(v.metWith ?? "");
  const [paid, setPaid] = useState<string>(v.noDebt ? "N" : v.paid ? "Y" : v.promiseDate ? "T" : "");
  const [paidAmount, setPaidAmount] = useState<string>(v.paidAmount != null ? String(v.paidAmount) : "");
  const [payMethod, setPayMethod] = useState<string>(v.payMethod ?? "");
  const [promiseDate, setPromiseDate] = useState<string>(v.promiseDate ?? "");
  const [showCal, setShowCal] = useState(false);
  const [ordered, setOrdered] = useState<string>(v.ordered ? "Y" : v.noOrderReason ? "T" : "");
  const [products, setProducts] = useState<string[]>(
    (v.orderItems ?? []).map((o: any) => String(o?.product ?? "")).filter((s: string) => s.length > 0)
  );
  const [noOrderReason, setNoOrderReason] = useState<string>(v.noOrderReason ?? "");
  const [trend, setTrend] = useState<string>(v.productTrend ?? "");
  const [searched, setSearched] = useState<string>(v.productSearched ?? "");
  const [notes, setNotes] = useState<string>(v.notes ?? "");
  const [stock, setStock] = useState<Photo[]>(
    (v.photoStock ?? []).map((id: string, i: number) => ({ id, url: photoStockUrls?.[i] ?? null }))
  );
  const [selfie, setSelfie] = useState<Photo | null>(
    v.photoSelfie ? { id: v.photoSelfie, url: photoSelfieUrl ?? null } : null
  );
  const [saving, setSaving] = useState(false);

  const isTutup = metWith === "toko_tutup";
  const working = !!busy || saving;

  const pick = async (kind: "stock" | "selfie") => {
    try {
      let res;
      const useCamera = Platform.OS !== "web" && kind === "selfie";
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== "granted") { Alert.alert("Izin Kamera", "Aktifkan izin kamera."); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] as any, quality: 0.6 });
      } else {
        if (Platform.OS !== "web") {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (perm.status !== "granted") { Alert.alert("Izin Galeri", "Aktifkan izin galeri."); return; }
        }
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.6 });
      }
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const item: Photo = { uri: a.uri, mime: a.mimeType ?? "image/jpeg" };
      if (kind === "selfie") setSelfie(item);
      else {
        if (stock.length >= 2) { Alert.alert("Maksimal", "Foto stok maksimal 2."); return; }
        setStock([...stock, item]);
      }
    } catch {
      Alert.alert("Gagal", "Tidak dapat mengambil foto.");
    }
  };

  const uploadOne = async (p: Photo): Promise<string> => {
    if (p.id) return p.id; // foto lama, tidak diunggah ulang
    const url = await generateUploadUrl();
    const blob = await (await fetch(p.uri!)).blob();
    const up = await fetch(url, { method: "POST", headers: { "Content-Type": p.mime || "image/jpeg" }, body: blob });
    if (!up.ok) throw new Error("Upload foto gagal (" + up.status + ").");
    const json: any = await up.json();
    return json.storageId;
  };

  const info = (msg: string) => Alert.alert("Lengkapi data", msg);

  const submit = async () => {
    if (!metWith) return info("Pilih 'Bertemu dengan'.");
    const cleanProducts = products.map((p) => p.trim()).filter(Boolean);
    if (isTutup) {
      if (requirePhotos && !selfie) return info("Foto selfie wajib untuk toko tutup.");
    } else {
      if (!paid) return info("Pilih Bayar: Ya / Tidak (janji bayar) / Tidak ada piutang.");
      if (paid === "Y") {
        const amt = parseInt(paidAmount.replace(/[^\d]/g, ""), 10);
        if (!amt || amt <= 0) return info("Isi nominal bayar.");
        if (!payMethod) return info("Pilih metode bayar.");
      } else if (paid === "T" && !promiseDate) return info("Pilih tanggal janji bayar.");
      if (!ordered) return info("Pilih Order: Ya / Tidak.");
      if (ordered === "Y" && cleanProducts.length === 0) return info("Tambah minimal 1 produk order.");
      if (ordered === "T" && !noOrderReason) return info("Pilih alasan tidak order.");
      if (!trend.trim()) return info("Isi trend produk.");
      if (requirePhotos && stock.length === 0) return info("Foto stok minimal 1.");
      if (requirePhotos && !selfie) return info("Foto selfie wajib.");
    }

    setSaving(true);
    try {
      const stockIds = isTutup ? [] : await Promise.all(stock.map(uploadOne));
      const selfieId = selfie ? await uploadOne(selfie) : undefined;
      await onSubmit({
        metWith,
        paid: !isTutup && (paid === "Y" || paid === "N") ? true : !isTutup && paid === "T" ? false : undefined,
        noDebt: !isTutup && paid === "N" ? true : undefined,
        paidAmount: !isTutup && paid === "Y" ? parseInt(paidAmount.replace(/[^\d]/g, ""), 10) : undefined,
        payMethod: !isTutup && paid === "Y" ? (payMethod as any) : undefined,
        promiseDate: !isTutup && paid === "T" ? promiseDate : undefined,
        ordered: !isTutup && ordered === "Y" ? true : !isTutup && ordered === "T" ? false : undefined,
        orderItems: !isTutup && ordered === "Y" ? cleanProducts.map((p) => ({ product: p })) : undefined,
        noOrderReason: !isTutup && ordered === "T" ? noOrderReason : undefined,
        productTrend: !isTutup ? trend.trim() || undefined : undefined,
        productSearched: !isTutup ? searched.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        photoStock: stockIds,
        photoSelfie: selfieId,
      });
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const Chip = ({ on, label, onPress }: any) => (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  const PhotoBox = ({ p, onRemove }: { p: Photo; onRemove: () => void }) => (
    <View style={s.photoBox}>
      {p.uri || p.url ? <Image source={{ uri: (p.uri ?? p.url) as string }} style={s.photoImg} /> : <View style={[s.photoImg, { backgroundColor: C.border2 }]} />}
      <TouchableOpacity style={s.photoX} onPress={onRemove}><Text style={{ color: C.onPrimary, fontWeight: "800" }}>✕</Text></TouchableOpacity>
    </View>
  );

  return (
    <View>
      <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
        <Text style={s.label}>Bertemu dengan *</Text>
        <View style={s.row}>
          {MET_LIST.map((m) => <Chip key={m.key} label={m.label} on={metWith === m.key} onPress={() => setMetWith(m.key)} />)}
        </View>

        {isTutup ? (
          <Text style={s.hint}>Toko tutup — pembayaran, order, dan foto stok tidak diisi.</Text>
        ) : (
          <>
            <Text style={s.label}>Pembayaran *</Text>
            <View style={s.row}>
              <Chip label="Ya, bayar" on={paid === "Y"} onPress={() => setPaid("Y")} />
              <Chip label="Tidak / janji bayar" on={paid === "T"} onPress={() => setPaid("T")} />
              <Chip label="Tidak ada piutang" on={paid === "N"} onPress={() => setPaid("N")} />
            </View>
            {paid === "Y" ? (
              <>
                <TextInput style={s.input} placeholder="Nominal bayar (contoh 500000)" placeholderTextColor={C.inkFaint}
                  keyboardType="numeric" value={paidAmount} onChangeText={setPaidAmount} />
                <View style={s.row}>
                  <Chip label="Tunai" on={payMethod === "tunai"} onPress={() => setPayMethod("tunai")} />
                  <Chip label="Transfer" on={payMethod === "transfer"} onPress={() => setPayMethod("transfer")} />
                </View>
              </>
            ) : null}
            {paid === "T" ? (
              <>
                <TouchableOpacity style={s.input} onPress={() => setShowCal(true)}>
                  <Text style={{ color: promiseDate ? C.ink : C.inkFaint }}>{promiseDate || "Pilih tanggal janji bayar"}</Text>
                </TouchableOpacity>
                <DatePickerModal visible={showCal} value={promiseDate} onClose={() => setShowCal(false)}
                  onPick={(dk) => { setPromiseDate(dk); setShowCal(false); }} />
              </>
            ) : null}

            <Text style={s.label}>Order *</Text>
            <View style={s.row}>
              <Chip label="Order" on={ordered === "Y"} onPress={() => setOrdered("Y")} />
              <Chip label="Tidak order" on={ordered === "T"} onPress={() => setOrdered("T")} />
            </View>
            {ordered === "Y" ? (
              <View>
                {products.map((p, i) => (
                  <View key={i} style={s.prodRow}>
                    <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} placeholder={`Produk ${i + 1}`} placeholderTextColor={C.inkFaint}
                      value={p} onChangeText={(t) => setProducts(products.map((x, j) => (j === i ? t : x)))} />
                    <TouchableOpacity style={s.prodDel} onPress={() => setProducts(products.filter((_, j) => j !== i))}>
                      <Text style={{ color: C.primary, fontWeight: "800" }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={s.addBtn} onPress={() => setProducts([...products, ""])}>
                  <Text style={s.addBtnText}>+ Tambah produk</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {ordered === "T" ? (
              <View style={s.row}>
                {REASON_LIST.map((r) => <Chip key={r.key} label={r.label} on={noOrderReason === r.key} onPress={() => setNoOrderReason(r.key)} />)}
              </View>
            ) : null}

            <Text style={s.label}>Trend produk *</Text>
            <TextInput style={s.input} placeholder="Produk yang sedang laku / trend" placeholderTextColor={C.inkFaint} value={trend} onChangeText={setTrend} multiline />
            <Text style={s.label}>Produk dicari toko</Text>
            <TextInput style={s.input} placeholder="Produk yang dicari toko (opsional)" placeholderTextColor={C.inkFaint} value={searched} onChangeText={setSearched} multiline />

            <Text style={s.label}>Foto stok (maks. 2){requirePhotos ? " *" : ""}</Text>
            <View style={s.row}>
              {stock.map((p, i) => <PhotoBox key={i} p={p} onRemove={() => setStock(stock.filter((_, j) => j !== i))} />)}
              {stock.length < 2 ? (
                <TouchableOpacity style={s.photoAdd} onPress={() => pick("stock")}><Text style={s.photoAddText}>+ Foto</Text></TouchableOpacity>
              ) : null}
            </View>
          </>
        )}

        <Text style={s.label}>Foto selfie{requirePhotos ? " *" : ""}</Text>
        <View style={s.row}>
          {selfie ? <PhotoBox p={selfie} onRemove={() => setSelfie(null)} /> : (
            <TouchableOpacity style={s.photoAdd} onPress={() => pick("selfie")}><Text style={s.photoAddText}>+ Foto</Text></TouchableOpacity>
          )}
        </View>

        <Text style={s.label}>Keterangan</Text>
        <TextInput style={s.input} placeholder="Catatan kunjungan" placeholderTextColor={C.inkFaint} value={notes} onChangeText={setNotes} multiline />
      </ScrollView>

      <View style={s.actions}>
        <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={onCancel} disabled={working}>
          <Text style={[s.btnText, { color: C.inkMuted }]}>Batal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnSave, working && { opacity: 0.6 }]} onPress={submit} disabled={working}>
          <Text style={s.btnText}>{working ? "Menyimpan…" : submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createS = (C: Colors) => StyleSheet.create({
  label: { fontSize: 12, fontWeight: "800", color: C.inkMuted, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.status.neutral.border, backgroundColor: C.card },
  chipOn: { backgroundColor: C.chip.danger.bg, borderColor: C.status.danger.border },
  chipText: { fontSize: 13, color: C.inkSoft, fontWeight: "600" },
  chipTextOn: { color: C.status.danger.fg, fontWeight: "800" },
  input: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.ink, backgroundColor: C.card, marginTop: 8 },
  hint: { fontSize: 12, color: C.inkMuted, marginTop: 10, lineHeight: 17 },
  prodRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  prodDel: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: C.chip.danger.bg },
  addBtn: { marginTop: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: C.status.neutral.border, alignItems: "center" },
  addBtnText: { color: C.primary, fontWeight: "800", fontSize: 13 },
  photoBox: { width: 84, height: 84, borderRadius: 12, overflow: "hidden" },
  photoImg: { width: 84, height: 84 },
  photoX: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  photoAdd: { width: 84, height: 84, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: C.status.neutral.border, alignItems: "center", justifyContent: "center" },
  photoAddText: { color: C.inkMuted, fontWeight: "700", fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  btnCancel: { borderWidth: 1, borderColor: C.status.neutral.border, backgroundColor: C.card },
  btnSave: { backgroundColor: C.primary },
  btnText: { color: C.onPrimary, fontWeight: "800", fontSize: 14 },
});
