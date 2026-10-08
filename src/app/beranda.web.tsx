import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import TodayCard from "../components/TodayCard";
import DesktopShell from "../components/desktop/DesktopShell";
import { Kpi, Panel, Bar, Chip } from "../components/desktop/ui";
import { theme } from "../lib/theme";

const { colors: C, radius: R } = theme;

const GRAY = C.inkMuted;
const RED = C.primary;
const BLUE = C.role.field;
const VIOLET = C.role.supervisor;
const GREEN = C.role.owner;
const ORANGE = C.role.telemarketing;

const ROLE_LABEL: any = { owner: "Owner", field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor" };

const LEAVE_TYPE_LABEL: any = { sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur" };
const LEAVE_SCOPE_LABEL: any = { tidak_masuk: "Tidak masuk", tidak_keliling: "Tidak keliling" };

const AREA_ORDER = ["GLOBAL", "SOLO", "DIY", "SEMARANG", "TAB"];
const AREA_BG: any = { GLOBAL: C.chip.purple.bg, SOLO: C.chip.danger.bg, DIY: C.chip.info.bg, SEMARANG: C.chip.success.bg, TAB: C.chip.warning.bg };
const AREA_TX: any = { GLOBAL: C.chip.purple.fg, SOLO: C.chip.danger.fg, DIY: C.chip.info.fg, SEMARANG: C.chip.success.fg, TAB: C.chip.warning.fg };

const TARGET_MIN = 7;
const EKSPEDISI_WEB_URL = "https://laporan-app-phi.vercel.app/";

let pcpCache: { at: number; data: any } | null = null;
let pgCache: { at: number; data: any } | null = null;
let eksCache: { at: number; data: any } | null = null;
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
        out.add(dd + mm + yr);
        out.add(yr + mm + dd);
      }
    }
  }
  out.add(dPad + mPad);
  return Array.from(out);
}
const digitsOf = (s: any) => String(s ?? "").replace(/\D/g, "");

export default function BerandaWeb() {
  const router = useRouter();

  const viewer = useQuery(api.users.viewer) as any;
  const role = viewer?.role;
  const isField = role === "field";
  const isTele = role === "telemarketing";
  const isSuper = role === "supervisor";
  const isOwner = role === "owner";
  const usesFu = isTele || isSuper || isOwner;

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayEnd = dayStart + 86400000 - 1;

  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const summary = useQuery(api.visits.todaySummary) as any;

  const piuFu = useQuery(api.piutang.todayByArea, (usesFu ? {} : "skip") as any) as any;
  const ordFu = useQuery(api.orderFollowups.todayByArea, (usesFu ? {} : "skip") as any) as any;
  const manageUsers = useQuery(api.users.listUsersManage, (isSuper ? {} : "skip") as any) as any;

  const fetchPcp = useAction(api.laporan.fetchPcpBulanan);
  const fetchPg = useAction(api.laporan.fetchPcpMingguan);
  const fetchEks = useAction(api.laporan.fetchEkspedisi);
  const ensureOrder = useMutation(api.orderFollowups.ensureToday);

  const live = useQuery(api.visits.listLiveSales, (isSuper || isOwner ? undefined : "skip") as any) as any;
  const visitHist = useQuery(api.visits.listHistory, (isTele ? { from: dayStart, to: dayEnd } : "skip") as any) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, (usesFu ? {} : "skip") as any) as any;

  const genRef = useRef(false);
  useEffect(() => {
    if (!viewer || genRef.current || !usesFu) return;
    genRef.current = true;
    ensureOrder({}).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  // ==== Fetch laporan (cache 5 mnt) ====
  const [pcp, setPcp] = useState<any>(null);
  const [pcpState, setPcpState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [pg, setPg] = useState<any>(null);
  const [pgState, setPgState] = useState<"idle" | "loading" | "done" | "err">("idle");
  const [eks, setEks] = useState<any>(null);
  const [eksState, setEksState] = useState<"idle" | "loading" | "done" | "err">("idle");

  useEffect(() => {
    if (!viewer) return;
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
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
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
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
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
  }, [viewer]);

  if (!viewer) {
    return <View style={sty.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const areaLabel = viewer.area ?? "Semua Area";
  const fmtTime = (ms: number | null) =>
    ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
  const tglPanjang = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // ==== Follow-up hari ini per area ====
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

  const teleByArea: Record<string, string> = {};
  for (const u of (manageUsers ?? [])) {
    if (u.role === "telemarketing" && u.area) teleByArea[u.area] = u.name;
  }
  const petugasOf = (area: string) => (isTele ? (viewer.name ?? "") : (teleByArea[area] ?? ""));

  // ==== Progres sales ====
  const liveRows: any[] = [...((live ?? []) as any[])].sort(
    (a, b) =>
      Number(!!a.leave) - Number(!!b.leave) ||
      String(a.sales?.area ?? "").localeCompare(String(b.sales?.area ?? "")) ||
      String(a.sales?.name ?? "").localeCompare(String(b.sales?.name ?? ""))
  );
  const liveLeave = liveRows.filter((x) => !!x.leave).length;
  const liveActive = liveRows.length - liveLeave;
  const liveNotStarted = liveRows.filter(
    (x: any) => !x.leave && x.state !== "visit" && (x.todayDoneCount ?? 0) === 0
  ).length;

  // ==== Field ====
  const fieldDone = summary?.doneCount ?? 0;
  const fieldPos = fieldDone + (ongoing?.visit ? 1 : 0);
  const fieldOk = fieldPos >= TARGET_MIN;
  const fieldPctBar = Math.min(100, Math.round((fieldPos / TARGET_MIN) * 100));

  // ==== Pencapaian bulanan ====
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

  // ==== Ekspedisi ====
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

  return (
    <DesktopShell
      active="beranda"
      title="Dashboard"
      subtitle={`${ROLE_LABEL[role] ?? role} • ${areaLabel} • ${tglPanjang}`}
    >
      {/* ================= KPI ================= */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        {ongoing?.visit ? (
          <Kpi label="KUNJUNGAN BERJALAN" value={ongoing.store?.name ?? "Toko"} color={RED} hint={`sejak ${fmtTime(ongoing.visit.checkinAt)} — ketuk untuk lanjut`} />
        ) : null}

        {isSuper || isOwner ? (
          <>
            <Kpi label="SALES AKTIF" value={`${liveActive}`} color={GREEN} hint={`${liveLeave} izin hari ini`} />
            <Kpi label="BELUM MULAI" value={`${liveNotStarted}`} color={liveNotStarted > 0 ? RED : GREEN} hint={`target ${TARGET_MIN} toko/hari`} />
          </>
        ) : null}

        {isField ? (
          <>
            <Kpi label="KUNJUNGAN HARI INI" value={`${fieldPos}/${TARGET_MIN}`} color={fieldOk ? GREEN : ORANGE} hint={summary ? `durasi ${fmtDur(summary.durMs ?? 0)}` : ""} />
            <Kpi
              label="STATUS"
              value={ongoing?.visit ? "Sedang berkunjung" : fieldOk ? "Target tercapai" : `Kurang ${Math.max(0, TARGET_MIN - fieldPos)} lagi`}
              color={ongoing?.visit ? RED : fieldOk ? GREEN : ORANGE}
            />
          </>
        ) : null}

        {usesFu ? (
          <>
            <Kpi label="FOLLOW-UP BELUM" value={fuReady ? String(fuTotalPending) : "–"} color={fuTotalPending > 0 ? ORANGE : GREEN} hint={`${fuTotalDone} selesai hari ini`} />
            <Kpi label="FU TOKO BELUM CLSD" value={fuToko ? String(fuToko.pending) : "–"} color={fuToko?.pending > 0 ? RED : GREEN} hint={fuToko ? `periode ${fuToko.monthKey}` : ""} />
          </>
        ) : null}

        {isSuper || isOwner ? (
          <Kpi label="KIRIMAN EKSPEDISI" value={String(eksShown.length)} color={BLUE} hint={eksShown.length ? eksLabel : "hari ini"} />
        ) : null}
      </View>

      {/* ================= HARI INI + PERLU TINDAKAN (supervisor) ================= */}
      {isSuper ? (
        <View style={{ marginTop: 16 }}>
          <TodayCard />
        </View>
      ) : null}

      {/* ================= PROGRES SALES + FOLLOW-UP PER AREA ================= */}
      {isSuper || isOwner ? (
        <View style={sty.grid}>
          <Panel
            basis={500}
            icon="users"
            title="Progres Kunjungan Sales"
            right={<Text style={sty.panelHint}>{liveActive} aktif • {liveLeave} izin</Text>}
          >
            {live === undefined ? (
              <ActivityIndicator size="small" color={RED} />
            ) : liveRows.length === 0 ? (
              <Text style={sty.muted}>Belum ada data sales hari ini.</Text>
            ) : (
              <>
                <View style={sty.thead}>
                  <Text style={[sty.th, { width: 180 }]}>Sales</Text>
                  <Text style={[sty.th, { flex: 1 }]}>Progres</Text>
                  <Text style={[sty.th, { width: 96, textAlign: "right" }]}>Hasil</Text>
                </View>
                {liveRows.map((ls: any, i: number) => {
                  const excused = !!ls.leave;
                  const pos = (ls.todayDoneCount ?? 0) + (ls.state === "visit" ? 1 : 0);
                  const pct = excused ? 100 : Math.min(100, Math.round((pos / TARGET_MIN) * 100));
                  const ok = !excused && pos >= TARGET_MIN;
                  const color = excused ? C.chip.warning.fg : ok ? GREEN : ORANGE;
                  const leaveLabel = excused
                    ? `${LEAVE_TYPE_LABEL[ls.leave.type] ?? ls.leave.type} • ${LEAVE_SCOPE_LABEL[ls.leave.scope] ?? ls.leave.scope}`
                    : "";
                  const info = excused
                    ? `${leaveLabel}${ls.leave.note ? ` • ${ls.leave.note}` : ""} • dikecualikan dari target`
                    : ls.state === "visit"
                      ? `Sedang di ${ls.storeName ?? "Toko"} sejak ${ls.checkinAt ? fmtTime(ls.checkinAt) : "-"}`
                      : (ls.todayDoneCount ?? 0) > 0
                        ? `${ls.todayDoneCount} selesai • Order ${ls.orderedCount ?? 0} · Tidak ${ls.notOrderedCount ?? 0} · Tutup ${ls.closedCount ?? 0}`
                        : "Belum mulai kunjungan";
                  return (
                    <View key={ls.sales._id} style={[sty.trow, i === liveRows.length - 1 && sty.trowLast]}>
                      <View style={{ width: 180, paddingRight: 10 }}>
                        <Text style={sty.tName} numberOfLines={1}>{ls.sales.name}</Text>
                        <Text style={sty.tSub} numberOfLines={1}>{ls.sales.area ?? "-"}</Text>
                      </View>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Bar pct={pct} color={excused ? C.chip.warning.fg : color} />
                        <Text style={sty.tSub} numberOfLines={1}>{info}</Text>
                      </View>
                      <View style={{ width: 96, alignItems: "flex-end" }}>
                        {excused ? (
                          <Chip text="IZIN" bg={C.chip.warning.bg} fg={C.chip.warning.fg} />
                        ) : (
                          <Text style={[sty.tProg, { color }]}>{pos}/{TARGET_MIN}{ok ? " ✓" : ""}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
            <TouchableOpacity style={sty.btnGhost} onPress={() => router.push("/izin" as any)}>
              <Text style={sty.btnGhostText}>Kelola Izin Sales</Text>
            </TouchableOpacity>
          </Panel>

          <Panel
            basis={440}
            icon="phone"
            title="Follow-up Hari Ini per Area"
            right={<Text style={sty.panelHint}>{fuTotalPending} belum · {fuTotalDone} selesai</Text>}
          >
            {!fuReady ? (
              <ActivityIndicator size="small" color={RED} />
            ) : fuTotalPending === 0 && fuTotalDone === 0 ? (
              <Text style={sty.muted}>Belum ada follow-up untuk hari ini.</Text>
            ) : (
              <>
                <View style={sty.thead}>
                  <Text style={[sty.th, { width: 86 }]}>Area</Text>
                  <Text style={[sty.th, { flex: 1 }]}>Petugas</Text>
                  <Text style={[sty.th, { width: 96, textAlign: "right" }]}>Piutang</Text>
                  <Text style={[sty.th, { width: 110, textAlign: "right" }]}>SPK H+1</Text>
                  <Text style={[sty.th, { width: 84, textAlign: "right" }]}>Status</Text>
                </View>
                {fuAreas.map((a, i) => {
                  const piuOk = a.piuPending === 0;
                  const ordOk = a.ordPending === 0;
                  const allOk = piuOk && ordOk;
                  const notStarted = (a.piuPending + a.ordPending) > 0 && (a.piuDone + a.ordDone) === 0;
                  const chip = notStarted ? C.chip.danger : allOk ? C.chip.success : C.chip.warning;
                  const chipLabel = notStarted ? "belum mulai" : allOk ? "beres" : "diproses";
                  return (
                    <View key={a.area} style={[sty.trow, i === fuAreas.length - 1 && sty.trowLast]}>
                      <View style={{ width: 86 }}>
                        <Chip text={a.area} bg={AREA_BG[a.area] ?? C.chip.neutral.bg} fg={AREA_TX[a.area] ?? C.chip.neutral.fg} />
                      </View>
                      <Text style={[sty.tSub, { flex: 1 }]} numberOfLines={1}>
                        {petugasOf(a.area) || "petugas belum diset"}
                      </Text>
                      <View style={{ width: 96, alignItems: "flex-end" }}>
                        <Text style={[sty.tVal, { color: piuOk ? GREEN : RED }]}>{a.piuPending} belum</Text>
                        <Text style={sty.tSub}>{a.piuDone} selesai</Text>
                      </View>
                      <View style={{ width: 110, alignItems: "flex-end" }}>
                        <Text style={[sty.tVal, { color: ordOk ? GREEN : RED }]}>{a.ordPending} belum</Text>
                        <Text style={sty.tSub}>{a.ordDone} selesai</Text>
                      </View>
                      <View style={{ width: 84, alignItems: "flex-end" }}>
                        <Chip text={chipLabel} bg={chip.bg} fg={chip.fg} />
                      </View>
                    </View>
                  );
                })}
              </>
            )}
            <TouchableOpacity style={sty.btnGhost} onPress={() => router.push("/spk" as any)}>
              <Text style={sty.btnGhostText}>Buka SPK Admin</Text>
            </TouchableOpacity>
          </Panel>
        </View>
      ) : null}

      {/* ================= FIELD ================= */}
      {isField ? (
        <View style={sty.grid}>
          <Panel basis={520} icon="store" title="Progres Kunjungan Hari Ini" right={<Text style={sty.panelHint}>{fieldPos}/{TARGET_MIN} toko</Text>}>
            <View style={sty.miniRow}>
              <View style={sty.miniBox}>
                <Text style={sty.miniLabel}>TARGET HARIAN</Text>
                <Text style={[sty.miniValue, { color: fieldOk ? GREEN : ORANGE }]}>{fieldPos}/{TARGET_MIN}{fieldOk ? " ✓" : ""}</Text>
              </View>
              <View style={sty.miniBox}>
                <Text style={sty.miniLabel}>SELESAI</Text>
                <Text style={[sty.miniValue, { color: GREEN }]}>{summary ? fieldDone : "–"}</Text>
              </View>
              <View style={sty.miniBox}>
                <Text style={sty.miniLabel}>TOTAL DURASI</Text>
                <Text style={sty.miniValue}>{summary ? fmtDur(summary.durMs ?? 0) : "–"}</Text>
              </View>
              <View style={sty.miniBox}>
                <Text style={sty.miniLabel}>BERJALAN</Text>
                <Text style={[sty.miniValue, { color: ongoing?.visit ? RED : GRAY }]}>
                  {ongoing?.visit ? "1 aktif" : "Tidak ada"}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <Bar pct={fieldPctBar} color={fieldOk ? GREEN : ORANGE} height={8} />
            </View>
            <Text style={sty.hint}>Daftar toko kunjungan ada di menu SPK → SPK Sales.</Text>
          </Panel>
        </View>
      ) : null}

      {/* ================= TELEMARKETING ================= */}
      {isTele ? (
        <View style={sty.grid}>
          <Panel basis={520} icon="store" title="Progres Kunjungan Area (hari ini)" right={<Text style={sty.panelHint}>{(visitHist ?? []).length} kunjungan</Text>}>
            {visitHist === undefined ? (
              <ActivityIndicator size="small" color={RED} />
            ) : (visitHist ?? []).length === 0 ? (
              <Text style={sty.muted}>Belum ada kunjungan sales di area {areaLabel} hari ini.</Text>
            ) : (
              (visitHist ?? []).slice(0, 8).map((it: any, i: number) => (
                <View key={it.visit._id} style={[sty.trow, i === Math.min(8, (visitHist ?? []).length) - 1 && sty.trowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={sty.tName} numberOfLines={1}>{it.store?.name ?? "Toko terhapus"}</Text>
                    <Text style={sty.tSub}>{it.salesName || "-"} • {fmtTime(it.visit.checkinAt)}</Text>
                  </View>
                </View>
              ))
            )}
            <Text style={sty.hint}>Riwayat lengkap ada di menu SPK → Riwayat.</Text>
          </Panel>
        </View>
      ) : null}

      {/* ================= FU TOKO + EKSPEDISI ================= */}
      {usesFu ? (
        <View style={sty.grid}>
          <Panel
            basis={420}
            icon="store"
            title="FU Toko (bulan ini)"
            right={<Text style={sty.panelHint}>{fuToko ? `periode ${fuToko.monthKey}` : "–"}</Text>}
          >
            {fuToko === undefined ? (
              <ActivityIndicator size="small" color={RED} />
            ) : !fuToko ? (
              <Text style={sty.muted}>Tidak ada data FU Toko.</Text>
            ) : (
              <>
                <View style={sty.miniRow}>
                  <View style={sty.miniBox}>
                    <Text style={sty.miniLabel}>TOTAL TUGAS</Text>
                    <Text style={sty.miniValue}>{fuToko.total}</Text>
                  </View>
                  <View style={sty.miniBox}>
                    <Text style={sty.miniLabel}>OPEN</Text>
                    <Text style={[sty.miniValue, { color: fuToko.open > 0 ? RED : GRAY }]}>{fuToko.open}</Text>
                  </View>
                  <View style={sty.miniBox}>
                    <Text style={sty.miniLabel}>INPG</Text>
                    <Text style={[sty.miniValue, { color: fuToko.inpg > 0 ? ORANGE : GRAY }]}>{fuToko.inpg}</Text>
                  </View>
                  <View style={sty.miniBox}>
                    <Text style={sty.miniLabel}>CLSD</Text>
                    <Text style={[sty.miniValue, { color: GREEN }]}>{fuToko.clsd}</Text>
                  </View>
                </View>
                <Text style={sty.hint}>
                  {fuToko.area ? `Area ${fuToko.area}. ` : "Semua area. "}
                  {fuToko.pending > 0 ? `Masih ${fuToko.pending} toko belum CLSD.` : "Semua sudah CLSD 👍"}
                </Text>
                <TouchableOpacity style={sty.btnGhost} onPress={() => router.push("/toko-aktif" as any)}>
                  <Text style={sty.btnGhostText}>Buka FU Toko</Text>
                </TouchableOpacity>
              </>
            )}
          </Panel>

          <Panel
            basis={420}
            icon={isSuper || isOwner ? "cash" : "box"}
            title="Kiriman Ekspedisi Hari Ini"
            right={<Text style={sty.panelHint}>{eksShown.length} kiriman</Text>}
          >
            {eksState === "loading" ? (
              <ActivityIndicator size="small" color={RED} />
            ) : eksState === "err" || !eks ? (
              <Text style={sty.muted}>Data belum tersedia.</Text>
            ) : (
              <>
                <View style={sty.miniRow}>
                  {isSuper || isOwner ? (
                    <>
                      <View style={sty.miniBox}>
                        <Text style={sty.miniLabel}>TOTAL TUNAI</Text>
                        <Text style={[sty.miniValue, { color: GREEN }]} numberOfLines={1}>{rupiah(eksTunai)}</Text>
                      </View>
                      <View style={sty.miniBox}>
                        <Text style={sty.miniLabel}>TOTAL TRANSFER</Text>
                        <Text style={[sty.miniValue, { color: BLUE }]} numberOfLines={1}>{rupiah(eksTransfer)}</Text>
                      </View>
                    </>
                  ) : null}
                  <View style={sty.miniBox}>
                    <Text style={sty.miniLabel}>KIRIMAN</Text>
                    <Text style={sty.miniValue}>{eksShown.length}</Text>
                  </View>
                  <View style={sty.miniBox}>
                    <Text style={sty.miniLabel}>ARMADA</Text>
                    <Text style={sty.miniValue}>{eksArmadaList.length}</Text>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  {eksShown.length === 0 ? (
                    <Text style={sty.muted}>Belum ada kiriman untuk tanggal hari ini.</Text>
                  ) : (
                    eksArmadaList.map((a: any) => (
                      <View key={a.armada} style={{ marginBottom: 10 }}>
                        <View style={sty.armadaRow}>
                          <Text style={sty.tName} numberOfLines={1}>{a.armada}</Text>
                          <Text style={sty.tVal}>{a.count} kiriman</Text>
                        </View>
                        <Bar pct={(a.count / eksMax) * 100} color={BLUE} height={5} />
                      </View>
                    ))
                  )}
                </View>

                {!eksIsToday && eksShown.length > 0 ? (
                  <Text style={sty.hint}>Tanggal hari ini belum ada di Sheet — menampilkan data terbaru ({eksLabel}).</Text>
                ) : null}

                <TouchableOpacity style={sty.btnPrimary} onPress={() => Linking.openURL(EKSPEDISI_WEB_URL)}>
                  <Text style={sty.btnPrimaryText}>Buka Laporan Ekspedisi Lengkap (Web)</Text>
                </TouchableOpacity>
              </>
            )}
          </Panel>
        </View>
      ) : null}

      {/* ================= PENCAPAIAN BULANAN + MINGGUAN ================= */}
      <View style={sty.grid}>
        <Panel
          basis={480}
          icon="trend"
          title="Pencapaian Bulanan per Area"
          right={<Text style={sty.panelHint}>{pcpGroups.length} area</Text>}
        >
          {!canSeeAllArea ? <Text style={sty.hint}>Menampilkan area {myAreaUp || "-"} saja.</Text> : null}
          {pcpState === "loading" ? (
            <ActivityIndicator size="small" color={RED} />
          ) : pcpState === "err" || !pcpRows || pcpRows.length === 0 ? (
            <>
              <Text style={sty.muted}>Data belum tersedia.</Text>
              <TouchableOpacity style={sty.btnGhost} onPress={() => router.push("/laporan-pcp" as any)}>
                <Text style={sty.btnGhostText}>Buka Laporan PCP</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={sty.thead}>
                <Text style={[sty.th, { width: 110 }]}>Area</Text>
                <Text style={[sty.th, { width: 56, textAlign: "right" }]}>SDM</Text>
                <Text style={[sty.th, { flex: 1, textAlign: "right" }]}>Target</Text>
                <Text style={[sty.th, { flex: 1, textAlign: "right" }]}>Aktual</Text>
                <Text style={[sty.th, { flex: 1, textAlign: "right" }]}>RP Kejar</Text>
                <Text style={[sty.th, { width: 110, textAlign: "right" }]}>Capaian</Text>
              </View>
              {pcpGroups.map((g, i) => (
                <View key={g.area} style={[sty.trow, i === pcpGroups.length - 1 && sty.trowLast]}>
                  <View style={{ width: 110 }}>
                    <Chip text={g.area} bg={AREA_BG[g.area] ?? C.chip.neutral.bg} fg={AREA_TX[g.area] ?? C.chip.neutral.fg} />
                  </View>
                  <Text style={[sty.tVal, { width: 56, textAlign: "right" }]}>{g.sdm}</Text>
                  <Text style={[sty.tVal, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{rupiah(g.tgt)}</Text>
                  <Text style={[sty.tVal, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{rupiah(g.act)}</Text>
                  <Text style={[sty.tVal, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{rupiah(g.kejar)}</Text>
                  <View style={{ width: 110, alignItems: "flex-end" }}>
                    <Text style={[sty.tVal, { color: pctColor(g.pct) }]}>{fmtPct(g.pct)}</Text>
                    <View style={{ width: 92 }}>
                      <Bar pct={Math.min(100, Math.max(0, g.pct ?? 0))} color={pctColor(g.pct)} height={4} />
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}
        </Panel>

        <Panel
          basis={480}
          icon="calendar"
          title="Pencapaian Mingguan M1–M5 per Area"
          right={<Text style={sty.panelHint}>{pgGroups.length} area</Text>}
        >
          {!canSeeAllArea ? <Text style={sty.hint}>Menampilkan area {myAreaUp || "-"} saja.</Text> : null}
          {pgState === "loading" ? (
            <ActivityIndicator size="small" color={RED} />
          ) : pgState === "err" || !pgRows || pgRows.length === 0 ? (
            <>
              <Text style={sty.muted}>Data belum tersedia.</Text>
              <TouchableOpacity style={sty.btnGhost} onPress={() => router.push("/laporan-pcp-mingguan" as any)}>
                <Text style={sty.btnGhostText}>Buka PCP Mingguan</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={sty.thead}>
                <Text style={[sty.th, { width: 110 }]}>Area</Text>
                <Text style={[sty.th, { width: 52, textAlign: "right" }]}>SDM</Text>
                {weekLabels.map((lbl) => (
                  <Text key={lbl} style={[sty.th, { flex: 1, textAlign: "right" }]}>{lbl}</Text>
                ))}
              </View>
              {pgGroups.map((g, i) => (
                <View key={g.area} style={[sty.trow, i === pgGroups.length - 1 && sty.trowLast]}>
                  <View style={{ width: 110 }}>
                    <Chip text={g.area} bg={AREA_BG[g.area] ?? C.chip.neutral.bg} fg={AREA_TX[g.area] ?? C.chip.neutral.fg} />
                  </View>
                  <Text style={[sty.tVal, { width: 52, textAlign: "right" }]}>{g.sdm}</Text>
                  {g.weeks.map((wk: any) => (
                    <View key={wk.label} style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={[sty.tVal, { color: pctColor(wk.pct) }]} numberOfLines={1}>{fmtPct(wk.pct)}</Text>
                      <View style={{ width: "80%" }}>
                        <Bar pct={Math.min(100, Math.max(0, wk.pct ?? 0))} color={pctColor(wk.pct)} height={4} />
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </Panel>
      </View>

      {/* ================= AKSES CEPAT ================= */}
      <Text style={sty.gridLabel}>Akses Cepat</Text>
      <View style={sty.quickWrap}>
        {(isField || isSuper) ? (
          <TouchableOpacity style={sty.quick} onPress={() => router.push("/toko-baru" as any)}>
            <View style={sty.quickBubble}><AppIcon name="store" size={18} color={C.primary} /></View>
            <Text style={sty.quickLabel}>Toko Baru</Text>
            <Text style={sty.quickDesc}>Daftarkan toko baru</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={sty.quick} onPress={() => router.push("/kelola-toko" as any)}>
          <View style={[sty.quickBubble, { backgroundColor: C.chip.info.bg }]}>
            <AppIcon name="store" size={18} color={C.chip.info.fg} />
          </View>
          <Text style={sty.quickLabel}>Kelola Toko</Text>
          <Text style={sty.quickDesc}>Cari & lihat data toko</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sty.quick} onPress={() => router.push("/riwayat" as any)}>
          <View style={[sty.quickBubble, { backgroundColor: C.chip.purple.bg }]}>
            <AppIcon name="timer" size={18} color={C.chip.purple.fg} />
          </View>
          <Text style={sty.quickLabel}>Riwayat</Text>
          <Text style={sty.quickDesc}>Kunjungan & follow-up</Text>
        </TouchableOpacity>
        {isOwner ? (
          <TouchableOpacity style={sty.quick} onPress={() => router.push("/laporan" as any)}>
            <View style={[sty.quickBubble, { backgroundColor: C.chip.success.bg }]}>
              <AppIcon name="chart" size={18} color={C.chip.success.fg} />
            </View>
            <Text style={sty.quickLabel}>Laporan</Text>
            <Text style={sty.quickDesc}>PCP, DAP & target toko</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </DesktopShell>
  );
}

const sty = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 16 },
  panelHint: { fontSize: 11, color: GRAY, fontWeight: "800" },
  muted: { fontSize: 12.5, color: GRAY },
  hint: { fontSize: 11, color: GRAY, marginTop: 10, fontStyle: "italic" },

  // ===== Tabel ringkas =====
  thead: { flexDirection: "row", alignItems: "center", paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: C.divider },
  th: { fontSize: 10, fontWeight: "900", color: C.inkFaint, letterSpacing: 0.5 },
  trow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  trowLast: { borderBottomWidth: 0 },
  tName: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  tProg: { fontSize: 15, fontWeight: "900" },
  tSub: { fontSize: 11.5, color: GRAY, marginTop: 2 },
  tVal: { fontSize: 13, fontWeight: "800", color: C.ink },
  armadaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  // ===== Kotak kecil =====
  miniRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  miniBox: { flexBasis: 130, flexGrow: 1, minWidth: 110, backgroundColor: C.surfaceAlt, borderRadius: R.sm, padding: 12 },
  miniLabel: { fontSize: 9.5, fontWeight: "900", color: C.inkMuted, letterSpacing: 0.4 },
  miniValue: { fontSize: 15, fontWeight: "900", color: C.ink, marginTop: 4 },

  // ===== Tombol =====
  btnGhost: { backgroundColor: C.status.neutral.bg, borderRadius: R.md, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  btnGhostText: { color: C.status.neutral.fg, fontWeight: "800", fontSize: 12.5 },
  btnPrimary: { backgroundColor: C.primary, borderRadius: R.md, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 12.5 },

  // ===== Akses cepat =====
  gridLabel: { fontSize: 15, fontWeight: "900", color: C.ink, marginTop: 24, marginBottom: 10 },
  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quick: { flexBasis: 210, flexGrow: 1, minWidth: 170, backgroundColor: C.surface, borderWidth: 1, borderColor: C.divider, borderRadius: R.lg, padding: 14 },
  quickBubble: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  quickLabel: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  quickDesc: { fontSize: 11.5, color: GRAY, marginTop: 2 },
});
