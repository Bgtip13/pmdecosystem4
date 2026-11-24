import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { Text } from "../components/AppText";
import { useRouter } from "expo-router";
import { useQuery, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import { exportCsv } from "../lib/csvExport";
import { TOP_PAD } from "../lib/layout";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
import { isOwnerLike } from "../lib/roles";
const AREAS = ["SOLO", "DIY", "SEMARANG"];

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

function monthNow() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}
function shiftMonth(mk: string, n: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function labelMonth(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_LABEL[m - 1] ?? m} ${y}`;
}

export default function LaporanFuToko() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const convex = useConvex();
  const viewer = useQuery(api.users.viewer) as any;
  const [monthKey, setMonthKey] = useState(monthNow());
  const [area, setArea] = useState<string>("ALL");
  const [busy, setBusy] = useState(false);

  const canArea = viewer?.role === "supervisor" || isOwnerLike(viewer?.role);
  const data = useQuery(api.dashboard.activeStoreReport, {
    monthKey,
    ...(canArea && area !== "ALL" ? { area: area as any } : {}),
  }) as any;

  // Ekspor RINCI per toko (sumber: activeStores.list — mendukung monthKey, termasuk bulan lalu)
  const doExportDetail = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res: any = await convex.query(api.activeStores.list, {
        monthKey,
        ...(canArea && area !== "ALL" ? { area: area as any } : {}),
      } as any);
      const rows: any[] = res?.items ?? [];
      if (!rows.length) {
        throw new Error(`Belum ada data FU Toko untuk ${labelMonth(monthKey)} (bulan itu belum pernah disinkron?).`);
      }
      const header = [
        "Bulan", "Area", "Pelanggan", "Kelas Toko", "Kelas Bayar", "Target",
        "Status", "Status Sheet", "Jml Dihubungi", "Hasil", "Rencana Order",
        "Disimpan oleh", "Disimpan pada", "Catatan Review",
      ];
      const body = rows.map((t: any) => [
        t.monthKey ?? monthKey,
        t.area, t.storeName, t.storeClass ?? "", t.paymentClass ?? "", t.target ?? "",
        t.workflowStatus ?? "OPEN", t.sourceStatus ?? "", t.callCount ?? 0,
        RESULT_LABEL[t.result] ?? "", t.plannedOrderDate ?? "",
        t.doneByName ?? "", t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID") : "",
        t.reviewNote ?? "",
      ]);
      const out = await exportCsv({
        fileName: `rekap-fu-toko_${monthKey}${canArea && area !== "ALL" ? `_${area}` : ""}`,
        header,
        rows: body,
        dialogTitle: "Ekspor Rekap FU Toko (rinci)",
      });
      Alert.alert("Ekspor selesai", `${out.rows} baris • ${out.file}`);
    } catch (e: any) {
      Alert.alert("Ekspor gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  // Ekspor RINGKASAN per area (Total / OPEN / INPG / CLSD)
  const doExportSummary = async () => {
    if (busy) return;
    if (!data || !Array.isArray(data.perArea) || data.perArea.length === 0) {
      Alert.alert("Ekspor ringkasan", `Belum ada ringkasan untuk ${labelMonth(monthKey)}.`);
      return;
    }
    setBusy(true);
    try {
      const header = ["Bulan", "Area", "Total", "OPEN", "INPG", "CLSD"];
      const body = [
        ...data.perArea.map((r: any) => [data.monthKey ?? monthKey, r.area, r.total, r.open, r.inpg, r.clsd]),
        ["", "TOTAL", data.totals?.total ?? 0, data.totals?.open ?? 0, data.totals?.inpg ?? 0, data.totals?.clsd ?? 0],
      ];
      const out = await exportCsv({
        fileName: `ringkasan-fu-toko_${monthKey}`,
        header,
        rows: body,
        dialogTitle: "Ekspor Ringkasan FU Toko",
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
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/laporan"))}>
          <Text style={styles.back}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Rekap FU Toko</Text>
        <Text style={styles.meta}>Status pekerjaan toko aktif • {labelMonth(monthKey)}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* Pemilih bulan */}
        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthBtn} onPress={() => setMonthKey(shiftMonth(monthKey, -1))}>
            <Text style={styles.monthBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthText}>{labelMonth(monthKey)}</Text>
          <TouchableOpacity style={styles.monthBtn} onPress={() => setMonthKey(shiftMonth(monthKey, 1))}>
            <Text style={styles.monthBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        {canArea ? (
          <View style={styles.chipRow}>
            {["ALL", ...AREAS].map((a) => {
              const on = area === a;
              return (
                <TouchableOpacity key={a} style={[styles.chip, on && styles.chipOn]} onPress={() => setArea(a)}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{a === "ALL" ? "Semua" : a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {/* Tombol ekspor selalu tampil, tidak menunggu data */}
        <TouchableOpacity
          style={[styles.exportBtn, busy && { opacity: 0.6 }]}
          onPress={doExportDetail}
          disabled={busy}
        >
          <Text style={styles.exportText}>{busy ? "Menyiapkan…" : `Ekspor Rinci — ${labelMonth(monthKey)}`}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtnGhost, busy && { opacity: 0.6 }]}
          onPress={doExportSummary}
          disabled={busy}
        >
          <Text style={styles.exportGhostText}>Ekspor Ringkasan per Area</Text>
        </TouchableOpacity>

        {data === undefined ? (
          <IOSSpinner size="large" color={C.primary} style={{ marginTop: 30 }} />
        ) : !data ? (
          <Text style={[styles.hint, { marginTop: 20 }]}>
            Tidak ada ringkasan untuk akun ini. Tombol ekspor di atas tetap bisa dipakai.
          </Text>
        ) : (
          <>
            {/* Ringkasan */}
            <View style={[styles.sumCard, { marginTop: 14 }]}>
              <View style={styles.metric}><Text style={[styles.metricV, { color: C.ink0 }]}>{data.totals?.total ?? 0}</Text><Text style={styles.metricL}>Total</Text></View>
              <View style={styles.metric}><Text style={[styles.metricV, { color: (data.totals?.open ?? 0) > 0 ? C.status.danger.fg : C.status.success.fg }]}>{data.totals?.open ?? 0}</Text><Text style={styles.metricL}>OPEN</Text></View>
              <View style={styles.metric}><Text style={[styles.metricV, { color: (data.totals?.inpg ?? 0) > 0 ? C.status.warning.fg : C.status.success.fg }]}>{data.totals?.inpg ?? 0}</Text><Text style={styles.metricL}>INPG</Text></View>
              <View style={styles.metric}><Text style={[styles.metricV, { color: C.status.success.fg }]}>{data.totals?.clsd ?? 0}</Text><Text style={styles.metricL}>CLSD</Text></View>
            </View>

            {/* Per area */}
            {(data.perArea ?? []).map((r: any) => (
              <View key={r.area} style={styles.rowCard}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowArea}>{r.area}</Text>
                  <Text style={styles.rowTotal}>{r.total} toko</Text>
                </View>
                <View style={styles.barRow}>
                  <Text style={[styles.pill, { color: C.status.danger.fg }]}>OPEN {r.open}</Text>
                  <Text style={[styles.pill, { color: C.status.warning.fg }]}>INPG {r.inpg}</Text>
                  <Text style={[styles.pill, { color: C.status.success.fg }]}>CLSD {r.clsd}</Text>
                </View>
              </View>
            ))}

            <Text style={styles.hint}>
              OPEN = belum dihubungi • INPG = sudah diisi, menunggu review supervisor • CLSD = disetujui.{"\n"}
              "Ekspor Rinci" mengambil data per toko langsung (termasuk bulan-bulan lampau yang masih tersimpan).
            </Text>
          </>
        )}
      </ScrollView>

      <TabBar active="laporan" />
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
  back: { color: C.primary, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 12 },
  monthBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.divider },
  monthBtnText: { fontSize: 20, fontWeight: "900", color: C.inkSoft },
  monthText: { fontSize: 17, fontWeight: "800", color: C.ink0, minWidth: 140, textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  chip: { backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: C.divider },
  chipOn: { backgroundColor: C.primarySoft, borderColor: C.primary },
  chipText: { fontSize: 12, fontWeight: "800", color: C.inkMuted },
  chipTextOn: { color: C.primary },
  sumCard: { flexDirection: "row", backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.divider, marginBottom: 12 },
  metric: { flex: 1, alignItems: "center" },
  metricV: { fontSize: 22, fontWeight: "900" },
  metricL: { fontSize: 11, color: C.inkMuted, marginTop: 2 },
  rowCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.divider, marginBottom: 10 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowArea: { fontSize: 15, fontWeight: "800", color: C.ink0 },
  rowTotal: { fontSize: 13, color: C.inkMuted, fontWeight: "700" },
  barRow: { flexDirection: "row", marginTop: 8 },
  pill: { fontSize: 12, fontWeight: "800", marginRight: 14 },
  exportBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  exportText: { color: C.onPrimary, fontWeight: "800", fontSize: 15 },
  exportBtnGhost: { backgroundColor: C.card, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: C.divider },
  exportGhostText: { color: C.inkSoft, fontWeight: "800", fontSize: 14 },
  hint: { fontSize: 12, color: C.inkMuted, marginTop: 10, lineHeight: 17 },
});
