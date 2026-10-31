import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import DesktopShell from "../../components/desktop/DesktopShell";
import { Kpi, Panel, Chip, Bar, WebButton } from "../../components/desktop/ui";
import DatePickerModal from "../../components/DatePickerModal";
import AppIcon from "../../components/AppIcon";
import { A, FONT } from "../../components/desktop/tokens";
import { toFriendlyError } from "../../lib/msg";

// ===== SPK JADWAL (WEB) — versi desktop dari layar HP =====
// Satu tanggal = satu daftar toko. Supervisor bisa menarik sheet, menyambungkan
// nama toko, dan masuk ke kartu untuk menggeser/menghapus. Sales mengajukan
// perubahan dari kartu, lalu supervisor menyetujuinya di menu Persetujuan.

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;
const AREA_ALL = "ALL";

const STATUS: any = {
  PLANNED: { label: "Belum", fg: A.muted, bg: A.surfaceAlt, bar: A.mutedSoft },
  ONGOING: { label: "Berjalan", fg: A.orange, bg: A.orangeSoft, bar: A.orange },
  DONE: { label: "Selesai", fg: A.green, bg: A.greenSoft, bar: A.green },
  CANCELLED: { label: "Dibatalkan", fg: A.red, bg: A.brandSoft, bar: A.red },
};

type Filter = "ALL" | "PLANNED" | "ONGOING" | "DONE";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "PLANNED", label: "Belum" },
  { key: "ONGOING", label: "Berjalan" },
  { key: "DONE", label: "Selesai" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const todayKeyWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function shiftDay(dk: string, n: number) {
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function fmtTanggal(dk: string) {
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dt.getUTCDay()];
  return `${hari}, ${pad2(d)} ${BULAN_SHORT[m - 1]} ${y}`;
}

function fmtShort(dk?: string | null) {
  if (!dk) return "-";
  const [, m, d] = dk.split("-").map(Number);
  return `${pad2(d)} ${BULAN_SHORT[m - 1]}`;
}

const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));
const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-";

export default function JadwalWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const role = viewer?.role;
  const isField = role === "field";
  const isSuper = role === "supervisor";
  const canLink = isSuper || role === "owner";
  const canAdd = isField || isSuper || role === "owner";
  const boleh = canAdd;

  const [dk, setDk] = useState(todayKeyWIB());
  const [area, setArea] = useState<string>(AREA_ALL);
  const [statusFilter, setStatusFilter] = useState<Filter>("ALL");
  const [calOpen, setCalOpen] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [linkRow, setLinkRow] = useState<any>(null);
  const [storeQ, setStoreQ] = useState("");
  const [linking, setLinking] = useState(false);

  const qArgs: any = { dateKey: dk };
  if (!isField && area !== AREA_ALL) qArgs.area = area;

  const data = useQuery(api.jadwal.listDay, viewer && boleh ? qArgs : "skip") as any;
  const doSync = useAction(api.jadwalSync.manualSync);
  const linkStore = useMutation(api.jadwal.linkStore);
  const linkMissing = useMutation(api.jadwal.linkMissing);
  const pendingRows = useQuery(api.jadwalRequests.list, viewer && boleh ? ({ status: "pending" } as any) : "skip") as any;

  const q = storeQ.trim();
  const browse = useQuery(
    api.stores.listStoresPage,
    linkRow && q.length < 2 ? ({ area: linkRow.area, take: 60 } as any) : "skip"
  ) as any;
  const found = useQuery(
    api.stores.searchStores,
    linkRow && q.length >= 2 ? ({ q, area: linkRow.area, limit: 30 } as any) : "skip"
  ) as any;
  const candidates: any[] = q.length >= 2 ? (found ?? []) : (browse ?? []);
  const candidatesLoading = q.length >= 2 ? found === undefined : browse === undefined;

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>;
  }

  if (!boleh) {
    return (
      <DesktopShell active="jadwal" title="SPK Jadwal" subtitle="Jadwal kunjungan sales">
        <Panel icon="calendar" title="Khusus sales lapangan, supervisor & owner">
          <Text style={s.muted}>Akun Anda ({role ?? "-"}) tidak memakai jadwal kunjungan lapangan.</Text>
        </Panel>
      </DesktopShell>
    );
  }

  const loading = data === undefined;
  const rows: any[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const done = data?.done ?? 0;
  const ongoing = data?.ongoing ?? 0;
  const planned = data?.planned ?? 0;
  const missing = rows.filter((r) => r.storeMissing).length;
  const minHari = data?.minPerDay ?? 7;
  const kurang = Math.max(0, minHari - total);
  const persen = total > 0 ? Math.round(((done + ongoing) / total) * 100) : 0;

  const countBy: any = { ALL: rows.length, PLANNED: planned, ONGOING: ongoing, DONE: done };
  let shown = statusFilter === "ALL" ? rows : rows.filter((r) => r.status === statusFilter);
  if (onlyMissing) shown = shown.filter((r) => r.storeMissing);

  const pendingList: any[] = pendingRows ?? [];
  const pendingMap = new Map<string, any>();
  for (const r of pendingList) pendingMap.set(String(r.scheduleId), r);

  const onSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const r: any = await doSync();
      const dibuang = (r?.cancelled ?? 0) + (r?.purged ?? 0);
      setNotice({
        tone: "ok",
        text:
          `${r?.inserted ?? 0} baru, ${r?.updated ?? 0} diperbarui, ${dibuang} dibatalkan/dihapus.` +
          ((r?.dateConflictCount ?? 0) > 0 ? ` ${r.dateConflictCount} tanggal sudah diputuskan di aplikasi (tidak ditimpa).` : "") +
          ((r?.keptManualCount ?? 0) > 0 ? ` ${r.keptManualCount} baris hasil edit aplikasi dipertahankan.` : "") +
          ((r?.ambiguousAreas?.length ?? 0) > 0 ? ` Area dengan >1 sales: ${r.ambiguousAreas.join(", ")}.` : "") +
          ((r?.unlinkedCount ?? 0) > 0 ? ` ${r.unlinkedCount} nama toko belum terhubung.` : ""),
      });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setSyncing(false);
    }
  };

  const onAutoLink = async () => {
    setSyncingAll(true);
    setNotice(null);
    try {
      const r: any = await linkMissing({ monthKey: dk.slice(0, 7) });
      setNotice({
        tone: "ok",
        text: `${r.linked} tersambung • ${r.ambiguous} nama mirip (pilih manual) • ${r.notFound} tidak ada di master.` +
          (r.sisa > 0 ? ` Sisa belum terhubung: ${r.sisa}.` : ""),
      });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setSyncingAll(false);
    }
  };

  const openLink = (row: any) => { setStoreQ(""); setLinkRow(row); };
  const closeLink = () => { setLinkRow(null); setStoreQ(""); };

  const doLink = async (store: any) => {
    if (!linkRow) return;
    setLinking(true);
    try {
      await linkStore({ scheduleId: linkRow._id, storeId: store._id });
      setNotice({ tone: "ok", text: `"${linkRow.storeName}" tersambung ke ${store.name}. SPK-nya sekarang bisa diisi.` });
      closeLink();
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setLinking(false);
    }
  };

  return (
    <DesktopShell
      active="jadwal"
      title="SPK Jadwal"
      subtitle={`${fmtTanggal(dk)} • ${isField ? `area ${viewer.area ?? "-"}` : area === AREA_ALL ? "semua area" : `area ${area}`}`}
      right={
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {isSuper ? (
            <>
              <WebButton
                label={syncing ? "Menarik…" : "Tarik jadwal"}
                icon="refresh"
                variant="ghost"
                onPress={onSync}
                disabled={syncing}
              />
              <WebButton label="Laporan" icon="chart" variant="ghost" onPress={() => router.push("/jadwal/laporan" as any)} />
            </>
          ) : null}
          {canAdd ? (
            <WebButton label="Tambah toko" icon="plus" onPress={() => router.push("/jadwal/luar" as any)} />
          ) : null}
        </View>
      }
    >
      <View style={s.kpiRow}>
        <Kpi label="Total toko" value={loading ? "…" : String(total)} hint={`minimal ${minHari}/hari`} />
        <Kpi label="Selesai" value={loading ? "…" : String(done)} color={A.green} hint="sudah check-out" />
        <Kpi label="Berjalan" value={loading ? "…" : String(ongoing)} color={A.orange} hint="masih di toko" />
        <Kpi
          label="Belum dikunjungi"
          value={loading ? "…" : String(planned)}
          color={planned > 0 ? A.info : A.green}
          hint={kurang > 0 ? `kurang ${kurang} dari minimal` : "memenuhi minimal"}
        />
      </View>

      {notice ? (
        <View style={[s.notice, notice.tone === "ok" ? s.noticeOk : s.noticeErr]}>
          <AppIcon name={notice.tone === "ok" ? "check" : "warn"} size={13} color={notice.tone === "ok" ? A.green : A.brandDark} style={{ marginRight: 7 }} />
          <Text style={[s.noticeText, { color: notice.tone === "ok" ? A.green : A.brandDark }]}>{notice.text}</Text>
        </View>
      ) : null}

      {/* ===== Pemilih tanggal + filter ===== */}
      <View style={s.toolbar}>
        <View style={s.dateNav}>
          <TouchableOpacity style={s.dateArrow} onPress={() => setDk(shiftDay(dk, -1))}>
            <Text style={s.dateArrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dateBtn} onPress={() => setCalOpen(true)}>
            <AppIcon name="calendar" size={14} color={A.brand} style={{ marginRight: 7 }} />
            <Text style={s.dateBtnText}>{fmtTanggal(dk)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dateArrow} onPress={() => setDk(shiftDay(dk, 1))}>
            <Text style={s.dateArrowText}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.chip} onPress={() => setDk(todayKeyWIB())}>
            <Text style={s.chipText}>Hari ini</Text>
          </TouchableOpacity>
        </View>

        <View style={s.chipRow}>
          {FILTERS.map((f) => {
            const on = statusFilter === f.key;
            return (
              <TouchableOpacity key={f.key} style={[s.chip, on && s.chipOn]} onPress={() => setStatusFilter(f.key)}>
                <Text style={[s.chipText, on && s.chipTextOn]}>
                  {f.label} ({countBy[f.key] ?? 0})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!isField ? (
        <View style={s.chipRow}>
          {([AREA_ALL, ...AREAS] as string[]).map((a) => {
            const on = area === a;
            return (
              <TouchableOpacity key={a} style={[s.chip, on && s.chipOn]} onPress={() => setArea(a)}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{a === AREA_ALL ? "Semua area" : a}</Text>
              </TouchableOpacity>
            );
          })}
          {missing > 0 ? (
            <TouchableOpacity style={[s.chip, onlyMissing && s.chipOn]} onPress={() => setOnlyMissing((v) => !v)}>
              <Text style={[s.chipText, onlyMissing && s.chipTextOn]}>Belum terhubung ({missing})</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={s.progressCard}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={s.progressLabel}>
            {done + ongoing} dari {total} toko sudah dikunjungi
          </Text>
          <Text style={[s.progressPct, { color: persen >= 100 ? A.green : A.brand }]}>{persen}%</Text>
        </View>
        <Bar pct={persen} color={persen >= 100 ? A.green : A.brand} height={6} />
        <Text style={[s.warnText, kurang === 0 || total === 0 ? { color: A.muted } : null]}>
          {total === 0
            ? `Belum ada toko terjadwal. Minimal ${minHari} toko/hari.`
            : kurang > 0
              ? `${total} toko pada tanggal ini — kurang ${kurang} dari minimal ${minHari} toko/hari.`
              : `${total} toko pada tanggal ini — sudah memenuhi minimal ${minHari} toko/hari.`}
        </Text>
      </View>

      {/* ===== Pengajuan menunggu (supervisor) / status (sales) ===== */}
      {pendingList.length > 0 ? (
        <Panel
          icon="clock"
          title={canLink ? `Pengajuan perubahan jadwal (${pendingList.length})` : `Pengajuan saya (${pendingList.length})`}
          right={
            canLink ? (
              <WebButton label="Tinjau semua" icon="chevron" variant="ghost" onPress={() => router.push("/spv-approval?tab=jadwal" as any)} />
            ) : (
              <Text style={s.panelHint}>menunggu supervisor</Text>
            )
          }
        >
          {pendingList.slice(0, 4).map((r) => (
            <View key={r._id} style={s.reqRow}>
              <View style={[s.reqKind, { backgroundColor: r.kind === "move" ? A.infoSoft : A.orangeSoft }]}>
                <AppIcon name={r.kind === "move" ? "calendar" : "trash"} size={13} color={r.kind === "move" ? A.info : A.orange} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.reqName} numberOfLines={1}>{r.storeName}</Text>
                <Text style={s.reqMeta} numberOfLines={1}>
                  {r.kind === "move"
                    ? `Geser ${fmtShort(r.fromDateKey)} → ${fmtShort(r.toDateKey)}`
                    : `Hapus dari ${fmtShort(r.fromDateKey)}`}
                  {r.requestedByName ? ` • ${r.requestedByName}` : ""}
                  {r.reason ? ` • ${r.reason}` : ""}
                </Text>
              </View>
              <Text style={s.reqStatus}>MENUNGGU</Text>
            </View>
          ))}
        </Panel>
      ) : null}

      {canLink && missing > 0 ? (
        <View style={s.autoRow}>
          <Text style={s.autoText}>{missing} nama toko belum terhubung ke master Kelola Toko.</Text>
          <WebButton
            label={syncingAll ? "Menyambungkan…" : "Hubungkan otomatis"}
            icon="sync"
            variant="ghost"
            onPress={onAutoLink}
            disabled={syncingAll}
          />
        </View>
      ) : null}

      <Panel
        icon="clipboard"
        title={`SPK ${fmtTanggal(dk)} (${shown.length})`}
        right={<Text style={s.panelHint}>{loading ? "memuat…" : "klik baris untuk membuka kartu"}</Text>}
      >
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}><IOSSpinner size="small" color={A.brand} /></View>
        ) : shown.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <Text style={s.muted}>
              {onlyMissing
                ? "Semua nama toko sudah terhubung."
                : statusFilter !== "ALL"
                  ? `Tidak ada toko berstatus "${FILTERS.find((f) => f.key === statusFilter)?.label}".`
                  : "Belum ada SPK untuk tanggal ini."}
            </Text>
            <Text style={s.hint}>
              {onlyMissing || statusFilter !== "ALL"
                ? "Ubah filter untuk melihat seluruh jadwal hari itu."
                : "Jadwal ditarik dari sheet setiap 08.00 WIB, atau tekan Tarik jadwal di kanan atas. Toko di luar jadwal bisa ditambah lewat tombol Tambah toko."}
            </Text>
          </View>
        ) : (
          <>
            <View style={s.thead}>
              <Text style={[s.th, { width: 150 }]}>No. SPK</Text>
              <Text style={[s.th, { flex: 1.8 }]}>Toko</Text>
              <Text style={[s.th, { width: 90, textAlign: "center" }]}>Status</Text>
              <Text style={[s.th, { width: 110, textAlign: "right" }]}>Target</Text>
              <Text style={[s.th, { width: 120, textAlign: "right" }]}>Omset bln ini</Text>
              <Text style={[s.th, { width: 110 }]}>Masuk / keluar</Text>
              <Text style={[s.th, { width: 130, textAlign: "right" }]}>Aksi</Text>
            </View>

            {shown.map((r, i) => {
              const st = STATUS[r.status] ?? STATUS.PLANNED;
              const req = pendingMap.get(String(r._id));
              return (
                <TouchableOpacity
                  key={r._id}
                  style={[s.trow, i === shown.length - 1 && s.trowLast, { borderLeftWidth: 3, borderLeftColor: st.bar }]}
                  onPress={() => router.push(`/jadwal/${r._id}?dk=${dk}` as any)}
                  activeOpacity={0.85}
                >
                  <View style={{ width: 150, paddingRight: 8 }}>
                    <Text style={s.spkNo} numberOfLines={1}>{r.noSpk}</Text>
                    <Text style={s.tSub} numberOfLines={1}>{r.tanggal}</Text>
                  </View>

                  <View style={{ flex: 1.8, paddingRight: 10 }}>
                    <Text style={s.tName} numberOfLines={2}>{r.storeName}</Text>
                    <View style={s.badgeRow}>
                      <Chip text={st.label} bg={st.bg} fg={st.fg} />
                      {!isField && r.area ? <Chip text={r.area} bg={A.surfaceAlt} fg={A.inkSoft} /> : null}
                      {r.isAdHoc ? <Chip text="Luar jadwal" bg={A.orangeSoft} fg={A.orange} /> : null}
                      {r.edited ? <Chip text="Diubah" bg={A.infoSoft} fg={A.info} /> : null}
                      {r.storeMissing ? <Chip text="Belum terhubung" bg={A.brandSoft} fg={A.brandDark} /> : null}
                      {req ? <Chip text={canLink ? `Pengajuan ${req.kind}` : "Menunggu persetujuan"} bg={A.purpleSoft} fg={A.purple} /> : null}
                    </View>
                    {r.editReason ? <Text style={s.tSub} numberOfLines={1}>Alasan: {r.editReason}</Text> : null}
                  </View>

                  <View style={{ width: 90, alignItems: "center" }}>
                    <Text style={[s.tSub, { color: st.fg, fontWeight: "800" }]}>{st.label}</Text>
                  </View>

                  <Text style={[s.tVal, { width: 110, textAlign: "right" }]} numberOfLines={1}>{rupiah(r.target)}</Text>
                  <Text style={[s.tVal, { width: 120, textAlign: "right" }]} numberOfLines={1}>{rupiah(r.act)}</Text>

                  <View style={{ width: 110 }}>
                    <Text style={s.tSub} numberOfLines={1}>{r.checkinAt ? fmtTime(r.checkinAt) : "—"}</Text>
                    <Text style={s.tSub} numberOfLines={1}>{r.checkoutAt ? fmtTime(r.checkoutAt) : "—"}</Text>
                  </View>

                  <View style={{ width: 130, alignItems: "flex-end" }}>
                    {r.storeMissing && canLink ? (
                      <TouchableOpacity style={s.btnOutline} onPress={() => openLink(r)}>
                        <Text style={s.btnOutlineText}>Hubungkan</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={s.btnOutline}
                        onPress={() => router.push(`/jadwal/${r._id}?dk=${dk}` as any)}
                      >
                        <Text style={s.btnOutlineText}>Buka kartu</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </Panel>

      <Text style={s.footNote}>
        Kuota harian bersifat minimal: 7 toko (Sabtu 3). Sales mengajukan geser / hapus lewat kartu SPK,
        lalu supervisor menyetujuinya di menu Persetujuan. Setiap perubahan tercatat di Audit Aktivitas.
      </Text>

      <DatePickerModal
        visible={calOpen}
        value={dk}
        onClose={() => setCalOpen(false)}
        onPick={(d: string) => { setDk(d); setCalOpen(false); }}
      />

      {/* ===== Modal hubungkan nama toko ===== */}
      <Modal visible={!!linkRow} transparent animationType="fade" onRequestClose={closeLink}>
        <Pressable style={s.modalBg} onPress={closeLink}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>Hubungkan ke Toko</Text>
            <Text style={s.modalSub} numberOfLines={2}>
              Nama di sheet: <Text style={{ fontWeight: "800" }}>{linkRow?.storeName}</Text> • {linkRow?.area}
            </Text>

            <TextInput
              style={s.modalSearch}
              placeholder="Cari nama toko di Kelola Toko…"
              placeholderTextColor={A.mutedSoft}
              value={storeQ}
              onChangeText={setStoreQ}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {candidatesLoading ? (
                <View style={{ paddingVertical: 18, alignItems: "center" }}><IOSSpinner size="small" color={A.brand} /></View>
              ) : candidates.length === 0 ? (
                <Text style={s.modalEmpty}>
                  {q.length >= 2
                    ? `Tidak ada toko cocok "${q}" di area ${linkRow?.area}.`
                    : `Belum ada toko terdaftar di area ${linkRow?.area}.`}
                </Text>
              ) : (
                candidates.map((store: any) => (
                  <TouchableOpacity
                    key={store._id}
                    style={s.candidate}
                    onPress={() => doLink(store)}
                    disabled={linking}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.candName} numberOfLines={1}>{store.name}</Text>
                      <Text style={s.candAddr} numberOfLines={1}>{store.address || "-"}</Text>
                    </View>
                    <Text style={[s.candPick, linking && { opacity: 0.5 }]}>Pilih</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={s.modalFoot}>
              <WebButton label="Toko Baru" icon="plus" variant="ghost" onPress={() => { closeLink(); router.push("/toko-baru" as any); }} />
              <WebButton label="Tutup" variant="ghost" onPress={closeLink} />
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
  hint: { fontSize: 10.5, color: A.muted, marginTop: 6, fontFamily: FONT, textAlign: "center", maxWidth: 520 },
  panelHint: { fontSize: 10.5, color: A.muted, fontWeight: "700", fontFamily: FONT },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  notice: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  noticeOk: { backgroundColor: A.greenSoft, borderColor: A.greenBorder },
  noticeErr: { backgroundColor: A.brandSoft, borderColor: A.brandBorder },
  noticeText: { fontSize: 11, fontWeight: "600", flex: 1, lineHeight: 17, fontFamily: FONT },

  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dateNav: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateArrow: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: A.border, backgroundColor: A.surface, alignItems: "center", justifyContent: "center" },
  dateArrowText: { fontSize: 18, fontWeight: "800", color: A.brand, lineHeight: 20 },
  dateBtn: { flexDirection: "row", alignItems: "center", height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: A.border, backgroundColor: A.surface },
  dateBtnText: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { borderWidth: 1, borderColor: A.border, backgroundColor: A.surface, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipOn: { backgroundColor: A.brand, borderColor: A.brand },
  chipText: { fontSize: 10.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  chipTextOn: { color: "#fff" },

  progressCard: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10, padding: 13 },
  progressLabel: { fontSize: 11.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  progressPct: { fontSize: 12, fontWeight: "800", fontFamily: FONT },
  warnText: { fontSize: 10.5, color: A.orange, fontWeight: "700", marginTop: 7, fontFamily: FONT },

  autoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: A.cream, borderWidth: 1, borderColor: A.brandBorder, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  autoText: { flex: 1, fontSize: 11, color: A.brandDark, fontWeight: "600", fontFamily: FONT },

  reqRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  reqKind: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  reqName: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  reqMeta: { fontSize: 10.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  reqStatus: { fontSize: 8.5, fontWeight: "800", color: A.purple, letterSpacing: 0.4, fontFamily: FONT },

  thead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 7,
    backgroundColor: A.headerRow,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: A.border,
  },
  th: { fontSize: 9.5, fontWeight: "800", color: A.inkSoft, letterSpacing: 0.3, textTransform: "uppercase", fontFamily: FONT },
  trow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  trowLast: { borderBottomWidth: 0 },
  tName: { fontSize: 12, fontWeight: "700", color: A.ink, fontFamily: FONT },
  tVal: { fontSize: 11.5, fontWeight: "600", color: A.inkSoft, fontVariant: ["tabular-nums"], fontFamily: FONT },
  tSub: { fontSize: 10.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  spkNo: { fontSize: 10.5, fontWeight: "800", color: A.inkSoft, fontFamily: FONT },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 },

  btnOutline: { borderWidth: 1, borderColor: A.brandBorder, backgroundColor: A.surface, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  btnOutlineText: { fontSize: 11, fontWeight: "700", color: A.brandDark, fontFamily: FONT },

  footNote: { fontSize: 10.5, color: A.muted, lineHeight: 17, fontFamily: FONT },

  modalBg: { flex: 1, backgroundColor: "rgba(27,21,19,0.46)", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 560, alignSelf: "center", backgroundColor: A.surface, borderRadius: 12, borderWidth: 1, borderColor: A.border, padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: "800", color: A.ink, fontFamily: FONT },
  modalSub: { fontSize: 11, color: A.muted, marginTop: 3, lineHeight: 16, fontFamily: FONT },
  modalSearch: { backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12, color: A.ink, marginTop: 12, marginBottom: 10, outlineStyle: "none", fontFamily: FONT } as any,
  modalEmpty: { fontSize: 11, color: A.muted, lineHeight: 17, textAlign: "center", paddingVertical: 16, fontFamily: FONT },
  candidate: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: A.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 7 },
  candName: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  candAddr: { fontSize: 10.5, color: A.muted, marginTop: 1, fontFamily: FONT },
  candPick: { fontSize: 11, fontWeight: "800", color: A.brand, fontFamily: FONT },
  modalFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
});
