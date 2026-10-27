import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { Kpi } from "../components/desktop/ui";
import { SpkStatusBadge, normalizeWf } from "../components/SpkWorkflow";
import AppIcon from "../components/AppIcon";
import { A, FONT, SHADOW } from "../components/desktop/tokens";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const AREAS = ["ALL", "SOLO", "DIY", "SEMARANG"];
const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko tutup" };
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
const P_HASIL: any = { janji_bayar: "Janji bayar", lunas: "Lunas", cicil: "Cicil", no_respon: "No respon" };
const O_HASIL: any = { order_masuk: "Order masuk", order_tambah: "Order tambah", tidak_order: "Tidak order", no_respon: "No respon" };
const FU_HASIL: any = {
  order_masuk: "Order masuk", plan_order: "Plan order", belum_order: "Belum order",
  tidak_potensi: "Tidak potensi", history_jelek: "History pembayaran jelek",
  no_respon: "No respon", tutup_permanen: "Toko tutup permanen",
  toko_ganti_nama: "Toko ganti nama", ganti_nama: "Toko ganti nama",
  kalah_harga: "Kalah harga", kebutuhan_pribadi: "Kebutuhan pribadi",
  pengambilan_retail: "Pengambilan retail", belum_ambil: "Belum ambil", stok_cukup: "Stok cukup",
};

type Tab = "kunjungan" | "admin" | "fu";
type AdminRow = {
  key: string;
  kind: "p" | "o";
  task: any;
  salesName?: string;
  reviewerName?: string;
};

const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));
const time = (ms: any) => (ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-");
const dateShort = (ms: any) =>
  ms ? new Date(ms).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "-";
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const monthNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
const labelMonth = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTHS[m - 1] ?? m} ${y}`;
};
const shiftMonth = (mk: string, n: number) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function downloadCsv(fileName: string, header: string[], rows: any[][]) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const cell = (v: any) => {
    const s = String(v ?? "").replace(/\r?\n/g, " ").trim();
    return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export default function RiwayatWeb() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const role = viewer?.role;
  const isSuper = role === "supervisor";
  const isOwner = role === "owner";
  const isTele = role === "telemarketing";
  const isField = role === "field";
  const canFilterArea = isSuper || isOwner;
  const canSeeFu = isSuper || isOwner || isTele;

  const paramTab = typeof params.tab === "string" ? params.tab : "";
  const [tab, setTab] = useState<Tab>(
    paramTab === "admin" || paramTab === "fu" ? paramTab : "kunjungan"
  );
  useEffect(() => {
    if (paramTab === "admin" || paramTab === "fu" || paramTab === "kunjungan") setTab(paramTab);
  }, [paramTab]);

  const [day, setDay] = useState(new Date());
  const [salesId, setSalesId] = useState<string | undefined>(undefined);
  const [area, setArea] = useState("ALL");
  const [q, setQ] = useState("");
  const [monthKey, setMonthKey] = useState(monthNow());
  const [fuWf, setFuWf] = useState("ALL");
  const [shownFu, setShownFu] = useState(50);
  const [notice, setNotice] = useState("");

  // Setiap filter FU berubah, kembali ke halaman pertama.
  useEffect(() => { setShownFu(50); }, [monthKey, area, q, fuWf]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4200);
    return () => clearTimeout(t);
  }, [notice]);

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = start + 86400000 - 1;
  const isToday = sameDay(day, new Date());
  const dayLabel = isToday
    ? "Hari ini"
    : day.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const canSee = !!viewer && role !== "ppic";
  const canFilterSales = isTele || isSuper || isOwner;

  const salesList = useQuery(
    api.users.listFieldSales,
    viewer && canFilterSales ? (isTele ? { area: (viewer as any).area as any } : {}) : "skip"
  ) as any;

  const areaArg = isSuper && area !== "ALL" ? { area } : {};

  const hist = useQuery(
    api.visits.listHistory,
    viewer && canSee
      ? { from: start, to: end, ...(salesId ? { salesId: salesId as any } : {}) }
      : "skip"
  ) as any;

  const doneP = useQuery(
    api.piutang.listDone,
    viewer && canSee ? ({ from: start, to: end, ...areaArg } as any) : "skip"
  ) as any;
  const doneO = useQuery(
    api.orderFollowups.listDone,
    viewer && canSee ? ({ from: start, to: end, ...areaArg } as any) : "skip"
  ) as any;

  // Ringkasan FU Toko selalu dimuat (query ringan) supaya jumlah di tab tidak berubah-ubah.
  const fuCounts = useQuery(
    api.activeStores.counts,
    viewer && canSeeFu ? ({ monthKey } as any) : "skip"
  ) as any;
  const fuList = useQuery(
    api.activeStores.list,
    viewer && canSeeFu && tab === "fu" ? ({ monthKey } as any) : "skip"
  ) as any;

  const needle = q.trim().toLowerCase();

  const visitRows = useMemo(() => {
    let rows: any[] = (hist ?? []) as any[];
    if (area !== "ALL") {
      rows = rows.filter((it) => String(it.store?.area ?? "").toUpperCase() === area);
    }
    if (needle) {
      rows = rows.filter((it) =>
        String(it.store?.name ?? "").toLowerCase().includes(needle) ||
        String(it.salesName ?? "").toLowerCase().includes(needle)
      );
    }
    return rows;
  }, [hist, area, needle]);

  const adminRows = useMemo(() => {
    const p: AdminRow[] = ((doneP ?? []) as any[]).map((it) => ({
      key: "p:" + String(it.task?._id), kind: "p", task: it.task, salesName: it.salesName, reviewerName: it.reviewerName,
    }));
    const o: AdminRow[] = ((doneO ?? []) as any[]).map((it) => ({
      key: "o:" + String(it.task?._id), kind: "o", task: it.task, salesName: it.salesName, reviewerName: it.reviewerName,
    }));
    let rows = [...p, ...o].sort((a, b) => (b.task?.doneAt ?? 0) - (a.task?.doneAt ?? 0));
    if (needle) {
      rows = rows.filter((r) =>
        String(r.task?.storeName ?? "").toLowerCase().includes(needle) ||
        String(r.salesName ?? "").toLowerCase().includes(needle)
      );
    }
    return rows;
  }, [doneP, doneO, needle]);

  const fuRows = useMemo(() => {
    let rows: any[] = (fuList?.items ?? []) as any[];
    if (area !== "ALL" && canFilterArea) {
      rows = rows.filter((r) => String(r.area ?? "").toUpperCase() === area);
    }
    if (needle) {
      rows = rows.filter((r) =>
        String(r.storeName ?? "").toLowerCase().includes(needle) ||
        String(r.doneByName ?? "").toLowerCase().includes(needle)
      );
    }
    if (fuWf !== "ALL") {
      rows = rows.filter((r) => String(r.workflowStatus ?? "OPEN") === fuWf);
    }
    return rows;
  }, [fuList, area, canFilterArea, needle, fuWf]);

  const loading =
    (tab === "kunjungan" && hist === undefined) ||
    (tab === "admin" && (doneP === undefined || doneO === undefined)) ||
    (tab === "fu" && fuList === undefined);

  const visitKpi = useMemo(() => {
    const rows: any[] = (hist ?? []) as any[];
    const inpg = rows.filter((r) => normalizeWf(r.visit?.workflowStatus) === "INPG").length;
    const ordered = rows.filter((r) => !!r.visit?.ordered).length;
    const paid = rows.filter((r) => !!r.visit?.paid).length;
    const revenue = rows.reduce((s, r) => s + (r.visit?.paidAmount ?? 0), 0);
    return { total: rows.length, inpg, ordered, paid, revenue };
  }, [hist]);

  const adminKpi = useMemo(() => {
    const p: any[] = (doneP ?? []) as any[];
    const o: any[] = (doneO ?? []) as any[];
    const nominal = p.reduce((s, it) => s + (it.task?.total ?? it.task?.piutang ?? 0), 0);
    const areas = new Set([...p, ...o].map((it) => it.task?.area).filter(Boolean));
    return { total: p.length + o.length, piutang: p.length, order: o.length, nominal, areas: areas.size };
  }, [doneP, doneO]);

  const exportCurrent = () => {
    if (tab === "kunjungan") {
      if (!visitRows.length) return setNotice("Tidak ada kunjungan untuk diekspor.");
      const ok = downloadCsv(
        `riwayat-kunjungan_${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}.csv`,
        ["Tanggal", "Toko", "Area", "Sales", "Check-in", "Check-out", "Durasi (menit)", "Bertemu", "Order", "Order (Rp)", "Status"],
        visitRows.map((it) => {
          const v = it.visit;
          return [
            dateShort(v.checkinAt), it.store?.name ?? "", it.store?.area ?? "", it.salesName ?? "",
            time(v.checkinAt), v.checkoutAt ? time(v.checkoutAt) : "", v.durationMin ?? 0,
            MET_LABEL[v.metWith] ?? v.metWith ?? "", v.ordered ? "Ya" : "Tidak",
            v.paidAmount ?? 0, normalizeWf(v.workflowStatus),
          ];
        })
      );
      setNotice(ok ? `${visitRows.length} kunjungan diekspor ke CSV.` : "Ekspor tidak tersedia.");
      return;
    }
    if (tab === "admin") {
      if (!adminRows.length) return setNotice("Tidak ada follow-up untuk diekspor.");
      const ok = downloadCsv(
        `riwayat-followup_${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}.csv`,
        ["Waktu CLSD", "Jenis", "Toko", "Area", "Petugas", "Hasil", "Nominal", "Catatan"],
        adminRows.map((r) => [
          new Date(r.task?.doneAt ?? 0).toLocaleString("id-ID"),
          r.kind === "p" ? "Piutang" : "Orderan",
          r.task?.storeName ?? "", r.task?.area ?? "", r.salesName ?? "",
          (r.kind === "p" ? P_HASIL : O_HASIL)[r.task?.hasil] ?? r.task?.hasil ?? "",
          r.kind === "p" ? r.task?.total ?? "" : "",
          r.task?.notes ?? "",
        ])
      );
      setNotice(ok ? `${adminRows.length} follow-up diekspor ke CSV.` : "Ekspor tidak tersedia.");
      return;
    }
    if (!fuRows.length) return setNotice("Tidak ada data FU Toko untuk diekspor.");
    const ok = downloadCsv(
      `fu-toko_${monthKey}.csv`,
      ["Bulan", "Toko", "Area", "Kelas", "Status", "Petugas", "Catatan"],
      fuRows.map((r) => [
        r.monthKey ?? monthKey, r.storeName ?? "", r.area ?? "", r.storeClass ?? "",
        r.workflowStatus ?? "OPEN", r.doneByName ?? "", r.reviewNote ?? "",
      ])
    );
    setNotice(ok ? `${fuRows.length} toko diekspor ke CSV.` : "Ekspor tidak tersedia.");
  };

  if (!viewer) {
    return <View style={s.center}><ActivityIndicator size="large" color={A.brand} /></View>;
  }

  if (!canSee) {
    return (
      <DesktopShell active="riwayat" title="Riwayat" subtitle="Arsip kunjungan dan follow-up">
        <View style={s.emptyCard}>
          <View style={s.emptyIcon}><AppIcon name="lock" size={20} color={A.muted} /></View>
          <Text style={s.emptyTitle}>Akun ini belum punya akses riwayat</Text>
          <Text style={s.emptyDesc}>Riwayat tersedia untuk sales, telemarketing, supervisor, dan owner.</Text>
        </View>
      </DesktopShell>
    );
  }

  const shiftDay = (n: number) => setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));

  return (
    <DesktopShell
      active="riwayat"
      title="Riwayat"
      subtitle="Arsip kunjungan sales, follow-up admin, dan FU toko — siap ditelusuri"
      right={
        <View style={s.headActions}>
          <TouchableOpacity style={s.btnGhost} onPress={exportCurrent}>
            <AppIcon name="download" size={13} color={A.inkSoft} style={{ marginRight: 6 }} />
            <Text style={s.btnGhostText}>Ekspor CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={() => router.push("/spk" as any)}>
            <AppIcon name="clipboard" size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.btnPrimaryText}>Buka SPK</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {/* ===== Tab ===== */}
      <View style={s.tabBar}>
        {([
          ["kunjungan", "Kunjungan Sales", (hist ?? []).length],
          ["admin", "Follow-up Admin", ((doneP ?? []).length + (doneO ?? []).length)],
          ["fu", "FU Toko", fuCounts?.total?.all ?? 0],
        ] as any[]).map(([key, label, count]) => {
          const on = tab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[s.tab, on && s.tabOn]}
              onPress={() => { setTab(key); router.setParams({ tab: key } as any); }}
            >
              <Text style={[s.tabText, on && s.tabTextOn]}>{label}</Text>
              {viewer ? <View style={[s.tabCount, on && s.tabCountOn]}><Text style={[s.tabCountText, on && s.tabCountTextOn]}>{count}</Text></View> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ===== KPI ===== */}
      {tab === "kunjungan" ? (
        <View style={s.kpiRow}>
          <Kpi label="Kunjungan" value={visitKpi.total} color={A.brand} hint={dayLabel} />
          <Kpi label="Menunggu review" value={visitKpi.inpg} color={A.info} hint="Status INPG" />
          <Kpi label="Hasil order" value={visitKpi.ordered} color={A.green} hint="Kunjungan dengan order" />
          <Kpi label="Pembayaran" value={visitKpi.paid} color={A.orange} hint={rupiah(visitKpi.revenue)} />
        </View>
      ) : tab === "admin" ? (
        <View style={s.kpiRow}>
          <Kpi label="Total CLSD" value={adminKpi.total} color={A.green} hint={dayLabel} />
          <Kpi label="Piutang" value={adminKpi.piutang} color={A.brand} hint="Tugas tertutup" />
          <Kpi label="Orderan" value={adminKpi.order} color={A.info} hint="Tugas tertutup" />
          <Kpi label="Nilai piutang" value={rupiah(adminKpi.nominal)} color={A.orange} hint={`${adminKpi.areas} area`} />
        </View>
      ) : (
        <View style={s.kpiRow}>
          <Kpi label="Total toko" value={fuCounts?.total?.all ?? 0} color={A.brand} hint={labelMonth(monthKey)} />
          <Kpi label="OPEN" value={fuCounts?.total?.open ?? 0} color={A.orange} hint="Belum dihubungi" />
          <Kpi label="INPG" value={fuCounts?.total?.inpg ?? 0} color={A.info} hint="Menunggu review" />
          <Kpi label="CLSD" value={fuCounts?.total?.closed ?? 0} color={A.green} hint="Sudah selesai" />
        </View>
      )}

      {/* ===== Toolbar ===== */}
      <View style={s.toolbar}>
        {tab === "fu" ? (
          <View style={s.monthNav}>
            <TouchableOpacity style={s.navBtn} onPress={() => setMonthKey(shiftMonth(monthKey, -1))}>
              <AppIcon name="back" size={15} color={A.inkSoft} />
            </TouchableOpacity>
            <Text style={s.monthText}>{labelMonth(monthKey)}</Text>
            <TouchableOpacity style={s.navBtn} onPress={() => setMonthKey(shiftMonth(monthKey, 1))}>
              <AppIcon name="chevron" size={15} color={A.inkSoft} />
            </TouchableOpacity>
            {monthKey !== monthNow() ? (
              <TouchableOpacity style={s.todayBtn} onPress={() => setMonthKey(monthNow())}>
                <Text style={s.todayText}>Bulan ini</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={s.dateNav}>
            <TouchableOpacity style={s.navBtn} onPress={() => shiftDay(-1)}>
              <AppIcon name="back" size={15} color={A.inkSoft} />
            </TouchableOpacity>
            <View style={s.dateLabelBox}>
              <Text style={s.dateLabel}>{dayLabel}</Text>
              <Text style={s.dateSub}>{DOW[day.getDay()]}, {dateShort(start)} {day.getFullYear()}</Text>
            </View>
            <TouchableOpacity style={s.navBtn} onPress={() => shiftDay(1)}>
              <AppIcon name="chevron" size={15} color={A.inkSoft} />
            </TouchableOpacity>
            {!isToday ? (
              <TouchableOpacity style={s.todayBtn} onPress={() => setDay(new Date())}>
                <Text style={s.todayText}>Hari ini</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={{ flex: 1 }} />

        <View style={s.searchWrap}>
          <AppIcon name="search" size={14} color={A.mutedSoft} style={{ marginRight: 6 }} />
          <TextInput
            style={s.searchInput}
            placeholder={tab === "fu" ? "Cari toko / petugas…" : "Cari toko / sales…"}
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
          <View style={s.areaRow}>
            {AREAS.map((a) => {
              const on = area === a;
              return (
                <TouchableOpacity key={a} style={[s.areaChip, on && s.areaChipOn]} onPress={() => setArea(a)}>
                  <Text style={[s.areaText, on && s.areaTextOn]}>{a === "ALL" ? "Semua area" : a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      {tab === "kunjungan" && canFilterSales && (salesList ?? []).length > 0 ? (
        <View style={s.salesRow}>
          <Text style={s.filterLabel}>Sales</Text>
          <TouchableOpacity style={[s.salesChip, !salesId && s.salesChipOn]} onPress={() => setSalesId(undefined)}>
            <Text style={[s.salesText, !salesId && s.salesTextOn]}>Semua</Text>
          </TouchableOpacity>
          {(salesList ?? []).map((sl: any) => {
            const on = salesId === sl._id;
            return (
              <TouchableOpacity
                key={sl._id}
                style={[s.salesChip, on && s.salesChipOn]}
                onPress={() => setSalesId(on ? undefined : sl._id)}
              >
                <Text style={[s.salesText, on && s.salesTextOn]} numberOfLines={1}>{sl.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {tab === "fu" ? (
        <View style={s.salesRow}>
          <Text style={s.filterLabel}>Status</Text>
          {([
            ["ALL", "Semua"], ["OPEN", `OPEN ${fuCounts?.total?.open ?? 0}`],
            ["INPG", `INPG ${fuCounts?.total?.inpg ?? 0}`], ["CLSD", `CLSD ${fuCounts?.total?.closed ?? 0}`],
          ] as any[]).map(([key, label]) => {
            const on = fuWf === key;
            return (
              <TouchableOpacity key={key} style={[s.salesChip, on && s.salesChipOn]} onPress={() => setFuWf(key)}>
                <Text style={[s.salesText, on && s.salesTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {notice ? (
        <View style={s.notice}>
          <AppIcon name="check" size={13} color={A.green} style={{ marginRight: 6 }} />
          <Text style={s.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {/* ===== Tabel ===== */}
      <View style={s.tableCard}>
        {loading ? (
          <View style={s.loading}><ActivityIndicator size="large" color={A.brand} /></View>
        ) : tab === "kunjungan" ? (
          <>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 2.1 }]}>Toko</Text>
              <Text style={[s.th, { flex: 1.1 }]}>Sales</Text>
              <Text style={[s.th, { width: 150 }]}>Waktu</Text>
              <Text style={[s.th, { flex: 1.7 }]}>Hasil kunjungan</Text>
              <Text style={[s.th, { width: 88, textAlign: "center" }]}>Status</Text>
              <Text style={[s.th, { width: 74, textAlign: "right" }]}>Aksi</Text>
            </View>
            {visitRows.length === 0 ? (
              <EmptyState title="Belum ada kunjungan" desc="Tidak ada kunjungan pada tanggal ini. Coba pindah tanggal atau ubah filter." />
            ) : (
              visitRows.map((it: any, i: number) => {
                const v = it.visit;
                const wf = normalizeWf(v.workflowStatus);
                return (
                  <TouchableOpacity
                    key={v._id}
                    style={[s.tr, i % 2 === 1 && s.trAlt]}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/visit-detail/${v._id}` as any)}
                  >
                    <View style={[s.td, { flex: 2.1 }]}>
                      <View style={s.storeRow}>
                        {it.photoSelfieUrl ? (
                          <Image source={{ uri: it.photoSelfieUrl }} style={s.thumb} />
                        ) : (
                          <View style={[s.thumb, s.thumbEmpty]}><AppIcon name="store" size={13} color={A.mutedSoft} /></View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.tdStrong} numberOfLines={1}>{it.store?.name ?? "Toko terhapus"}</Text>
                          <Text style={s.tdSub} numberOfLines={1}>{it.store?.area ?? "-"} • {MET_LABEL[v.metWith] ?? "-"}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[s.tdText, { flex: 1.1 }]} numberOfLines={1}>{it.salesName || "-"}</Text>
                    <View style={{ width: 150 }}>
                      <Text style={s.tdText}>{time(v.checkinAt)} → {v.checkoutAt ? time(v.checkoutAt) : "—"}</Text>
                      <Text style={s.tdSub}>{v.durationMin ?? 0} menit</Text>
                    </View>
                    <View style={[s.td, { flex: 1.7 }]}>
                      <View style={s.tagRow}>
                        {v.ordered ? <Tag text="Order" bg={A.infoSoft} fg={A.info} /> : null}
                        {v.paid ? <Tag text="Bayar" bg={A.greenSoft} fg={A.green} /> : null}
                        {!v.ordered && v.noOrderReason ? (
                          <Tag text={REASON_LABEL[v.noOrderReason] ?? v.noOrderReason} bg={A.brandSoft} fg={A.red} />
                        ) : null}
                        {!v.ordered && !v.paid && !v.noOrderReason ? <Text style={s.tdSub}>Tanpa hasil</Text> : null}
                      </View>
                      {v.paid ? <Text style={s.tdSub}>{rupiah(v.paidAmount)}</Text> : null}
                    </View>
                    <View style={{ width: 88, alignItems: "center" }}><SpkStatusBadge status={wf} size={9} /></View>
                    <View style={{ width: 74, alignItems: "flex-end" }}>
                      <Text style={s.linkText}>Detail ›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : tab === "admin" ? (
          <>
            <View style={s.thead}>
              <Text style={[s.th, { width: 118 }]}>Waktu CLSD</Text>
              <Text style={[s.th, { flex: 2 }]}>Toko</Text>
              <Text style={[s.th, { width: 84 }]}>Jenis</Text>
              <Text style={[s.th, { flex: 1 }]}>Petugas</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Hasil</Text>
              <Text style={[s.th, { width: 120, textAlign: "right" }]}>Nilai</Text>
              <Text style={[s.th, { width: 104, textAlign: "center" }]}>Bukti</Text>
            </View>
            {adminRows.length === 0 ? (
              <EmptyState title="Belum ada follow-up CLSD" desc="Tidak ada follow-up yang disetujui pada tanggal ini." />
            ) : (
              adminRows.map((r, i) => {
                const isP = r.kind === "p";
                const hasil = (isP ? P_HASIL : O_HASIL)[r.task?.hasil] ?? r.task?.hasil ?? "-";
                const href = isP ? `/spk-detail/${r.task?._id}` : `/spk-detail-order/${r.task?._id}`;
                return (
                  <TouchableOpacity
                    key={r.key}
                    activeOpacity={0.75}
                    style={[s.tr, i % 2 === 1 && s.trAlt]}
                    disabled={!r.task?._id}
                    onPress={() => r.task?._id && router.push(href as any)}
                  >
                    <View style={{ width: 118 }}>
                      <Text style={s.tdText}>{time(r.task?.doneAt)}</Text>
                      <Text style={s.tdSub}>{dateShort(r.task?.doneAt)}</Text>
                    </View>
                    <View style={[s.td, { flex: 2 }]}>
                      <Text style={s.tdStrong} numberOfLines={1}>{r.task?.storeName ?? "-"}</Text>
                      <Text style={s.tdSub} numberOfLines={1}>{r.task?.area ?? "-"} • {isP ? "Follow-up piutang" : "Follow-up orderan"}</Text>
                    </View>
                    <View style={{ width: 84 }}>
                      <Tag text={isP ? "Piutang" : "Orderan"} bg={isP ? A.brandSoft : A.infoSoft} fg={isP ? A.red : A.info} />
                    </View>
                    <Text style={[s.tdText, { flex: 1 }]} numberOfLines={1}>{r.salesName || "-"}</Text>
                    <View style={{ flex: 1.5 }}>
                      <Text style={s.tdText} numberOfLines={1}>{hasil}</Text>
                      {r.task?.notes ? <Text style={s.tdSub} numberOfLines={1}>{r.task.notes}</Text> : null}
                    </View>
                    <Text style={[s.tdText, { width: 120, textAlign: "right", fontWeight: "800" }]}>
                      {isP ? rupiah(r.task?.total) : "-"}
                    </Text>
                    <View style={{ width: 104, alignItems: "center" }}>
                      <Text style={s.linkBtn}>Lihat bukti →</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 2.2 }]}>Toko</Text>
              <Text style={[s.th, { width: 90 }]}>Area</Text>
              <Text style={[s.th, { width: 110 }]}>Kelas</Text>
              <Text style={[s.th, { flex: 1.1 }]}>Petugas</Text>
              <Text style={[s.th, { flex: 1.8 }]}>Catatan / hasil</Text>
              <Text style={[s.th, { width: 88, textAlign: "center" }]}>Status</Text>
            </View>
            {fuRows.length === 0 ? (
              <EmptyState title="Belum ada data FU Toko" desc={`Tidak ada toko pada periode ${labelMonth(monthKey)}.`} />
            ) : (
              fuRows.slice(0, shownFu).map((r: any, i: number) => (
                <TouchableOpacity
                  key={r._id}
                  style={[s.tr, i % 2 === 1 && s.trAlt]}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/toko-aktif/${r._id}` as any)}
                >
                  <View style={{ flex: 2.2, paddingRight: 12 }}>
                    <Text style={s.tdStrong} numberOfLines={1}>{r.storeName}</Text>
                    <Text style={s.tdSub} numberOfLines={1}>{r.target ? `Target ${rupiah(r.target)}` : "FU Toko bulanan"}</Text>
                  </View>
                  <Text style={[s.tdText, { width: 90 }]}>{r.area}</Text>
                  <Text style={[s.tdText, { width: 110 }]} numberOfLines={1}>
                    {r.storeClass ?? "-"}{r.paymentClass ? ` • ${r.paymentClass}` : ""}
                  </Text>
                  <Text style={[s.tdText, { flex: 1.1 }]} numberOfLines={1}>{r.doneByName || "Belum"}</Text>
                  <Text style={[s.tdSub, { flex: 1.8 }]} numberOfLines={2}>
                    {r.reviewNote || FU_HASIL[r.result] || r.result || (r.workflowStatus === "OPEN" ? "Belum dihubungi" : "-")}
                  </Text>
                  <View style={{ width: 88, alignItems: "center" }}><SpkStatusBadge status={r.workflowStatus} size={9} /></View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
        {tab === "fu" && fuRows.length > shownFu ? (
          <TouchableOpacity style={s.moreBtn} onPress={() => setShownFu((v) => v + 50)}>
            <Text style={s.moreText}>Muat 50 toko lagi ({fuRows.length - shownFu} tersisa)</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={s.footNote}>
        Menampilkan maksimal 200 baris terbaru per jenis. Perubahan hasil kunjungan dan persetujuan SPV tercatat pada
        detail masing-masing baris.
      </Text>
    </DesktopShell>
  );
}

function Tag({ text, bg, fg }: any) {
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.tagText, { color: fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function EmptyState({ title, desc }: any) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><AppIcon name="search" size={19} color={A.mutedSoft} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyDesc}>{desc}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },

  headActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnGhost: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  btnGhostText: { fontSize: 10.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  btnPrimary: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.brand, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  btnPrimaryText: { fontSize: 10.5, fontWeight: "700", color: "#fff", fontFamily: FONT },

  tabBar: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 4, alignSelf: "flex-start",
  },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 7,
  },
  tabOn: { backgroundColor: A.brandSoft },
  tabText: { fontSize: 11, fontWeight: "700", color: A.muted, fontFamily: FONT },
  tabTextOn: { color: A.brandDark, fontWeight: "800" },
  tabCount: {
    minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: A.surfaceAlt, alignItems: "center", justifyContent: "center",
  },
  tabCountOn: { backgroundColor: A.brand },
  tabCountText: { fontSize: 8.5, fontWeight: "800", color: A.muted, fontFamily: FONT },
  tabCountTextOn: { color: "#fff" },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  toolbar: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 10, ...SHADOW, shadowOpacity: 0.04, shadowRadius: 10,
  },
  dateNav: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBtn: {
    width: 30, height: 30, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
  },
  dateLabelBox: { minWidth: 156, paddingHorizontal: 4 },
  dateLabel: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  dateSub: { fontSize: 9, color: A.muted, marginTop: 1, fontFamily: FONT },
  monthText: { fontSize: 12, fontWeight: "800", color: A.ink, minWidth: 92, textAlign: "center", fontFamily: FONT },
  todayBtn: {
    backgroundColor: A.cream, borderWidth: 1, borderColor: A.brandBorder,
    borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, marginLeft: 4,
  },
  todayText: { fontSize: 9.5, fontWeight: "700", color: A.brandDark, fontFamily: FONT },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    minWidth: 200, maxWidth: 280, flexGrow: 1,
    height: 34, paddingHorizontal: 10,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft, borderRadius: 8,
  },
  searchInput: {
    flex: 1, fontSize: 11, color: A.ink, outlineStyle: "none", fontFamily: FONT,
  } as any,
  areaRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  areaChip: {
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7,
    borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
  },
  areaChipOn: { backgroundColor: A.brand, borderColor: A.brand },
  areaText: { fontSize: 9.5, fontWeight: "700", color: A.muted, fontFamily: FONT },
  areaTextOn: { color: "#fff" },

  salesRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  filterLabel: {
    fontSize: 9, fontWeight: "800", color: A.mutedSoft, letterSpacing: 0.6,
    textTransform: "uppercase", marginRight: 3, fontFamily: FONT,
  },
  salesChip: {
    maxWidth: 150, paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1, borderColor: A.border, backgroundColor: A.surface,
  },
  salesChipOn: { backgroundColor: A.brandSoft, borderColor: A.brandBorder },
  salesText: { fontSize: 9.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  salesTextOn: { color: A.brandDark, fontWeight: "800" },

  notice: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.greenSoft, borderWidth: 1, borderColor: A.greenBorder,
    borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8,
  },
  noticeText: { fontSize: 10.5, fontWeight: "600", color: A.green, fontFamily: FONT },

  tableCard: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, overflow: "hidden", ...SHADOW, shadowOpacity: 0.045,
  },
  loading: { paddingVertical: 60, alignItems: "center" },
  thead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: A.cream, borderBottomWidth: 1, borderBottomColor: A.border,
  },
  th: {
    fontSize: 8.5, fontWeight: "800", color: A.inkSoft,
    letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONT,
  },
  tr: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  trAlt: { backgroundColor: "#FCFAF9" },
  td: { paddingRight: 10 },
  tdStrong: { fontSize: 11, fontWeight: "700", color: A.ink, fontFamily: FONT },
  tdText: { fontSize: 10.5, color: A.inkSoft, fontFamily: FONT },
  tdSub: { fontSize: 9, color: A.muted, marginTop: 2, lineHeight: 13, fontFamily: FONT },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  thumb: { width: 30, height: 30, borderRadius: 8 },
  thumbEmpty: { backgroundColor: A.surfaceAlt, alignItems: "center", justifyContent: "center" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 160 },
  tagText: { fontSize: 8.5, fontWeight: "800", fontFamily: FONT },
  linkText: { fontSize: 9.5, fontWeight: "800", color: A.brand, fontFamily: FONT },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 54, paddingHorizontal: 24 },
  emptyCard: {
    alignItems: "center", justifyContent: "center", paddingVertical: 70, paddingHorizontal: 24,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10,
  },
  emptyIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  emptyTitle: { fontSize: 13, fontWeight: "800", color: A.ink, textAlign: "center", fontFamily: FONT },
  emptyDesc: { fontSize: 10.5, color: A.muted, textAlign: "center", marginTop: 4, lineHeight: 16, fontFamily: FONT },

  moreBtn: {
    paddingVertical: 11, alignItems: "center",
    borderTopWidth: 1, borderTopColor: A.borderSoft, backgroundColor: A.surfaceAlt,
  },
  moreText: { fontSize: 10, fontWeight: "700", color: A.brandDark, fontFamily: FONT },

  linkBtn: {
    fontSize: 9.5, fontWeight: "800", color: A.brandDark, fontFamily: FONT,
    backgroundColor: A.brandSoft, borderColor: A.brandBorder, borderWidth: 1,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },

  footNote: { fontSize: 9, color: A.mutedSoft, lineHeight: 14, fontFamily: FONT, paddingHorizontal: 2 },
});
