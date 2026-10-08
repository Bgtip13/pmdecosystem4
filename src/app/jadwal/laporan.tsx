import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useConvex } from "convex/react";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import { theme } from "../../lib/theme";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = "#067647";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko tutup" };

const esc = (v: any) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const fmtTimeFull = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

async function writeAndShareCsv(fileName: string, header: string[], body: (string | number | null)[][]) {
  const lines = [header.join(","), ...body.map((r) => r.map(esc).join(","))];
  const csv = "\uFEFF" + lines.join("\r\n"); // BOM biar Excel baca UTF-8 benar
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Berbagi file tidak tersedia di perangkat ini.");
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    dialogTitle: "Ekspor Jadwal",
    UTI: "public.comma-separated-values-text",
  });
}

const monthLabel = (mk: string) => {
  const [y, m] = mk.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};

export default function LaporanJadwal() {
  const router = useRouter();
  const convex = useConvex();

  const [mk, setMk] = useState(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);

  const data = useQuery(api.jadwal.monthReport, { monthKey: mk }) as any;

  const shiftMonth = (n: number) => {
    const [y, m] = mk.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMk(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/jadwal" as any);
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const rows: any[] = await convex.query(api.jadwal.exportMonth, { monthKey: mk });
      if (!rows || rows.length === 0) {
        Alert.alert("Ekspor", "Belum ada data jadwal untuk bulan ini.");
        return;
      }
      const body = rows.map((r) => [
        r.tanggal, r.area, r.sales, r.storeName, r.statusLabel,
        r.isAdHoc ? "Ya" : "Tidak", r.noSpk,
        r.target ?? "", r.act ?? "",
        fmtTimeFull(r.checkinAt), fmtTimeFull(r.checkoutAt),
        r.metWith ? (MET_LABEL[r.metWith] ?? r.metWith) : "",
        r.catatan ?? "",
        r.terhubung ?? "",
      ]);
      await writeAndShareCsv(
        `jadwal_${mk}.csv`,
        ["Tanggal", "Area", "Sales", "Toko", "Status", "Luar Jadwal", "No. SPK", "Target", "Omset", "Check-in", "Check-out", "Bertemu", "Catatan", "Terhubung"],
        body
      );
    } catch (e: any) {
      Alert.alert("Ekspor gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const cnt = data?.counts ?? {
    total: 0, done: 0, ongoing: 0, planned: 0, cancelled: 0, terlewat: 0, adHoc: 0,
    belumTerhubung: 0, terlewatTerkunci: 0,
  };
  const persen = cnt.total > 0 ? Math.round((cnt.done / cnt.total) * 100) : 0;

  const Box = ({ label, value, color }: any) => (
    <View style={styles.box}>
      <Text style={styles.boxLabel}>{label}</Text>
      <Text style={[styles.boxValue, { color: color ?? C.ink }]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Laporan Jadwal</Text>
            <Text style={styles.meta}>Capaian kunjungan bulanan & toko terlewat</Text>
          </View>
          <TouchableOpacity style={[styles.expBtn, busy && { opacity: 0.5 }]} onPress={doExport} disabled={busy}>
            <AppIcon name="download" size={14} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.expBtnText}>{busy ? "…" : "Excel"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navArrow}>
            <Text style={styles.navArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel(mk)}</Text>
          <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.navArrow}>
            <Text style={styles.navArrowText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {data === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : !data ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tidak ada akses</Text>
          <Text style={styles.emptySub}>Laporan ini untuk supervisor dan owner.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ringkasan {monthLabel(mk)}</Text>
            <View style={styles.boxRow}>
              <Box label="TERJADWAL" value={cnt.total} />
              <Box label="SELESAI" value={cnt.done} color={GREEN} />
              <Box label="TERLEWAT" value={cnt.terlewat} color={cnt.terlewat > 0 ? "#B42318" : GRAY} />
            </View>
            <View style={styles.boxRow}>
              <Box label="BERJALAN" value={cnt.ongoing} color="#B54708" />
              <Box label="BELUM" value={cnt.planned} />
              <Box label="BATAL" value={cnt.cancelled} />
            </View>
            <Text style={styles.hint}>
              Capaian {persen}% dari {cnt.total} toko terjadwal
              {cnt.adHoc > 0 ? ` • ${cnt.adHoc} kunjungan luar jadwal` : ""}
            </Text>
          </View>

          {/* ← BARU: nama yang belum tertaut ke master toko (tidak bisa di-check-in) */}
          {cnt.belumTerhubung > 0 ? (
            <View style={[styles.card, { borderColor: "#FECDCA", backgroundColor: "#FFFBFB" }]}>
              <Text style={styles.cardTitle}>Nama Belum Terhubung ({cnt.belumTerhubung})</Text>
              <Text style={styles.hint}>
                Nama toko di sheet JADWAL tidak sama dengan master Kelola Toko, jadi SPK-nya tidak bisa diisi
                {cnt.terlewatTerkunci > 0
                  ? ` — ${cnt.terlewatTerkunci} di antaranya sudah tercatat sebagai TERLEWAT padahal bukan salah sales.`
                  : "."}
              </Text>
              {(data.belumTerhubung as any[]).map((t: any) => (
                <View key={t._id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{t.storeName}</Text>
                    <Text style={styles.rowSub}>{t.tanggal} • {t.area} • {t.salesName}</Text>
                  </View>
                </View>
              ))}
              {cnt.belumTerhubung > 150 ? (
                <Text style={styles.hint}>Ditampilkan 150 pertama — sisanya ada di file Excel.</Text>
              ) : null}
              <TouchableOpacity style={styles.fixBtn} onPress={() => router.push("/jadwal" as any)}>
                <Text style={styles.fixBtnText}>Buka SPK Jadwal untuk menyambungkan</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Per Sales</Text>
            {(data.perSales ?? []).length === 0 ? (
              <Text style={styles.hint}>Belum ada jadwal bulan ini.</Text>
            ) : (
              (data.perSales as any[]).map((g: any) => (
                <View key={String(g.salesId ?? g.name)} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{g.name}</Text>
                    <Text style={styles.rowSub}>
                      {g.area} • {g.done}/{g.total} selesai
                      {g.adHoc ? ` • ${g.adHoc} luar jadwal` : ""}
                      {g.belumTerhubung ? ` • ${g.belumTerhubung} nama belum terhubung` : ""}
                    </Text>
                  </View>
                  {g.terlewat > 0 ? (
                    <View style={styles.chipBad}>
                      <Text style={styles.chipBadText}>{g.terlewat} terlewat</Text>
                    </View>
                  ) : (
                    <View style={styles.chipOk}>
                      <Text style={styles.chipOkText}>aman</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Toko Terlewat ({cnt.terlewat})</Text>
            {cnt.terlewat === 0 ? (
              <Text style={styles.hint}>Tidak ada toko terlewat sampai hari ini. 👍</Text>
            ) : (
              <>
                <Text style={styles.hint}>
                  Terjadwal tapi belum dikunjungi sampai tanggalnya lewat. Ini yang perlu dikejar.
                  {cnt.terlewatTerkunci > 0
                    ? ` Catatan: ${cnt.terlewatTerkunci} di antaranya tidak bisa dikunjungi karena nama tokonya belum terhubung.`
                    : ""}
                </Text>
                {(data.terlewat as any[]).map((t: any) => (
                  <View key={t._id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{t.storeName}</Text>
                      <Text style={styles.rowSub}>{t.tanggal} • {t.area} • {t.salesName}</Text>
                    </View>
                  </View>
                ))}
                {cnt.terlewat > 150 ? (
                  <Text style={styles.hint}>Ditampilkan 150 pertama — sisanya ada di file Excel.</Text>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  titleRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  title: { fontSize: 20, fontWeight: "800", color: C.ink },
  meta: { fontSize: 12, color: GRAY, marginTop: 2 },
  expBtn: { flexDirection: "row", alignItems: "center", backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9 },
  expBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8 },
  navArrow: { paddingHorizontal: 14, paddingVertical: 2 },
  navArrowText: { fontSize: 22, fontWeight: "800", color: RED },
  monthLabel: { fontSize: 15, fontWeight: "800", color: C.ink, minWidth: 110, textAlign: "center" },

  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 14, fontWeight: "800", color: C.ink, marginBottom: 8 },

  boxRow: { flexDirection: "row", marginBottom: 8 },
  box: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: R.md, padding: 10, marginRight: 6, alignItems: "center" },
  boxLabel: { fontSize: 10, fontWeight: "800", color: GRAY, letterSpacing: 0.3 },
  boxValue: { fontSize: 20, fontWeight: "800", marginTop: 2 },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowName: { fontSize: 14, fontWeight: "700", color: C.ink },
  rowSub: { fontSize: 11, color: GRAY, marginTop: 2 },
  chipBad: { backgroundColor: "#FEE4E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipBadText: { fontSize: 11, fontWeight: "800", color: "#B42318" },
  chipOk: { backgroundColor: "#DCFAE6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipOkText: { fontSize: 11, fontWeight: "800", color: GREEN },

  hint: { fontSize: 12, color: GRAY, lineHeight: 18, marginTop: 6 },
  fixBtn: { backgroundColor: C.primary, borderRadius: R.md, paddingVertical: 11, alignItems: "center", marginTop: 10 },
  fixBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  emptySub: { fontSize: 13, color: GRAY, marginTop: 6, textAlign: "center" },
});
