import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
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
  janji_bayar: { label: "Janji bayar", fg: A.orange, bg: A.orangeSoft },
  lunas: { label: "Lunas", fg: A.green, bg: A.greenSoft },
  cicil: { label: "Cicil", fg: A.info, bg: A.infoSoft },
  no_respon: { label: "Tidak ada respon", fg: A.muted, bg: A.surfaceAlt },
};

const rupiah = (n?: number) =>
  n == null || isNaN(n as any) ? "-" : "Rp" + Number(n).toLocaleString("id-ID");
const fmtDateTime = (ms?: number) =>
  ms ? new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "";

// ===== DETAIL FOLLOW-UP PIUTANG (web) — dibuka dari Riwayat Follow-up Admin =====
export default function SpkDetailWeb() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.piutang.getTaskDetail, { taskId: id as any }) as any;
  const closeTask = useMutation(api.piutang.supervisorCloseTask);
  const reopenTask = useMutation(api.piutang.supervisorReopenTask);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"" | "close" | "reopen">("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/riwayat?tab=admin" as any));

  if (data === undefined) {
    return (
      <DesktopShell active="riwayat" title="Detail Follow-up" subtitle="Memuat data tugas…">
        <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>
      </DesktopShell>
    );
  }
  if (!data) {
    return (
      <DesktopShell active="riwayat" title="Detail Follow-up" subtitle="Data tidak ditemukan">
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
      title={t.storeName ?? "Detail Follow-up"}
      subtitle={`Follow-up piutang${t.area ? ` • ${t.area}` : ""}${t.tanggal ? ` • Data ${t.tanggal}` : ""}`}
      right={<BackButton onPress={back} />}
    >
      <HeadCard>
        <View style={s.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeadTitle>{t.storeName ?? "-"}</HeadTitle>
            <HeadMeta>
              {t.area ?? "-"} • Follow-up piutang
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
        <Kpi label="Total tagihan" value={rupiah(t.total)} color={A.ink} hint="Nilai piutang tercatat" />
        <Kpi label="Sisa piutang" value={rupiah(t.piutang)} color={A.brand} hint="Belum dibayar" />
        <Kpi label="Sudah dibayar" value={rupiah(t.cicil)} color={A.green} hint="Cicilan / pembayaran" />
        <Kpi
          label="Usia piutang"
          value={t.usia != null ? `${t.usia} hari` : "—"}
          color={t.usia != null && t.usia > 60 ? A.orange : A.info}
          hint={t.retur ? `Retur ${rupiah(t.retur)}` : "Tanpa retur"}
        />
      </View>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <Cols
        main={
          <>
            <Panel title="Data Piutang" icon="bill">
              <Field label="Total tagihan" value={rupiah(t.total)} />
              <Field label="Sisa piutang" value={rupiah(t.piutang)} strong />
              <Field label="Sudah dibayar (cicil)" value={rupiah(t.cicil)} />
              <Field label="Retur" value={rupiah(t.retur)} />
              <Field label="Usia piutang" value={t.usia != null ? `${t.usia} hari` : ""} />
              <Field label="Tanggal data" value={t.tanggal ?? ""} />
            </Panel>

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
                <Text style={[s.hasilText, { color: hasil.fg }]}>
                  {t.hasil === "janji_bayar" && t.promiseDate ? `Janji Bayar ${t.promiseDate}` : hasil.label}
                </Text>
                {t.payMethod ? (
                  <Text style={[s.hasilSub, { color: hasil.fg }]}>
                    Metode: {t.payMethod === "tunai" ? "Tunai" : "Transfer"}
                  </Text>
                ) : null}
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
  hasilSub: { fontSize: 11, fontWeight: "700", marginTop: 4, fontFamily: FONT },

  para: { fontSize: 11.5, color: A.inkSoft, lineHeight: 18, fontFamily: FONT },
  photo: {
    width: "100%", height: 340, borderRadius: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
});
