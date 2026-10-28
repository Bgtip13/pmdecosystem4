import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import DesktopShell from "../../components/desktop/DesktopShell";
import { Panel, Field, Kpi, Chip, NoteBox } from "../../components/desktop/ui";
import {
  BackButton, HeadCard, HeadTitle, HeadMeta, HeadBadges, Cols, ActionButton, ActionRow,
  TextArea, Notice, EmptyLine, Para, Hint, Pick, PickRow, FieldLabel,
} from "../../components/desktop/detail";
import { SpkStatusBadge, normalizeWf } from "../../components/SpkWorkflow";
import AppIcon from "../../components/AppIcon";
import { A, FONT } from "../../components/desktop/tokens";

const MET_LABEL: any = {
  owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko tutup",
};
const MET_OPTIONS = [
  { key: "owner", label: "Owner" }, { key: "karyawan", label: "Karyawan" },
  { key: "pic", label: "PIC" }, { key: "keluarga", label: "Keluarga" },
  { key: "toko_tutup", label: "Toko tutup" },
];
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const REASON_OPTIONS = [
  { key: "stok_cukup", label: "Stok cukup" }, { key: "baru_order", label: "Baru order" },
  { key: "kalah_harga", label: "Kalah harga" }, { key: "harga_dipelajari", label: "Harga dipelajari" },
  { key: "owner_tidak_ada", label: "Owner tidak ada" }, { key: "piutang", label: "Ada piutang" },
];

const fmtTime = (ms?: number) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = (ms?: number) =>
  ms ? new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";
const rupiah = (n?: number) =>
  n == null || isNaN(n as any) ? "-" : "Rp" + Number(n).toLocaleString("id-ID");

// ===== DETAIL KUNJUNGAN SALES (web) — dibuka dari Riwayat Kunjungan =====
export default function VisitDetailWeb() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.visits.getVisitDetail, { visitId: id as any }) as any;
  const closeVisit = useMutation(api.visits.supervisorCloseVisit);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/riwayat" as any));

  if (data === undefined) {
    return (
      <DesktopShell active="riwayat" title="Detail Kunjungan" subtitle="Memuat data kunjungan…">
        <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>
      </DesktopShell>
    );
  }
  if (!data) {
    return (
      <DesktopShell active="riwayat" title="Detail Kunjungan" subtitle="Data tidak ditemukan">
        <View style={s.emptyCard}>
          <AppIcon name="search" size={20} color={A.mutedSoft} />
          <Text style={s.emptyTitle}>Kunjungan tidak ditemukan</Text>
          <Text style={s.emptyDesc}>Data ini sudah dihapus atau tidak bisa diakses oleh akun Anda.</Text>
          <View style={{ marginTop: 14 }}>
            <ActionButton label="Kembali ke Riwayat" icon="back" onPress={back} />
          </View>
        </View>
      </DesktopShell>
    );
  }

  const v = data.visit;
  const store = data.store;
  const wf = normalizeWf(v.workflowStatus ?? "INPG");
  const isSuper = viewer?.role === "supervisor";
  const isOwnerOfVisit = viewer?._id === v.salesId;
  const canEdit = v.status === "done" && wf === "INPG" && (isSuper || isOwnerOfVisit);
  const canClose = isSuper && v.status === "done" && wf === "INPG";
  const tutup = v.metWith === "toko_tutup";
  const stockPhotos: string[] = (data.photoStockUrls ?? []).filter(Boolean);

  const doClose = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await closeVisit({ visitId: v._id, reviewNote: note.trim() || undefined });
      setNote("");
      setConfirming(false);
      setNotice({ tone: "ok", text: "Kunjungan sudah disetujui (CLSD) dan terkunci." });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal menyetujui. Coba lagi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesktopShell
      active="riwayat"
      title={store?.name ?? "Detail Kunjungan"}
      subtitle={`Detail kunjungan sales${data.salesName ? ` • ${data.salesName}` : ""}${v.checkinAt ? ` • ${fmtDate(v.checkinAt)}` : ""}`}
      right={<BackButton onPress={back} />}
    >
      <HeadCard>
        <View style={s.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeadTitle>{store?.name ?? "Toko terhapus"}</HeadTitle>
            <HeadMeta>
              {store?.area ?? "-"} • Bertemu {MET_LABEL[v.metWith] ?? "-"} • Petugas {data.salesName || "-"}
            </HeadMeta>
          </View>
          <HeadBadges>
            <SpkStatusBadge status={wf} size={11} />
            {tutup ? <Chip text="Toko tutup" bg={A.orangeSoft} fg={A.orange} /> : null}
            {v.noDebt ? <Chip text="Tidak ada piutang" bg={A.greenSoft} fg={A.green} /> : null}
          </HeadBadges>
        </View>
      </HeadCard>

      <View style={s.kpiRow}>
        <Kpi label="Durasi" value={v.durationMin != null ? `${v.durationMin} mnt` : "—"} color={A.brand} hint="Check-in → check-out" />
        <Kpi label="Check-in" value={fmtTime(v.checkinAt) || "—"} color={A.info} hint={fmtDate(v.checkinAt) || "-"} />
        <Kpi label="Check-out" value={fmtTime(v.checkoutAt) || "—"} color={A.purple} hint={v.checkoutAt ? fmtDate(v.checkoutAt) : "Belum check-out"} />
        <Kpi
          label="Pembayaran"
          value={v.paid ? rupiah(v.paidAmount ?? 0) : v.noDebt ? "Nihil" : "—"}
          color={v.paid ? A.green : A.muted}
          hint={v.paid ? (v.payMethod === "transfer" ? "Transfer" : "Tunai") : tutup ? "Toko tutup" : "Tidak ada bayar"}
        />
      </View>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <Cols
        main={
          <>
            <Panel title="Waktu Kunjungan" icon="clock">
              <Field label="Sales" value={data.salesName} />
              <Field label="Tanggal" value={fmtDate(v.checkinAt)} />
              <Field label="Check-in" value={fmtTime(v.checkinAt)} />
              <Field label="Check-out" value={fmtTime(v.checkoutAt)} />
              <Field label="Durasi" value={v.durationMin != null ? `${v.durationMin} menit` : ""} />
              <Field
                label="Koordinat masuk"
                value={v.checkinLat ? `${v.checkinLat.toFixed(6)}, ${v.checkinLng?.toFixed(6)}` : ""}
              />
              <Field
                label="Koordinat keluar"
                value={v.checkoutLat ? `${v.checkoutLat.toFixed(6)}, ${v.checkoutLng?.toFixed(6)}` : ""}
              />
            </Panel>

            <Panel title="Pembayaran" icon="cash">
              {tutup ? (
                <EmptyLine text="Toko tutup — tidak ada transaksi pembayaran." />
              ) : v.noDebt ? (
                <>
                  <Field label="Status" value="Tidak ada piutang" />
                  <Field label="Keterangan" value="Toko tidak punya tagihan tersisa" />
                </>
              ) : v.paid ? (
                <>
                  <Field label="Status" value="Bayar" strong />
                  <Field label="Nominal" value={rupiah(v.paidAmount ?? 0)} strong />
                  <Field label="Metode" value={v.payMethod === "tunai" ? "Tunai" : v.payMethod === "transfer" ? "Transfer" : ""} />
                </>
              ) : v.promiseDate ? (
                <Field label="Janji bayar" value={v.promiseDate} strong />
              ) : (
                <EmptyLine text="Tidak ada data pembayaran." />
              )}
            </Panel>

            <Panel title="Order" icon="cart">
              {tutup ? (
                <EmptyLine text="Toko tutup — tidak ada transaksi order." />
              ) : v.ordered ? (
                (v.orderItems ?? []).length ? (
                  <View style={s.orderList}>
                    {(v.orderItems ?? []).map((it: any, i: number) => (
                      <View key={i} style={s.orderItem}>
                        <AppIcon name="box" size={14} color={A.info} />
                        <Text style={s.orderName} numberOfLines={2}>{it.product || "Produk"}</Text>
                        {it.qty ? <Text style={s.orderQty}>{it.qty}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <EmptyLine text="Order tanpa produk tercatat." />
                )
              ) : v.noOrderReason ? (
                <Field label="Alasan tidak order" value={REASON_LABEL[v.noOrderReason] ?? v.noOrderReason} strong />
              ) : (
                <EmptyLine text="Tidak ada data order." />
              )}
            </Panel>

            {!tutup && v.productTrend ? (
              <Panel title="Trend Produk" icon="trend"><Para>{v.productTrend}</Para></Panel>
            ) : null}

            {v.notes ? (
              <Panel title="Keterangan" icon="doc"><Para>{v.notes}</Para></Panel>
            ) : null}
          </>
        }
        side={
          <>
            <Panel title="Hasil Kunjungan" icon="checkDone">
              {v.status === "done" && wf === "INPG" ? (
                confirming ? (
                  <View style={{ gap: 10 }}>
                    <Hint>
                      Setelah disetujui (CLSD), sales tidak bisa mengedit lagi dan kunjungan tidak bisa dibuka kembali.
                    </Hint>
                    <TextArea
                      label="Saran / review (opsional)"
                      value={note}
                      onChangeText={setNote}
                      placeholder="mis. besok follow up lagi / sudah cukup"
                      rows={3}
                    />
                    <ActionRow>
                      <ActionButton
                        label={busy ? "Memproses…" : "Ya, Setujui (CLSD)"}
                        icon="check"
                        tone="green"
                        disabled={busy}
                        onPress={doClose}
                      />
                      <ActionButton label="Batal" disabled={busy} onPress={() => { setConfirming(false); setNote(""); }} />
                    </ActionRow>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Hint>
                      {isSuper
                        ? "Tutup dengan Setujui supaya sales tidak bisa mengedit lagi."
                        : canEdit
                          ? "Anda masih bisa mengoreksi hasil ini selama belum disetujui supervisor."
                          : "Hasil sudah terkunci. Perubahan hanya bisa dilakukan supervisor."}
                    </Hint>
                    <ActionRow>
                      {canEdit ? (
                        <ActionButton
                          label={editing ? "Tutup koreksi" : "Edit hasil kunjungan"}
                          icon="edit"
                          onPress={() => setEditing((x) => !x)}
                        />
                      ) : null}
                      {canClose ? (
                        <ActionButton
                          label="Setujui (CLSD)"
                          icon="check"
                          tone="green"
                          onPress={() => { setNote(""); setConfirming(true); }}
                        />
                      ) : null}
                    </ActionRow>
                  </View>
                )
              ) : (
                <EmptyLine
                  text={
                    wf === "CLSD"
                      ? "Kunjungan sudah disetujui (CLSD) — data terkunci."
                      : `Kunjungan masih berstatus ${wf}.`
                  }
                />
              )}
            </Panel>

            <NoteBox note={v.reviewNote} author={data.reviewerName} />

            <Panel title="Foto" icon="camera">
              <Text style={s.photoLabel}>Selfie</Text>
              {data.photoSelfieUrl ? (
                <Image source={{ uri: data.photoSelfieUrl }} style={s.photoSelfie} resizeMode="cover" />
              ) : (
                <EmptyLine text="Tidak ada foto selfie." />
              )}

              {!tutup ? (
                <>
                  <Text style={[s.photoLabel, { marginTop: 16 }]}>
                    Stok{stockPhotos.length ? ` (${stockPhotos.length})` : ""}
                  </Text>
                  {stockPhotos.length ? (
                    <View style={s.photoGrid}>
                      {stockPhotos.map((u, i) => (
                        <Image key={i} source={{ uri: u }} style={s.photoTile} resizeMode="cover" />
                      ))}
                    </View>
                  ) : (
                    <EmptyLine text="Tidak ada foto stok." />
                  )}
                </>
              ) : null}
            </Panel>
          </>
        }
      />

      {editing && canEdit ? (
        <EditPanel
          v={v}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice({ tone: "ok", text: "Koreksi hasil kunjungan tersimpan dan masih menunggu review SPV." });
          }}
        />
      ) : null}
    </DesktopShell>
  );
}

// ===== PANEL KOREKSI HASIL (sales pemilik & supervisor, hanya saat INPG) =====
function EditPanel({ v, onCancel, onSaved }: { v: any; onCancel: () => void; onSaved: () => void }) {
  const editVisit = useMutation(api.visits.editVisitResult);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
      setErr("Isi tanggal janji bayar dulu (contoh 2026-09-25).");
      return;
    }
    setBusy(true);
    setErr("");
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
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Gagal menyimpan koreksi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Koreksi Hasil Kunjungan"
      icon="edit"
      right={
        <TouchableOpacity onPress={onCancel}>
          <Text style={s.closeLink}>Tutup</Text>
        </TouchableOpacity>
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Notice tone="err" text={err} /> : null}

        <View>
          <FieldLabel>Bertemu siapa</FieldLabel>
          <PickRow>
            {MET_OPTIONS.map((m) => (
              <Pick key={m.key} label={m.label} on={metWith === m.key} onPress={() => setMetWith(m.key)} />
            ))}
          </PickRow>
        </View>

        {!isTutup ? (
          <>
            <View>
              <FieldLabel>Pembayaran</FieldLabel>
              <PickRow>
                <Pick label="Tidak ada piutang" on={payMode === "noDebt"} onPress={() => setPayMode("noDebt")} />
                <Pick label="Bayar" on={payMode === "paid"} onPress={() => setPayMode("paid")} />
                <Pick label="Janji bayar" on={payMode === "promise"} onPress={() => setPayMode("promise")} />
              </PickRow>
              {payMode === "paid" ? (
                <View style={{ marginTop: 10, gap: 10 }}>
                  <TextArea
                    label="Nominal bayar"
                    value={paidAmount}
                    onChangeText={setPaidAmount}
                    placeholder="contoh 500000"
                    rows={1}
                  />
                  <PickRow>
                    <Pick label="Tunai" on={payMethod === "tunai"} onPress={() => setPayMethod("tunai")} />
                    <Pick label="Transfer" on={payMethod === "transfer"} onPress={() => setPayMethod("transfer")} />
                  </PickRow>
                </View>
              ) : null}
              {payMode === "promise" ? (
                <View style={{ marginTop: 10 }}>
                  <TextArea
                    label="Tanggal janji bayar"
                    value={promiseDate}
                    onChangeText={setPromiseDate}
                    placeholder="2026-09-25"
                    rows={1}
                  />
                </View>
              ) : null}
            </View>

            <View>
              <FieldLabel>Order</FieldLabel>
              <PickRow>
                <Pick label="Order" on={orderMode === "yes"} onPress={() => setOrderMode("yes")} />
                <Pick label="Tidak order" on={orderMode === "no"} onPress={() => setOrderMode("no")} />
              </PickRow>
              {orderMode === "no" ? (
                <View style={{ marginTop: 10 }}>
                  <PickRow>
                    {REASON_OPTIONS.map((r) => (
                      <Pick
                        key={r.key}
                        label={r.label}
                        on={noOrderReason === r.key}
                        onPress={() => setNoOrderReason(r.key)}
                      />
                    ))}
                  </PickRow>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <Hint>Toko tutup — bagian pembayaran &amp; order otomatis dikosongkan.</Hint>
        )}

        <TextArea label="Keterangan" value={notes} onChangeText={setNotes} placeholder="Catatan kunjungan" rows={3} />

        <Hint>
          Daftar produk order &amp; foto tidak ikut diubah di sini — keduanya tetap seperti saat check-out.
        </Hint>

        <ActionRow>
          <ActionButton label="Batal" disabled={busy} onPress={onCancel} />
          <ActionButton
            label={busy ? "Menyimpan…" : "Simpan koreksi"}
            icon="save"
            tone="primary"
            disabled={busy}
            onPress={save}
          />
        </ActionRow>
      </View>
    </Panel>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 70, alignItems: "center" },
  emptyCard: {
    alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: 24,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10,
  },
  emptyTitle: { fontSize: 13, fontWeight: "800", color: A.ink, marginTop: 10, fontFamily: FONT },
  emptyDesc: { fontSize: 11, color: A.muted, marginTop: 4, textAlign: "center", fontFamily: FONT },

  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  orderList: { gap: 6 },
  orderItem: {
    flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  orderName: { flex: 1, fontSize: 11.5, color: A.ink, fontWeight: "600", fontFamily: FONT },
  orderQty: {
    fontSize: 10, fontWeight: "800", color: A.info, backgroundColor: A.infoSoft,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, fontFamily: FONT,
  },

  photoLabel: {
    fontSize: 9, fontWeight: "800", color: A.mutedSoft, letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 6, fontFamily: FONT,
  },
  photoSelfie: {
    width: "100%", height: 220, borderRadius: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: {
    width: 74, height: 74, borderRadius: 8,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
  closeLink: { fontSize: 10.5, fontWeight: "800", color: A.brand, fontFamily: FONT },
});
