import IOSSpinner from "../../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import DesktopShell from "../../components/desktop/DesktopShell";
import { Panel, Field, Kpi, Chip, NoteBox } from "../../components/desktop/ui";
import {
  BackButton, HeadCard, HeadTitle, HeadMeta, HeadBadges, Cols, ActionButton, ActionRow,
  TextArea, Notice, EmptyLine, Hint, Timeline,
} from "../../components/desktop/detail";
import { SpkStatusBadge } from "../../components/SpkWorkflow";
import AppIcon from "../../components/AppIcon";
import { A, FONT } from "../../components/desktop/tokens";

const RESULT_LABEL: any = {
  order_masuk: "Order masuk", plan_order: "Plan order", belum_order: "Belum order",
  tidak_potensi: "Tidak potensi", history_jelek: "History pembayaran jelek",
  no_respon: "No respon", tutup_permanen: "Toko tutup permanen",
  toko_ganti_nama: "Toko ganti nama", ganti_nama: "Toko ganti nama",
  kalah_harga: "Kalah harga", kebutuhan_pribadi: "Kebutuhan pribadi",
  pengambilan_retail: "Pengambilan retail", belum_ambil: "Belum ambil (lama)",
  stok_cukup: "Stok masih cukup (lama)",
};

const rupiah = (n?: number) =>
  n == null || isNaN(n as any) ? "-" : "Rp" + Number(n).toLocaleString("id-ID");
const fmtDateTime = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";

// ===== DETAIL FU TOKO (web) — dibuka dari Riwayat FU Toko =====
export default function TokoAktifDetailWeb() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.activeStores.getTask, { taskId: id as any }) as any;
  const trail = useQuery(api.activeStores.getAuditTrail, { taskId: id as any }) as any;

  const markCall = useMutation(api.activeStores.markCall);
  const closeTask = useMutation(api.activeStores.supervisorClose);
  const reopenTask = useMutation(api.activeStores.supervisorReopen);

  const [reviewNote, setReviewNote] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"" | "close" | "reopen">("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  // Ambil alasan review yang sudah ada sekali saja (kotak bisa ditulis ulang).
  useEffect(() => {
    const task = data?.task;
    if (!task || prefilled) return;
    setReviewNote(task.reviewNote ?? "");
    setPrefilled(true);
  }, [data, prefilled]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/riwayat?tab=fu" as any));

  if (data === undefined) {
    return (
      <DesktopShell active="riwayat" title="Detail FU Toko" subtitle="Memuat data toko…">
        <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>
      </DesktopShell>
    );
  }
  if (!data) {
    return (
      <DesktopShell active="riwayat" title="Detail FU Toko" subtitle="Data tidak ditemukan">
        <View style={s.emptyCard}>
          <AppIcon name="search" size={20} color={A.mutedSoft} />
          <Text style={s.emptyTitle}>Tugas FU Toko tidak ditemukan</Text>
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
  const isSuper = viewer?.role === "supervisor";
  const isOwner = viewer?.role === "owner";
  const bisaEdit = !isOwner && wf !== "CLSD";
  const canClose = isSuper && wf !== "CLSD";
  const canReopen = isSuper && wf === "CLSD";

  const doCall = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await markCall({ taskId: t._id });
      setNotice({ tone: "ok", text: "Toko ditandai sedang dihubungi. Status tetap OPEN sampai hasilnya disimpan." });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal menandai. Coba lagi." });
    } finally {
      setBusy(false);
    }
  };

  const doClose = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await closeTask({ taskId: t._id, reviewNote: reviewNote.trim() || undefined });
      setConfirm("");
      setNotice({ tone: "ok", text: `FU Toko "${t.storeName}" disetujui (CLSD) dan pindah ke Riwayat.` });
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
      await reopenTask({ taskId: t._id, reason: reviewNote.trim() || undefined });
      setConfirm("");
      setNotice({ tone: "ok", text: "Tugas dibuka kembali (OPEN) dan petugas diberi tahu." });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal membuka tugas. Coba lagi." });
    } finally {
      setBusy(false);
    }
  };

  const audit: any[] = trail ?? [];

  return (
    <DesktopShell
      active="riwayat"
      title={t.storeName ?? "Detail FU Toko"}
      subtitle={`Follow-up toko${t.area ? ` • ${t.area}` : ""}${t.monthKey ? ` • ${t.monthKey}` : ""}`}
      right={<BackButton onPress={back} />}
    >
      <HeadCard>
        <View style={s.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeadTitle>{t.storeName ?? "-"}</HeadTitle>
            <HeadMeta>
              {t.area ?? "-"} • FU Toko{t.monthKey ? ` ${t.monthKey}` : ""}
              {t.doneAt ? ` • Hasil disimpan ${fmtDateTime(t.doneAt)}` : " • Belum ada hasil"}
              {data.doneByName ? ` oleh ${data.doneByName}` : ""}
            </HeadMeta>
          </View>
          <HeadBadges>
            <SpkStatusBadge status={wf} size={11} />
            {t.sourceStatus ? <Chip text={t.sourceStatus} bg={A.surfaceAlt} fg={A.muted} /> : null}
            {t.result ? (
              <Chip
                text={RESULT_LABEL[t.result] ?? t.result}
                bg={t.result === "order_masuk" ? A.greenSoft : A.infoSoft}
                fg={t.result === "order_masuk" ? A.green : A.info}
              />
            ) : null}
          </HeadBadges>
        </View>
      </HeadCard>

      <View style={s.kpiRow}>
        <Kpi label="Target" value={rupiah(t.target)} color={A.brand} hint="Target dari sheet" />
        <Kpi label="Kelas toko" value={t.storeClass ?? "—"} color={A.info} hint={t.paymentClass ? `Bayar: ${t.paymentClass}` : "Kelas bayar belum ada"} />
        <Kpi label="Jumlah dihubungi" value={`${t.callCount ?? 0}×`} color={A.purple} hint={t.calledAt ? `Terakhir ${fmtDateTime(t.calledAt)}` : "Belum pernah"} />
        <Kpi
          label="Hasil"
          value={t.result ? (RESULT_LABEL[t.result] ?? t.result) : "—"}
          color={t.result === "order_masuk" ? A.green : A.orange}
          hint={t.result === "plan_order" && t.plannedOrderDate ? `Rencana ${t.plannedOrderDate}` : "Hasil follow-up"}
        />
      </View>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      {data.sudahOrder ? (
        <Panel title="Sudah order bulan ini" icon="check">
          <Text style={s.orderText}>
            ACT {rupiah(data.act)} dari tarikan SPK Jadwal
            {data.actTanggal ? ` (${data.actTanggal})` : ""}
            {data.actNoSpk ? ` • ${data.actNoSpk}` : ""}. Toko ini tidak perlu di-FU untuk order lagi.
          </Text>
        </Panel>
      ) : null}

      <Cols
        main={
          <>
            <Panel title="Data Toko (dari sheet)" icon="store">
              <Field label="Target" value={rupiah(t.target)} />
              <Field label="Kelas toko" value={t.storeClass} />
              <Field label="Kelas bayar" value={t.paymentClass} />
              <Field label="Status sheet" value={t.sourceStatus} />
              <Field label="Periode" value={t.monthKey} />
              <Field
                label="ACT (SPK Jadwal)"
                value={data.act != null ? `${rupiah(data.act)}${data.actTanggal ? ` • ${data.actTanggal}` : ""}` : ""}
              />
              <Field label="Status order" value={data.sudahOrder ? "Sudah order otomatis" : "Belum ada ACT"} strong />
            </Panel>

            <Panel title="Progres" icon="trend">
              <Field label="Jumlah dihubungi" value={`${t.callCount ?? 0}×`} />
              <Field
                label="Terakhir call"
                value={t.calledAt ? `${fmtDateTime(t.calledAt)} • ${data.calledByName || "-"}` : ""}
              />
              <Field label="Hasil" value={t.result ? (RESULT_LABEL[t.result] ?? t.result) : ""} strong />
              {t.result === "plan_order" ? <Field label="Rencana order" value={t.plannedOrderDate} /> : null}
              <Field label="Disimpan oleh" value={t.doneAt ? `${data.doneByName || "-"} • ${fmtDateTime(t.doneAt)}` : ""} />
              <Field label="Direview" value={t.reviewedAt ? `${data.reviewerName || "-"} • ${fmtDateTime(t.reviewedAt)}` : ""} />
            </Panel>

            {t.identification ? (
              <Panel title="Identifikasi" icon="doc"><Text style={s.para}>{t.identification}</Text></Panel>
            ) : null}

            {t.note ? (
              <Panel title="Catatan Petugas" icon="doc"><Text style={s.para}>{t.note}</Text></Panel>
            ) : null}
          </>
        }
        side={
          <>
            {bisaEdit ? (
              <Panel title="Hubungi Toko" icon="phone">
                <Hint>
                  Tekan Call kalau toko sedang Anda hubungi. Statusnya tetap OPEN, jadi boleh dilanjut besok.
                </Hint>
                <View style={{ marginTop: 12 }}>
                  <ActionButton
                    label={busy ? "Memproses…" : "Call sekarang"}
                    icon="phone"
                    tone="primary"
                    disabled={busy}
                    onPress={doCall}
                  />
                </View>
                <View style={{ marginTop: 12 }}>
                  <Hint>
                    Pengisian hasil, identifikasi, dan unggah bukti chat WA dilakukan dari aplikasi HP — di web ini
                    hasilnya hanya ditampilkan untuk direview.
                  </Hint>
                </View>
              </Panel>
            ) : null}

            {isSuper ? (
              <Panel title="Review Supervisor" icon="shield">
                {confirm === "close" ? (
                  <View style={{ gap: 10 }}>
                    <Hint>
                      FU Toko &quot;{t.storeName}&quot; akan dikunci. Petugas tidak bisa mengedit lagi.
                    </Hint>
                    <TextArea
                      label="Saran / review (opsional)"
                      value={reviewNote}
                      onChangeText={setReviewNote}
                      placeholder="mis. besok follow up lagi / sudah cukup, tutup"
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
                      <ActionButton label="Batal" disabled={busy} onPress={() => setConfirm("")} />
                    </ActionRow>
                  </View>
                ) : confirm === "reopen" ? (
                  <View style={{ gap: 10 }}>
                    <Hint>
                      Tugas kembali ke OPEN. Identifikasi &amp; bukti chat tetap tersimpan
                      {reviewNote.trim() ? ` — alasan ini dikirim ke petugas.` : ` — tulis alasan di kotak bawah kalau perlu.`}
                    </Hint>
                    <TextArea
                      label="Alasan buka kembali (opsional)"
                      value={reviewNote}
                      onChangeText={setReviewNote}
                      placeholder="mis. identifikasi kurang jelas, mohon lengkapi"
                      rows={3}
                    />
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
                    <TextArea
                      label={wf === "CLSD" ? "Alasan buka kembali (opsional)" : "Saran / review (opsional)"}
                      value={reviewNote}
                      onChangeText={setReviewNote}
                      placeholder="mis. besok follow up lagi / sudah cukup, tutup"
                      rows={3}
                    />
                    <ActionRow>
                      {canClose ? (
                        <ActionButton label="Setujui (CLSD)" icon="check" tone="green" onPress={() => setConfirm("close")} />
                      ) : null}
                      {canReopen ? (
                        <ActionButton label="Buka Kembali (OPEN)" icon="refresh" tone="danger" onPress={() => setConfirm("reopen")} />
                      ) : null}
                    </ActionRow>
                  </View>
                )}
              </Panel>
            ) : null}

            <NoteBox note={t.reviewNote} author={data.reviewerName} />

            <Panel title="Bukti Chat WhatsApp" icon="whatsapp">
              {data.chatProofUrl ? (
                <Image source={{ uri: data.chatProofUrl }} style={s.photo} resizeMode="contain" />
              ) : (
                <EmptyLine text="Belum ada bukti chat." />
              )}
            </Panel>

            <Panel title="Riwayat Aksi" icon="clock">
              {trail === undefined ? (
                <IOSSpinner size="small" color={A.brand} />
              ) : audit.length === 0 ? (
                <EmptyLine text="Belum ada aktivitas tercatat." />
              ) : (
                <Timeline
                  items={audit.map((a) => ({
                    key: String(a._id),
                    summary: a.summary ?? "-",
                    meta: `${a.actorName || "-"} • ${fmtDateTime(a.createdAt)}`,
                  }))}
                />
              )}
            </Panel>
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

  para: { fontSize: 11.5, color: A.inkSoft, lineHeight: 18, fontFamily: FONT },
  orderText: { fontSize: 11.5, color: "#067647", lineHeight: 18, fontFamily: FONT, fontWeight: "700" },
  photo: {
    width: "100%", height: 260, borderRadius: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
});
