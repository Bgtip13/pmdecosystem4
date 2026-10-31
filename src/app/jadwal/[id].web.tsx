import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, StyleSheet, Linking, Modal, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as Location from "expo-location";
import { api } from "../../../convex/_generated/api";
import DesktopShell from "../../components/desktop/DesktopShell";
import { Kpi, Panel, Field, Chip, WebButton } from "../../components/desktop/ui";
import {
  BackButton, HeadCard, HeadTitle, HeadMeta, HeadBadges, Cols,
  ActionButton, ActionRow, TextArea, Notice, Hint, Pick, PickRow,
} from "../../components/desktop/detail";
import DatePickerModal from "../../components/DatePickerModal";
import AppIcon from "../../components/AppIcon";
import { A, FONT } from "../../components/desktop/tokens";
import { toFriendlyError } from "../../lib/msg";

// ===== KARTU SPK JADWAL (WEB) =====
// Isinya sama dengan kartu di HP: data toko, lokasi, piutang, status kunjungan.
// Bedanya: aksi geser/batalkan jadwal tampil penuh untuk supervisor (sheet hanya
// untuk input), dan check-in memakai lokasi browser.

const STATUS: any = {
  PLANNED: { label: "Belum dikunjungi", fg: A.muted, bg: A.surfaceAlt },
  ONGOING: { label: "Berjalan", fg: A.orange, bg: A.orangeSoft },
  DONE: { label: "Selesai", fg: A.green, bg: A.greenSoft },
  CANCELLED: { label: "Dibatalkan", fg: A.red, bg: A.brandSoft },
};

const MET_LABEL: any = {
  owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko tutup",
};

const ALASAN = [
  "Toko tutup",
  "Owner minta hari lain",
  "Toko ramai / antre",
  "Akses & jalan",
  "Sales izin / sakit",
  "Cuaca",
  "Lain-lain",
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const todayKeyWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function addDayKey(dk: string, n: number) {
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function fmtTanggal(dk?: string) {
  if (!dk) return "-";
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dt.getUTCDay()];
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][m - 1];
  return `${hari}, ${pad2(d)} ${bulan} ${y}`;
}

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";
const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));

export default function JadwalKartuWeb() {
  const router = useRouter();
  const { id, dk } = useLocalSearchParams<{ id: string; dk?: string }>();

  const viewer = useQuery(api.users.viewer) as any;
  const data = useQuery(api.jadwal.getCard, { scheduleId: id as any }) as any;
  const checkIn = useMutation(api.jadwal.checkIn);
  const moveSchedule = useMutation(api.jadwalEdit.moveSchedule);
  const cancelSchedule = useMutation(api.jadwalEdit.cancelSchedule);
  // ← Sales mengajukan, supervisor/owner memutuskan.
  const requestMove = useMutation(api.jadwalRequests.requestMove);
  const requestCancel = useMutation(api.jadwalRequests.requestCancel);
  const withdrawRequest = useMutation(api.jadwalRequests.withdraw);
  const decideRequest = useMutation(api.jadwalRequests.decide);
  const reqList = useQuery(
    api.jadwalRequests.list,
    id ? ({ scheduleId: id as any } as any) : "skip"
  ) as any;

  const isSuper = viewer?.role === "supervisor" || viewer?.role === "owner";
  const isSales = viewer?.role === "field";
  const bolehCheckIn = isSales || isSuper;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  // Dua langkah untuk pelanggaran kuota minimal (web tidak menampilkan Alert).
  const [forceMove, setForceMove] = useState(false);
  const [forceCancel, setForceCancel] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/jadwal" as any));

  if (data === undefined) {
    return (
      <DesktopShell active="jadwal" title="Kartu SPK" subtitle="Memuat data jadwal…">
        <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>
      </DesktopShell>
    );
  }

  if (!data) {
    return (
      <DesktopShell active="jadwal" title="Kartu SPK" subtitle="Data tidak ditemukan">
        <Panel icon="search" title="Jadwal tidak ditemukan">
          <Text style={s.muted}>Baris ini sudah dihapus atau bukan milik akun Anda.</Text>
          <View style={{ marginTop: 12 }}>
            <WebButton label="Kembali ke SPK Jadwal" icon="back" variant="ghost" onPress={() => router.replace("/jadwal" as any)} />
          </View>
        </Panel>
      </DesktopShell>
    );
  }

  const sc = data.schedule;
  const store = data.store;
  const status = String(sc.status);
  const st = STATUS[status] ?? STATUS.PLANNED;
  const sudahSelesai = status === "DONE";
  const sedangBerjalan = status === "ONGOING" && sc.visitId;
  const bisaDiubah = isSuper && status === "PLANNED";
  const scheduleReqs: any[] = (reqList ?? []) as any[];
  const pendingReq = scheduleReqs.find((r: any) => r.status === "pending") ?? null;

  const doWithdraw = async () => {
    if (!pendingReq) return;
    setBusy(true);
    setNotice(null);
    try {
      await withdrawRequest({ requestId: pendingReq._id });
      setNotice({ tone: "ok", text: "Pengajuan ditarik. Jadwal tidak berubah." });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const onDecide = async (approve: boolean, ignoreMinimum = false) => {
    if (!pendingReq) return;
    setBusy(true);
    setNotice(null);
    try {
      await decideRequest({ requestId: pendingReq._id, approve, ignoreMinimum });
      setNotice({
        tone: "ok",
        text: approve ? "Pengajuan disetujui. Jadwal sudah diperbarui." : "Pengajuan ditolak. Jadwal tidak diubah.",
      });
    } catch (e: any) {
      const msg = toFriendlyError(e);
      if (approve && !ignoreMinimum && msg.includes("di bawah minimal")) {
        setNotice({ tone: "err", text: `${msg} Klik "Tetap setujui" kalau memang disengaja.` });
      } else {
        setNotice({ tone: "err", text: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  const openMaps = () => {
    if (store?.lat == null || store?.lng == null) {
      setNotice({ tone: "err", text: "Toko ini belum punya koordinat." });
      return;
    }
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`);
  };

  const doCheckIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { status: izin } = await Location.requestForegroundPermissionsAsync();
      if (izin !== "granted") throw new Error("Izinkan akses lokasi di browser untuk check-in.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const res: any = await checkIn({
        scheduleId: sc._id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        mock: !!((pos as any).mocked),
      });
      setNotice({ tone: "ok", text: "Check-in berhasil. Lanjutkan isi SPK & foto." });
      router.push(`/visit/${res.visitId}` as any);
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const openMove = () => {
    const base = sc.dateKey >= todayKeyWIB() ? sc.dateKey : todayKeyWIB();
    const mulai = isSales ? addDayKey(base, 1) : base;
    setReason("");
    setNote("");
    setForceMove(false);
    setTargetDate(mulai);
    setMoveOpen(true);
  };

  const submitMove = async (ignoreMinimum = false) => {
    if (!targetDate) {
      setNotice({ tone: "err", text: "Pilih tanggal tujuan dulu." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const alasan = [reason, note.trim()].filter(Boolean).join(" — ");
      if (isSales) {
        await requestMove({
          scheduleId: sc._id,
          toDateKey: targetDate,
          reason: reason || undefined,
          note: note.trim() || undefined,
        });
        setMoveOpen(false);
        setNotice({ tone: "ok", text: `Pengajuan geser ke ${fmtTanggal(targetDate)} terkirim. Menunggu persetujuan supervisor.` });
        return;
      }
      await moveSchedule({
        scheduleId: sc._id,
        toDateKey: targetDate,
        reason: alasan || undefined,
        ignoreMinimum,
      });
      setMoveOpen(false);
      setNotice({ tone: "ok", text: `Jadwal digeser ke ${fmtTanggal(targetDate)}.` });
    } catch (e: any) {
      const msg = toFriendlyError(e);
      if (!isSales && !ignoreMinimum && msg.includes("di bawah minimal")) {
        // Tawarkan lanjut (dua langkah), tanpa Alert karena web tidak menampilkannya.
        setNotice({ tone: "err", text: `${msg} Klik "Tetap geser" kalau memang disengaja.` });
        setForceMove(true);
      } else {
        setNotice({ tone: "err", text: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async (ignoreMinimum = false) => {
    if (!reason.trim()) {
      setNotice({ tone: "err", text: "Pilih alasan pembatalan dulu." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const alasan = [reason, note.trim()].filter(Boolean).join(" — ");
      if (isSales) {
        await requestCancel({ scheduleId: sc._id, reason: alasan, note: note.trim() || undefined });
        setCancelOpen(false);
        setNotice({ tone: "ok", text: "Pengajuan hapus terkirim. Menunggu persetujuan supervisor." });
        return;
      }
      await cancelSchedule({ scheduleId: sc._id, reason: alasan, ignoreMinimum });
      setCancelOpen(false);
      setNotice({ tone: "ok", text: "Jadwal dihapus dari daftar. Baris tetap tersimpan sebagai riwayat." });
    } catch (e: any) {
      const msg = toFriendlyError(e);
      if (!isSales && !ignoreMinimum && msg.includes("di bawah minimal")) {
        setForceCancel(true);
      }
      setNotice({ tone: "err", text: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesktopShell
      active="jadwal"
      title={sc.storeName ?? "Kartu SPK"}
      subtitle={`${fmtTanggal(sc.dateKey)} • ${sc.area ?? "-"} • No. SPK ${sc.noSpk ?? "-"}`}
      right={<BackButton onPress={back} label="SPK Jadwal" />}
    >
      <HeadCard>
        <View style={s.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <HeadTitle>{sc.storeName}</HeadTitle>
            <HeadMeta>
              {fmtTanggal(sc.dateKey)} • {sc.area}
              {store?.address ? ` • ${store.address}` : ""}
            </HeadMeta>
          </View>
          <HeadBadges>
            <Chip text={st.label} bg={st.bg} fg={st.fg} />
            {sc.storeMissing ? <Chip text="Belum terhubung" bg={A.brandSoft} fg={A.brandDark} /> : null}
            {sc.isAdHoc ? <Chip text="Luar jadwal" bg={A.orangeSoft} fg={A.orange} /> : null}
            {sc.editedAt ? <Chip text="Diubah supervisor" bg={A.infoSoft} fg={A.info} /> : null}
          </HeadBadges>
        </View>
      </HeadCard>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      <View style={s.kpiRow}>
        <Kpi label="Target" value={rupiah(sc.target)} hint="target bulan berjalan" />
        <Kpi label="Omset bulan ini" value={rupiah(sc.act)} color={A.green} hint="dari sheet JADWAL" />
        <Kpi
          label="Piutang toko"
          value={rupiah(data.piutang)}
          color={data.piutang ? A.brand : A.ink}
          hint={data.usia != null ? `usia ${data.usia} hari` : "tidak tercatat"}
        />
        <Kpi
          label="Kunjungan bulan ini"
          value={String(data.visitCount ?? 0)}
          color={data.lockedThisMonth ? A.orange : A.green}
          hint={data.lockedThisMonth ? "sudah dikunjungi (1x/bulan)" : "belum dikunjungi"}
        />
      </View>

      <Cols
        main={
          <>
            <Panel title="Data Toko" icon="store">
              <Field label="Nama toko" value={sc.storeName} strong />
              <Field label="Area" value={sc.area} />
              <Field label="Alamat" value={store?.address ?? ""} />
              <Field label="No. SPK" value={sc.noSpk ?? ""} />
              <Field label="Tanggal jadwal" value={fmtTanggal(sc.dateKey)} />
              <Field label="Check-in" value={fmtTime(sc.checkinAt)} />
              <Field label="Check-out" value={fmtTime(sc.checkoutAt)} />
              <Field label="Target" value={rupiah(sc.target)} />
              <Field label="Omset bulan ini" value={rupiah(sc.act)} />
            </Panel>

            <Panel title="Lokasi Toko" icon="location">
              <Field
                label="Koordinat"
                value={store?.lat != null && store?.lng != null ? `${store.lat.toFixed(5)}, ${store.lng.toFixed(5)}` : ""}
              />
              <Field label="Sumber titik" value={data.store ? "master Kelola Toko" : ""} />
              <View style={{ marginTop: 10 }}>
                <ActionButton label="Buka di Google Maps" icon="location" onPress={openMaps} />
              </View>
              {!sc.storeMissing ? (
                <Hint>
                  Check-in tetap dibatasi radius toko. Kalau titiknya salah, sales mengajukan “Reset
                  longlat” dari aplikasi HP dan supervisor menyetujuinya.
                </Hint>
              ) : null}
            </Panel>

            {sc.editedAt ? (
              <Panel title="Riwayat Perubahan" icon="clock">
                <Field
                  label={sc.editKind === "cancel" ? "Dibatalkan pada" : "Digeser pada"}
                  value={new Date(sc.editedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                />
                {sc.previousDateKey ? <Field label="Dari tanggal" value={fmtTanggal(sc.previousDateKey)} /> : null}
                <Field label="Tanggal sekarang" value={fmtTanggal(sc.dateKey)} />
                <Field label="Alasan" value={sc.editReason ?? ""} />
                <Field label="Tanggal asli dari sheet" value={fmtTanggal(sc.originalDateKey) } />
              </Panel>
            ) : null}

            {data.lastVisit ? (
              <Panel title="Kunjungan Terakhir" icon="checkDone">
                <Field label="Bertemu" value={MET_LABEL[data.lastVisit.metWith] ?? "-"} />
                <Field label="Masuk" value={fmtTime(data.lastVisit.checkinAt)} />
                <Field label="Keluar" value={fmtTime(data.lastVisit.checkoutAt)} />
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            <Panel title="Aksi" icon="clipboard">
              {sc.storeMissing ? (
                <Hint>
                  Nama toko ini belum terhubung ke master Kelola Toko, jadi SPK belum bisa diisi.
                  Sambungkan dulu dari daftar SPK Jadwal.
                </Hint>
              ) : sudahSelesai ? (
                <Hint>Kunjungan selesai. Hasil SPK-nya ada di Riwayat Kunjungan.</Hint>
              ) : sedangBerjalan ? (
                <ActionButton
                  label="Lanjut isi SPK & foto"
                  icon="clipboard"
                  tone="primary"
                  onPress={() => router.push(`/visit/${sc.visitId}` as any)}
                />
              ) : data.lockedThisMonth ? (
                <Hint>
                  Toko ini sudah dikunjungi bulan ini (aturan 1 toko 1x per bulan), jadi check-in
                  berikutnya belum bisa.
                </Hint>
              ) : bolehCheckIn ? (
                <ActionButton
                  label={busy ? "Mengambil lokasi…" : "Check-in sekarang"}
                  icon="pin"
                  tone="primary"
                  onPress={doCheckIn}
                  disabled={busy}
                />
              ) : (
                <Hint>Check-in hanya untuk sales lapangan & supervisor.</Hint>
              )}

              {isSales && status === "PLANNED" ? (
                <>
                  <View style={{ height: 10 }} />
                  <Hint>
                    Perlu geser tanggal atau toko ini tutup? Ajukan perubahan — supervisor yang menyetujui.
                    Jadwal tidak berubah sebelum disetujui.
                  </Hint>
                  <View style={{ height: 8 }} />
                  <ActionRow>
                    <ActionButton label="Ajukan geser" icon="calendar" onPress={openMove} />
                    <ActionButton
                      label="Ajukan hapus"
                      icon="trash"
                      tone="danger"
                      onPress={() => { setReason(""); setNote(""); setForceCancel(false); setCancelOpen(true); }}
                    />
                  </ActionRow>
                </>
              ) : null}

              {bisaDiubah ? (
                <>
                  <View style={{ height: 10 }} />
                  <Hint>
                    Perubahan langsung berlaku dan tidak akan ditimpa tarik jadwal berikutnya.
                    Pengajuan dari sales muncul di panel “Pengajuan Menunggu”.
                  </Hint>
                  <View style={{ height: 8 }} />
                  <ActionRow>
                    <ActionButton label="Geser tanggal" icon="calendar" onPress={openMove} />
                    <ActionButton
                      label="Hapus dari jadwal"
                      icon="trash"
                      tone="danger"
                      onPress={() => { setReason(""); setNote(""); setForceCancel(false); setCancelOpen(true); }}
                    />
                  </ActionRow>
                </>
              ) : null}
            </Panel>

            {pendingReq ? (
              <Panel title="Pengajuan Menunggu" icon="clock">
                <Field
                  label="Jenis"
                  value={pendingReq.kind === "move" ? "Geser tanggal" : "Hapus dari jadwal"}
                  strong
                />
                <Field label="Diajukan oleh" value={pendingReq.requestedByName} />
                {pendingReq.toDateKey ? <Field label="Tanggal tujuan" value={fmtTanggal(pendingReq.toDateKey)} /> : null}
                <Field label="Alasan" value={pendingReq.reason || "-"} />
                {pendingReq.note ? <Field label="Catatan" value={pendingReq.note} /> : null}
                <View style={{ height: 10 }} />
                {isSales ? (
                  <ActionButton label="Tarik pengajuan" icon="close" tone="danger" onPress={doWithdraw} disabled={busy} />
                ) : (
                  <ActionRow>
                    <ActionButton label="Setujui" icon="check" tone="green" onPress={() => onDecide(true)} disabled={busy} />
                    <ActionButton label="Tolak" icon="close" tone="danger" onPress={() => onDecide(false)} disabled={busy} />
                  </ActionRow>
                )}
                {isSuper && pendingReq.kind === "move" ? (
                  <Hint>
                    Kalau persetujuan ditahan karena kuota minimal harian, klik Setujui sekali lagi setelah
                    pesan konfirmasi muncul untuk tetap melanjutkan.
                  </Hint>
                ) : null}
              </Panel>
            ) : null}

            <Panel title="Beban Hari Ini" icon="chart">
              <Field
                label="Toko terjadwal"
                value={data.dayLoad ? `${data.dayLoad.count} toko` : ""}
              />
              <Field label="Minimal" value={data.dayLoad ? `${data.dayLoad.min} toko/hari` : ""} />
              {data.dayLoad && data.dayLoad.count < data.dayLoad.min ? (
                <Hint>
                  Hari ini kurang {data.dayLoad.min - data.dayLoad.count} toko dari minimal. Jangan
                  geser keluar lagi kalau tidak perlu.
                </Hint>
              ) : (
                <Hint>Jumlah toko hari ini sudah memenuhi minimal.</Hint>
              )}
            </Panel>
          </>
        }
      />

      {/* ===== Modal geser ===== */}
      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setMoveOpen(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>{isSales ? "Ajukan geser tanggal" : "Geser tanggal"}</Text>
            <Text style={s.modalSub}>
              {sc.storeName} • sekarang {fmtTanggal(sc.dateKey)}
              {isSales ? " — pengajuan dikirim ke supervisor" : ""}
            </Text>

            <View style={{ marginTop: 12 }}>
              <ActionButton label={targetDate ? fmtTanggal(targetDate) : "Pilih tanggal"} icon="calendar" onPress={() => setCalOpen(true)} />
            </View>

            <Text style={s.modalLabel}>Alasan</Text>
            <PickRow>
              {ALASAN.map((r) => (
                <Pick key={r} on={reason === r} label={r} onPress={() => setReason(r)} />
              ))}
            </PickRow>

            <View style={{ height: 10 }} />
            <TextArea label="Catatan tambahan (opsional)" value={note} onChangeText={setNote} placeholder="Mis. owner minta setelah jam 10" rows={2} />

            <View style={s.modalFoot}>
              <ActionButton label="Tutup" onPress={() => setMoveOpen(false)} />
              {forceMove ? (
                <ActionButton label="Tetap geser" icon="warn" tone="primary" onPress={() => submitMove(true)} disabled={busy} />
              ) : (
                <ActionButton label={busy ? "Menyimpan…" : isSales ? "Kirim pengajuan" : "Geser"} icon="check" tone="primary" onPress={() => submitMove(false)} disabled={busy} />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <DatePickerModal
        visible={calOpen}
        value={targetDate || sc.dateKey}
        minDate={todayKeyWIB()}
        onClose={() => setCalOpen(false)}
        onPick={(d: string) => { setTargetDate(d); setCalOpen(false); }}
      />

      {/* ===== Modal batal ===== */}
      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={() => setCancelOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setCancelOpen(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>{isSales ? "Ajukan hapus jadwal" : "Hapus dari jadwal"}</Text>
            <Text style={s.modalSub}>{sc.storeName} • {fmtTanggal(sc.dateKey)}</Text>
            <Hint>
              {isSales
                ? "Pengajuan dikirim ke supervisor. Jadwal baru hilang setelah disetujui, dan alasannya tetap tersimpan sebagai riwayat."
                : "Baris tidak dihapus permanen — tetap tersimpan sebagai dibatalkan beserta alasannya, jadi masih bisa ditelusuri kapan saja."}
            </Hint>

            <Text style={s.modalLabel}>Alasan (wajib)</Text>
            <PickRow>
              {ALASAN.map((r) => (
                <Pick key={r} on={reason === r} label={r} onPress={() => setReason(r)} />
              ))}
            </PickRow>

            <View style={{ height: 10 }} />
            <TextArea label="Catatan tambahan (opsional)" value={note} onChangeText={setNote} rows={2} />

            <View style={s.modalFoot}>
              <ActionButton label="Kembali" onPress={() => setCancelOpen(false)} />
              {forceCancel ? (
                <ActionButton label="Tetap batalkan" icon="warn" tone="danger" onPress={() => submitCancel(true)} disabled={busy} />
              ) : (
                <ActionButton label={busy ? "Menyimpan…" : isSales ? "Kirim pengajuan" : "Hapus"} icon="close" tone="danger" onPress={() => submitCancel(false)} disabled={busy} />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  muted: { fontSize: 11.5, color: A.muted, fontFamily: FONT },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  modalBg: { flex: 1, backgroundColor: "rgba(27,21,19,0.46)", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: A.surface, borderRadius: 12, borderWidth: 1, borderColor: A.border, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: "800", color: A.ink, fontFamily: FONT },
  modalSub: { fontSize: 11, color: A.muted, marginTop: 3, fontFamily: FONT },
  modalLabel: { fontSize: 9.5, fontWeight: "800", color: A.muted, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 14, marginBottom: 6, fontFamily: FONT },
  modalFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
});
