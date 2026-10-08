import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar, { ChatHeaderButton } from "../components/TabBar";
import AppIcon from "../components/AppIcon";
import TodayCard from "../components/TodayCard";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R, shadow: SH } = theme;

const GRAY = C.inkMuted;
const RED = C.primary;
const BLUE = C.role.field;
const VIOLET = C.role.supervisor;
const GREEN = C.role.owner;
const ORANGE = C.role.telemarketing;

const ROLE_LABEL: any = { owner: "Owner", field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor" };

const LEAVE_TYPE_LABEL: any = { sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur" };
const LEAVE_SCOPE_LABEL: any = { tidak_masuk: "Tidak masuk", tidak_keliling: "Tidak keliling" };

// Urutan + warna area (area lain yang muncul di Sheet otomatis ikut tampil di bawahnya)
const AREA_ORDER = ["GLOBAL", "SOLO", "DIY", "SEMARANG", "TAB"];
const AREA_BG: any = { GLOBAL: C.chip.purple.bg, SOLO: C.chip.danger.bg, DIY: C.chip.info.bg, SEMARANG: C.chip.success.bg, TAB: C.chip.warning.bg };
const AREA_TX: any = { GLOBAL: C.chip.purple.fg, SOLO: C.chip.danger.fg, DIY: C.chip.info.fg, SEMARANG: C.chip.success.fg, TAB: C.chip.warning.fg };

// Target minimal kunjungan per sales per hari (bonus sampai 10 toko)
const TARGET_MIN = 7;
// Laporan ekspedisi lengkap (versi web)
const EKSPEDISI_WEB_URL = "https://laporan-app-phi.vercel.app/";

// Cache hasil fetch laporan 5 menit (hindari fetch Google Sheets tiap dashboard dibuka)
let pcpCache: { at: number; data: any } | null = null;
let pgCache: { at: number; data: any } | null = null;
let eksCache: { at: number; data: any } | null = null;

// Panel yang DIBUKA user. Kosong = semua tertutup (default saat app dibuka).
// Disimpan di memori modul supaya tidak reset saat pindah tab; hilang saat app ditutup.
let cardOpen: Record<string, boolean> = {};

// Baris paling BAWAH di Sheet dianggap paling baru (dipakai kalau tanggal hari ini belum ada)
const EKS_NEWEST_AT_BOTTOM = true;

function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}
const rupiah = (n?: number | null) => (n == null ? "-" : "Rp" + n.toLocaleString("id-ID"));
const fmtPct = (p: number | null) =>
  p == null ? "–" : p.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
const pctColor = (p: number | null) => (p == null ? C.inkFaint : p < 30 ? RED : p < 70 ? ORANGE : GREEN);

// ===== Kelompokin baris laporan per area (GLOBAL / SOLO / DIY / SEMARANG / TAB / lainnya) =====
function groupByArea(rows: any[]) {
  const map = new Map<string, any[]>();
  for (const r of rows) {
    const a = String(r.area ?? "").trim().toUpperCase() || "LAINNYA";
    const arr = map.get(a);
    if (arr) arr.push(r);
    else map.set(a, [r]);
  }
  return Array.from(map.keys())
    .sort((a, b) => {
      const ia = AREA_ORDER.indexOf(a);
      const ib = AREA_ORDER.indexOf(b);
      return (ia < 0 ? 90 : ia) - (ib < 0 ? 90 : ib) || a.localeCompare(b);
    })
    .map((area) => ({ area, rows: map.get(area) as any[] }));
}
const sumBy = (rows: any[], f: (r: any) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);

// ===== Hari ini (WIB) vs kolom tanggal Sheet (format apa pun) =====
function todayPatterns(): string[] {
  const n = new Date(Date.now() + 7 * 3600 * 1000);
  const dPad = String(n.getUTCDate()).padStart(2, "0");
  const dNoPad = String(n.getUTCDate());
  const mPad = String(n.getUTCMonth() + 1).padStart(2, "0");
  const mNoPad = String(n.getUTCMonth() + 1);
  const y = String(n.getUTCFullYear());
  const yy = y.slice(2);
  const out = new Set<string>();
  for (const dd of [dPad, dNoPad]) {
    for (const mm of [mPad, mNoPad]) {
      for (const yr of [y, yy]) {
        out.add(dd + mm + yr); // 10/09/2026
        out.add(yr + mm + dd); // 2026-09-10
      }
    }
  }
  out.add(dPad + mPad); // kolom tanpa tahun (10/09)
  return Array.from(out);
}
const digitsOf = (s: any) => String(s ?? "").replace(/\D/g, "");

export default function Beranda() {
  const router = useRouter();

  const viewer = useQuery(api.users.viewer) as any;
  const role = viewer?.role;
  const isField = role === "field";
  const isTele = role === "telemarketing";
  const isSuper = role === "supervisor";
  const isOwner = role === "owner";
  // Pemakai follow-up harian (piutang + SPK Sales H+1)
  const usesFu = isTele || isSuper || isOwner;

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayEnd = dayStart + 86400000 - 1;

  // ===== SELALU ditarik (dipakai di header/banner) =====
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  // todaySummary hanya dipakai panel sales lapangan — role lain jangan tarik data sia-sia
  const summary = useQuery(api.visits.todaySummary, isField ? {} : "skip") as any;


  // ==== Buka/tutup panel (minimize) — default: SEMUA TERTUTUP ====
  // (dipindah ke ATAS query supaya panel yang tertutup tidak menarik data)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(cardOpen);
  const isCardOpen = (id?: string) => (id ? !!openMap[id] : true);
  const toggleCard = (id: string) =>
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      cardOpen = next;
      return next;
    });

  // ← HEMAT Database I/O — data hanya ditarik untuk panel yang PERNAH dibuka.
  //   Sekali dibuka, panel dianggap "hidup" (data Convex tetap ter-cache).
  const opened = useRef<Set<string>>(new Set(Object.keys(cardOpen).filter((k) => cardOpen[k])));
  const need = (id: string) => {
    if (openMap[id]) opened.current.add(id);
    return opened.current.has(id);
  };

  // ==== Panel: Progres Kunjungan Sales (SPV/Owner) ====
  const live = useQuery(
    api.visits.listLiveSales,
    (isSuper || isOwner) && need("live") ? undefined : "skip"
  ) as any;

  // ==== Panel: Progres Kunjungan Area (telemarketing) ====
  const visitHist = useQuery(
    api.visits.listHistory,
    isTele && need("tele") ? { from: dayStart, to: dayEnd } : "skip"
  ) as any;

  // ==== Panel: Follow-up hari ini per area (piutang + SPK Sales H+1) ====
  // Telemarketing SELALU menarik (kartu tugas di atas butuh angkanya);
  // supervisor/owner tetap hemat: hanya saat panel "fu" dibuka.
  const fuOn = usesFu && (isTele || need("fu"));
  const piuFu = useQuery(api.piutang.todayByArea, fuOn ? {} : "skip") as any;
  const ordFu = useQuery(api.orderFollowups.todayByArea, fuOn ? {} : "skip") as any;
  // Nama petugas telemarketing per area (khusus supervisor)
  const manageUsers = useQuery(api.users.listUsersManage, isSuper && need("fu") ? {} : "skip") as any;

  // ==== Panel: FU Toko bulan ini ====
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, usesFu && need("futoko") ? {} : "skip") as any;

  const fetchPcp = useAction(api.laporan.fetchPcpBulanan);
  const fetchPg = useAction(api.laporan.fetchPcpMingguan);
  const fetchEks = useAction(api.laporan.fetchEkspedisi);
  const ensureOrder = useMutation(api.orderFollowups.ensureToday);

  // Sekali per buka beranda: pastikan daftar follow-up orderan hari ini sudah dibuat (idempoten)
  const genRef = useRef(false);
  useEffect(() => {
    if (!viewer || genRef.current || !usesFu) return;
    genRef.current = true;
    ensureOrder({}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  // ==== Fetch laporan (cache 5 mnt) — HANYA saat panelnya dibuka ====
  const [pcp, setPcp] = useState<any>(null);
  const [pcpState, setPcpState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [pg, setPg] = useState<any>(null);
  const [pgState, setPgState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [eks, setEks] = useState<any>(null);
  const [eksState, setEksState] = useState<"idle" | "loading" | "done" | "err">("idle");

  useEffect(() => {
    if (!viewer || !need("pcp")) return;
    if (pcpCache && Date.now() - pcpCache.at < 5 * 60 * 1000) {
      setPcp(pcpCache.data);
      setPcpState("done");
      return;
    }
    setPcpState("loading");
    fetchPcp()
      .then((r: any) => {
        pcpCache = { at: Date.now(), data: r };
        setPcp(r);
        setPcpState("done");
      })
      .catch(() => setPcpState("err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, openMap]);

  useEffect(() => {
    if (!viewer || !need("pg")) return;
    if (pgCache && Date.now() - pgCache.at < 5 * 60 * 1000) {
      setPg(pgCache.data);
      setPgState("done");
      return;
    }
    setPgState("loading");
    fetchPg()
      .then((r: any) => {
        pgCache = { at: Date.now(), data: r };
        setPg(r);
        setPgState("done");
      })
      .catch(() => setPgState("err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, openMap]);

  useEffect(() => {
    if (!viewer || !need("eks")) return;
    if (eksCache && Date.now() - eksCache.at < 5 * 60 * 1000) {
      setEks(eksCache.data);
      setEksState("done");
      return;
    }
    setEksState("loading");
    fetchEks()
      .then((r: any) => {
        eksCache = { at: Date.now(), data: r };
        setEks(r);
        setEksState("done");
      })
      .catch(() => setEksState("err"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, openMap]);

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const accent = isField ? RED : isTele ? ORANGE : VIOLET;
  const areaLabel = viewer.area ?? "Semua Area";
  const fmtTime = (ms: number | null) =>
    ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

  // ==== Follow-up hari ini per area ====
  // Area tetap (SOLO/DIY/SEMARANG) → tidak mungkin hilang walau tidak ada tugas atau ada yang izin
  type FuRow = { area: string; piuPending: number; piuDone: number; ordPending: number; ordDone: number };
  const FOLLOWUP_AREAS = ["SOLO", "DIY", "SEMARANG"];

  const fuMap = new Map<string, FuRow>(
    FOLLOWUP_AREAS.map((area) => [area, { area, piuPending: 0, piuDone: 0, ordPending: 0, ordDone: 0 }])
  );
  const fuBump = (area: string, k: "piuPending" | "piuDone" | "ordPending" | "ordDone", n: number) => {
    const key = String(area ?? "").trim().toUpperCase() || "LAINNYA";
    if (!fuMap.has(key)) fuMap.set(key, { area: key, piuPending: 0, piuDone: 0, ordPending: 0, ordDone: 0 });
    fuMap.get(key)![k] += Number(n ?? 0);
  };
  for (const r of (piuFu ?? [])) { fuBump(String(r.area), "piuPending", r.pending ?? 0); fuBump(String(r.area), "piuDone", r.done ?? 0); }
  for (const r of (ordFu ?? [])) { fuBump(String(r.area), "ordPending", r.pending ?? 0); fuBump(String(r.area), "ordDone", r.done ?? 0); }

  const fuAreas = Array.from(fuMap.values()).sort(
    (a, b) => FOLLOWUP_AREAS.indexOf(a.area) - FOLLOWUP_AREAS.indexOf(b.area) || a.area.localeCompare(b.area)
  );
  const fuTotalPending = fuAreas.reduce((s, a) => s + a.piuPending + a.ordPending, 0);
  const fuTotalDone = fuAreas.reduce((s, a) => s + a.piuDone + a.ordDone, 0);
  const fuReady = usesFu && piuFu !== undefined && ordFu !== undefined;

  // ==== Telemarketing: ringkasan tugas AREA SENDIRI (bukan 3 area) ====
  const myAreaKey = String(viewer.area ?? "").trim().toUpperCase();
  const telePiu = (piuFu ?? []).find((r: any) => String(r.area ?? "").trim().toUpperCase() === myAreaKey);
  const teleOrd = (ordFu ?? []).find((r: any) => String(r.area ?? "").trim().toUpperCase() === myAreaKey);
  const telePiuPending = Number(telePiu?.pending ?? 0);
  const teleOrdPending = Number(teleOrd?.pending ?? 0);
  const telePiuDone = Number(telePiu?.done ?? 0);
  const teleOrdDone = Number(teleOrd?.done ?? 0);
  const telePending = telePiuPending + teleOrdPending;
  const teleDone = telePiuDone + teleOrdDone;
  const teleTotal = telePending + teleDone;
  const telePct = teleTotal > 0 ? Math.round((teleDone / teleTotal) * 100) : 100;
  const fuLoading = usesFu && (piuFu === undefined || ordFu === undefined);

  const teleByArea: Record<string, string> = {};
  for (const u of (manageUsers ?? [])) {
    if (u.role === "telemarketing" && u.area) teleByArea[u.area] = u.name;
  }
  const petugasOf = (area: string) => (isTele ? (viewer.name ?? "") : (teleByArea[area] ?? ""));


  // (Telemarketing tidak memakai kartu kecil ini — diganti Kartu Tugas di bawah)

  // ==== Progres sales — yang izin ditaruh paling bawah, sekalian hitung ringkasannya ====
  const liveRows = [...((live ?? []) as any[])].sort(
    (a, b) =>
      Number(!!a.leave) - Number(!!b.leave) ||
      String(a.sales?.area ?? "").localeCompare(String(b.sales?.area ?? "")) ||
      String(a.sales?.name ?? "").localeCompare(String(b.sales?.name ?? ""))
  );
  const liveLeave = liveRows.filter((s) => !!s.leave).length;
  const liveActive = liveRows.length - liveLeave;

  // ==== Field: progres + target harian ====
  const fieldDone = summary?.doneCount ?? 0;
  const fieldPos = fieldDone + (ongoing?.visit ? 1 : 0);
  const fieldOk = fieldPos >= TARGET_MIN;
  const fieldPctBar = Math.min(100, Math.round((fieldPos / TARGET_MIN) * 100));

  // ==== Pencapaian bulanan per area ====
  // field & telemarketing: hanya area sendiri. supervisor/owner: semua
  // (GLOBAL, SOLO, DIY, SEMARANG, TAB).
  const canSeeAllArea = isSuper || isOwner;
  const myAreaUp = String(viewer.area ?? "").trim().toUpperCase();
  const filterMyArea = (rows: any[] | null) => {
    if (!rows) return rows;
    if (canSeeAllArea) return rows;
    if (!myAreaUp) return [];
    return rows.filter((r: any) => String(r.area ?? "").trim().toUpperCase() === myAreaUp);
  };

  const pcpRows = filterMyArea(pcp?.rows ?? null);
  const pcpGroups = pcpRows
    ? groupByArea(pcpRows).map((g) => {
      const tgt = sumBy(g.rows, (r) => r.tgt || 0);
      const act = sumBy(g.rows, (r) => r.act || 0);
      const kejar = sumBy(g.rows, (r) => r.kejar || 0);
      const pcts = g.rows.map((r) => r.pcpPct).filter((p: any) => typeof p === "number") as number[];
      const pct = tgt > 0 ? (act / tgt) * 100 : pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
      return { area: g.area, sdm: g.rows.length, tgt, act, kejar, pct };
    })
    : [];

  // ==== Pencapaian mingguan M1-M5 per area ====
  const pgRows = filterMyArea(pg?.rows ?? null);
  const weekLabels: string[] = pg?.weekLabels ?? ["M1", "M2", "M3", "M4", "M5"];
  const pgGroups = pgRows
    ? groupByArea(pgRows).map((g) => {
      const weeks = weekLabels.map((lbl, i) => {
        let act = 0;
        const pcts: number[] = [];
        for (const r of g.rows) {
          const w = (r.weeks ?? [])[i];
          if (!w) continue;
          act += w.act || 0;
          if (typeof w.pct === "number") pcts.push(w.pct);
        }
        const pct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
        return { label: lbl, act, pct };
      });
      return { area: g.area, sdm: g.rows.length, weeks };
    })
    : [];

  // ==== Ekspedisi: HANYA tanggal hari ini (fallback: tanggal terbaru di Sheet) ====
  const eksRows: any[] = (eks?.detail ?? []).flatMap((g: any) => g.rows ?? []);
  const eksPats = todayPatterns();
  const matchToday = (t: any) => {
    const dg = digitsOf(t);
    return !!dg && eksPats.some((p) => dg === p || dg.startsWith(p));
  };
  const eksToday = eksRows.filter((r: any) => matchToday(r.tanggal));
  const rawDates: string[] = [];
  for (const r of eksRows) {
    const t = String(r.tanggal ?? "").trim();
    if (t && !rawDates.includes(t)) rawDates.push(t);
  }
  const lastDate = rawDates.length
    ? (EKS_NEWEST_AT_BOTTOM ? rawDates[rawDates.length - 1] : rawDates[0])
    : "";
  const eksShown: any[] = eksToday.length > 0
    ? eksToday
    : lastDate
      ? eksRows.filter((r: any) => String(r.tanggal ?? "").trim() === lastDate)
      : [];
  const eksIsToday = eksToday.length > 0;
  const eksLabel = eksShown.length ? String(eksShown[0]?.tanggal ?? "").trim() : "";

  const eksArmadaCount: Record<string, number> = {};
  for (const r of eksShown) {
    const a = r.armada || "Tanpa Armada";
    eksArmadaCount[a] = (eksArmadaCount[a] || 0) + 1;
  }
  const eksArmadaList = Object.keys(eksArmadaCount)
    .sort((a, b) => a.localeCompare(b))
    .map((a) => ({ armada: a, count: eksArmadaCount[a] }));
  const eksMax = eksArmadaList.reduce((m: number, a: any) => Math.max(m, a.count), 0) || 1;
  const eksTunai = eksShown.reduce((s: number, r: any) => s + (r.tunai || 0), 0);
  const eksTransfer = eksShown.reduce((s: number, r: any) => s + (r.transfer || 0), 0);

  // Panel beranda: judulnya bisa diketuk untuk dibuka/tutup + ringkasan singkat saat tertutup
  const SectionCard = ({ icon, title, id, summary, children }: any) => {
    const isOpen = isCardOpen(id);
    return (
      <View style={styles.sectionCard}>
        <TouchableOpacity
          style={[styles.secTitleRow, isOpen && { marginBottom: 8 }]}
          activeOpacity={0.7}
          onPress={() => toggleCard(id)}
        >
          <View style={styles.secIconBubble}>
            <AppIcon name={icon} size={15} color={C.primary} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={{ flex: 1 }} />
          {!isOpen && summary ? (
            <Text style={styles.secSummary} numberOfLines={1}>{summary}</Text>
          ) : null}
          <Text style={styles.secChevron}>{isOpen ? "▾" : "▸"}</Text>
        </TouchableOpacity>
        {isOpen ? children : null}
      </View>
    );
  };

  const Row = ({ left, right, rightColor }: any) => (
    <View style={styles.row}>
      <Text style={styles.rowLeft}>{left}</Text>
      <Text style={[styles.rowRight, rightColor ? { color: rightColor } : null]}>{right}</Text>
    </View>
  );

  // Kartu per area (PCP bulanan & mingguan) — juga bisa ditutup satu-satu
  const AreaCard = ({ id, area, summary, children }: any) => {
    const isOpen = isCardOpen(id);
    const label =
      area === "GLOBAL" ? "GLOBAL • ALL AREA"
        : area === "TAB" ? "TAB • CABANG"
          : area;
    return (
      <View style={styles.areaCard}>
        <TouchableOpacity
          style={[styles.areaCardHead, isOpen && { marginBottom: 10 }]}
          activeOpacity={0.7}
          onPress={() => toggleCard(id)}
        >
          <View style={[styles.areaChip, { backgroundColor: AREA_BG[area] ?? C.chip.neutral.bg }]}>
            <Text style={[styles.areaChipText, { color: AREA_TX[area] ?? C.chip.neutral.fg }]}>{label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {summary ? <Text style={styles.sdmText} numberOfLines={1}>{summary}</Text> : null}
          <Text style={styles.secChevron}>{isOpen ? "▾" : "▸"}</Text>
        </TouchableOpacity>
        {isOpen ? children : null}
      </View>
    );
  };
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
        <Text style={styles.greet}>Halo, {viewer.name}</Text>
        <Text style={styles.meta}>{ROLE_LABEL[role] ?? role} • {areaLabel}</Text>
        <ChatHeaderButton />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>

        {ongoing?.visit ? (
          <TouchableOpacity style={styles.banner} onPress={() => router.push(`/visit/${ongoing.visit._id}`)}>
            <View style={styles.secTitleRow}>
              <AppIcon name="timer" size={15} color={C.status.danger.fg} style={{ marginRight: 6 }} />
              <Text style={styles.bannerTitle}>Kunjungan berjalan</Text>
            </View>
            <Text style={styles.bannerText}>{ongoing.store?.name} — sejak {fmtTime(ongoing.visit.checkinAt)}. Ketuk untuk lanjut</Text>
          </TouchableOpacity>
        ) : null}

        {/* ===== KARTU TUGAS (telemarketing) ===== */}
        {isTele ? (
          <TouchableOpacity
            style={styles.taskCard}
            activeOpacity={0.85}
            onPress={() => router.push("/spk?sec=admin" as any)}
          >
            <View style={styles.taskTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.taskLabel}>TUGAS FOLLOW-UP HARI INI • {areaLabel}</Text>
                <Text style={[styles.taskValue, { color: fuLoading ? GRAY : telePending > 0 ? ORANGE : GREEN }]}>
                  {fuLoading ? "…" : telePending}
                </Text>
                <Text style={styles.taskSub}>
                  {fuLoading
                    ? "Memuat data tugas…"
                    : telePending === 0
                      ? (teleTotal > 0 ? "Semua tugas hari ini sudah beres ✓" : "Belum ada tugas follow-up hari ini")
                      : `${telePending} belum selesai • ${teleDone} dari ${teleTotal} selesai`}
                </Text>
              </View>
              <View style={styles.taskArrowBox}><Text style={styles.taskArrow}>›</Text></View>
            </View>

            <View style={styles.barBg}>
              <View
                style={[styles.barFill, {
                  width: ((fuLoading ? 0 : telePct) + "%") as any,
                  backgroundColor: telePending > 0 ? ORANGE : GREEN,
                }]}
              />
            </View>

            <View style={styles.taskBreak}>
              <View style={styles.taskBreakBox}>
                <Text style={styles.miniLabel}>PIUTANG</Text>
                <Text style={[styles.taskBreakNum, { color: telePiuPending > 0 ? RED : GREEN }]}>
                  {fuLoading ? "…" : telePiuPending}
                </Text>
                <Text style={styles.taskBreakSub}>{fuLoading ? " " : `${telePiuDone} selesai`}</Text>
              </View>
              <View style={[styles.taskBreakBox, { marginRight: 0 }]}>
                <Text style={styles.miniLabel}>SPK SALES H+1</Text>
                <Text style={[styles.taskBreakNum, { color: teleOrdPending > 0 ? RED : GREEN }]}>
                  {fuLoading ? "…" : teleOrdPending}
                </Text>
                <Text style={styles.taskBreakSub}>{fuLoading ? " " : `${teleOrdDone} selesai`}</Text>
              </View>
            </View>

            <Text style={styles.taskCta}>Ketuk untuk buka SPK Admin dan kerjakan ›</Text>
          </TouchableOpacity>
        ) : null}


        {/* ===== HARI INI + PERLU TINDAKAN + IZIN HARI INI (khusus supervisor) ===== */}
        {isSuper ? <TodayCard /> : null}

        {/* ===== PROGRES KUNJUNGAN SALES (supervisor/owner) ===== */}
        {isSuper || isOwner ? (
          <SectionCard
            icon="users"
            title="Progres Kunjungan Sales"
            id="live"
            summary={live === undefined ? "–" : `${liveActive} aktif • ${liveLeave} izin`}
          >
            {live === undefined ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
            ) : liveRows.length === 0 ? (
              <Text style={styles.meta}>Belum ada data sales hari ini.</Text>
            ) : (
              liveRows.map((s: any) => {
                const excused = !!s.leave;
                const pos = s.todayDoneCount + (s.state === "visit" ? 1 : 0);
                const pct = excused ? 100 : Math.min(100, Math.round((pos / TARGET_MIN) * 100));
                const ok = !excused && pos >= TARGET_MIN;
                const color = excused ? C.chip.warning.fg : ok ? GREEN : ORANGE;
                const leaveLabel = excused
                  ? `${LEAVE_TYPE_LABEL[s.leave.type] ?? s.leave.type} • ${LEAVE_SCOPE_LABEL[s.leave.scope] ?? s.leave.scope}`
                  : "";
                return (
                  <View key={s.sales._id} style={[styles.liveCard, excused && styles.liveCardLeave]}>
                    <View style={styles.liveHead}>
                      <View style={[styles.dot, excused ? styles.dotLeave : s.state === "visit" ? styles.dotOn : styles.dotOff]} />
                      <Text style={styles.liveName} numberOfLines={1}>{s.sales.name}</Text>
                      {s.sales.area ? <Text style={styles.areaTxt}>  {s.sales.area}</Text> : null}
                      <View style={{ flex: 1 }} />
                      {excused ? (
                        <View style={styles.leaveBadge}>
                          <Text style={styles.leaveBadgeText}>IZIN</Text>
                        </View>
                      ) : (
                        <Text style={[styles.progTxt, { color }]}>
                          {pos}/{TARGET_MIN}{ok ? "  ✓" : ""}
                        </Text>
                      )}
                    </View>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: (pct + "%") as any, backgroundColor: excused ? C.chip.warning.fg : color }]} />
                    </View>
                    <Text style={styles.liveInfo} numberOfLines={2}>
                      {excused
                        ? `${leaveLabel}${s.leave.note ? ` • ${s.leave.note}` : ""} • dikecualikan dari target ${TARGET_MIN}`
                        : s.state === "visit"
                          ? `Sedang di ${s.storeName ?? "Toko"} sejak ${s.checkinAt ? fmtTime(s.checkinAt) : "-"} • kunjungan ke-${pos}`
                          : s.todayDoneCount > 0
                            ? `${s.todayDoneCount} kunjungan selesai${pos < TARGET_MIN ? ` • kurang ${TARGET_MIN - pos} lagi` : " • target tercapai"}`
                            : "Belum mulai kunjungan"}
                    </Text>
                    {s.todayDoneCount > 0 ? (
                      <View style={styles.chipRowWrap}>
                        <View style={[styles.miniChip, { backgroundColor: C.chip.success.bg }]}>
                          <Text style={[styles.miniChipText, { color: C.chip.success.fg }]}>Order {s.orderedCount ?? 0}</Text>
                        </View>
                        <View style={[styles.miniChip, { backgroundColor: C.chip.danger.bg }]}>
                          <Text style={[styles.miniChipText, { color: C.chip.danger.fg }]}>Tidak {s.notOrderedCount ?? 0}</Text>
                        </View>
                        <View style={[styles.miniChip, { backgroundColor: C.chip.neutral.bg }]}>
                          <Text style={[styles.miniChipText, { color: C.chip.neutral.fg }]}>Tutup {s.closedCount ?? 0}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
            <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/izin")}>
              <Text style={styles.btnSmallText}>Kelola Izin Sales</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              Target minimal {TARGET_MIN} toko/hari. Sales berizin tidak dihitung kurang.
            </Text>
          </SectionCard>
        ) : null}

        {/* ===== PROGRES KUNJUNGAN HARI INI (field) ===== */}
        {isField ? (
          <SectionCard icon="store" title="Progres Kunjungan Hari Ini" id="field" summary={!summary ? "–" : `${fieldPos}/${TARGET_MIN} toko`}>
            <Row
              left="Target harian"
              right={`${fieldPos}/${TARGET_MIN}${fieldOk ? " ✓" : ""}`}
              rightColor={fieldOk ? GREEN : ORANGE}
            />
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: (fieldPctBar + "%") as any, backgroundColor: fieldOk ? GREEN : ORANGE }]} />
            </View>
            <Row left="Kunjungan selesai" right={summary ? String(fieldDone) : "–"} rightColor={GREEN} />
            <Row left="Total durasi" right={summary ? fmtDur(summary.durMs ?? 0) : "–"} rightColor={accent} />
            <Row left="Kunjungan berjalan" right={ongoing?.visit ? "1 aktif" : "Tidak ada"} rightColor={ongoing?.visit ? RED : GRAY} />
            <Text style={styles.hint}>Daftar toko kunjungan ada di tab SPK → SPK Sales.</Text>
          </SectionCard>
        ) : null}

        {/* ===== PROGRES KUNJUNGAN AREA (telemarketing) ===== */}
        {isTele ? (
          <SectionCard icon="store" title="Progres Kunjungan Area (hari ini)" id="tele" summary={visitHist === undefined ? "–" : `${(visitHist ?? []).length} kunjungan`}>
            {visitHist === undefined ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
            ) : (visitHist ?? []).length === 0 ? (
              <Text style={styles.meta}>Belum ada kunjungan sales di area {areaLabel} hari ini.</Text>
            ) : (
              (visitHist ?? []).slice(0, 5).map((it: any) => (
                <View key={it.visit._id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveName} numberOfLines={1}>{it.store?.name ?? "Toko terhapus"}</Text>
                    <Text style={styles.liveInfo}>{it.salesName || "-"} • {fmtTime(it.visit.checkinAt)}</Text>
                  </View>
                </View>
              ))
            )}
            <Text style={styles.hint}>Riwayat lengkap ada di tab SPK → Riwayat.</Text>
          </SectionCard>
        ) : null}

        {/* ===== FOLLOW-UP HARI INI PER AREA ===== */}
        {usesFu ? (
          <SectionCard
            icon="phone"
            title={isTele ? "Follow-up Hari Ini (area kamu)" : "Follow-up Hari Ini per Area"}
            id="fu"
            summary={
              isTele
                ? (fuLoading ? "–" : `${telePending} belum · ${teleDone} selesai`)
                : (!fuReady ? "–" : `${fuTotalPending} belum · ${fuTotalDone} selesai`)
            }
          >
            {fuLoading ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
            ) : fuTotalPending === 0 && fuTotalDone === 0 ? (
              <Text style={styles.meta}>Belum ada follow-up untuk hari ini.</Text>
            ) : (
              <>
                {isSuper || isOwner ? (
                  <View style={styles.fuTotalBox}>
                    <Text style={styles.fuTotalLabel}>TOTAL SEMUA AREA</Text>
                    <Text
                      style={[styles.fuTotalValue, { color: fuTotalPending > 0 ? ORANGE : GREEN }]}
                      numberOfLines={1}
                    >
                      {fuTotalPending} belum · {fuTotalDone} selesai
                    </Text>
                  </View>
                ) : null}

                {(isTele ? fuAreas.filter((a) => a.area.trim().toUpperCase() === myAreaKey) : fuAreas).map((a) => {
                  const petugas = petugasOf(a.area);
                  const piuOk = a.piuPending === 0;
                  const ordOk = a.ordPending === 0;
                  const allOk = piuOk && ordOk;
                  const notStarted = (a.piuPending + a.ordPending) > 0 && (a.piuDone + a.ordDone) === 0;
                  const chip = notStarted ? C.chip.danger : allOk ? C.chip.success : C.chip.warning;
                  const chipLabel = notStarted ? "belum mulai" : allOk ? "beres" : "diproses";
                  return (
                    <View key={a.area} style={styles.areaCard}>
                      <View style={styles.areaCardHead}>
                        <View style={[styles.areaChip, { backgroundColor: AREA_BG[a.area] ?? C.chip.neutral.bg }]}>
                          <Text style={[styles.areaChipText, { color: AREA_TX[a.area] ?? C.chip.neutral.fg }]}>{a.area}</Text>
                        </View>
                        <Text style={styles.fuWho} numberOfLines={1}>
                          {petugas || "petugas belum diset"}
                        </Text>
                        <View style={[styles.miniChip, { backgroundColor: chip.bg, marginRight: 0 }]}>
                          <Text style={[styles.miniChipText, { color: chip.fg }]}>{chipLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.fuMiniRow}>
                        <View style={styles.fuMiniBox}>
                          <Text style={styles.miniLabel}>PIUTANG</Text>
                          <Text style={[styles.fuNum, { color: piuOk ? GREEN : RED }]}>{a.piuPending} belum</Text>
                          <Text style={styles.fuSub}>{a.piuDone} selesai</Text>
                        </View>
                        <View style={[styles.fuMiniBox, { marginRight: 0 }]}>
                          <Text style={styles.miniLabel}>SPK SALES H+1</Text>
                          <Text style={[styles.fuNum, { color: ordOk ? GREEN : RED }]}>{a.ordPending} belum</Text>
                          <Text style={styles.fuSub}>{a.ordDone} selesai</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
            <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/spk?sec=admin" as any)}>
              <Text style={styles.btnSmallText}>Buka SPK Admin</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>SPK Sales H+1 = follow-up orderan dari kunjungan sales kemarin.</Text>
          </SectionCard>
        ) : null}

        {/* ===== FU TOKO: OPEN / INPG / CLSD ===== */}
        {usesFu ? (
          <SectionCard
            icon="store"
            title="FU Toko (bulan ini)"
            id="futoko"
            summary={fuToko ? `${fuToko.pending} belum` : "–"}
          >
            {fuToko === undefined ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
            ) : !fuToko ? (
              <Text style={styles.hint}>Tidak ada data FU Toko.</Text>
            ) : (
              <>
                <Row left="Total tugas" right={String(fuToko.total)} />
                <Row left="OPEN (belum dihubungi)" right={String(fuToko.open)} rightColor={fuToko.open > 0 ? RED : GRAY} />
                <Row left="INPG (menunggu review)" right={String(fuToko.inpg)} rightColor={fuToko.inpg > 0 ? ORANGE : GRAY} />
                <Row left="CLSD (disetujui)" right={String(fuToko.clsd)} rightColor={GREEN} />
                <Text style={styles.hint}>
                  Periode {fuToko.monthKey}{fuToko.area ? ` • ${fuToko.area}` : " • semua area"}.
                  {fuToko.pending > 0 ? ` Masih ${fuToko.pending} toko belum CLSD.` : " Semua sudah CLSD 👍"}
                </Text>
                <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/toko-aktif" as any)}>
                  <Text style={styles.btnSmallText}>Buka FU Toko</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnSmall, { marginTop: 8 }]} onPress={() => router.push("/fu-toko-riwayat" as any)}>
                  <Text style={styles.btnSmallText}>Riwayat FU Toko per Bulan</Text>
                </TouchableOpacity>
              </>
            )}
          </SectionCard>
        ) : null}

        {/* ===== PENCAPAIAN BULANAN PER AREA ===== */}
        <SectionCard
          icon="trend"
          title="Pencapaian Bulanan per Area"
          id="pcp"
          summary={!pcpRows ? "–" : `${pcpGroups.length} area`}
        >
          {!canSeeAllArea ? (
            <Text style={styles.hint}>Menampilkan area {myAreaUp || "-"} saja.</Text>
          ) : null}
          {pcpState === "loading" ? (
            <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
          ) : pcpState === "err" || !pcpRows || pcpRows.length === 0 ? (
            <View>
              <Text style={styles.meta}>Data belum tersedia.</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/laporan-pcp")}>
                <Text style={styles.btnSmallText}>Buka Laporan PCP</Text>
              </TouchableOpacity>
            </View>
          ) : (
            pcpGroups.map((g) => (
              <AreaCard
                key={g.area}
                id={`pcp-${g.area}`}
                area={g.area}
                summary={isCardOpen(`pcp-${g.area}`) ? `${g.sdm} SDM` : `${fmtPct(g.pct)} • ${g.sdm} SDM`}
              >
                <View style={styles.monthHero}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.heroLabel}>AKTUAL</Text>
                    <Text
                      style={styles.heroValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {rupiah(g.act)}
                    </Text>
                    <Text style={styles.targetHint}>dari target {rupiah(g.tgt)}</Text>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: pctColor(g.pct) + "18" }]}>
                    <Text style={[styles.pctBadgeText, { color: pctColor(g.pct) }]}>{fmtPct(g.pct)}</Text>
                  </View>
                </View>

                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: (Math.min(100, Math.max(0, g.pct ?? 0)) + "%") as any,
                        backgroundColor: pctColor(g.pct),
                      },
                    ]}
                  />
                </View>

                <View style={styles.monthMiniRow}>
                  <View style={styles.monthMiniBox}>
                    <Text style={styles.miniLabel}>TARGET</Text>
                    <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit>
                      {rupiah(g.tgt)}
                    </Text>
                  </View>
                  <View style={[styles.monthMiniBox, { marginRight: 0 }]}>
                    <Text style={styles.miniLabel}>RP KEJAR</Text>
                    <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit>
                      {rupiah(g.kejar)}
                    </Text>
                  </View>
                </View>
              </AreaCard>
            ))
          )}
        </SectionCard>

        {/* ===== PENCAPAIAN MINGGUAN M1-M5 PER AREA ===== */}
        <SectionCard
          icon="calendar"
          title="Pencapaian Mingguan M1–M5 per Area"
          id="pg"
          summary={!pgRows ? "–" : `${pgGroups.length} area`}
        >
          {!canSeeAllArea ? (
            <Text style={styles.hint}>Menampilkan area {myAreaUp || "-"} saja.</Text>
          ) : null}
          {pgState === "loading" ? (
            <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
          ) : pgState === "err" || !pgRows || pgRows.length === 0 ? (
            <View>
              <Text style={styles.meta}>Data belum tersedia.</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => router.push("/laporan-pcp-mingguan")}>
                <Text style={styles.btnSmallText}>Buka PCP Mingguan</Text>
              </TouchableOpacity>
            </View>
          ) : (
            pgGroups.map((g) => (
              <AreaCard key={g.area} id={`pg-${g.area}`} area={g.area} summary={`${g.sdm} SDM`}>
                <View style={styles.weekRow}>
                  {g.weeks.map((w: any, i: number) => (
                    <View
                      key={w.label}
                      style={[styles.weekBox, i === g.weeks.length - 1 && { marginRight: 0 }]}
                    >
                      <Text style={styles.weekLabel}>{w.label}</Text>
                      <Text style={[styles.weekPct, { color: pctColor(w.pct) }]} numberOfLines={1}>
                        {fmtPct(w.pct)}
                      </Text>
                      <View style={styles.weekBarBg}>
                        <View
                          style={[
                            styles.weekBarFill,
                            {
                              width: (Math.min(100, Math.max(0, w.pct ?? 0)) + "%") as any,
                              backgroundColor: pctColor(w.pct),
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </AreaCard>
            ))
          )}
        </SectionCard>

        {/* ===== EKSPEDISI: hanya tanggal hari ini ===== */}
        <SectionCard
          icon={isSuper || isOwner ? "cash" : "box"}
          title="Kiriman Ekspedisi Hari Ini"
          id="eks"
          summary={!eks ? "–" : `${eksShown.length} kiriman`}
        >
          {eksState === "loading" ? (
            <ActivityIndicator size="small" color={RED} style={{ marginVertical: 8 }} />
          ) : eksState === "err" || !eks ? (
            <Text style={styles.meta}>Data belum tersedia.</Text>
          ) : (
            <>
              {/* Uang: hanya supervisor/owner */}
              {isSuper || isOwner ? (
                <View style={styles.monthMiniRow}>
                  <View style={styles.monthMiniBox}>
                    <Text style={styles.miniLabel}>TOTAL TUNAI</Text>
                    <Text
                      style={[styles.miniValue, { color: GREEN }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {rupiah(eksTunai)}
                    </Text>
                  </View>
                  <View style={[styles.monthMiniBox, { marginRight: 0 }]}>
                    <Text style={styles.miniLabel}>TOTAL TRANSFER</Text>
                    <Text
                      style={[styles.miniValue, { color: BLUE }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {rupiah(eksTransfer)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Jumlah kiriman & armada */}
              <View style={styles.monthMiniRow}>
                <View style={styles.monthMiniBox}>
                  <Text style={styles.miniLabel}>KIRIMAN</Text>
                  <Text style={styles.miniValue}>{eksShown.length}</Text>
                </View>
                <View style={[styles.monthMiniBox, { marginRight: 0 }]}>
                  <Text style={styles.miniLabel}>ARMADA</Text>
                  <Text style={styles.miniValue}>{eksArmadaList.length}</Text>
                </View>
              </View>

              {/* Rincian per armada */}
              <View style={styles.areaCard}>
                <View style={styles.areaCardHead}>
                  <View style={[styles.areaChip, { backgroundColor: C.chip.info.bg }]}>
                    <Text style={[styles.areaChipText, { color: C.chip.info.fg }]}>PER ARMADA</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.sdmText} numberOfLines={1}>
                    {eksShown.length > 0 ? eksLabel : "hari ini"}
                  </Text>
                </View>

                {eksShown.length === 0 ? (
                  <Text style={styles.meta}>Belum ada kiriman untuk tanggal hari ini.</Text>
                ) : (
                  eksArmadaList.map((a) => (
                    <View key={a.armada} style={styles.eksArmadaWrap}>
                      <View style={styles.eksRowTop}>
                        <Text style={styles.eksArmada} numberOfLines={1}>{a.armada}</Text>
                        <Text style={styles.eksCount}>{a.count} kiriman</Text>
                      </View>
                      <View style={styles.eksBarBg}>
                        <View
                          style={[
                            styles.eksBarFill,
                            { width: (Math.round((a.count / eksMax) * 100) + "%") as any },
                          ]}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>

              {!eksIsToday && eksShown.length > 0 ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>
                    Tanggal hari ini belum ada di Sheet — menampilkan data terbaru ({eksLabel}).
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity style={styles.btnWeb} onPress={() => Linking.openURL(EKSPEDISI_WEB_URL)}>
                <Text style={styles.btnWebText}>Buka Laporan Ekspedisi Lengkap (Web)</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>Sumber: Google Sheets — diperbarui otomatis tiap 5 menit.</Text>
            </>
          )}
        </SectionCard>

        {/* ===== AKSES CEPAT ===== */}
        <Text style={styles.gridLabel}>Akses Cepat</Text>
        <View style={styles.grid}>
          {(isField || isSuper) ? (
            <TouchableOpacity style={styles.action} onPress={() => router.push("/toko-baru")}>
              <View style={styles.actionBubble}><AppIcon name="store" size={19} color={C.primary} /></View>
              <Text style={styles.actionLabel}>Toko Baru</Text>
              <Text style={styles.actionDesc} numberOfLines={2}>Daftarkan toko baru</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.action} onPress={() => router.push("/kelola-toko")}>
            <View style={[styles.actionBubble, { backgroundColor: C.chip.info.bg }]}>
              <AppIcon name="store" size={19} color={C.chip.info.fg} />
            </View>
            <Text style={styles.actionLabel}>Kelola Toko</Text>
            <Text style={styles.actionDesc} numberOfLines={2}>Cari & lihat data toko (mode lihat)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => router.push("/riwayat")}>
            <View style={[styles.actionBubble, { backgroundColor: C.chip.purple.bg }]}>
              <AppIcon name="calendar" size={19} color={C.chip.purple.fg} />
            </View>
            <Text style={styles.actionLabel}>Riwayat</Text>
            <Text style={styles.actionDesc} numberOfLines={2}>Riwayat kunjungan & follow-up</Text>
          </TouchableOpacity>
          {isOwner ? (
            <TouchableOpacity style={styles.action} onPress={() => router.push("/laporan")}>
              <View style={[styles.actionBubble, { backgroundColor: C.chip.success.bg }]}>
                <AppIcon name="chart" size={19} color={C.chip.success.fg} />
              </View>
              <Text style={styles.actionLabel}>Laporan</Text>
              <Text style={styles.actionDesc} numberOfLines={2}>PCP, DAP & target toko</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <TabBar active="beranda" />
    </View>
  );
}
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: C.surfaceTint,
    borderBottomLeftRadius: R.xl, borderBottomRightRadius: R.xl,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: SH.elevation,
  },
  brand: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1, textTransform: "uppercase" },
  greet: { fontSize: 23, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 3 },
  headerTop: { flexDirection: "row", alignItems: "flex-start" },

  banner: { backgroundColor: C.status.danger.bg, borderRadius: R.md, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.status.danger.border },
  bannerTitle: { color: C.status.danger.fg, fontWeight: "800", fontSize: 14 },
  bannerText: { color: C.status.danger.fg, fontSize: 13, marginTop: 6 },

  statRow: { flexDirection: "row", marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginRight: 10,
    borderWidth: 1, borderColor: C.divider,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: 2,
  },
  statAccent: { width: 22, height: 4, borderRadius: R.pill, marginBottom: 10 },
  statValue: { fontSize: 24, fontWeight: "900", letterSpacing: -0.3 },
  statLabel: { fontSize: 12, color: C.inkMuted, marginTop: 4, fontWeight: "600" },

  // ===== Kartu Tugas (telemarketing) =====
  taskCard: {
    backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 14,
    borderWidth: 1.5, borderColor: ORANGE,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: SH.elevation,
  },
  taskTop: { flexDirection: "row", alignItems: "flex-start" },
  taskLabel: { fontSize: 10, fontWeight: "900", color: ORANGE, letterSpacing: 0.5 },
  taskValue: { fontSize: 40, fontWeight: "900", marginTop: 2, lineHeight: 44 },
  taskSub: { fontSize: 12.5, color: GRAY, marginTop: 2, lineHeight: 18 },
  taskArrowBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  taskArrow: { fontSize: 20, fontWeight: "900", color: C.inkSoft, marginTop: -2 },
  taskBreak: { flexDirection: "row", marginTop: 12 },
  taskBreakBox: { flex: 1, minWidth: 0, backgroundColor: C.surfaceAlt, borderRadius: R.md, paddingVertical: 9, paddingHorizontal: 10, marginRight: 8 },
  taskBreakNum: { fontSize: 20, fontWeight: "900", marginTop: 1 },
  taskBreakSub: { fontSize: 11, color: GRAY, marginTop: 1 },
  taskCta: { fontSize: 12, fontWeight: "800", color: ORANGE, marginTop: 12 },

  sectionCard: {
    backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: C.divider,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: SH.elevation,
  },
  secTitleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  secIconBubble: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: C.ink, letterSpacing: 0.1 },
  secSummary: { fontSize: 11, color: C.inkMuted, fontWeight: "700", marginRight: 8, flexShrink: 1 },
  secChevron: { fontSize: 12, color: C.inkFaint, fontWeight: "900", marginLeft: 6 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  rowLeft: { fontSize: 13, color: C.inkSoft, fontWeight: "600", flex: 1, marginRight: 8 },
  rowRight: { fontSize: 14, fontWeight: "800", color: C.ink },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  dotOn: { backgroundColor: ORANGE },
  dotOff: { backgroundColor: GREEN },
  dotLeave: { backgroundColor: C.chip.warning.fg },
  liveName: { fontSize: 14, fontWeight: "700", color: C.ink },
  liveInfo: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  areaTxt: { fontSize: 11, fontWeight: "700", color: C.inkMuted },
  hint: { fontSize: 11, color: C.inkMuted, marginTop: 10, fontStyle: "italic" },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },

  btnSmall: { backgroundColor: C.status.neutral.bg, borderRadius: R.md, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  btnSmallText: { color: C.status.neutral.fg, fontWeight: "800", fontSize: 13 },
  gridLabel: { fontSize: 15, fontWeight: "800", color: C.ink, marginTop: 20, marginBottom: 10 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  action: {
    width: "48.5%", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.divider,
    shadowColor: SH.color, shadowOpacity: SH.opacity, shadowRadius: SH.radius, elevation: 2,
  },
  actionBubble: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  actionLabel: { fontSize: 14, fontWeight: "800", color: C.ink, marginTop: 4 },
  actionDesc: { fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 16 },

  // ===== Kartu progres per sales =====
  liveCard: { backgroundColor: C.surfaceAlt, borderRadius: R.md, padding: 11, marginTop: 8 },
  liveCardLeave: { backgroundColor: C.chip.warning.bg, borderWidth: 1, borderColor: C.chip.warning.fg },
  liveHead: { flexDirection: "row", alignItems: "center" },
  progTxt: { fontSize: 15, fontWeight: "900" },
  leaveBadge: { backgroundColor: "#FFFFFF", borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: C.chip.warning.fg },
  leaveBadgeText: { color: C.chip.warning.fg, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  barBg: { height: 6, borderRadius: R.pill, backgroundColor: "#EAECF0", marginTop: 8, overflow: "hidden" },
  barFill: { height: 6, borderRadius: R.pill },
  miniChip: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 5, marginRight: 6 },
  miniChipText: { fontSize: 11, fontWeight: "800" },
  btnWeb: {
    backgroundColor: C.primary, borderRadius: R.md, paddingVertical: 13, alignItems: "center", marginTop: 12,
    shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 8, elevation: 2,
  },
  btnWebText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // ===== Follow-up Hari Ini per area =====
  fuTotalBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.divider, borderRadius: R.md, padding: 12, marginBottom: 2 },
  fuTotalLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.5, textTransform: "uppercase" },
  fuTotalValue: { fontSize: 13, fontWeight: "900" },
  fuWho: { flex: 1, fontSize: 12, color: C.inkSoft, fontWeight: "700", marginLeft: 8, marginRight: 6 },
  fuMiniRow: { flexDirection: "row" },
  fuMiniBox: { flex: 1, minWidth: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.divider, borderRadius: R.sm, padding: 10, marginRight: 8 },
  fuNum: { fontSize: 15, fontWeight: "900", marginTop: 4 },
  fuSub: { fontSize: 11, color: C.inkMuted, marginTop: 2 },

  // ===== Panel per area (bulanan & mingguan) =====
  areaCard: { backgroundColor: C.surfaceAlt, borderRadius: R.md, padding: 12, marginTop: 10 },
  areaCardHead: { flexDirection: "row", alignItems: "center" },
  areaChip: { borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  areaChipText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  sdmText: { fontSize: 11, color: C.inkMuted, fontWeight: "600", marginRight: 2, flexShrink: 1 },

  monthHero: { flexDirection: "row", alignItems: "center" },
  heroLabel: { fontSize: 10, color: C.inkMuted, fontWeight: "800", letterSpacing: 0.5 },
  heroValue: { fontSize: 23, color: C.ink, fontWeight: "900", marginTop: 2, letterSpacing: -0.4 },
  targetHint: { fontSize: 11, color: C.inkMuted, marginTop: 3 },
  pctBadge: { borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 6, marginLeft: 8 },
  pctBadgeText: { fontSize: 13, fontWeight: "900" },
  progressBg: { height: 7, borderRadius: R.pill, backgroundColor: "#EAECF0", overflow: "hidden", marginTop: 12 },
  progressFill: { height: 7, borderRadius: R.pill },
  monthMiniRow: { flexDirection: "row", marginTop: 10 },
  monthMiniBox: { flex: 1, minWidth: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.divider, borderRadius: R.sm, padding: 9, marginRight: 8 },
  miniLabel: { fontSize: 9, color: C.inkMuted, fontWeight: "800", letterSpacing: 0.4 },
  miniValue: { fontSize: 12, color: C.inkSoft, fontWeight: "800", marginTop: 4 },

  weekRow: { flexDirection: "row", marginTop: 2 },
  weekBox: { flex: 1, minWidth: 0, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.divider, borderRadius: R.sm, paddingVertical: 8, paddingHorizontal: 2, marginRight: 4, alignItems: "center" },
  weekLabel: { fontSize: 10, color: C.inkMuted, fontWeight: "800", letterSpacing: 0.3 },
  weekPct: { fontSize: 11, fontWeight: "900", marginTop: 3 },
  weekBarBg: { width: "82%", height: 4, borderRadius: R.pill, backgroundColor: "#E4E7EC", overflow: "hidden", marginTop: 6 },
  weekBarFill: { height: 4, borderRadius: R.pill },

  // ===== Ekspedisi: rincian per armada =====
  eksArmadaWrap: { marginBottom: 10 },
  eksRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eksArmada: { flex: 1, fontSize: 13, fontWeight: "700", color: C.inkSoft, marginRight: 8 },
  eksCount: { fontSize: 13, fontWeight: "800", color: C.ink },
  eksBarBg: { height: 5, borderRadius: R.pill, backgroundColor: "#EAECF0", marginTop: 6, overflow: "hidden" },
  eksBarFill: { height: 5, borderRadius: R.pill, backgroundColor: GREEN },

  // ===== Catatan kecil =====
  noteBox: { backgroundColor: C.status.warning.bg, borderWidth: 1, borderColor: C.status.warning.border, borderRadius: R.md, padding: 11, marginTop: 10 },
  noteText: { fontSize: 11, color: C.status.warning.fg, lineHeight: 16 },
});
