import { useState } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator, Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import DesktopShell from "../../components/desktop/DesktopShell";
import { Panel, Field, Kpi, Chip, NoteBox } from "../../components/desktop/ui";
import {
  BackButton, HeadCard, HeadTitle, HeadMeta, HeadBadges, Cols, ActionButton, ActionRow,
  TextArea, Notice, EmptyLine, Hint,
} from "../../components/desktop/detail";
import { SpkStatusBadge } from "../../components/SpkWorkflow";
import AppIcon from "../../components/AppIcon";
import { A, FONT } from "../../components/desktop/tokens";

const HASIL: any = {
  order_masuk: { label: "Order masuk", fg: A.green, bg: A.greenSoft },
  order_tambah: { label: "Order tambahan", fg: A.info, bg: A.infoSoft },
  tidak_order: { label: "Tidak order", fg: A.red, bg: A.brandSoft },
  no_respon: { label: "No respon", fg: A.muted, bg: A.surfaceAlt },
};
const REASON: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const MET: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko tutup" };

const fmtDateTime = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";

// ===== DETAIL FOLLOW-UP ORDERAN (web) — dibuka dari Riwayat Follow-up Admin =====
export default function SpkDetailOrderWeb() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.orderFollowups.getTaskDetail, { taskId: id as any }) as any;
  const closeTask = useMutation(api.orderFollowups.supervisorCloseTask);
  const reopenTask = useMutation(api.orderFollowups.supervisorReopen);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"" | "close" | "reopen">("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/riwayat?tab=admin" as any));

  if (data === undefined) {
    return (
      <DesktopShell active="riwayat" title="Detail Follow-up Orderan" subtitle="Memuat data tugas…">
        <View style={s.center}><ActivityIndicator size="large" color={A.brand} /></View>
      </DesktopShell>
    );
  }
  if (!data) {
    return (
      <DesktopShell active="riwayat" title="Detail Follow-up Orderan" subtitle="Data tidak ditemukan">
        <View style={s.emptyCard}>
          <AppIcon name="search" size={20} color={A.mutedSoft} />
          <Text style={s.emptyTitle}>Tugas tidak ditemukan</Text>
          <Text style={s.emptyDesc}>Data ini sudah dihapus atau tidak bisa diakses oleh akun Anda.</Text>
          <View style={{ marginTop: 14 }}>
            <ActionButton label="Kembali ke Riwayat" icon="back" onPress={back} />
          </View>
        </View>
      </DesktopShell>
    );
  }

  const t = data.task;
  const wf = (t.workflowStatus ?? "OPEN") as string;
  const hasil = HASIL[t.hasil] ?? { label: t.hasil ?? "-", fg: A.muted, bg: A.surfaceAlt };
  const items: any[] = t.orderItems ?? [];
  const isSuper = viewer?.role === "supervisor";
  const canClose = isSuper && wf === "INPG";
  const canReopen = isSuper && wf === "CLSD";

  const doClose = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await closeTask({ taskId: t._id, reviewNote: note.trim() || undefined });
      setNote("");
      setConfirm("");
      setNotice({ tone: "ok", text: "Tugas sudah disetujui (CLSD) dan pindah ke Riwayat." });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal menyetujui. Coba lagi." });
    } finally {
      setBusy(false);
    }
  };

  const doReopen = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await reopenTask({ taskId: t._id });
      setConfirm("");
      setNotice({ tone: "ok", text: "Tugas dibuka kembali (OPEN) dan muncul di daftar SPK hari ini." });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal membuka tugas. Coba lagi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesktopShell
      active="riwayat"
      title={t.storeName ?? "Detail Follow-up Orderan"}
      subtitle={`Follow-up orderan${t.area ? ` • ${t.area}` : ""}${t.day ? ` • Jadwal ${t.day}` : ""}`}
      right={<BackButton onPress={back} />}
    >
      <HeadCard>
        <View style={s.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeadTitle>{t.storeName ?? "-"}</HeadTitle>
            <HeadMeta>
              {t.area ?? "-"} • Follow-up orderan
              {t.doneAt ? ` • Diisi ${fmtDateTime(t.doneAt)}` : ""}
              {data.salesName ? ` oleh ${data.salesName}` : ""}
            </HeadMeta>
          </View>
          <HeadBadges>
            <SpkStatusBadge status={wf} size={11} />
            <Chip text={hasil.label} bg={hasil.bg} fg={hasil.fg} />
          </HeadBadges>
        </View>
      </HeadCard>

      <View style={s.kpiRow}>
        <Kpi label="Produk order" value={items.length ? `${items.length} item` : "0"} color={A.brand} hint="Dari form orderan" />
        <Kpi label="Tanggal kunjungan" value={t.visitDay ?? "—"} color={A.info} hint="Sumber data H-1" />
        <Kpi label="Jumlah kunjungan" value={t.visitCount != null ? `${t.visitCount}×` : "—"} color={A.purple} hint="Kunjungan sales" />
        <Kpi
          label="Bertemu"
          value={t.visitMetWith ? (MET[t.visitMetWith] ?? t.visitMetWith) : "—"}
          color={A.orange}
          hint={t.visitMetWith === "toko_tutup" ? "Toko tutup" : "Pihak yang ditemui"}
        />
      </View>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <Cols
        main={
          <>
            <Panel title="Kunjungan Sumber (H-1)" icon="pin">
              <Field label="Dikunjungi oleh" value={t.salesName} />
              <Field label="Tanggal kunjungan" value={t.visitDay} />
              <Field label="Jumlah kunjungan" value={t.visitCount != null ? `${t.visitCount}×` : ""} />
              <Field label="Bertemu" value={t.visitMetWith ? (MET[t.visitMetWith] ?? t.visitMetWith) : ""} />
              <Field
                label="Hasil kunjungan"
                value={
                  t.ordered
                    ? `Order ${items.length} produk`
                    : t.visitReason
                      ? (REASON[t.visitReason] ?? t.visitReason)
                      : "Tidak order"
                }
                strong
              />
            </Panel>

            {items.length ? (
              <Panel title="Daftar Order" icon="box">
                <View style={s.orderList}>
                  {items.map((it: any, i: number) => (
                    <View key={i} style={s.orderItem}>
                      <AppIcon name="box" size={14} color={A.info} />
                      <Text style={s.orderName} numberOfLines={2}>{it.product || "Produk"}</Text>
                      {it.qty ? <Text style={s.orderQty}>{it.qty}</Text> : null}
                    </View>
                  ))}
                </View>
              </Panel>
            ) : null}

            {t.notes ? (
              <Panel title="Catatan Petugas" icon="doc"><Text style={s.para}>{t.notes}</Text></Panel>
            ) : null}

            <Panel title="Screenshot WhatsApp" icon="whatsapp">
              {data.photoUrl ? (
                <Image source={{ uri: data.photoUrl }} style={s.photo} resizeMode="contain" />
              ) : (
                <EmptyLine text="Tidak ada lampiran bukti." />
              )}
            </Panel>
          </>
        }
        side={
          <>
            <Panel title="Hasil Follow-up" icon="checkDone">
              <View style={s.hasilBox}>
                <Text style={[s.hasilText, { color: hasil.fg }]}>{hasil.label}</Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Field label="Dikerjakan oleh" value={data.salesName} />
                <Field label="Diisi pada" value={fmtDateTime(t.doneAt)} />
                {wf === "CLSD" ? (
                  <>
                    <Field label="Disetujui oleh" value={data.reviewerName} />
                    <Field label="Disetujui pada" value={fmtDateTime(t.reviewedAt)} />
                  </>
                ) : null}
              </View>
            </Panel>

            <NoteBox note={t.reviewNote} author={data.reviewerName} />

            {isSuper ? (
              <Panel title="Review Supervisor" icon="shield">
                {wf === "OPEN" ? (
                  <Hint>Petugas belum mengisi hasil. Tugas ini belum bisa ditutup (CLSD).</Hint>
                ) : null}

                {wf === "INPG" ? (
                  confirm === "close" ? (
                    <View style={{ gap: 10 }}>
                      <Hint>
                        Setelah CLSD, petugas tidak bisa mengedit lagi dan tugas pindah ke Riwayat.
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
                        <ActionButton label="Batal" disabled={busy} onPress={() => { setConfirm(""); setNote(""); }} />
                      </ActionRow>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <Hint>Isian sudah masuk. Tambahkan saran (opsional), lalu tutup dengan CLSD.</Hint>
                      <ActionRow>
                        <ActionButton
                          label="Setujui (CLSD)"
                          icon="check"
                          tone="green"
                          disabled={!canClose}
                          onPress={() => { setNote(""); setConfirm("close"); }}
                        />
                      </ActionRow>
                    </View>
                  )
                ) : null}

                {wf === "CLSD" ? (
                  confirm === "reopen" ? (
                    <View style={{ gap: 10 }}>
                      <Hint>
                        Isian hasil akan dikosongkan dan tugas kembali muncul di daftar SPK hari ini.
                      </Hint>
                      <ActionRow>
                        <ActionButton
                          label={busy ? "Memproses…" : "Ya, Buka (OPEN)"}
                          icon="refresh"
                          tone="primary"
                          disabled={busy}
                          onPress={doReopen}
                        />
                        <ActionButton label="Batal" disabled={busy} onPress={() => setConfirm("")} />
                      </ActionRow>
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <Hint>
                        Sudah disetujui. Kalau ada yang salah, buka kembali ke OPEN supaya bisa dikerjakan ulang.
                      </Hint>
                      <ActionRow>
                        <ActionButton label="Buka Kembali (OPEN)" icon="refresh" tone="danger" disabled={!canReopen} onPress={() => setConfirm("reopen")} />
                      </ActionRow>
                    </View>
                  )
                ) : null}
              </Panel>
            ) : null}
          </>
        }
      />
    </DesktopShell>
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

  hasilBox: { borderRadius: 9, padding: 13, backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft },
  hasilText: { fontSize: 13.5, fontWeight: "800", fontFamily: FONT },

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

  para: { fontSize: 11.5, color: A.inkSoft, lineHeight: 18, fontFamily: FONT },
  photo: {
    width: "100%", height: 340, borderRadius: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
});
