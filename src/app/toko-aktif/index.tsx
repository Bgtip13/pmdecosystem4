import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SpkStatusBadge } from "../../components/SpkWorkflow";
import { useBulkSelect, BulkBar, BulkToggle, SelectBox } from "../../components/BulkSelect";
import { theme } from "../../lib/theme";
import { toFriendlyError } from "../../lib/msg";
import { exportCsv } from "../../lib/csvExport";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;

const RESULT_LABEL: any = {
  order_masuk: "Order masuk",
  plan_order: "Plan order",
  belum_order: "Belum order",
  tidak_potensi: "Tidak potensi",
  history_jelek: "History pembayaran jelek",
  no_respon: "No respon",
  tutup_permanen: "Toko tutup permanen",
  toko_ganti_nama: "Toko ganti nama",
  kalah_harga: "Kalah harga",
  kebutuhan_pribadi: "Kebutuhan pribadi",
  pengambilan_retail: "Pengambilan retail",
  belum_ambil: "Belum ambil",
  stok_cukup: "Stok masih cukup",
  ganti_nama: "Toko ganti nama",
};
const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };

const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));
const monthLabel = (mk?: string) => {
  if (!mk) return "-";
  const [y, m] = mk.split("-");
  const nm = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${nm[Number(m) - 1] ?? m} ${y}`;
};

export default function TokoAktifList() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  const isSuper = viewer?.role === "supervisor";
  const isTele = viewer?.role === "telemarketing";
  const isOwner = viewer?.role === "owner";
  const bolehLihat = isSuper || isTele || isOwner;

  const [areaChip, setAreaChip] = useState("ALL");
  const [wf, setWf] = useState<"ALL" | "OPEN" | "INPG" | "CLSD">("ALL");
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);

  const list = useQuery(
    api.activeStores.list,
    bolehLihat
      ? {
          ...(isSuper && areaChip !== "ALL" ? { area: areaChip as any } : {}),
          ...(wf !== "ALL" ? { wf } : {}),
          ...(q.trim() ? { q: q.trim() } : {}),
        }
      : "skip"
  ) as any;

  const counts = useQuery(api.activeStores.counts, bolehLihat ? {} : "skip") as any;
  const lastSync = useQuery(api.activeStoreSync.getLastSyncStatus, isSuper ? {} : "skip") as any;

  const doSync = useAction(api.activeStoreSync.manualSync);
  const closeTask = useMutation(api.activeStores.supervisorClose);
  const closeMany = useMutation(api.activeStores.supervisorCloseMany);   // ← BARU
  const markCall = useMutation(api.activeStores.markCall);

  const bulk = useBulkSelect();   // ← BARU

  const back = () => { if (router.canGoBack()) router.back(); else router.replace("/spk"); };

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  if (!bolehLihat) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Tidak ada akses</Text>
        <TouchableOpacity style={styles.btnBack} onPress={back}><Text style={styles.btnBackText}>Kembali</Text></TouchableOpacity>
      </View>
    );
  }

  const items = list?.items ?? [];
  const total = counts?.total ?? { open: 0, inpg: 0, closed: 0, all: 0 };
  const inpgIds = (items as any[]).filter((t: any) => t.workflowStatus === "INPG").map((t: any) => t._id);

  const onSync = async () => {
    setSyncing(true);
    try {
      const r: any = await doSync();
      Alert.alert(
        "Sinkron selesai",
        `${monthLabel(r?.monthKey)} — ${r?.inserted ?? 0} baru, ${r?.updated ?? 0} diperbarui, ${r?.deletedOpen ?? 0} OPEN dihapus.`
      );
    } catch (e: any) {
      Alert.alert("Gagal sinkron", toFriendlyError(e));
    } finally {
      setSyncing(false);
    }
  };

  const onQuickCall = async (t: any) => {
    try {
      await markCall({ taskId: t._id });
      Alert.alert("Tercatat", `Toko "${t.storeName}" ditandai sedang dihubungi.`);
    } catch (e: any) {
      Alert.alert("Gagal mencatat panggilan", toFriendlyError(e));
    }
  };

  const onClose = (t: any) => {
    Alert.alert("Setujui tugas ini? (CLSD)", `FU Toko "${t.storeName}" akan dikunci dan pindah ke Riwayat.`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya, CLSD",
        onPress: async () => {
          try {
            await closeTask({ taskId: t._id });
            Alert.alert("Tersimpan", "Tugas sudah disetujui (CLSD).");
          } catch (e: any) {
            Alert.alert("Gagal menyetujui", toFriendlyError(e));
          }
        },
      },
    ]);
  };

  // ← BARU: setujui banyak sekaligus
  const onCloseMany = () => {
    const ids = [...bulk.terpilih] as any;
    if (!ids.length) return;
    Alert.alert(
      `Setujui ${ids.length} toko sekaligus? (CLSD)`,
      "Toko terpilih akan dikunci dan pindah ke Riwayat. Petugas tidak bisa mengedit lagi.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, CLSD",
          onPress: async () => {
            try {
              const r: any = await closeMany({ taskIds: ids });
              bulk.reset();
              Alert.alert(
                "Tersimpan",
                `${r.closed} toko disetujui${r.skippedCount ? `, ${r.skippedCount} dilewati (status berubah).` : "."}`
              );
            } catch (e: any) {
              Alert.alert("Gagal menyetujui", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  // ← BARU: ekspor CSV sesuai filter yang sedang aktif
  const onExport = async () => {
    try {
      const rows = items as any[];
      const header = [
        "Area", "Pelanggan", "Kelas Toko", "Kelas Bayar", "Target",
        "Status", "Status Sheet", "Jml Dihubungi", "Hasil", "Rencana Order",
        "Disimpan oleh", "Disimpan pada", "Catatan Review",
      ];
      const body = rows.map((t) => [
        t.area, t.storeName, t.storeClass ?? "", t.paymentClass ?? "", t.target ?? "",
        t.workflowStatus ?? "OPEN", t.sourceStatus ?? "", t.callCount ?? 0,
        RESULT_LABEL[t.result] ?? "", t.plannedOrderDate ?? "",
        t.doneByName ?? "", t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID") : "",
        t.reviewNote ?? "",
      ]);
      const res = await exportCsv({
        fileName: `fu-toko_${list?.monthKey ?? "bulan"}`,
        header,
        rows: body,
        dialogTitle: "Ekspor FU Toko",
      });
      Alert.alert("Ekspor selesai", `${res.rows} baris • ${res.file}`);
    } catch (e: any) {
      Alert.alert("Ekspor gagal", e?.message ?? "Silakan coba lagi.");
    }
  };

  const renderCard = ({ item: t }: any) => {
    const wfs = (t.workflowStatus ?? "OPEN") as string;
    const sudahCall = !!t.calledAt;
    const bisaPilih = bulk.pilih && wfs === "INPG";          // ← BARU: hanya INPG yang bisa dicentang
    const dibuka = () => router.push(`/toko-aktif/${t._id}` as any);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={bisaPilih ? 0.6 : 0.85}
          onPress={() => (bisaPilih ? bulk.toggle(t._id) : dibuka())}
        >
          <View style={styles.head}>
            {bulk.pilih ? <SelectBox checked={bulk.terpilih.has(t._id) && bisaPilih} /> : null}
            <Text style={[styles.name, { flex: 1 }]} numberOfLines={2}>{t.storeName}</Text>
            {(isSuper || isOwner) && t.area ? (
              <View style={[styles.areaChip, { backgroundColor: AREA_BG[t.area] ?? "#F2F4F7" }]}>
                <Text style={[styles.areaChipText, { color: AREA_TX[t.area] ?? GRAY }]}>{t.area}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.chipRow}>
            <SpkStatusBadge status={wfs} />
            {t.sourceStatus ? (
              <View style={styles.srcChip}><Text style={styles.srcText} numberOfLines={1}>{t.sourceStatus}</Text></View>
            ) : null}
            {t.storeClass ? <View style={styles.srcChip}><Text style={styles.srcText}>Kelas {t.storeClass}</Text></View> : null}
            {t.paymentClass ? <View style={styles.srcChip}><Text style={styles.srcText}>{t.paymentClass}</Text></View> : null}
          </View>

          <Text style={styles.sub}>Target {rupiah(t.target)}</Text>
          {sudahCall ? (
            <Text style={styles.sub2}>
              📞 Dihubungi {t.callCount ?? 1}× • {t.calledByName || "-"}
            </Text>
          ) : (
            <Text style={styles.warnText}>Belum ditelepon</Text>
          )}
          {wfs === "INPG" ? (
            <Text style={styles.sub2}>
              Hasil: {RESULT_LABEL[t.result] ?? t.result ?? "-"}
              {t.result === "plan_order" && t.plannedOrderDate ? ` (${t.plannedOrderDate})` : ""} • {t.doneByName || "-"}
            </Text>
          ) : null}
          {wfs === "CLSD" && t.reviewNote ? (
            <Text style={styles.note}>💬 {t.reviewNote}</Text>
          ) : null}
        </TouchableOpacity>

        {/* Aksi per baris disembunyikan saat mode pilih */}
        {wfs !== "CLSD" && !bulk.pilih ? (
          <View style={styles.actRow}>
            <TouchableOpacity style={styles.actBtn} onPress={() => onQuickCall(t)}>
              <Text style={styles.actBtnText}>📞 Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actBtn, styles.actBtnPrimary]} onPress={dibuka}>
              <Text style={[styles.actBtnText, { color: "#fff" }]}>Isi Hasil</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {isSuper && wfs === "INPG" && !bulk.pilih ? (
          <View style={styles.actRow}>
            <TouchableOpacity style={[styles.actBtn, styles.actBtnGreen]} onPress={() => onClose(t)}>
              <Text style={[styles.actBtnText, { color: "#067647" }]}>Setujui (CLSD)</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>FU Toko</Text>
        <Text style={styles.meta}>
          {monthLabel(list?.monthKey ?? counts?.monthKey)} • Toko belum ambil bulan ini
        </Text>
      </View>

      <FlatList
        data={list === undefined ? [] : items}
        keyExtractor={(t: any) => t._id}
        renderItem={renderCard}
        contentContainerStyle={{ padding: 16, paddingBottom: bulk.pilih ? 190 : 40 }}
        ListHeaderComponent={
          <>
            {isSuper ? (
              <View style={{ marginBottom: 12 }}>
                <TouchableOpacity style={[styles.syncBtn, syncing && { opacity: 0.6 }]} onPress={onSync} disabled={syncing}>
                  <Text style={styles.syncBtnText}>{syncing ? "Menarik data..." : "Sinkron Toko_aktif"}</Text>
                </TouchableOpacity>
                <Text style={styles.cronNote}>
                  {lastSync?.hasSync
                    ? `Terakhir: ${new Date(lastSync.requestedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} • ${lastSync.status}`
                    : "Belum pernah sinkron bulan ini."}
                </Text>
              </View>
            ) : null}

            <View style={styles.filterRow}>
              {([["ALL", `Semua (${total.all})`], ["OPEN", `OPEN (${total.open})`], ["INPG", `INPG (${total.inpg})`], ["CLSD", `CLSD (${total.closed})`]] as any[]).map(([k, l]) => {
                const on = wf === k;
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => { if (!bulk.pilih) setWf(k); }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {isSuper ? (
              <View style={styles.filterRow}>
                {["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => {
                  const on = areaChip === a;
                  return (
                    <TouchableOpacity
                      key={a}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => { if (!bulk.pilih) setAreaChip(a); }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{a === "ALL" ? "Semua Area" : a}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <TextInput
              style={styles.search}
              placeholder="Cari nama pelanggan..."
              placeholderTextColor="#98A2B3"
              value={q}
              onChangeText={setQ}
              editable={!bulk.pilih}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {list === undefined ? null : (
              <Text style={styles.listMeta}>{items.length} toko • {monthLabel(list?.monthKey)}</Text>
            )}

            {/* ← BARU: tombol Pilih (supervisor saja) */}
            {isSuper && list !== undefined && inpgIds.length > 0 && !bulk.pilih ? (
              <View style={{ marginBottom: 10 }}>
                <BulkToggle onPress={bulk.buka} />
                <Text style={styles.cronNote}>
                  {inpgIds.length} toko menunggu review. Bisa disetujui sekaligus.
                </Text>
              </View>
            ) : null}

            {list === undefined || bulk.pilih ? null : (
              <TouchableOpacity style={styles.exportBtn} onPress={onExport}>
                <Text style={styles.exportBtnText}>⬇️ Ekspor CSV ({items.length})</Text>
              </TouchableOpacity>
            )}
          </>
        }
        ListEmptyComponent={
          list === undefined ? (
            <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Belum ada data FU Toko</Text>
              <Text style={styles.meta}>
                {isSuper
                  ? "Tekan \"Sinkron Toko_aktif\" untuk menarik daftar dari Google Sheet."
                  : "Daftar diisi supervisor lewat tombol Sinkron."}
              </Text>
            </View>
          )
        }
      />

      {/* ← BARU: bar bawah saat mode pilih */}
      {bulk.pilih ? (
        <BulkBar
          label="Setujui"
          count={bulk.terpilih.size}
          onAll={() => bulk.pilihSemua(inpgIds)}
          onCancel={bulk.reset}
          onClose={onCloseMany}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 12, color: GRAY, marginTop: 2 },

  syncBtn: { backgroundColor: C.status.success.fg, borderRadius: R.md, padding: 13, alignItems: "center" },
  syncBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cronNote: { fontSize: 11, color: GRAY, marginTop: 6 },

  filterRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  search: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 11, fontSize: 15, color: C.ink, marginTop: 6 },
  listMeta: { fontSize: 12, fontWeight: "700", color: GRAY, marginTop: 10, marginBottom: 2 },
  exportBtn: { backgroundColor: C.status.neutral.bg, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingVertical: 11, alignItems: "center", marginTop: 10 },
  exportBtnText: { fontSize: 13, fontWeight: "800", color: C.inkSoft },

  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  head: { flexDirection: "row", alignItems: "flex-start" },
  name: { fontSize: 15, fontWeight: "800", color: C.ink, marginRight: 8 },
  areaChip: { borderRadius: R.xs, paddingHorizontal: 7, paddingVertical: 2 },
  areaChipText: { fontSize: 10, fontWeight: "800" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 8 },
  srcChip: { backgroundColor: "#F2F4F7", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6, marginBottom: 3 },
  srcText: { fontSize: 10, fontWeight: "800", color: "#475467" },
  sub: { fontSize: 12, color: C.inkSoft, fontWeight: "700", marginTop: 8 },
  sub2: { fontSize: 12, color: GRAY, marginTop: 4 },
  warnText: { fontSize: 12, color: "#B54708", fontWeight: "700", marginTop: 4 },
  note: { fontSize: 12, color: "#5B21B6", marginTop: 6 },

  actRow: { flexDirection: "row", marginTop: 10 },
  actBtn: { backgroundColor: C.status.neutral.bg, borderRadius: R.xs, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  actBtnPrimary: { backgroundColor: C.primary },
  actBtnGreen: { backgroundColor: "#DCFAE6" },
  actBtnText: { fontSize: 12, fontWeight: "800", color: C.inkSoft },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginBottom: 6 },
  btnBack: { backgroundColor: RED, borderRadius: R.md, paddingHorizontal: 26, paddingVertical: 12, marginTop: 10 },
  btnBackText: { color: "#fff", fontWeight: "800" },
});
