import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Image, Modal, Alert, Linking } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { useRouter } from "expo-router";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TOP_PAD } from "../lib/layout";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

const rupiah = (n?: number) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const isUrl = (s?: string) => !!s && /^https?:\/\//i.test(s);
const isDriveFolder = (s?: string) => !!s && s.includes("/drive/folders/");
const rowKey = (r: any) => [r.tanggal, r.jam, r.armada, r.store].join("||");

function toImgUrl(s: string): string {
  const t = (s || "").trim();
  if (/^https?:\/\//i.test(t) && !t.includes("drive.google.com")) return t;
  const m = t.match(/[?&]id=([^&]+)/) || t.match(/\/d\/([^/]+)/);
  if (m) return "https://drive.google.com/uc?export=view&id=" + m[1];
  return t;
}

export default function LaporanEkspedisi() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const fetchData = useAction(api.laporan.fetchEkspedisi);
  const saveEdit = useMutation(api.laporan.saveEkspedisiEdit);

  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  // Grup armada: default semua TERBUKA (true = ditutup oleh user)
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  // Supervisor & PPIC boleh quick-edit (Dicek / nominal Tunai)
  const canEdit = viewer?.role === "supervisor" || viewer?.role === "ppic";

  const load = async () => {
    if (!viewer) return;
    setLoading(true);
    setErr("");
    try {
      const r: any = await fetchData();
      setData(r);
    } catch (e: any) {
      setErr(e?.message ?? "Gagal menarik data.");
    } finally {
      setLoading(false);
    }
  };

  // Muat ulang saat viewer siap / segarkan manual
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [viewer]);

  const toggleGroup = (armada: string) =>
    setClosed((c) => ({ ...c, [armada]: !c[armada] }));

  // Hitung ulang ringkasan setelah quick-edit tunai/cek
  const recompute = (rowsAll: any[]) => {
    const perKategori: Record<string, number> = {};
    const armadaMap: Record<string, any> = {};
    for (const r of rowsAll) {
      perKategori[r.kategori || "Lain"] = (perKategori[r.kategori || "Lain"] || 0) + (r.tunai || 0);
      if (!armadaMap[r.armada]) armadaMap[r.armada] = { armada: r.armada, prima: 0, ecer: 0, total: 0, count: 0 };
      const a = armadaMap[r.armada];
      a.total += r.tunai || 0;
      a.count++;
      if ((r.kategori || "").toLowerCase().includes("prima")) a.prima += r.tunai || 0;
      else a.ecer += r.tunai || 0;
    }
    const armadas = Object.keys(armadaMap).sort((a, b) => a.localeCompare(b));
    return {
      perKategori,
      perArmadaList: armadas.map((a) => armadaMap[a]),
      detail: armadas.map((a) => ({ armada: a, rows: rowsAll.filter((r) => r.armada === a) })),
    };
  };

  const applyEdit = (key: string, patch: { checked?: boolean; tunai?: number }) => {
    setData((prev: any) => {
      if (!prev) return prev;
      const rowsAll = prev.detail.flatMap((g: any) => g.rows).map((r: any) =>
        rowKey(r) === key ? { ...r, ...patch } : r
      );
      const sum = rowsAll.reduce((s: number, r: any) => s + (r.tunai || 0), 0);
      return {
        ...prev,
        totalTunai: sum,
        totalCount: rowsAll.length,
        dicekCount: rowsAll.filter((r: any) => r.checked).length,
        ...recompute(rowsAll),
      };
    });
  };

  const toggleCheck = async (r: any) => {
    if (!canEdit) return;
    const key = rowKey(r);
    const next = !r.checked;
    applyEdit(key, { checked: next });
    try { await saveEdit({ key, checked: next }); }
    catch (e: any) { Alert.alert("Gagal", e?.message ?? "Coba lagi."); }
  };

  const openTunai = (r: any) => {
    setEditVal(r.tunai ? String(r.tunai) : "");
    setEditKey(rowKey(r));
  };

  const saveTunai = async () => {
    const n = parseInt((editVal || "").replace(/[^0-9]/g, ""), 10);
    if (!n || n <= 0) { Alert.alert("Nominal", "Isi nominal tunai lebih dari 0."); return; }
    const key = editKey!;
    applyEdit(key, { tunai: n });
    setEditKey(null);
    try { await saveEdit({ key, tunai: n }); }
    catch (e: any) { Alert.alert("Gagal", e?.message ?? "Coba lagi."); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ekspedisi</Text>
        <Text style={styles.sub}>Laporan Ekspedisi • {data ? new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
        <TouchableOpacity style={styles.refresh} onPress={load} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? "Memuat..." : "🔄 Segarkan"}</Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Gagal memuat</Text>
          <Text style={styles.meta}>{err}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryText}>Coba Lagi</Text></TouchableOpacity>
        </View>
      ) : data && data.totalCount === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Belum ada data pengiriman</Text>
          <Text style={styles.meta}>Pastikan Google Sheets sudah terisi, lalu segarkan.</Text>
          <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryText}>Segarkan</Text></TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.kpiRow}>
            <Kpi label="TOTAL TUNAI" value={rupiah(data.totalTunai)} />
            <Kpi label="TOTAL TRANSFER" value={rupiah(data.totalTransfer)} />
            <Kpi label="PENGIRIMAN" value={`${data.totalCount} kiriman`} />
            <Kpi label="DICECK" value={`${data.dicekCount ?? 0}/${data.totalCount}`} />
            <Kpi label="ARMADA" value={`${data.perArmadaList?.length ?? 0}`} />
          </View>

          {/* Per Kategori */}
          <Text style={styles.section}>Per Kategori</Text>
          <View style={styles.card}>
            {Object.entries(data.perKategori ?? {}).map(([k, v]: any) => (
              <View key={k} style={styles.sumRow}>
                <Text style={styles.sumLabel}>{k}</Text>
                <Text style={styles.sumValue}>{rupiah(v)}</Text>
              </View>
            ))}
          </View>

          {/* Per Armada */}
          <Text style={styles.section}>Per Armada (Prima vs Ecer)</Text>
          <View style={styles.card}>
            {(data.perArmadaList ?? []).map((a: any, i: number) => (
              <View key={i} style={styles.sumRow}>
                <Text style={[styles.sumLabel, { flex: 1.4 }]}>{a.armada}</Text>
                <Text style={styles.sumMini}>{rupiah(a.prima)}</Text>
                <Text style={styles.sumMini}>{rupiah(a.ecer)}</Text>
                <Text style={[styles.sumMini, { fontWeight: "900", color: C.ink0 }]}>{rupiah(a.total)}</Text>
              </View>
            ))}
          </View>

          {/* Detail per armada (default terbuka) */}
          {(data.detail ?? []).length > 0 ? (
            <>
              <Text style={styles.section}>Detail Pengiriman</Text>
              {(data.detail ?? []).map((g: any, gi: number) => {
                const isClosed = !!closed[g.armada];
                const totalG = g.rows.reduce((s: number, r: any) => s + (r.tunai || 0), 0);
                const dicekG = g.rows.filter((r: any) => r.checked).length;
                return (
                  <View key={gi} style={styles.group}>
                    <TouchableOpacity style={styles.groupHead} onPress={() => toggleGroup(g.armada)}>
                      <Text style={styles.groupTitle}>{g.armada}</Text>
                      <Text style={styles.groupMeta}>{dicekG}/{g.rows.length} dicek • {rupiah(totalG)}</Text>
                      <Text style={styles.arrow}>{isClosed ? "▾" : "▴"}</Text>
                    </TouchableOpacity>
                    {!isClosed ? (
                      g.rows.map((r: any, ri: number) => (
                        <View key={ri} style={styles.item}>
                          <View style={styles.itemTop}>
                            <Text style={styles.itemDate}>{r.tanggal} {r.jam}</Text>
                            <View style={[styles.katChip, { backgroundColor: r.kategori === "Prima" ? C.chip.danger.bg : C.chip.info.bg }]}>
                              <Text style={[styles.katText, { color: r.kategori === "Prima" ? C.primary : C.blueStrong }]}>{r.kategori}</Text>
                            </View>
                          </View>
                          <Text style={styles.itemStore} numberOfLines={1}>{r.store}</Text>
                          <Text style={styles.itemMeta}>🚚 {r.driver}{r.helper ? " • " + r.helper : ""} • {r.armada}</Text>

                          {r.pod && r.pod !== "-" ? (
                            <View style={styles.podBox}>
                              <Text style={styles.podLabel}>📦 POD</Text>
                              {isDriveFolder(r.pod) ? (
                                <TouchableOpacity style={styles.openLink} onPress={() => Linking.openURL(r.pod).catch(() => {})}>
                                  <Text style={styles.openLinkText}>📂 Buka Folder POD di Google Drive</Text>
                                </TouchableOpacity>
                              ) : isUrl(r.pod) || r.pod.includes("drive.google.com") ? (
                                <Image source={{ uri: toImgUrl(r.pod) }} style={styles.podImg} resizeMode="cover" />
                              ) : (
                                <Text style={styles.itemGps} numberOfLines={1}>{r.pod}</Text>
                              )}
                            </View>
                          ) : null}

                          <View style={styles.itemTop}>
                            <Text style={styles.itemBayar}>
                              {r.bayar === "Ya" ? "✅ " + (r.typeByr || "Bayar") : "⛔ Tidak"}
                            </Text>
                            {canEdit ? (
                              <TouchableOpacity onPress={() => openTunai(r)}>
                                <Text style={styles.itemMoney}>Tunai {rupiah(r.tunai)} ✏️</Text>
                              </TouchableOpacity>
                            ) : r.tunai > 0 ? (
                              <Text style={styles.itemMoney}>Tunai {rupiah(r.tunai)}</Text>
                            ) : null}
                            {r.transfer > 0 ? <Text style={[styles.itemMoney, { color: C.blueStrong }]}>TF {rupiah(r.transfer)}</Text> : null}
                          </View>

                          {r.ket ? <Text style={styles.itemKet} numberOfLines={2}>📝 {r.ket}</Text> : null}
                          {r.gps && r.gps !== "-" ? <Text style={styles.itemGps} numberOfLines={1}>📍 {r.gps}</Text> : null}

                          {canEdit ? (
                            <TouchableOpacity style={styles.checkRow} onPress={() => toggleCheck(r)}>
                              <Text style={[styles.checkIcon, r.checked && styles.checkIconOn]}>{r.checked ? "☑" : "☐"}</Text>
                              <Text style={[styles.checkLabel, r.checked && { color: C.status.success.fg }]}>Dicek</Text>
                            </TouchableOpacity>
                          ) : r.checked ? (
                            <View style={styles.checkRow}>
                              <Text style={[styles.checkIcon, styles.checkIconOn]}>☑</Text>
                              <Text style={[styles.checkLabel, { color: C.status.success.fg }]}>Dicek</Text>
                            </View>
                          ) : null}
                        </View>
                      ))
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={styles.note}>Tidak ada baris detail untuk ditampilkan.</Text>
          )}
        </ScrollView>
      ) : null}

      {/* Modal edit nominal tunai (supervisor / PPIC) */}
      {editKey !== null ? (
        <Modal transparent animationType="fade" onRequestClose={() => setEditKey(null)}>
          <View style={styles.mask}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Nominal Tunai</Text>
              <Text style={styles.modalSub} numberOfLines={2}>{editKey}</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="number-pad"
                value={editVal}
                onChangeText={(t) => setEditVal(t.replace(/[^0-9]/g, ""))}
                placeholder="contoh: 250000"
                autoFocus
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: C.divider }]} onPress={() => setEditKey(null)}>
                  <Text style={[styles.modalBtnText, { color: C.inkSoft }]}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: C.status.success.fg }]} onPress={saveTunai}>
                  <Text style={styles.modalBtnText}>Simpan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  const styles = useStyles(createStyles);
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: C.surfaceTint,
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  sub: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  refresh: { marginTop: 10, backgroundColor: C.divider, borderRadius: 10, padding: 10, alignItems: "center" },
  refreshText: { color: C.inkSoft, fontWeight: "800", fontSize: 13 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink3, textAlign: "center" },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 6, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: C.primary, borderRadius: 12, padding: 12, paddingHorizontal: 24 },
  retryText: { color: C.onPrimary, fontWeight: "800", fontSize: 14 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpi: { width: "48.5%", backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.divider, borderTopWidth: 3, borderTopColor: C.status.success.fg },
  kpiLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted },
  kpiValue: { fontSize: 14, fontWeight: "900", color: C.ink0, marginTop: 4 },
  section: { fontSize: 13, fontWeight: "800", color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.divider },
  sumRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  sumLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: C.inkSoft },
  sumMini: { width: 90, textAlign: "right", fontSize: 12, color: C.ink2, fontWeight: "600" },
  sumValue: { fontSize: 13, fontWeight: "800", color: C.ink0 },
  group: { backgroundColor: C.card, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: C.divider, overflow: "hidden" },
  groupHead: { flexDirection: "row", alignItems: "center", padding: 14 },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: C.ink0 },
  groupMeta: { fontSize: 11, color: C.inkMuted, fontWeight: "600", marginRight: 8 },
  arrow: { fontSize: 14, color: C.inkMuted },
  item: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.status.neutral.bg },
  itemTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  itemDate: { fontSize: 12, color: C.inkMuted, fontWeight: "700", marginRight: 8 },
  katChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  katText: { fontSize: 10, fontWeight: "900" },
  itemStore: { fontSize: 14, fontWeight: "800", color: C.ink0, marginTop: 4 },
  itemMeta: { fontSize: 11, color: C.inkMuted, marginTop: 2 },
  itemBayar: { fontSize: 12, color: C.inkSoft, fontWeight: "700", marginRight: 10 },
  itemMoney: { fontSize: 12, color: C.status.success.fg, fontWeight: "800", marginRight: 10 },
  itemKet: { fontSize: 11, color: C.ink2, marginTop: 4, lineHeight: 15 },
  itemGps: { fontSize: 10, color: C.blueStrong, marginTop: 3 },
  podBox: { marginTop: 6 },
  podLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted, marginBottom: 4 },
  openLink: { backgroundColor: C.chip.info.bg, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, alignSelf: "flex-start" },
  openLinkText: { fontSize: 12, fontWeight: "800", color: C.status.info.fg },
  podImg: { width: 96, height: 96, borderRadius: 8, backgroundColor: C.status.neutral.bg },
  checkRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  checkIcon: { fontSize: 18, color: C.inkMuted, marginRight: 6 },
  checkIconOn: { color: C.status.success.fg },
  checkLabel: { fontSize: 12, fontWeight: "800", color: C.inkMuted },
  mask: { flex: 1, backgroundColor: "rgba(16,24,40,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: C.card, borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: C.ink0 },
  modalSub: { fontSize: 11, color: C.inkMuted, marginTop: 4 },
  modalInput: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 10, padding: 12, fontSize: 16, marginTop: 12, backgroundColor: C.surfaceAlt2 },
  modalBtns: { flexDirection: "row", marginTop: 14 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center", marginHorizontal: 4 },
  modalBtnText: { color: C.onPrimary, fontWeight: "800", fontSize: 14 },
  note: { fontSize: 12, color: C.inkMuted, fontStyle: "italic", marginTop: 12, textAlign: "center", lineHeight: 17 },
});
