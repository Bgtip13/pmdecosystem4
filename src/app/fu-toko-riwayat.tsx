import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import { exportCsv } from "../lib/csvExport";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = C.status.success.fg;
const ORANGE = C.role.telemarketing;

const RESULT_LABEL: any = {
  order_masuk: "Order masuk", plan_order: "Plan order", belum_order: "Belum order",
  tidak_potensi: "Tidak potensi", history_jelek: "History pembayaran jelek",
  no_respon: "No respon", tutup_permanen: "Toko tutup permanen",
  toko_ganti_nama: "Toko ganti nama", ganti_nama: "Toko ganti nama",
  kalah_harga: "Kalah harga", kebutuhan_pribadi: "Kebutuhan pribadi",
  pengambilan_retail: "Pengambilan retail", belum_ambil: "Belum ambil",
  stok_cukup: "Stok masih cukup",
};

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function monthNow() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}
function shiftMonth(mk: string, n: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function labelMonth(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_LABEL[m - 1] ?? m} ${y}`;
}
const wfTone = (wf?: string) =>
  wf === "CLSD" ? { color: GREEN, bg: "#DCFAE6" } : wf === "INPG" ? { color: ORANGE, bg: "#FEF0C7" } : { color: RED, bg: "#FEE4E2" };

export default function FuTokoRiwayat() {
  const router = useRouter();
  const convex = useConvex();
  const viewer = useQuery(api.users.viewer) as any;

  const role = viewer?.role;
  const canSee = role === "supervisor" || role === "owner" || role === "telemarketing";

  const [monthKey, setMonthKey] = useState(monthNow());
  const [report, setReport] = useState<any>(null);     // counts bulan terpilih
  const [compare, setCompare] = useState<any[]>([]);   // 3 bulan terakhir
  const [rows, setRows] = useState<any[] | null>(null); // hasil cari toko
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/laporan" as any));
  const resetAll = () => { setReport(null); setCompare([]); setRows(null); };

  // ---- 1 query: ringkasan satu bulan (total + per area) ----
  const loadMonth = async () => {
    setBusy(true);
    try {
      const r: any = await convex.query(api.activeStores.counts, { monthKey });
      setReport(r);
      setRows(null);
    } catch (e: any) {
      Alert.alert("Gagal memuat", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  // ---- 3 query: bandingkan bulan ini + 2 bulan sebelumnya ----
  const loadCompare = async () => {
    setBusy(true);
    try {
      const months = [monthKey, shiftMonth(monthKey, -1), shiftMonth(monthKey, -2)];
      const res = await Promise.all(
        months.map((mk) => convex.query(api.activeStores.counts, { monthKey: mk }))
      );
      setCompare(
        res.map((r: any, i) => ({
          monthKey: months[i],
          total: r?.total?.all ?? 0,
          open: r?.total?.open ?? 0,
          inpg: r?.total?.inpg ?? 0,
          clsd: r?.total?.closed ?? 0,
        }))
      );
    } catch (e: any) {
      Alert.alert("Gagal membandingkan", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  // ---- cari toko dalam bulan terpilih (hanya saat ditekan) ----
  const searchStores = async () => {
    setBusy(true);
    try {
      const r: any = await convex.query(api.activeStores.list, {
        monthKey,
        ...(q.trim() ? { q: q.trim() } : {}),
      });
      setRows(r?.items ?? []);
    } catch (e: any) {
      Alert.alert("Gagal mencari", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  // ---- ekspor CSV ----
  const exportSummary = async () => {
    try {
      if (!report) return;
      const header = ["Bulan", "Area", "Total", "OPEN", "INPG", "CLSD"];
      const body = [
        ...(report.areas ?? []).map((a: any) => [report.monthKey, a.area, a.all, a.open, a.inpg, a.closed]),
        ["", "TOTAL", report.total?.all ?? 0, report.total?.open ?? 0, report.total?.inpg ?? 0, report.total?.closed ?? 0],
      ];
      const out = await exportCsv({
        fileName: `ringkasan-fu-toko_${monthKey}`,
        header, rows: body, dialogTitle: "Ekspor Ringkasan FU Toko",
      });
      Alert.alert("Ekspor selesai", `${out.rows} baris • ${out.file}`);
    } catch (e: any) {
      Alert.alert("Ekspor gagal", e?.message ?? "Coba lagi.");
    }
  };

  const exportDetail = async () => {
    setBusy(true);
    try {
      const r: any = await convex.query(api.activeStores.list, { monthKey });
      const list: any[] = r?.items ?? [];
      if (!list.length) throw new Error(`Belum ada data FU Toko untuk ${labelMonth(monthKey)}.`);
      const header = [
        "Bulan", "Area", "Pelanggan", "Kelas Toko", "Kelas Bayar", "Target",
        "Status", "Status Sheet", "Jml Dihubungi", "Hasil", "Rencana Order",
        "Disimpan oleh", "Disimpan pada", "Catatan Review",
      ];
      const body = list.map((t: any) => [
        t.monthKey ?? monthKey, t.area, t.storeName, t.storeClass ?? "", t.paymentClass ?? "", t.target ?? "",
        t.workflowStatus ?? "OPEN", t.sourceStatus ?? "", t.callCount ?? 0,
        RESULT_LABEL[t.result] ?? "", t.plannedOrderDate ?? "",
        t.doneByName ?? "", t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID") : "",
        t.reviewNote ?? "",
      ]);
      const out = await exportCsv({
        fileName: `rekap-fu-toko_${monthKey}`,
        header, rows: body, dialogTitle: "Ekspor Rinci FU Toko",
      });
      Alert.alert("Ekspor selesai", `${out.rows} baris • ${out.file}`);
    } catch (e: any) {
      Alert.alert("Ekspor gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}><Text style={styles.back}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Riwayat FU Toko</Text>
        <Text style={styles.meta}>Pilih bulan, lalu tekan tombol — data diambil hanya saat diminta.</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {!viewer ? (
          <ActivityIndicator size="large" color={RED} style={{ marginTop: 30 }} />
        ) : !canSee ? (
          <Text style={styles.hint}>Tidak ada akses. Layar ini untuk supervisor, owner & telemarketing.</Text>
        ) : (
          <>
            {/* Pemilih bulan */}
            <View style={styles.monthRow}>
              <TouchableOpacity style={styles.monthBtn} onPress={() => { setMonthKey(shiftMonth(monthKey, -1)); resetAll(); }}>
                <Text style={styles.monthBtnText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthText}>{labelMonth(monthKey)}</Text>
              <TouchableOpacity style={styles.monthBtn} onPress={() => { setMonthKey(shiftMonth(monthKey, 1)); resetAll(); }}>
                <Text style={styles.monthBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Tombol aksi */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={loadMonth}>
                <Text style={styles.btnText}>{busy ? "Memuat…" : "Tampilkan Bulan Ini"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnGhost, busy && { opacity: 0.6 }]} disabled={busy} onPress={loadCompare}>
                <Text style={styles.btnGhostText}>Bandingkan 3 Bulan</Text>
              </TouchableOpacity>
            </View>

            {/* Ringkasan bulan terpilih */}
            {report ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Hasil {labelMonth(report.monthKey ?? monthKey)}</Text>
                <View style={styles.metricRow}>
                  <View style={styles.metric}><Text style={[styles.metricV, { color: C.ink }]}>{report.total?.all ?? 0}</Text><Text style={styles.metricL}>Total</Text></View>
                  <View style={styles.metric}><Text style={[styles.metricV, { color: (report.total?.open ?? 0) > 0 ? RED : GREEN }]}>{report.total?.open ?? 0}</Text><Text style={styles.metricL}>OPEN</Text></View>
                  <View style={styles.metric}><Text style={[styles.metricV, { color: (report.total?.inpg ?? 0) > 0 ? ORANGE : GREEN }]}>{report.total?.inpg ?? 0}</Text><Text style={styles.metricL}>INPG</Text></View>
                  <View style={styles.metric}><Text style={[styles.metricV, { color: GREEN }]}>{report.total?.closed ?? 0}</Text><Text style={styles.metricL}>CLSD</Text></View>
                </View>

                {(report.areas ?? []).map((a: any) => (
                  <View key={a.area} style={styles.areaRow}>
                    <Text style={styles.areaName}>{a.area}</Text>
                    <Text style={styles.areaPills}>
                      <Text style={{ color: RED }}>OPEN {a.open}</Text>
                      {"   "}
                      <Text style={{ color: ORANGE }}>INPG {a.inpg}</Text>
                      {"   "}
                      <Text style={{ color: GREEN }}>CLSD {a.closed}</Text>
                    </Text>
                  </View>
                ))}

                <View style={styles.exportRow}>
                  <TouchableOpacity style={[styles.btnSmall, styles.btnSmallGhost]} onPress={exportSummary}>
                    <Text style={styles.btnSmallGhostText}>Ekspor Ringkasan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnSmall} onPress={exportDetail} disabled={busy}>
                    <Text style={styles.btnSmallText}>Ekspor Rinci (per toko)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Perbandingan 3 bulan */}
            {compare.length ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Perbandingan 3 Bulan</Text>
                <View style={styles.tHead}>
                  <Text style={[styles.tCell, styles.tHeadText, { flex: 1.4 }]}>Bulan</Text>
                  <Text style={[styles.tCell, styles.tHeadText]}>Total</Text>
                  <Text style={[styles.tCell, styles.tHeadText, { color: RED }]}>OPEN</Text>
                  <Text style={[styles.tCell, styles.tHeadText, { color: ORANGE }]}>INPG</Text>
                  <Text style={[styles.tCell, styles.tHeadText, { color: GREEN }]}>CLSD</Text>
                </View>
                {compare.map((m) => (
                  <View key={m.monthKey} style={styles.tRow}>
                    <Text style={[styles.tCell, styles.tText, { flex: 1.4 }]}>{labelMonth(m.monthKey)}</Text>
                    <Text style={[styles.tCell, styles.tText]}>{m.total}</Text>
                    <Text style={[styles.tCell, styles.tText, { color: RED, fontWeight: "900" }]}>{m.open}</Text>
                    <Text style={[styles.tCell, styles.tText, { color: ORANGE, fontWeight: "900" }]}>{m.inpg}</Text>
                    <Text style={[styles.tCell, styles.tText, { color: GREEN, fontWeight: "900" }]}>{m.clsd}</Text>
                  </View>
                ))}
                <Text style={styles.hint}>Tren: banyaknya OPEN yang menurun dari bulan ke bulan = progres makin baik.</Text>
              </View>
            ) : null}

            {/* Cari toko di bulan terpilih */}
            <Text style={styles.section}>Cari Toko — {labelMonth(monthKey)}</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                placeholder="Nama toko (boleh kosong = semua)"
                placeholderTextColor="#98A2B3"
                value={q}
                onChangeText={setQ}
                onSubmitEditing={searchStores}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={[styles.searchBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={searchStores}>
                <Text style={styles.searchBtnText}>Cari</Text>
              </TouchableOpacity>
            </View>

            {rows !== null ? (
              rows.length === 0 ? (
                <Text style={styles.hint}>Tidak ada toko cocok di {labelMonth(monthKey)}.</Text>
              ) : (
                <>
                  <Text style={styles.listMeta}>{rows.length} toko • {labelMonth(monthKey)}</Text>
                  {rows.map((t: any) => {
                    const tone = wfTone(t.workflowStatus);
                    return (
                      <TouchableOpacity
                        key={t._id}
                        style={styles.storeCard}
                        activeOpacity={0.85}
                        onPress={() => router.push(`/toko-aktif/${t._id}` as any)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.storeName} numberOfLines={2}>{t.storeName}</Text>
                          <Text style={styles.storeSub}>
                            {t.area}
                            {t.storeClass ? ` • Kelas ${t.storeClass}` : ""}
                            {t.paymentClass ? ` • ${t.paymentClass}` : ""}
                          </Text>
                          {t.workflowStatus === "INPG" && t.result ? (
                            <Text style={styles.storeSub}>
                              Hasil: {RESULT_LABEL[t.result] ?? t.result}
                              {t.result === "plan_order" && t.plannedOrderDate ? ` (${t.plannedOrderDate})` : ""}
                            </Text>
                          ) : null}
                          {t.workflowStatus === "CLSD" && t.reviewNote ? (
                            <Text style={styles.storeNote}>💬 {t.reviewNote}</Text>
                          ) : null}
                        </View>
                        <View style={[styles.wfChip, { backgroundColor: tone.bg }]}>
                          <Text style={[styles.wfChipText, { color: tone.color }]}>{t.workflowStatus ?? "OPEN"}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )
            ) : null}
          </>
        )}
      </ScrollView>

      <TabBar active="laporan" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  back: { color: RED, fontSize: 16, fontWeight: "800" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 12, color: GRAY, marginTop: 2 },

  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  monthBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  monthBtnText: { fontSize: 20, fontWeight: "900", color: C.inkSoft },
  monthText: { fontSize: 17, fontWeight: "800", color: C.ink, minWidth: 140, textAlign: "center" },

  btnRow: { flexDirection: "row" },
  btn: { flex: 1, backgroundColor: RED, borderRadius: R.md, paddingVertical: 13, alignItems: "center", marginRight: 6 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnGhost: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, paddingVertical: 13, alignItems: "center", marginLeft: 6, borderWidth: 1, borderColor: C.border },
  btnGhostText: { color: C.inkSoft, fontWeight: "800", fontSize: 14 },

  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: C.border, marginTop: 14 },
  cardTitle: { fontSize: 14, fontWeight: "900", color: C.ink, marginBottom: 8 },
  metricRow: { flexDirection: "row" },
  metric: { flex: 1, alignItems: "center" },
  metricV: { fontSize: 22, fontWeight: "900" },
  metricL: { fontSize: 11, color: GRAY, marginTop: 2 },
  areaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 8 },
  areaName: { fontSize: 13, fontWeight: "800", color: C.ink },
  areaPills: { fontSize: 12, fontWeight: "800" },

  exportRow: { flexDirection: "row", marginTop: 14 },
  btnSmall: { flex: 1, backgroundColor: RED, borderRadius: R.md, paddingVertical: 11, alignItems: "center", marginLeft: 6 },
  btnSmallText: { color: "#fff", fontWeight: "800", fontSize: 12.5 },
  btnSmallGhost: { backgroundColor: C.status.neutral.bg, marginLeft: 0, marginRight: 6 },
  btnSmallGhostText: { color: C.inkSoft, fontWeight: "800", fontSize: 12.5 },

  tHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.divider, paddingBottom: 6 },
  tRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  tCell: { flex: 1, textAlign: "center" },
  tHeadText: { fontSize: 11, fontWeight: "900", color: GRAY },
  tText: { fontSize: 13, fontWeight: "700", color: C.ink },

  section: { fontSize: 13, fontWeight: "900", color: C.ink, marginTop: 20, marginBottom: 8 },
  searchRow: { flexDirection: "row", alignItems: "center" },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 11, fontSize: 15, color: C.ink },
  searchBtn: { backgroundColor: RED, borderRadius: R.md, paddingHorizontal: 18, paddingVertical: 12, marginLeft: 8 },
  searchBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  listMeta: { fontSize: 12, fontWeight: "700", color: GRAY, marginTop: 12 },

  storeCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.surface, borderRadius: R.lg, padding: 13, marginTop: 10, borderWidth: 1, borderColor: C.border },
  storeName: { fontSize: 14.5, fontWeight: "800", color: C.ink },
  storeSub: { fontSize: 12, color: GRAY, marginTop: 3 },
  storeNote: { fontSize: 12, color: "#5B21B6", marginTop: 4 },
  wfChip: { borderRadius: R.xs, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 10 },
  wfChipText: { fontSize: 10, fontWeight: "900" },

  hint: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },
});
