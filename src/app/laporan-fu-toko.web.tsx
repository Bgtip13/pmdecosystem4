import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import { Bar, Card, DataTable, EmptyState, FilterChip, Kpi, Pill, WebButton } from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { A } from "../components/desktop/tokens";
import { downloadCsv } from "../lib/downloadCsv";
import { isOwnerLike } from "../lib/roles";

const AREAS = ["SOLO", "DIY", "SEMARANG"];
const AREA_TONE: Record<string, Tone> = { SOLO: "red", DIY: "blue", SEMARANG: "green" };
const RESULT_LABEL: any = {
  order_masuk: "Order masuk", plan_order: "Plan order", belum_order: "Belum order", tidak_potensi: "Tidak potensi",
  history_jelek: "History pembayaran jelek", no_respon: "No respon", tutup_permanen: "Toko tutup permanen",
  toko_ganti_nama: "Toko ganti nama", kalah_harga: "Kalah harga", kebutuhan_pribadi: "Kebutuhan pribadi",
  pengambilan_retail: "Pengambilan retail", belum_ambil: "Belum ambil", stok_cukup: "Stok masih cukup", ganti_nama: "Toko ganti nama",
};
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
function shiftMonth(mk: string, n: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function labelMonth(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_LABEL[m - 1] ?? m} ${y}`;
}

type Notice = { tone: "ok" | "err"; text: string } | null;

export default function LaporanFuTokoWeb() {
  const router = useRouter();
  const convex = useConvex();
  const viewer = useQuery(api.users.viewer) as any;
  const [monthKey, setMonthKey] = useState(monthNow());
  const [area, setArea] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const canArea = viewer?.role === "supervisor" || isOwnerLike(viewer?.role);
  const data = useQuery(api.dashboard.activeStoreReport, {
    monthKey,
    ...(canArea && area !== "ALL" ? { area: area as any } : {}),
  }) as any;

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  const exportDetail = async () => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const res: any = await convex.query(api.activeStores.list, {
        monthKey, ...(canArea && area !== "ALL" ? { area: area as any } : {}),
      } as any);
      const rows: any[] = res?.items ?? [];
      if (!rows.length) throw new Error(`Belum ada data FU Toko untuk ${labelMonth(monthKey)} (bulan itu belum pernah disinkron?).`);
      const header = ["Bulan", "Area", "Pelanggan", "Kelas Toko", "Kelas Bayar", "Target", "Status", "Status Sheet", "Jml Dihubungi", "Hasil", "Rencana Order", "Disimpan oleh", "Disimpan pada", "Catatan Review"];
      const body = rows.map((t: any) => [
        t.monthKey ?? monthKey, t.area, t.storeName, t.storeClass ?? "", t.paymentClass ?? "", t.target ?? "",
        t.workflowStatus ?? "OPEN", t.sourceStatus ?? "", t.callCount ?? 0, RESULT_LABEL[t.result] ?? "", t.plannedOrderDate ?? "",
        t.doneByName ?? "", t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID") : "", t.reviewNote ?? "",
      ]);
      const ok = downloadCsv(`rekap-fu-toko_${monthKey}${canArea && area !== "ALL" ? `_${area}` : ""}`, header, body);
      setNotice(ok ? { tone: "ok", text: `${body.length} baris diunduh.` } : { tone: "err", text: "Browser tidak mendukung unduhan." });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Ekspor gagal. Coba lagi." });
    } finally { setBusy(false); }
  };

  const exportSummary = () => {
    if (!data || !Array.isArray(data.perArea) || data.perArea.length === 0) {
      setNotice({ tone: "err", text: `Belum ada ringkasan untuk ${labelMonth(monthKey)}.` });
      return;
    }
    const body = [
      ...data.perArea.map((r: any) => [data.monthKey ?? monthKey, r.area, r.total, r.open, r.inpg, r.clsd]),
      ["", "TOTAL", data.totals?.total ?? 0, data.totals?.open ?? 0, data.totals?.inpg ?? 0, data.totals?.clsd ?? 0],
    ];
    const ok = downloadCsv(`ringkasan-fu-toko_${monthKey}`, ["Bulan", "Area", "Total", "OPEN", "INPG", "CLSD"], body);
    setNotice(ok ? { tone: "ok", text: `${body.length} baris diunduh.` } : { tone: "err", text: "Browser tidak mendukung unduhan." });
  };

  const total = data?.totals ?? { total: 0, open: 0, inpg: 0, clsd: 0 };
  const cols: Col[] = [
    { key: "area", label: "Area", width: 120, render: (r: any) => <Pill text={r.area} tone={AREA_TONE[r.area] ?? "gray"} size="sm" /> },
    { key: "total", label: "Total toko", width: 100, align: "right", render: (r: any) => <Text style={s.strong}>{r.total}</Text> },
    { key: "open", label: "OPEN", width: 80, align: "right", render: (r: any) => <Text style={[s.strong, { color: r.open > 0 ? A.red : A.green }]}>{r.open}</Text> },
    { key: "inpg", label: "INPG", width: 80, align: "right", render: (r: any) => <Text style={[s.strong, { color: r.inpg > 0 ? A.orange : A.green }]}>{r.inpg}</Text> },
    { key: "clsd", label: "CLSD", width: 80, align: "right", render: (r: any) => <Text style={[s.strong, { color: A.green }]}>{r.clsd}</Text> },
    {
      key: "bar", label: "Progres selesai", flex: 2,
      render: (r: any) => (
        <View style={{ width: "100%", gap: 4 }}>
          <Bar pct={r.total > 0 ? (r.clsd / r.total) * 100 : 0} color={A.green} height={7} />
          <Text style={s.tiny}>{r.total > 0 ? Math.round((r.clsd / r.total) * 100) : 0}% CLSD</Text>
        </View>
      ),
    },
  ];

  return (
    <DesktopShell
      active="laporan"
      title="Rekap FU Toko"
      subtitle={`Status pekerjaan toko aktif • ${labelMonth(monthKey)}`}
      right={
        <View style={s.row}>
          <WebButton label="Kembali ke Laporan" icon="back" variant="ghost" onPress={() => router.replace("/laporan")} />
          <WebButton label="Ringkasan CSV" icon="download" variant="ghost" onPress={exportSummary} />
          <WebButton label={busy ? "Menyiapkan…" : "Rinci CSV"} icon="download" variant="soft" disabled={busy} onPress={exportDetail} />
        </View>
      }
    >
      <View style={s.stack}>
        {notice ? (
          <View style={[s.notice, notice.tone === "ok" ? s.noticeOk : s.noticeErr]}>
            <Text style={[s.noticeText, { color: notice.tone === "ok" ? A.green : A.red }]}>{notice.text}</Text>
          </View>
        ) : null}

        <Card pad={16}>
          <View style={s.toolbar}>
            <View style={s.row}>
              <WebButton icon="back" variant="ghost" size="sm" onPress={() => setMonthKey(shiftMonth(monthKey, -1))} />
              <Text style={s.month}>{labelMonth(monthKey)}</Text>
              <WebButton icon="chevron" variant="ghost" size="sm" onPress={() => setMonthKey(shiftMonth(monthKey, 1))} />
              {monthKey !== monthNow() ? <WebButton label="Bulan ini" variant="soft" size="sm" onPress={() => setMonthKey(monthNow())} /> : null}
            </View>
            {canArea ? (
              <View style={s.chips}>
                {["ALL", ...AREAS].map((a) => <FilterChip key={a} label={a === "ALL" ? "Semua area" : a} on={area === a} onPress={() => setArea(a)} />)}
              </View>
            ) : null}
          </View>
        </Card>

        {data === undefined ? (
          <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
        ) : !data ? (
          <EmptyState icon="clipboard" title="Tidak ada ringkasan" desc="Tidak ada ringkasan untuk akun ini. Tombol unduh tetap bisa dipakai." />
        ) : (
          <>
            <View style={s.kpis}>
              <Kpi icon="store" tone="violet" label="Total" value={total.total ?? 0} />
              <Kpi icon="clock" tone={(total.open ?? 0) > 0 ? "red" : "green"} label="OPEN" value={total.open ?? 0} hint="belum dihubungi" />
              <Kpi icon="clipboard" tone={(total.inpg ?? 0) > 0 ? "amber" : "green"} label="INPG" value={total.inpg ?? 0} hint="menunggu review" />
              <Kpi icon="check" tone="green" label="CLSD" value={total.clsd ?? 0} hint="disetujui" />
            </View>

            <Card pad={0}>
              <DataTable cols={cols} rows={data.perArea ?? []} keyOf={(r: any) => r.area} minWidth={720}
                empty={<EmptyState icon="clipboard" title="Belum ada data" />} />
            </Card>

            <Text style={s.hint}>
              OPEN = belum dihubungi • INPG = sudah diisi, menunggu review supervisor • CLSD = disetujui. “Rinci CSV” mengambil data per toko langsung, termasuk bulan-bulan lampau yang masih tersimpan.
            </Text>
          </>
        )}
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  stack: { gap: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  month: { minWidth: 110, textAlign: "center", fontSize: 14, fontWeight: "700", color: A.ink },
  pad: { padding: 60, alignItems: "center" },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  strong: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  tiny: { fontSize: 12, color: A.muted },
  hint: { fontSize: 12.5, color: A.muted, lineHeight: 18 },
  notice: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  noticeOk: { backgroundColor: A.greenSoft, borderColor: A.greenBorder },
  noticeErr: { backgroundColor: A.redSoft, borderColor: "#F7C9C5" },
  noticeText: { fontSize: 13, fontWeight: "600" },
});
