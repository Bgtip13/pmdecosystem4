import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { Bar, Kpi } from "../components/desktop/ui";
import { BackButton, ActionButton, Notice, EmptyLine } from "../components/desktop/detail";
import AppIcon from "../components/AppIcon";
import { A, FONT, SHADOW } from "../components/desktop/tokens";
import { downloadCsv } from "../lib/downloadCsv";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const AREAS = ["ALL", "SOLO", "DIY", "SEMARANG"];
const RESULT_LABEL: any = {
  order_masuk: "Order masuk", plan_order: "Plan order", belum_order: "Belum order",
  tidak_potensi: "Tidak potensi", history_jelek: "History pembayaran jelek",
  no_respon: "No respon", tutup_permanen: "Toko tutup permanen",
  toko_ganti_nama: "Toko ganti nama", ganti_nama: "Toko ganti nama",
  kalah_harga: "Kalah harga", kebutuhan_pribadi: "Kebutuhan pribadi",
  pengambilan_retail: "Pengambilan retail", belum_ambil: "Belum ambil (lama)",
  stok_cukup: "Stok masih cukup (lama)",
};

const monthNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
const shiftMonth = (mk: string, n: number) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const labelMonth = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTHS[m - 1] ?? m} ${y}`;
};
const rupiah = (n: any) =>
  n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID");

// ===== RIWAYAT FU TOKO (web) — hasil follow-up toko per bulan =====
export default function FuTokoRiwayatWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const role = viewer?.role;
  const canSee = role === "supervisor" || role === "owner" || role === "telemarketing";
  const canFilterArea = role === "supervisor" || role === "owner";

  const [monthKey, setMonthKey] = useState(monthNow());
  const [area, setArea] = useState("ALL");
  const [q, setQ] = useState("");
  const [wf, setWf] = useState("ALL");
  const [shown, setShown] = useState(60);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);

  // Setiap filter berubah, kembali ke halaman pertama.
  useEffect(() => { setShown(60); }, [monthKey, area, q, wf]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4600);
    return () => clearTimeout(t);
  }, [notice]);

  const m1 = shiftMonth(monthKey, -1);
  const m2 = shiftMonth(monthKey, -2);

  const counts = useQuery(
    api.activeStores.counts,
    viewer && canSee ? ({ monthKey } as any) : "skip"
  ) as any;
  const counts1 = useQuery(
    api.activeStores.counts,
    viewer && canSee ? ({ monthKey: m1 } as any) : "skip"
  ) as any;
  const counts2 = useQuery(
    api.activeStores.counts,
    viewer && canSee ? ({ monthKey: m2 } as any) : "skip"
  ) as any;
  const list = useQuery(
    api.activeStores.list,
    viewer && canSee ? ({ monthKey } as any) : "skip"
  ) as any;

  const needle = q.trim().toLowerCase();

  const rows = useMemo(() => {
    let out: any[] = (list?.items ?? []) as any[];
    if (area !== "ALL" && canFilterArea) {
      out = out.filter((r) => String(r.area ?? "").toUpperCase() === area);
    }
    if (wf !== "ALL") {
      out = out.filter((r) => String(r.workflowStatus ?? "OPEN") === wf);
    }
    if (needle) {
      out = out.filter((r) =>
        String(r.storeName ?? "").toLowerCase().includes(needle) ||
        String(r.doneByName ?? "").toLowerCase().includes(needle)
      );
    }
    return out;
  }, [list, area, canFilterArea, needle, wf]);

  const compare = useMemo(() => {
    const pick = (r: any) => ({
      total: r?.total?.all ?? 0,
      open: r?.total?.open ?? 0,
      inpg: r?.total?.inpg ?? 0,
      closed: r?.total?.closed ?? 0,
    });
    return [
      { monthKey: m2, ...pick(counts2) },
      { monthKey: m1, ...pick(counts1) },
      { monthKey, ...pick(counts) },
    ];
  }, [counts, counts1, counts2, monthKey, m1, m2]);

  const areas: any[] = counts?.areas ?? [];
  const areaTotal = counts?.total?.all ?? 0;

  const exportSummary = () => {
    if (!counts) return setNotice({ tone: "err", text: "Ringkasan bulan ini belum termuat." });
    const ok = downloadCsv(
      `ringkasan-fu-toko_${monthKey}`,
      ["Bulan", "Area", "Total", "OPEN", "INPG", "CLSD"],
      [
        ...areas.map((a) => [monthKey, a.area, a.all, a.open, a.inpg, a.closed]),
        [monthKey, "TOTAL", areaTotal, counts.total?.open ?? 0, counts.total?.inpg ?? 0, counts.total?.closed ?? 0],
      ]
    );
    setNotice({
      tone: ok ? "ok" : "err",
      text: ok ? `Ringkasan ${labelMonth(monthKey)} diekspor ke CSV.` : "Ekspor tidak tersedia di peramban ini.",
    });
  };

  const exportDetail = () => {
    if (!rows.length) return setNotice({ tone: "err", text: `Tidak ada data FU Toko untuk ${labelMonth(monthKey)} pada filter ini.` });
    const ok = downloadCsv(
      `rekap-fu-toko_${monthKey}`,
      ["Bulan", "Area", "Pelanggan", "Kelas Toko", "Kelas Bayar", "Target", "Status", "Status Sheet",
        "Jml Dihubungi", "Hasil", "Rencana Order", "Disimpan oleh", "Disimpan pada", "Catatan Review"],
      rows.map((t: any) => [
        t.monthKey ?? monthKey, t.area ?? "", t.storeName ?? "", t.storeClass ?? "", t.paymentClass ?? "",
        t.target ?? "", t.workflowStatus ?? "OPEN", t.sourceStatus ?? "", t.callCount ?? 0,
        RESULT_LABEL[t.result] ?? "", t.plannedOrderDate ?? "",
        t.doneByName ?? "", t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID") : "", t.reviewNote ?? "",
      ])
    );
    setNotice({
      tone: ok ? "ok" : "err",
      text: ok ? `${rows.length} toko diekspor ke CSV.` : "Ekspor tidak tersedia di peramban ini.",
    });
  };

  if (!viewer) {
    return (
      <DesktopShell active="laporan" title="Riwayat FU Toko" subtitle="Memuat akun…">
        <View style={s.center}><ActivityIndicator size="large" color={A.brand} /></View>
      </DesktopShell>
    );
  }

  if (!canSee) {
    return (
      <DesktopShell active="laporan" title="Riwayat FU Toko" subtitle="Hasil follow-up toko per bulan">
        <View style={s.emptyCard}>
          <View style={s.emptyIcon}><AppIcon name="lock" size={20} color={A.muted} /></View>
          <Text style={s.emptyTitle}>Akun ini belum punya akses</Text>
          <Text style={s.emptyDesc}>Riwayat FU Toko tersedia untuk supervisor, owner, dan telemarketing.</Text>
        </View>
      </DesktopShell>
    );
  }

  const loading = counts === undefined || list === undefined;
  const isThisMonth = monthKey === monthNow();

  return (
    <DesktopShell
      active="laporan"
      title="Riwayat FU Toko"
      subtitle={`Hasil follow-up toko • ${labelMonth(monthKey)} • OPEN / INPG / CLSD per area`}
      right={
        <View style={s.headActions}>
          <BackButton onPress={() => router.replace("/laporan" as any)} label="Laporan" />
          <ActionButton label="Ekspor Ringkasan" icon="download" onPress={exportSummary} />
          <ActionButton label="Ekspor Rinci" icon="download" tone="primary" onPress={exportDetail} />
        </View>
      }
    >
      {/* ===== Pemilih bulan + filter ===== */}
      <View style={s.toolbar}>
        <View style={s.monthNav}>
          <TouchableOpacity style={s.navBtn} onPress={() => setMonthKey(shiftMonth(monthKey, -1))}>
            <AppIcon name="back" size={15} color={A.inkSoft} />
          </TouchableOpacity>
          <Text style={s.monthText}>{labelMonth(monthKey)}</Text>
          <TouchableOpacity style={s.navBtn} onPress={() => setMonthKey(shiftMonth(monthKey, 1))}>
            <AppIcon name="chevron" size={15} color={A.inkSoft} />
          </TouchableOpacity>
          {!isThisMonth ? (
            <TouchableOpacity style={s.resetBtn} onPress={() => setMonthKey(monthNow())}>
              <Text style={s.resetText}>Bulan ini</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />

        <View style={s.searchWrap}>
          <AppIcon name="search" size={14} color={A.mutedSoft} style={{ marginRight: 6 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Cari toko / petugas…"
            placeholderTextColor={A.mutedSoft}
            value={q}
            onChangeText={setQ}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ("")}>
              <AppIcon name="closeCircle" size={14} color={A.mutedSoft} />
            </TouchableOpacity>
          ) : null}
        </View>

        {canFilterArea ? (
          <View style={s.chipRow}>
            {AREAS.map((a) => {
              const on = area === a;
              return (
                <TouchableOpacity key={a} style={[s.chip, on && s.chipOn]} onPress={() => setArea(a)}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{a === "ALL" ? "Semua area" : a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={s.chipRow}>
          {([
            ["ALL", "Semua"],
            ["OPEN", `OPEN ${counts?.total?.open ?? 0}`],
            ["INPG", `INPG ${counts?.total?.inpg ?? 0}`],
            ["CLSD", `CLSD ${counts?.total?.closed ?? 0}`],
          ] as any[]).map(([key, label]) => {
            const on = wf === key;
            return (
              <TouchableOpacity key={key} style={[s.chip, on && s.chipOn]} onPress={() => setWf(key)}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

      {/* ===== Ringkasan bulan ===== */}
      <View style={s.kpiRow}>
        <Kpi label="Total toko" value={counts?.total?.all ?? 0} color={A.brand} hint={labelMonth(monthKey)} />
        <Kpi label="OPEN" value={counts?.total?.open ?? 0} color={A.orange} hint="Belum dihubungi" />
        <Kpi label="INPG" value={counts?.total?.inpg ?? 0} color={A.info} hint="Menunggu review" />
        <Kpi label="CLSD" value={counts?.total?.closed ?? 0} color={A.green} hint="Sudah selesai" />
      </View>

      <View style={s.cols}>
        <View style={s.colMain}>
          {/* ===== Hasil per area ===== */}
          <View style={s.panel}>
            <View style={s.panelHead}>
              <View style={s.panelIcon}><AppIcon name="chart" size={13} color={A.brand} /></View>
              <Text style={s.panelTitle}>Hasil per Area</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.panelHint}>{labelMonth(monthKey)}</Text>
            </View>
            <View style={s.panelBody}>
              {areas.length === 0 ? (
                <EmptyLine text={`Belum ada data FU Toko untuk ${labelMonth(monthKey)}.`} />
              ) : (
                <>
                  <View style={s.thead}>
                    <Text style={[s.th, { flex: 1.4 }]}>Area</Text>
                    <Text style={[s.th, { width: 70, textAlign: "center" }]}>Total</Text>
                    <Text style={[s.th, { width: 70, textAlign: "center", color: A.orange }]}>OPEN</Text>
                    <Text style={[s.th, { width: 70, textAlign: "center", color: A.info }]}>INPG</Text>
                    <Text style={[s.th, { width: 70, textAlign: "center", color: A.green }]}>CLSD</Text>
                    <Text style={[s.th, { width: 150 }]}>Selesai</Text>
                  </View>
                  {areas.map((a: any) => {
                    const pct = a.all ? Math.round((a.closed / a.all) * 100) : 0;
                    return (
                      <View key={a.area} style={s.tr}>
                        <Text style={[s.tdStrong, { flex: 1.4 }]} numberOfLines={1}>{a.area}</Text>
                        <Text style={[s.tdText, { width: 70, textAlign: "center" }]}>{a.all}</Text>
                        <Text style={[s.tdText, { width: 70, textAlign: "center", color: A.orange, fontWeight: "800" }]}>{a.open}</Text>
                        <Text style={[s.tdText, { width: 70, textAlign: "center", color: A.info, fontWeight: "800" }]}>{a.inpg}</Text>
                        <Text style={[s.tdText, { width: 70, textAlign: "center", color: A.green, fontWeight: "800" }]}>{a.closed}</Text>
                        <View style={{ width: 150, flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={{ flex: 1 }}><Bar pct={pct} color={A.green} /></View>
                          <Text style={s.pctText}>{pct}%</Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>

          {/* ===== Daftar toko ===== */}
          <View style={s.panel}>
            <View style={s.panelHead}>
              <View style={s.panelIcon}><AppIcon name="store" size={13} color={A.brand} /></View>
              <Text style={s.panelTitle}>Daftar Toko</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.panelHint}>{rows.length} toko</Text>
            </View>
            {loading ? (
              <View style={s.loading}><ActivityIndicator size="large" color={A.brand} /></View>
            ) : rows.length === 0 ? (
              <View style={s.panelBody}>
                <EmptyLine text="Tidak ada toko yang cocok dengan filter ini." />
              </View>
            ) : (
              <>
                <View style={[s.thead, { paddingHorizontal: 13 }]}>
                  <Text style={[s.th, { flex: 2.4 }]}>Toko</Text>
                  <Text style={[s.th, { width: 90 }]}>Area</Text>
                  <Text style={[s.th, { width: 110 }]}>Kelas</Text>
                  <Text style={[s.th, { flex: 1.2 }]}>Petugas</Text>
                  <Text style={[s.th, { flex: 1.9 }]}>Catatan / hasil</Text>
                  <Text style={[s.th, { width: 86, textAlign: "center" }]}>Status</Text>
                </View>
                {rows.slice(0, shown).map((r: any, i: number) => (
                  <TouchableOpacity
                    key={r._id}
                    style={[s.tr, s.trClick, i % 2 === 1 && s.trAlt]}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/toko-aktif/${r._id}` as any)}
                  >
                    <View style={{ flex: 2.4, paddingRight: 12 }}>
                      <Text style={s.tdStrong} numberOfLines={1}>{r.storeName}</Text>
                      <Text style={s.tdSub} numberOfLines={1}>
                        {r.target ? `Target ${rupiah(r.target)}` : "FU Toko bulanan"}
                      </Text>
                    </View>
                    <Text style={[s.tdText, { width: 90 }]}>{r.area ?? "-"}</Text>
                    <Text style={[s.tdText, { width: 110 }]} numberOfLines={1}>
                      {r.storeClass ?? "-"}{r.paymentClass ? ` • ${r.paymentClass}` : ""}
                    </Text>
                    <Text style={[s.tdText, { flex: 1.2 }]} numberOfLines={1}>{r.doneByName || "Belum"}</Text>
                    <Text style={[s.tdSub, { flex: 1.9 }]} numberOfLines={2}>
                      {r.reviewNote || RESULT_LABEL[r.result] || r.result ||
                        (String(r.workflowStatus ?? "OPEN") === "OPEN" ? "Belum dihubungi" : "-")}
                    </Text>
                    <View style={[s.statusCell, { width: 86 }]}>
                      <StatusPill wf={r.workflowStatus} />
                    </View>
                  </TouchableOpacity>
                ))}
                {rows.length > shown ? (
                  <TouchableOpacity style={s.moreBtn} onPress={() => setShown((v) => v + 60)}>
                    <Text style={s.moreText}>Muat 60 toko lagi ({rows.length - shown} tersisa)</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>

        <View style={s.colSide}>
          {/* ===== Perbandingan 3 bulan ===== */}
          <View style={s.panel}>
            <View style={s.panelHead}>
              <View style={s.panelIcon}><AppIcon name="trend" size={13} color={A.brand} /></View>
              <Text style={s.panelTitle}>Perbandingan 3 Bulan</Text>
            </View>
            <View style={s.panelBody}>
              <View style={s.thead}>
                <Text style={[s.th, { flex: 1.5 }]}>Bulan</Text>
                <Text style={[s.th, { width: 46, textAlign: "center" }]}>Total</Text>
                <Text style={[s.th, { width: 46, textAlign: "center", color: A.orange }]}>OPEN</Text>
                <Text style={[s.th, { width: 46, textAlign: "center", color: A.info }]}>INPG</Text>
                <Text style={[s.th, { width: 46, textAlign: "center", color: A.green }]}>CLSD</Text>
              </View>
              {compare.map((m) => (
                <View key={m.monthKey} style={[s.tr, m.monthKey === monthKey && s.trActive]}>
                  <Text style={[s.tdStrong, { flex: 1.5 }]} numberOfLines={1}>{labelMonth(m.monthKey)}</Text>
                  <Text style={[s.tdText, { width: 46, textAlign: "center" }]}>{m.total}</Text>
                  <Text style={[s.tdText, { width: 46, textAlign: "center", color: A.orange, fontWeight: "800" }]}>{m.open}</Text>
                  <Text style={[s.tdText, { width: 46, textAlign: "center", color: A.info, fontWeight: "800" }]}>{m.inpg}</Text>
                  <Text style={[s.tdText, { width: 46, textAlign: "center", color: A.green, fontWeight: "800" }]}>{m.closed}</Text>
                </View>
              ))}
              <Text style={s.footNote}>
                Tren: makin sedikit OPEN dari bulan ke bulan = progres makin baik.
              </Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <AppIcon name="info" size={14} color={A.brand} style={{ marginBottom: 6 }} />
            <Text style={s.infoTitle}>Cara membaca</Text>
            <Text style={s.infoText}>
              Klik satu baris toko untuk melihat identifikasi, bukti chat WA, dan riwayat aksinya.
              Data di sini mengikuti periode bulan yang sedang dipilih.
            </Text>
          </View>
        </View>
      </View>
    </DesktopShell>
  );
}

function StatusPill({ wf }: { wf?: string }) {
  const key = String(wf ?? "OPEN");
  const tone =
    key === "CLSD" ? { bg: A.greenSoft, fg: A.green }
      : key === "INPG" ? { bg: A.infoSoft, fg: A.info }
        : { bg: A.orangeSoft, fg: A.orange };
  return (
    <View style={[s.pill, { backgroundColor: tone.bg }]}>
      <Text style={[s.pillText, { color: tone.fg }]}>{key}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 70, alignItems: "center" },
  headActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },

  emptyCard: {
    alignItems: "center", justifyContent: "center", paddingVertical: 70, paddingHorizontal: 24,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10,
  },
  emptyIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  emptyTitle: { fontSize: 13, fontWeight: "800", color: A.ink, fontFamily: FONT },
  emptyDesc: { fontSize: 11, color: A.muted, marginTop: 4, textAlign: "center", fontFamily: FONT },

  toolbar: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 10, ...SHADOW, shadowOpacity: 0.04, shadowRadius: 10,
  },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBtn: {
    width: 30, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
  },
  monthText: { fontSize: 12.5, fontWeight: "800", color: A.ink, minWidth: 96, textAlign: "center", fontFamily: FONT },
  resetBtn: {
    backgroundColor: A.cream, borderWidth: 1, borderColor: A.brandBorder,
    borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, marginLeft: 4,
  },
  resetText: { fontSize: 10, fontWeight: "700", color: A.brandDark, fontFamily: FONT },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    minWidth: 200, maxWidth: 280, flexGrow: 1, height: 34, paddingHorizontal: 10,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft, borderRadius: 8,
  },
  searchInput: { flex: 1, fontSize: 11, color: A.ink, outlineStyle: "none", fontFamily: FONT } as any,

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7,
    borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
  },
  chipOn: { backgroundColor: A.brandSoft, borderColor: A.brandBorder },
  chipText: { fontSize: 10, fontWeight: "700", color: A.muted, fontFamily: FONT },
  chipTextOn: { color: A.brandDark, fontWeight: "800" },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  cols: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  colMain: { flexGrow: 3, flexBasis: 620, minWidth: 320, gap: 16 },
  colSide: { flexGrow: 1, flexBasis: 340, minWidth: 300, gap: 16 },

  panel: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, overflow: "hidden", ...SHADOW, shadowOpacity: 0.045, shadowRadius: 10,
  },
  panelHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 13, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  panelIcon: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: A.brandSoft,
    alignItems: "center", justifyContent: "center",
  },
  panelTitle: {
    fontSize: 10.5, fontWeight: "800", color: A.inkSoft,
    letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONT,
  },
  panelHint: { fontSize: 10, color: A.muted, fontFamily: FONT },
  panelBody: { padding: 13 },
  loading: { paddingVertical: 50, alignItems: "center" },

  thead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 2, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: A.border,
  },
  th: {
    fontSize: 8.5, fontWeight: "800", color: A.inkSoft,
    letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONT,
  },
  tr: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 2, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  trClick: { paddingHorizontal: 13, borderRadius: 6 },
  trAlt: { backgroundColor: "#FCFAF9" },
  trActive: { backgroundColor: A.brandSoft },
  tdStrong: { fontSize: 11, fontWeight: "700", color: A.ink, fontFamily: FONT },
  tdText: { fontSize: 10.5, color: A.inkSoft, fontFamily: FONT },
  tdSub: { fontSize: 9, color: A.muted, marginTop: 2, lineHeight: 13, fontFamily: FONT },
  pctText: { width: 32, fontSize: 9.5, fontWeight: "800", color: A.green, textAlign: "right", fontFamily: FONT },

  statusCell: { alignItems: "center" },
  pill: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 8.5, fontWeight: "800", fontFamily: FONT },

  moreBtn: {
    paddingVertical: 11, alignItems: "center",
    borderTopWidth: 1, borderTopColor: A.borderSoft, backgroundColor: A.surfaceAlt,
  },
  moreText: { fontSize: 10, fontWeight: "700", color: A.brandDark, fontFamily: FONT },

  footNote: { fontSize: 9.5, color: A.mutedSoft, lineHeight: 14, marginTop: 10, fontFamily: FONT },
  infoCard: {
    backgroundColor: A.cream, borderWidth: 1, borderColor: A.brandBorder,
    borderRadius: 10, padding: 13,
  },
  infoTitle: { fontSize: 10.5, fontWeight: "800", color: A.brandDark, fontFamily: FONT },
  infoText: { fontSize: 10, color: A.inkSoft, lineHeight: 16, marginTop: 3, fontFamily: FONT },
});
