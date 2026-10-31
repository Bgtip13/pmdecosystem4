import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { Panel, Kpi, Field } from "../components/desktop/ui";
import { ActionButton, ActionRow, Hint, Notice, TextArea } from "../components/desktop/detail";
import { A, FONT } from "../components/desktop/tokens";
import { toFriendlyError } from "../lib/msg";

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function fmtTanggal(dk?: string | null) {
  if (!dk) return "-";
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const hari = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][dt.getUTCDay()];
  return `${hari} ${pad2(d)} ${BULAN_SHORT[m - 1]} ${y}`;
}

const fmtDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

// ===== PUSAT PERSETUJUAN (WEB) =====
// Dua jenis persetujuan dalam satu halaman:
//   • Perubahan jadwal dari sales (geser tanggal / hapus toko)
//   • Usulan perbarui koordinat toko
export default function SpvApprovalWeb() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const viewer = useQuery(api.users.viewer) as any;
  const jadwalReq = useQuery(api.jadwalRequests.list, { status: "pending" } as any) as any;
  const locReq = useQuery(api.locationRequests.listPendingRequests) as any;

  const decideJadwal = useMutation(api.jadwalRequests.decide);
  const approveRequest = useMutation(api.locationRequests.approveRequest);
  const rejectRequest = useMutation(api.locationRequests.rejectRequest);

  const [tab, setTab] = useState<"jadwal" | "lokasi">(params.tab === "lokasi" ? "lokasi" : "jadwal");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [rejectId, setRejectId] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [forceApprove, setForceApprove] = useState<string | null>(null);

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>;
  }

  if (viewer.role !== "supervisor" && viewer.role !== "owner") {
    return (
      <DesktopShell active="spv" title="Pusat Persetujuan" subtitle="Khusus supervisor">
        <Panel icon="shield" title="Akses dibatasi">
          <Text style={s.muted}>Akun Anda tidak memiliki akses ke halaman persetujuan.</Text>
        </Panel>
      </DesktopShell>
    );
  }

  const jadwalList: any[] = (jadwalReq ?? []) as any[];
  const lokasiList: any[] = (locReq ?? []) as any[];

  const approveJadwal = async (id: string, ignoreMinimum = false) => {
    setBusyId(id);
    setNotice(null);
    try {
      await decideJadwal({ requestId: id as any, approve: true, ignoreMinimum });
      setForceApprove(null);
      setNotice({ tone: "ok", text: "Pengajuan disetujui. Jadwal sudah diperbarui sesuai permintaan sales." });
    } catch (e: any) {
      const msg = toFriendlyError(e);
      if (!ignoreMinimum && msg.includes("di bawah minimal")) {
        setForceApprove(id);
        setNotice({ tone: "err", text: `${msg} Klik "Tetap setujui" kalau memang disengaja.` });
      } else {
        setNotice({ tone: "err", text: msg });
      }
    } finally {
      setBusyId("");
    }
  };

  const rejectJadwal = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await decideJadwal({ requestId: id as any, approve: false, reviewNote: rejectNote.trim() || undefined });
      setRejectId("");
      setRejectNote("");
      setNotice({ tone: "ok", text: "Pengajuan ditolak. Sales menerima alasannya lewat notifikasi." });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setBusyId("");
    }
  };

  const approveLokasi = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await approveRequest({ requestId: id as any });
      setNotice({ tone: "ok", text: "Koordinat toko diperbarui." });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setBusyId("");
    }
  };

  const rejectLokasi = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await rejectRequest({ requestId: id as any });
      setNotice({ tone: "ok", text: "Usulan lokasi ditolak." });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setBusyId("");
    }
  };

  return (
    <DesktopShell
      active="spv"
      title="Pusat Persetujuan"
      subtitle={`${jadwalList.length} pengajuan jadwal • ${lokasiList.length} usulan lokasi`}
      right={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[s.tab, tab === "jadwal" && s.tabOn]}
            onPress={() => setTab("jadwal")}
            activeOpacity={0.85}
          >
            <Text style={[s.tabText, tab === "jadwal" && s.tabTextOn]}>Perubahan jadwal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, tab === "lokasi" && s.tabOn]}
            onPress={() => setTab("lokasi")}
            activeOpacity={0.85}
          >
            <Text style={[s.tabText, tab === "lokasi" && s.tabTextOn]}>Lokasi toko</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={s.kpiRow}>
        <Kpi label="Pengajuan jadwal" value={jadwalList.length} color={jadwalList.length ? A.purple : A.green} hint="geser / hapus dari sales" />
        <Kpi label="Usulan lokasi" value={lokasiList.length} color={lokasiList.length ? A.orange : A.green} hint="koordinat toko" />
        <Kpi label="Total menunggu" value={jadwalList.length + lokasiList.length} hint="semua jenis persetujuan" />
      </View>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      {tab === "jadwal" ? (
        <Panel icon="calendar" title={`Pengajuan perubahan jadwal (${jadwalList.length})`} right={<Text style={s.panelHint}>keputusan langsung tercatat di audit</Text>}>
          {jadwalReq === undefined ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}><IOSSpinner size="small" color={A.brand} /></View>
          ) : jadwalList.length === 0 ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <Text style={s.muted}>Tidak ada pengajuan yang menunggu.</Text>
              <Text style={s.hint}>Sales mengajukan geser tanggal / hapus toko dari kartu SPK Jadwal.</Text>
            </View>
          ) : (
            jadwalList.map((r) => {
              const isMove = r.kind === "move";
              const busy = busyId === r._id;
              const stale = r.scheduleStatus && r.scheduleStatus !== "PLANNED";
              const rejecting = rejectId === r._id;
              return (
                <View key={r._id} style={[s.reqCard, { borderLeftColor: isMove ? A.info : A.orange }]}>
                  <View style={s.reqHead}>
                    <View style={[s.kind, { backgroundColor: isMove ? A.infoSoft : A.orangeSoft }]}>
                      <Text style={[s.kindText, { color: isMove ? A.info : A.orange }]}>
                        {isMove ? "GESER TANGGAL" : "HAPUS DARI JADWAL"}
                      </Text>
                    </View>
                    <Text style={s.reqTime}>{fmtDate(r.createdAt)}</Text>
                  </View>

                  <Text style={s.reqName}>{r.storeName} <Text style={s.reqArea}>• {r.area}</Text></Text>
                  <Text style={s.reqLine}>Diajukan oleh {r.requestedByName}</Text>
                  <Text style={s.reqLine}>
                    {isMove
                      ? `${fmtTanggal(r.fromDateKey)}  →  ${fmtTanggal(r.toDateKey)}`
                      : `Dihapus dari ${fmtTanggal(r.fromDateKey)}`}
                  </Text>
                  {r.noSpk ? <Text style={s.reqLine}>No. SPK {r.noSpk}</Text> : null}
                  <Text style={s.reqReason}>Alasan: {r.reason || "-"}</Text>
                  {r.note ? <Text style={s.reqLine}>Catatan: {r.note}</Text> : null}
                  {stale ? (
                    <Text style={s.stale}>
                      Baris sekarang berstatus {r.scheduleStatus} — persetujuan akan ditolak sistem. Tolak saja pengajuannya.
                    </Text>
                  ) : null}

                  {rejecting ? (
                    <>
                      <View style={{ height: 10 }} />
                      <TextArea
                        label="Alasan penolakan (opsional, dikirim ke sales)"
                        value={rejectNote}
                        onChangeText={setRejectNote}
                        placeholder="Contoh: toko tetap harus dikunjungi minggu ini"
                        rows={2}
                      />
                      <View style={{ height: 8 }} />
                      <ActionRow>
                        <ActionButton label="Kirim penolakan" icon="close" tone="danger" onPress={() => rejectJadwal(r._id)} disabled={busy} />
                        <ActionButton label="Batal" onPress={() => { setRejectId(""); setRejectNote(""); }} />
                      </ActionRow>
                    </>
                  ) : (
                    <>
                      <View style={{ height: 10 }} />
                      <ActionRow>
                        {forceApprove === r._id ? (
                          <ActionButton label="Tetap setujui" icon="warn" tone="green" onPress={() => approveJadwal(r._id, true)} disabled={busy} />
                        ) : (
                          <ActionButton label={busy ? "Memproses…" : "Setujui"} icon="check" tone="green" onPress={() => approveJadwal(r._id)} disabled={busy} />
                        )}
                        <ActionButton label="Tolak" icon="close" tone="danger" onPress={() => { setRejectNote(""); setRejectId(r._id); }} disabled={busy} />
                      </ActionRow>
                    </>
                  )}
                </View>
              );
            })
          )}
        </Panel>
      ) : (
        <Panel icon="location" title={`Usulan perbarui lokasi (${lokasiList.length})`} right={<Text style={s.panelHint}>koordinat toko lebih akurat</Text>}>
          {locReq === undefined ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}><IOSSpinner size="small" color={A.brand} /></View>
          ) : lokasiList.length === 0 ? (
            <View style={{ paddingVertical: 18, alignItems: "center" }}>
              <Text style={s.muted}>Tidak ada usulan lokasi yang menunggu.</Text>
              <Text style={s.hint}>Sales mengajukan “Reset longlat” saat titik toko tidak sesuai.</Text>
            </View>
          ) : (
            lokasiList.map((it: any) => {
              const r = it.request;
              const busy = busyId === r._id;
              return (
                <View key={r._id} style={[s.reqCard, { borderLeftColor: A.brand }]}>
                  <Text style={s.reqName}>{it.store?.name ?? "Toko terhapus"}</Text>
                  <Text style={s.reqLine}>Diajukan oleh {it.salesName} • {r.area}</Text>
                  <Text style={s.reqLine}>{fmtDate(r.createdAt)}</Text>
                  <Field
                    label="Lokasi lama"
                    value={r.oldLat ? `${r.oldLat.toFixed(6)}, ${r.oldLng?.toFixed(6)}` : "Belum ada"}
                  />
                  <Field
                    label="Lokasi usulan"
                    value={`${r.proposedLat.toFixed(6)}, ${r.proposedLng.toFixed(6)}`}
                    strong
                  />
                  <View style={{ height: 10 }} />
                  <ActionRow>
                    <ActionButton label="Setujui" icon="check" tone="green" onPress={() => approveLokasi(r._id)} disabled={busy} />
                    <ActionButton label="Tolak" icon="close" tone="danger" onPress={() => rejectLokasi(r._id)} disabled={busy} />
                  </ActionRow>
                </View>
              );
            })
          )}
        </Panel>
      )}

      <Hint>
        Persetujuan jadwal memakai aturan yang sama dengan perubahan langsung supervisor: tidak boleh melewati
        tanggal yang sudah lewat, tidak boleh dobel 1 toko/bulan, dan kuota minimal harian harus disengaja.
        Semua keputusan tercatat di Audit Aktivitas dan dikirim sebagai notifikasi ke pengaju.
      </Hint>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  muted: { fontSize: 11.5, color: A.muted, fontFamily: FONT },
  hint: { fontSize: 10.5, color: A.muted, marginTop: 6, textAlign: "center", fontFamily: FONT },
  panelHint: { fontSize: 10.5, color: A.muted, fontWeight: "700", fontFamily: FONT },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  tab: {
    borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  tabOn: { backgroundColor: A.brand, borderColor: A.brand },
  tabText: { fontSize: 11, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  tabTextOn: { color: "#fff" },

  reqCard: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderLeftWidth: 4, borderRadius: 9, padding: 12, marginBottom: 10,
  },
  reqHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  kind: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  kindText: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.4, fontFamily: FONT },
  reqTime: { fontSize: 10, color: A.muted, fontFamily: FONT },
  reqName: { fontSize: 13, fontWeight: "800", color: A.ink, fontFamily: FONT },
  reqArea: { fontSize: 10.5, color: A.muted, fontWeight: "600" },
  reqLine: { fontSize: 11, color: A.inkSoft, marginTop: 3, fontFamily: FONT },
  reqReason: { fontSize: 11, color: A.inkSoft, marginTop: 6, fontFamily: FONT, lineHeight: 16 },
  stale: { fontSize: 10.5, color: A.orange, fontWeight: "700", marginTop: 6, fontFamily: FONT },
});
