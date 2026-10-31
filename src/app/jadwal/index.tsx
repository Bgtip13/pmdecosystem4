import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, ScrollView, Modal, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import TabBar from "../../components/TabBar";
import AppIcon from "../../components/AppIcon";
import { theme } from "../../lib/theme";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = "#067647";
const BLUE = "#175CD3";
const ORANGE = "#B54708";

const AREAS = ["SOLO", "DIY", "SEMARANG"] as const;
const AREA_ALL = "ALL";

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const STATUS_META: any = {
  PLANNED: { label: "Belum", bg: "#F2F4F7", fg: "#475467", bar: "#98A2B3" },
  ONGOING: { label: "Berjalan", bg: "#FEF0C7", fg: "#B54708", bar: "#F79009" },
  DONE: { label: "Selesai", bg: "#DCFAE6", fg: "#067647", bar: "#12B76A" },
  CANCELLED: { label: "Dibatalkan", bg: "#FEE4E2", fg: "#B42318", bar: "#F04438" },
};

type Filter = "ALL" | "PLANNED" | "ONGOING" | "DONE";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "PLANNED", label: "Belum" },
  { key: "ONGOING", label: "Berjalan" },
  { key: "DONE", label: "Selesai" },
];

const todayKeyWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const pad2 = (n: number) => String(n).padStart(2, "0");
const dayKeyOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function fmtTanggal(dk: string) {
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]}, ${pad2(d)}-${pad2(m)}-${y}`;
}

function fmtShort(dk: string) {
  const [y, m, d] = dk.split("-").map(Number);
  return `${pad2(d)} ${BULAN_SHORT[m - 1]} ${y}`;
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

const rupiah = (n: any) => (n == null ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));
const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

// ===== Chip filter =====
function Chip({ label, on, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ===== Kotak angka ringkas =====
function Stat({ label, value, color }: any) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ===== Kalender bulanan (tanpa library tambahan) =====
function Kalender({ visible, value, onClose, onPick }: any) {
  const [ym, setYm] = useState(String(value || todayKeyWIB()).slice(0, 7));
  const [y, m] = ym.split("-").map(Number);
  const today = todayKeyWIB();

  const firstIdx = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const jmlHari = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstIdx; i++) cells.push(null);
  for (let d = 1; d <= jmlHari; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.calBg} onPress={onClose}>
        <Pressable style={styles.calCard} onPress={() => {}}>
          <View style={styles.calHead}>
            <TouchableOpacity style={styles.calArrow} onPress={() => setYm(addMonths(ym, -1))}>
              <Text style={styles.calArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calHeadText}>{BULAN[m - 1]} {y}</Text>
            <TouchableOpacity style={styles.calArrow} onPress={() => setYm(addMonths(ym, 1))}>
              <Text style={styles.calArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calWeekRow}>
            {HARI_SHORT.map((h) => (
              <Text key={h} style={styles.calWeek}>{h}</Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={`e${i}`} style={styles.calCell} />;
              const dk = dayKeyOf(y, m, d);
              const on = dk === value;
              const isToday = dk === today;
              const lewat = dk < today;
              return (
                <TouchableOpacity
                  key={dk}
                  style={styles.calCell}
                  onPress={() => { onPick(dk); onClose(); }}
                >
                  <View style={[styles.calDay, on && styles.calDayOn, !on && isToday && styles.calDayToday]}>
                    <Text
                      style={[
                        styles.calDayText,
                        on && styles.calDayTextOn,
                        !on && isToday && { color: RED },
                        !on && lewat && { color: "#98A2B3" },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.calFoot}>
            <TouchableOpacity style={styles.calGhost} onPress={() => { onPick(today); onClose(); }}>
              <Text style={styles.calGhostText}>Hari ini</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={onClose}>
              <Text style={styles.calBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function JadwalList() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const [dk, setDk] = useState(todayKeyWIB());
  const [area, setArea] = useState<string>(AREA_ALL);
  const [statusFilter, setStatusFilter] = useState<Filter>("ALL");
  const [calOpen, setCalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ← penyambungan nama toko ↔ master toko (Kelola Toko)
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [linkRow, setLinkRow] = useState<any>(null);
  const [storeQ, setStoreQ] = useState("");
  const [linking, setLinking] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  const role = viewer?.role;
  const isField = role === "field";
  const isSuper = role === "supervisor";
  const isOwner = role === "owner";
  const canLink = isSuper || isOwner;
  const canAdd = isField || isSuper || isOwner;

  // Sales: server otomatis mengunci ke dirinya sendiri (area tidak berpengaruh)
  const qArgs: any = { dateKey: dk };
  if (!isField && area !== AREA_ALL) qArgs.area = area;

  const data = useQuery(api.jadwal.listDay, qArgs) as any;
  const doSync = useAction(api.jadwalSync.manualSync);
  const linkStore = useMutation(api.jadwal.linkStore);
  const linkMissing = useMutation(api.jadwal.linkMissing);

  // Pengajuan yang masih menunggu → lencana di kartu + banner.
  // Sales hanya menerima pengajuannya sendiri (disaring di server).
  const pendingRequests = useQuery(api.jadwalRequests.list, { status: "pending" } as any) as any;
  const pendingMap = new Map<string, any>();
  for (const r of pendingRequests ?? []) pendingMap.set(String(r.scheduleId), r);

  // Kandidat toko master: HANYA ditarik saat modal benar-benar terbuka
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

  const onSync = async () => {
    setSyncing(true);
    try {
      const r: any = await doSync();
      const dibuang = (r?.cancelled ?? 0) + (r?.purged ?? 0);
      Alert.alert(
        "Jadwal ditarik",
        `${r?.inserted ?? 0} baru, ${r?.updated ?? 0} diperbarui, ${dibuang} dibatalkan & dihapus.` +
          ((r?.dateConflictCount ?? 0) > 0
            ? `\n\n${r.dateConflictCount} baris tanggalnya sudah diubah di aplikasi — TIDAK ditimpa sheet.`
            : "") +
          ((r?.keptManualCount ?? 0) > 0
            ? `\n${r.keptManualCount} baris hasil geser/batal dari aplikasi dipertahankan.`
            : "") +
          ((r?.ambiguousAreas?.length ?? 0) > 0
            ? `\n\nArea dengan lebih dari 1 sales lapangan: ${r.ambiguousAreas.join(", ")}. Jadwal area itu belum ditugaskan — rapikan di Kelola Akun (1 area = 1 sales).`
            : "") +
          ((r?.unlinkedCount ?? 0) > 0 ? `\n\n${r.unlinkedCount} nama toko belum terhubung.` : "")
      );
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setSyncing(false);
    }
  };

  // ===== Buka / tutup modal penyambungan =====
  const openLink = (row: any) => { setStoreQ(""); setLinkRow(row); };
  const closeLink = () => { setLinkRow(null); setStoreQ(""); };

  const doLink = async (st: any) => {
    if (!linkRow) return;
    setLinking(true);
    try {
      await linkStore({ scheduleId: linkRow._id, storeId: st._id });
      Alert.alert("Tersambung", `"${linkRow.storeName}" → ${st.name}. SPK-nya sekarang bisa diisi.`);
      closeLink();
    } catch (e: any) {
      Alert.alert("Gagal menyambungkan", toFriendlyError(e));
    } finally {
      setLinking(false);
    }
  };

  const onAutoLink = () => {
    Alert.alert(
      "Hubungkan otomatis?",
      `Sistem mencocokkan nama toko sheet dengan master Kelola Toko untuk bulan ${BULAN_SHORT[Number(dk.slice(5, 7)) - 1]} ${dk.slice(0, 4)}.\n\nHanya nama yang cocoknya PASTI (kandidat tunggal) yang disambungkan. Yang mirip lebih dari satu dilewati agar tidak salah toko.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Hubungkan",
          onPress: async () => {
            setSyncingAll(true);
            try {
              const r: any = await linkMissing({ monthKey: dk.slice(0, 7) });
              Alert.alert(
                "Selesai",
                `${r.linked} tersambung • ${r.ambiguous} nama mirip (pilih manual) • ${r.notFound} tidak ada di master.` +
                  (r.sisa > 0 ? `\n\nSisa belum terhubung: ${r.sisa}.` : "")
              );
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            } finally {
              setSyncingAll(false);
            }
          },
        },
      ]
    );
  };

  const shiftDay = (n: number) => {
    const [y, m, d] = dk.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    setDk(`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`);
  };

  if (!viewer || data === undefined) {
    return <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>;
  }

  if (!isField && !isSuper && !isOwner) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Bukan halaman kamu</Text>
        <Text style={styles.emptySub}>SPK Jadwal dipakai sales lapangan, supervisor, dan owner.</Text>
        <TouchableOpacity style={styles.linkBtn} onPress={() => router.replace("/beranda" as any)}>
          <Text style={styles.linkBtnText}>Kembali ke Beranda</Text>
        </TouchableOpacity>
        <TabBar active="spk" />
      </View>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const done = data?.done ?? 0;
  const ongoing = data?.ongoing ?? 0;
  const planned = data?.planned ?? 0;
  const persen = total > 0 ? Math.round(((done + ongoing) / total) * 100) : 0;
  // Kuota MINIMAL harian: 7 toko (Sabtu 3) — dihitung per area = per sales.
  const minHari = data?.minPerDay ?? 7;
  const kurang = Math.max(0, minHari - total);

  const missingCount = rows.filter((r: any) => r.storeMissing).length;
  const pendingCount = (pendingRequests ?? []).length;

  const countBy: any = { ALL: rows.length, PLANNED: planned, ONGOING: ongoing, DONE: done };
  let shown = statusFilter === "ALL" ? rows : rows.filter((r: any) => r.status === statusFilter);
  if (onlyMissing) shown = shown.filter((r: any) => r.storeMissing);

  const renderRow = ({ item }: any) => {
    const meta = STATUS_META[item.status] ?? STATUS_META.PLANNED;
    const bisaHubung = canLink && item.storeMissing;
    const req = pendingMap.get(String(item._id));
    return (
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: meta.bar }]}
        activeOpacity={0.85}
        onPress={() => (bisaHubung ? openLink(item) : router.push(`/jadwal/${item._id}?dk=${dk}` as any))}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTop}>
            <Text style={styles.storeName} numberOfLines={2}>{item.storeName}</Text>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
            </View>
          </View>

          <Text style={styles.spkNo} numberOfLines={1}>
            {item.noSpk}{!isField && item.area ? ` · ${item.area}` : ""}
          </Text>

          {item.isAdHoc || item.edited || item.storeMissing || req ? (
            <View style={styles.badgeRow}>
              {item.isAdHoc ? (
                <View style={[styles.badge, { backgroundColor: "#FEF0C7" }]}>
                  <Text style={[styles.badgeText, { color: ORANGE }]}>Luar jadwal</Text>
                </View>
              ) : null}
              {item.edited ? (
                <View style={[styles.badge, { backgroundColor: "#EFF8FF" }]}>
                  <Text style={[styles.badgeText, { color: BLUE }]}>Diubah</Text>
                </View>
              ) : null}
              {item.storeMissing ? (
                <View style={[styles.badge, { backgroundColor: "#FEE4E2" }]}>
                  <Text style={[styles.badgeText, { color: "#B42318" }]}>Belum terhubung</Text>
                </View>
              ) : null}
              {req ? (
                <View style={[styles.badge, { backgroundColor: "#F4EBFF" }]}>
                  <Text style={[styles.badgeText, { color: "#6941C6" }]}>
                    {isField ? "Menunggu persetujuan" : `Pengajuan ${req.kind === "move" ? "geser" : "hapus"}`}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.miniRow}>
            <View style={styles.miniBox}>
              <Text style={styles.miniLabel}>Target</Text>
              <Text style={styles.miniValue} numberOfLines={1}>{rupiah(item.target)}</Text>
            </View>
            <View style={styles.miniBox}>
              <Text style={styles.miniLabel}>Omset bln ini</Text>
              <Text style={styles.miniValue} numberOfLines={1}>{rupiah(item.act)}</Text>
            </View>
          </View>

          {item.checkinAt ? (
            <Text style={styles.subTime}>
              Masuk {fmtTime(item.checkinAt)}
              {item.checkoutAt ? ` · Keluar ${fmtTime(item.checkoutAt)}` : " · masih berjalan"}
            </Text>
          ) : (
            <Text style={styles.subTime}>Belum check-in</Text>
          )}

          {item.storeMissing ? (
            <Text style={styles.linkHint}>
              {canLink
                ? "Nama di sheet JADWAL beda dengan master toko. Ketuk kartu ini untuk memilih toko yang benar."
                : "Nama di sheet JADWAL beda dengan master toko. Minta supervisor menyambungkannya."}
            </Text>
          ) : null}

          {req ? (
            <Text style={styles.reqHint}>
              {req.kind === "move"
                ? `Diajukan geser ke ${fmtShort(req.toDateKey)}${req.reason ? ` — ${req.reason}` : ""}`
                : `Diajukan hapus${req.reason ? ` — ${req.reason}` : ""}`}
            </Text>
          ) : null}
        </View>

        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
            <Text style={styles.title}>SPK Jadwal</Text>
            <Text style={styles.meta}>
              {done + ongoing} dari {total} toko sudah dikunjungi · {persen}%
            </Text>
          </View>

          {/* Ekspor & tarik jadwal — hanya supervisor */}
          {isSuper ? (
            <>
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/jadwal/laporan" as any)}>
                <AppIcon name="download" size={17} color={RED} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, syncing && { opacity: 0.5 }]}
                onPress={onSync}
                disabled={syncing}
              >
                <AppIcon name="refresh" size={17} color={RED} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* ===== Pemilih tanggal: panah ‹ › + ketuk untuk kalender ===== */}
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.arrowBtn} onPress={() => shiftDay(-1)}>
            <Text style={styles.arrowBtnText}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dateBtn} onPress={() => setCalOpen(true)} activeOpacity={0.85}>
            <AppIcon name="calendar" size={16} color={RED} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dateBtnText}>{fmtShort(dk)}</Text>
              <Text style={styles.dateBtnSub}>
                {dk === todayKeyWIB() ? "Hari ini" : fmtTanggal(dk)}
              </Text>
            </View>
            <Text style={styles.dateBtnHint}>Ubah</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.arrowBtn} onPress={() => shiftDay(1)}>
            <Text style={styles.arrowBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ===== Aksi utama: tambah toko di luar jadwal ===== */}
        {canAdd ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/jadwal/luar" as any)} activeOpacity={0.85}>
            <AppIcon name="plus" size={16} color={RED} style={{ marginRight: 6 }} />
            <Text style={styles.addBtnText}>Tambah toko di luar jadwal</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.statRow}>
        <Stat label="TOTAL" value={total} />
        <Stat label="SELESAI" value={done} color={GREEN} />
        <Stat label="BERJALAN" value={ongoing} color={ORANGE} />
        <Stat label="BELUM" value={planned} color={BLUE} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: (`${persen}%`) as any }]} />
        </View>
        <Text style={[styles.minHint, kurang > 0 && total > 0 ? null : { color: GRAY }]}>
          {total === 0
            ? `Belum ada toko terjadwal. Minimal ${minHari} toko/hari.`
            : kurang > 0
              ? `${total} toko pada tanggal ini — kurang ${kurang} dari minimal ${minHari} toko/hari.`
              : `${total} toko pada tanggal ini — sudah memenuhi minimal ${minHari} toko/hari.`}
        </Text>
      </View>

      {/* ← Pengajuan perubahan jadwal */}
      {pendingCount > 0 ? (
        <TouchableOpacity
          style={styles.pendingBanner}
          activeOpacity={0.85}
          onPress={() => (canLink ? router.push("/spv-approval?tab=jadwal" as any) : undefined)}
          disabled={!canLink}
        >
          <AppIcon name="clock" size={15} color="#6941C6" style={{ marginRight: 8 }} />
          <Text style={styles.pendingText}>
            {canLink
              ? `${pendingCount} pengajuan perubahan jadwal menunggu persetujuan. Ketuk untuk meninjau.`
              : `${pendingCount} pengajuanmu masih menunggu persetujuan supervisor.`}
          </Text>
          {canLink ? <AppIcon name="chevron" size={15} color="#6941C6" /> : null}
        </TouchableOpacity>
      ) : null}

      {/* ===== Filter status + area ===== */}
      <View style={styles.filterWrap}>
        <View style={styles.chipRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.key === "ALL" ? `${f.label} (${countBy.ALL})` : `${f.label} (${countBy[f.key] ?? 0})`}
              on={statusFilter === f.key}
              onPress={() => setStatusFilter(f.key)}
            />
          ))}
        </View>
        {!isField ? (
          <View style={styles.chipRow}>
            <Chip label="Semua area" on={area === AREA_ALL} onPress={() => setArea(AREA_ALL)} />
            {AREAS.map((a) => (
              <Chip key={a} label={a} on={area === a} onPress={() => setArea(a)} />
            ))}
            {missingCount > 0 ? (
              <Chip
                label={`Belum terhubung (${missingCount})`}
                on={onlyMissing}
                onPress={() => setOnlyMissing((v) => !v)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ← sambungkan otomatis (supervisor/owner) — tanpa buka satu-satu */}
      {canLink && missingCount > 0 ? (
        <View style={styles.autoRow}>
          <TouchableOpacity
            style={[styles.autoBtn, syncingAll && { opacity: 0.6 }]}
            onPress={onAutoLink}
            disabled={syncingAll}
          >
            <AppIcon name="sync" size={15} color={GREEN} style={{ marginRight: 6 }} />
            <Text style={styles.autoBtnText}>
              {syncingAll ? "Menyambungkan..." : `Hubungkan otomatis (${missingCount})`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {shown.length === 0 ? (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <Text style={styles.emptyTitle}>
            {onlyMissing
              ? "Semua nama toko sudah terhubung"
              : statusFilter !== "ALL"
                ? `Tidak ada toko berstatus "${FILTERS.find((f) => f.key === statusFilter)?.label}"`
                : "Belum ada SPK untuk tanggal ini"}
          </Text>
          <Text style={styles.emptySub}>
            {onlyMissing
              ? `Tidak ada lagi nama toko di sheet JADWAL yang belum punya pasangan di Kelola Toko untuk ${fmtShort(dk)}.`
              : statusFilter !== "ALL"
                ? "Coba pilih filter “Semua” untuk melihat seluruh jadwal hari itu."
                : isField
                  ? "Jadwal ditarik dari sheet setiap pukul 08.00. Kalau perlu menambah toko, tekan “Tambah toko di luar jadwal”."
                  : `Tidak ada baris jadwal${area === AREA_ALL ? "" : ` untuk area ${area}`} pada ${fmtShort(dk)}. Kalau jadwal baru saja diubah di sheet, tekan tombol tarik (⟳) di kanan atas.`}
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(it: any) => it._id}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      <Kalender
        visible={calOpen}
        value={dk}
        onClose={() => setCalOpen(false)}
        onPick={(d: string) => setDk(d)}
      />

      {/* ===== Modal: pilih toko master untuk baris yang belum terhubung ===== */}
      <Modal visible={!!linkRow} transparent animationType="fade" onRequestClose={closeLink}>
        <Pressable style={styles.calBg} onPress={closeLink}>
          <Pressable style={styles.linkCard} onPress={() => {}}>
            <Text style={styles.linkTitle}>Hubungkan ke Toko</Text>
            <Text style={styles.linkSub} numberOfLines={2}>
              Nama di sheet: <Text style={{ fontWeight: "800" }}>{linkRow?.storeName}</Text> • {linkRow?.area}
            </Text>

            <TextInput
              style={styles.linkSearch}
              placeholder="Cari nama toko di Kelola Toko..."
              placeholderTextColor="#98A2B3"
              value={storeQ}
              onChangeText={setStoreQ}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {candidatesLoading ? (
                <IOSSpinner size="small" color={RED} style={{ marginVertical: 16 }} />
              ) : candidates.length === 0 ? (
                <Text style={styles.linkEmpty}>
                  {q.length >= 2
                    ? `Tidak ada toko cocok "${q}" di area ${linkRow?.area}.`
                    : `Belum ada toko terdaftar di area ${linkRow?.area}.`}
                  {"\n"}Kalau tokonya memang belum ada, daftarkan dulu lewat menu Toko Baru.
                </Text>
              ) : (
                candidates.map((st: any) => (
                  <TouchableOpacity
                    key={st._id}
                    style={styles.linkItem}
                    onPress={() => doLink(st)}
                    disabled={linking}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkItemName} numberOfLines={1}>{st.name}</Text>
                      <Text style={styles.linkItemAddr} numberOfLines={1}>{st.address || "-"}</Text>
                    </View>
                    <Text style={[styles.linkItemPick, linking && { opacity: 0.5 }]}>Pilih</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={styles.calFoot}>
              <TouchableOpacity
                style={styles.calGhost}
                onPress={() => { closeLink(); router.push("/toko-baru" as any); }}
              >
                <Text style={styles.calGhostText}>+ Toko Baru</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calBtn} onPress={closeLink}>
                <Text style={styles.calBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TabBar active="spk" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  topbar: {
    backgroundColor: "#FFF7F5",
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  brand: { fontSize: 11, fontWeight: "800", color: "#D92D20", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 2 },
  title: { fontSize: 21, fontWeight: "800", color: "#101828", letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 12.5, color: "#667085", marginTop: 3, lineHeight: 18 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", marginLeft: 8 },

  // ===== pemilih tanggal =====
  dateRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  arrowBtn: { width: 38, height: 44, borderRadius: R.md, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  arrowBtnText: { fontSize: 22, fontWeight: "800", color: RED, lineHeight: 24 },
  dateBtn: { flex: 1, flexDirection: "row", alignItems: "center", height: 44, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, marginHorizontal: 8 },
  dateBtnText: { fontSize: 14, fontWeight: "800", color: C.ink },
  dateBtnSub: { fontSize: 11, color: GRAY, marginTop: 1 },
  dateBtnHint: { fontSize: 10, fontWeight: "800", color: RED, backgroundColor: "#FDE8E6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },

  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#FECDCA", borderRadius: R.md, paddingVertical: 10, marginTop: 10 },
  addBtnText: { fontSize: 12.5, fontWeight: "800", color: "#B42318" },
  linkBtn: { marginTop: 16, backgroundColor: RED, borderRadius: R.md, paddingHorizontal: 24, paddingVertical: 12 },
  linkBtnText: { color: "#fff", fontWeight: "800" },

  // ===== ringkasan =====
  statRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  stat: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingVertical: 9, alignItems: "center" },
  statValue: { fontSize: 19, fontWeight: "900", color: C.ink },
  statLabel: { fontSize: 8.5, fontWeight: "800", color: GRAY, letterSpacing: 0.4, marginTop: 1 },

  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "#F2E3E0", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: GREEN },
  minHint: { fontSize: 11.5, fontWeight: "700", color: "#B54708", marginTop: 6, lineHeight: 16 },

  // ===== pengajuan =====
  pendingBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, backgroundColor: "#F4EBFF", borderWidth: 1, borderColor: "#D9D6FE", borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10 },
  pendingText: { flex: 1, fontSize: 11.5, fontWeight: "700", color: "#6941C6", lineHeight: 16 },
  reqHint: { fontSize: 11, color: "#6941C6", fontWeight: "700", marginTop: 5, lineHeight: 16 },

  // ===== filter =====
  filterWrap: { paddingHorizontal: 16, paddingTop: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6, marginRight: 7, marginBottom: 7 },
  chipOn: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 11.5, fontWeight: "800", color: GRAY },
  chipTextOn: { color: "#fff" },

  // ===== sambungkan otomatis =====
  autoRow: { paddingHorizontal: 16, paddingTop: 6 },
  autoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF3", borderWidth: 1, borderColor: "#ABEFC6", borderRadius: R.md, paddingVertical: 10 },
  autoBtnText: { fontSize: 12.5, fontWeight: "800", color: GREEN },

  // ===== kartu =====
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  storeName: { flex: 1, fontSize: 15, fontWeight: "800", color: C.ink },
  spkNo: { fontSize: 10.5, fontWeight: "700", color: C.inkFaint, marginTop: 3 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginRight: 5 },
  badgeText: { fontSize: 10, fontWeight: "800" },

  miniRow: { flexDirection: "row", marginTop: 8 },
  miniBox: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  miniLabel: { fontSize: 9.5, fontWeight: "800", color: GRAY, letterSpacing: 0.3 },
  miniValue: { fontSize: 12.5, fontWeight: "800", color: C.ink, marginTop: 1 },

  subTime: { fontSize: 11, color: GRAY, marginTop: 7 },
  linkHint: { fontSize: 11, color: "#B42318", fontWeight: "700", marginTop: 6, lineHeight: 16 },
  arrow: { fontSize: 22, color: "#98A2B3", fontWeight: "800", marginLeft: 6 },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center" },
  emptySub: { fontSize: 13, color: GRAY, lineHeight: 19, textAlign: "center", marginTop: 8 },

  // ===== kalender =====
  calBg: { flex: 1, backgroundColor: "rgba(16,24,40,0.45)", justifyContent: "center", padding: 22 },
  calCard: { backgroundColor: "#fff", borderRadius: R.lg, padding: 14 },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  calArrowText: { fontSize: 20, fontWeight: "800", color: RED, lineHeight: 22 },
  calHeadText: { fontSize: 15, fontWeight: "800", color: C.ink },
  calWeekRow: { flexDirection: "row" },
  calWeek: { width: "14.2857%", textAlign: "center", fontSize: 10.5, fontWeight: "800", color: GRAY, paddingVertical: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  calCell: { width: "14.2857%", height: 42, alignItems: "center", justifyContent: "center" },
  calDay: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  calDayOn: { backgroundColor: RED },
  calDayToday: { borderWidth: 1.5, borderColor: RED },
  calDayText: { fontSize: 13, fontWeight: "700", color: C.ink },
  calDayTextOn: { color: "#fff", fontWeight: "800" },
  calFoot: { flexDirection: "row", marginTop: 12 },
  calGhost: { flex: 1, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: "center", marginRight: 8 },
  calGhostText: { fontSize: 13, fontWeight: "800", color: C.inkSoft },
  calBtn: { flex: 1, borderRadius: R.md, backgroundColor: RED, paddingVertical: 12, alignItems: "center" },
  calBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },

  // ===== modal hubungkan toko =====
  linkCard: { backgroundColor: "#fff", borderRadius: R.lg, padding: 14 },
  linkTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  linkSub: { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 17 },
  linkSearch: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.ink, marginTop: 10, marginBottom: 8 },
  linkEmpty: { fontSize: 12, color: GRAY, lineHeight: 18, textAlign: "center", paddingVertical: 14 },
  linkItem: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  linkItemName: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  linkItemAddr: { fontSize: 11, color: GRAY, marginTop: 1 },
  linkItemPick: { fontSize: 12, fontWeight: "800", color: RED, marginLeft: 8 },
});
