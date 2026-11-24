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
import VisitResultForm, { type VisitResultValues } from "../../components/VisitResultForm";

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
          data={data}
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
// Isinya sama lengkapnya dengan form SPK saat check-out (produk order, foto, tanggal janji bayar, dll).
function EditPanel({ v, data, onCancel, onSaved }: { v: any; data: any; onCancel: () => void; onSaved: () => void }) {
  const editVisit = useMutation(api.visits.editVisitResult);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async (vals: VisitResultValues) => {
    setBusy(true);
    setErr("");
    try {
      await editVisit({ visitId: v._id, ...(vals as any) });
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
      <View style={{ gap: 14, maxWidth: 640 }}>
        {err ? <Notice tone="err" text={err} /> : null}
        <VisitResultForm
          initial={v}
          photoStockUrls={data?.photoStockUrls}
          photoSelfieUrl={data?.photoSelfieUrl}
          requirePhotos
          submitLabel="Simpan koreksi"
          busy={busy}
          onCancel={onCancel}
          onSubmit={save}
          maxHeight={720}
        />
      </View>
    </Panel>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 70, alignItems: "center" },
  emptyCard: {
    alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: 24,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 16,
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: A.ink, marginTop: 10, fontFamily: FONT },
  emptyDesc: { fontSize: 12.5, color: A.muted, marginTop: 4, textAlign: "center", fontFamily: FONT },

  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  orderList: { gap: 6 },
  orderItem: {
    flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
  },
  orderName: { flex: 1, fontSize: 13, color: A.ink, fontWeight: "600", fontFamily: FONT },
  orderQty: {
    fontSize: 11.5, fontWeight: "800", color: A.info, backgroundColor: A.infoSoft,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, fontFamily: FONT,
  },

  photoLabel: {
    fontSize: 11, fontWeight: "800", color: A.mutedSoft, letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 6, fontFamily: FONT,
  },
  photoSelfie: {
    width: "100%", height: 220, borderRadius: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: {
    width: 74, height: 74, borderRadius: 12,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
  closeLink: { fontSize: 12, fontWeight: "800", color: A.brand, fontFamily: FONT },
});
