import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  FlatList, ScrollView, Alert, Modal, Image, BackHandler,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useQuery, useAction, useMutation, useConvex } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { api } from "../../../convex/_generated/api";
import TabBar from "../../components/TabBar";
import AppIcon from "../../components/AppIcon";
import { SpkStatusBadge } from "../../components/SpkWorkflow";
import { useBulkSelect, BulkBar, BulkToggle, SelectBox } from "../../components/BulkSelect";
import { toFriendlyError } from "../../lib/msg";
import { theme } from "../../lib/theme";
import { TOP_PAD } from "../../lib/layout";
import { exportCsv } from "../../lib/csvExport";

const { colors: C, radius: R } = theme;

// Bayangan tipis khas Android (ditulis eksplisit supaya kunci RN-nya benar)
const SHADOW = {
  shadowColor: "#101828",
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = C.status.success.fg;
const BLUE = C.status.info.fg;
const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };
const ROLE_LABEL: any = { owner: "Owner", field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor" };
const MET_LABEL: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };
const REASON_LABEL: any = {
  stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga",
  harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang",
};
// Warna kotak hasil di kartu Riwayat Kunjungan
const RV_TONE: any = {
  ok: { backgroundColor: "#ECFDF3", borderColor: "#ABEFC6" },
  warn: { backgroundColor: "#FFFAEB", borderColor: "#FEDF89" },
  info: { backgroundColor: "#EFF8FF", borderColor: "#B2DDFF" },
  bad: { backgroundColor: "#FEF3F2", borderColor: "#FECDCA" },
};
const RV_TONE_TX: any = { ok: "#067647", warn: "#B54708", info: "#175CD3", bad: "#B42318" };
const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + n.toLocaleString("id-ID"));
const fmtTgl = (d: Date) =>
  d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// ===== Helper export CSV =====
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ===== Riwayat Follow-up: 1 toko = 1 kartu =====
// Baris piutang & orderan yang tokonya sama digabung jadi satu kartu.
const nkName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function groupHist(rows: { kind: "piutang" | "order"; item: any; task: any }[]) {
  const map = new Map<string, any>();
  const blank = (k: string, t: any) => ({ key: k, area: t.area, storeName: t.storeName, piutang: [] as any[], order: [] as any[] });

  // Pass 1 — piutang jadi penentu kartu
  for (const r of rows) {
    if (r.kind !== "piutang") continue;
    const k = `${r.task.area}::${nkName(r.task.storeName)}`;
    const g = map.get(k) ?? blank(k, r.task);
    g.piutang.push(r);
    map.set(k, g);
  }

  // Pass 2 — orderan menempel ke kartu piutang yang sama kalau namanya cocok
  for (const r of rows) {
    if (r.kind !== "order") continue;
    const k = `${r.task.area}::${r.task.nameKey || nkName(r.task.storeName)}`;
    let g = map.get(k);
    if (!g) {
      const short = nkName(r.task.storeName);
      const cand = Array.from(map.values()).filter(
        (x: any) => x.area === r.task.area && x.piutang.length > 0 &&
          (x.key.endsWith("::" + short) || x.key.includes(short + " ") || short.includes(x.key.split("::")[1]))
      );
      if (cand.length === 1) g = cand[0];
    }
    if (!g) {
      g = blank(k, r.task);
      map.set(k, g);
    }
    g.order.push(r);
  }

  const byDone = (a: any, b: any) => (b.task.doneAt ?? 0) - (a.task.doneAt ?? 0);
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.piutang.sort(byDone);
    g.order.sort(byDone);
  }
  // kartu dengan follow-up terbaru di atas; kalau seri, yang ada piutang naik
  groups.sort((a: any, b: any) => {
    const la = Math.max(a.piutang[0]?.task.doneAt ?? 0, a.order[0]?.task.doneAt ?? 0);
    const lb = Math.max(b.piutang[0]?.task.doneAt ?? 0, b.order[0]?.task.doneAt ?? 0);
    if (lb !== la) return lb - la;
    return (b.piutang.length > 0 ? 1 : 0) - (a.piutang.length > 0 ? 1 : 0);
  });
  return groups;
}

// Penanda "sudah pernah di-ensure hari ini" untuk seluruh sesi aplikasi
// (biar tidak men-scan kunjungan H-1 tiap kali tab SPK dibuka)
let ensuredOrderKey: string | null = null;

export default function Spk() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const sync = useAction(api.piutang.manualSync);
  const reopenTask = useMutation(api.piutang.supervisorReopenTask);
  const editResult = useMutation(api.piutang.supervisorEditTaskResult);
  const addManual = useMutation(api.visits.supervisorAddManualVisit);
  const deleteVisit = useMutation(api.visits.deleteVisitBySupervisor);
  // ===== Follow-up orderan (auto dari kunjungan sales) =====
  const ensureOrder = useMutation(api.orderFollowups.ensureToday);
  const completeOrder = useMutation(api.orderFollowups.completeTask);
  const reopenOrder = useMutation(api.orderFollowups.supervisorReopen);
  const editOrderResult = useMutation(api.orderFollowups.supervisorEditResult);
  // ← FASE 1: tutup/setujui (CLSD) — khusus supervisor
  const closeTask = useMutation(api.piutang.supervisorCloseTask);
  const closeOrderTask = useMutation(api.orderFollowups.supervisorCloseTask);
  // ← CLSD massal (bulk select)
  const closeTaskMany = useMutation(api.piutang.supervisorCloseMany);
  const closeOrderTaskMany = useMutation(api.orderFollowups.supervisorCloseMany);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const params = useLocalSearchParams();
  const [sec, setSec] = useState(String((params as any)?.sec ?? "sales"));
  const [hubOpen, setHubOpen] = useState(!(params as any)?.sec);   // ← FASE 2: hub menu pembuka
  const [areaChip, setAreaChip] = useState("ALL");
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState(""); // kata kunci yang dikirim ke server (setelah berhenti mengetik)
  const [storeTake, setStoreTake] = useState(30); // SPK Sales: 30 baris dulu
  const [day, setDay] = useState(() => new Date());
  const [syncing, setSyncing] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [calCursor, setCalCursor] = useState(() => new Date());
  const [dq, setDq] = useState(""); // search riwayat follow-up
  const [rvSalesId, setRvSalesId] = useState<string | undefined>(undefined); // filter per sales di Riwayat Kunjungan
  // Filter tipe di SPK Admin: semua / piutang / orderan
  const [adminFilter, setAdminFilter] = useState<"all" | "piutang" | "order">("all");

  // ← Bulk select SPK Admin: hanya sah saat SATU jenis dipilih,
  // supaya ID piutang & orderan tidak pernah tercampur dalam satu batch.
  const bulk = useBulkSelect();
  const bulkJenis: "p" | "o" | null =
    adminFilter === "piutang" ? "p" : adminFilter === "order" ? "o" : null;
  const bulkKey = `${bulk.pilih}|${[...bulk.terpilih].join(",")}`; // extraData FlatList
    // ← Status buka/tutup kartu SPK Admin (ringkas → rinci)
  const [admOpen, setAdmOpen] = useState<string | null>(null);


  // Modal hasil follow-up orderan
  const [od, setOd] = useState<any>(null);      // task orderan yang dibuka
  const [odEdit, setOdEdit] = useState(false);  // true = mode edit (supervisor)
  const [odHasil, setOdHasil] = useState("");
  const [odNotes, setOdNotes] = useState("");
  const [odBusy, setOdBusy] = useState(false);
  const [odShot, setOdShot] = useState<{ uri: string; mime: string } | null>(null);
  const [odShotId, setOdShotId] = useState("");
  const [odUrl, setOdUrl] = useState("");       // URL bukti WA (dari listDone)
  const [odDoneBy, setOdDoneBy] = useState(""); // nama pengguna yang mengerjakan follow-up
  const [odView, setOdView] = useState<string | null>(null); // URL bukti untuk diperbesar

  // Modal edit hasil (supervisor)
  const [ed, setEd] = useState<any>(null);
  const [edHasil, setEdHasil] = useState("");
  const [edDate, setEdDate] = useState("");
  const [edMethod, setEdMethod] = useState("");
  const [edNotes, setEdNotes] = useState("");

  // State export excel
  const convex = useConvex();
  const [showExp, setShowExp] = useState(false);
  const [expSec, setExpSec] = useState<"done" | "riwayat">("done");
  const [expFrom, setExpFrom] = useState<Date | null>(null);
  const [expTo, setExpTo] = useState<Date | null>(null);
  const [expBusy, setExpBusy] = useState(false);
  const [calTarget, setCalTarget] = useState<"day" | "expFrom" | "expTo">("day");

  // State modal kunjungan manual (supervisor)
  const [showManual, setShowManual] = useState(false);
  const [mvSalesId, setMvSalesId] = useState<string | null>(null);
  const [mvStoreId, setMvStoreId] = useState<string | null>(null);
  const [mvStoreQ, setMvStoreQ] = useState("");
  const [mvNotes, setMvNotes] = useState("");
  const [mvBusy, setMvBusy] = useState(false);

  // Tunggu 700 ms setelah berhenti mengetik, baru cari ke server
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 700);
    return () => clearTimeout(t);
  }, [q]);

  // ← #4: back HP di dalam seksi → balik ke menu SPK (bukan keluar app)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!hubOpen) { setHubOpen(true); return true; }
        return false;
      });
      return () => sub.remove();
    }, [hubOpen])
  );

  const role = viewer?.role;
  const isField = role === "field";
  const isTele = role === "telemarketing";
  const isSuper = role === "supervisor";
  const isOwner = role === "owner";
  const usesPiutang = isTele || isSuper || isOwner;
  // ← Riwayat (read-only) juga untuk sales lapangan → area sendiri
  const usesHist = usesPiutang || isField;


  const SEGS: any[] = [];
  if (isOwner) {
    // Owner: hanya monitor riwayat (follow-up & kunjungan), semua area
    SEGS.push({ key: "done", label: "Riwayat Follow-up" });
    SEGS.push({ key: "riwayat", label: "Riwayat Kunjungan" });
  } else {
    if (role !== "telemarketing") SEGS.push({ key: "sales", label: "SPK Sales" });
    if (role !== "field") SEGS.push({ key: "admin", label: "SPK Admin" });
    SEGS.push({ key: "done", label: "Riwayat Follow-up" });
    SEGS.push({ key: "riwayat", label: "Riwayat Kunjungan" });
  }
  const effSec = SEGS.some((s) => s.key === sec) ? sec : SEGS[0]?.key ?? "sales";
  // Judul header mengikuti seksi yang sedang dibuka (mis. "SPK Admin", "Riwayat Kunjungan")
  const secLabel = SEGS.find((s: any) => s.key === effSec)?.label ?? "SPK";

  // ← FASE 2: kartu hub menu (label dari SEGS, ditambah emoji + warna + deskripsi)
  const HUB_META: any = {
    sales: { emoji: "🧭", bg: "#E0F2FE", desc: "Daftar toko & SPK kunjungan sales lapangan" },
    admin: { emoji: "🗂️", bg: "#FEF0C7", desc: "Follow up tagihan, FU H+1 kunjungan sales & FU Toko" },
    done: { emoji: "✅", bg: "#DCFAE6", desc: "Hasil follow-up yang sudah CLSD (disetujui)" },
    riwayat: { emoji: "📍", bg: "#F4EBFF", desc: "Kunjungan sales lapangan — lihat & koreksi hasil" },
  };
   // Hub = menu kerja saja.
  // - owner tidak punya menu kerja → 2 riwayatnya tampil sebagai kartu menu
  // - field/tele/supervisor: riwayat diakses lewat ikon di header
  const HUB = SEGS.filter((s: any) =>
    isOwner ? (s.key === "done" || s.key === "riwayat")
            : (s.key === "sales" || s.key === "admin")
  ).map((s: any) => ({ ...s, ...(HUB_META[s.key] ?? {}) }));

  // ← FASE 2: kartu tambahan — FU Toko (toko belum ambil bulan ini)
  if (!isOwner && !isField) {
    HUB.push({ key: "toko", label: "FU Toko", emoji: "🏪", bg: "#FEF0C7", desc: "Toko belum ambil bulan ini — hubungi & catat hasilnya" });
  }
  // ← Kartu menu SPK Jadwal (supervisor & sales lapangan)
  if (isSuper || isField) {
    HUB.push({
      key: "jadwal",
      label: "SPK Jadwal",
      emoji: "📅",
      bg: "#E0F2FE",
      desc: "Kunjungan hari ini sesuai jadwal bulanan — ketuk untuk check-in",
    });
  }

  const showAreaFilter = isSuper && (effSec === "sales" || effSec === "admin" || effSec === "done");

  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 86400000 - 1;
  const isTodaySel = day.toDateString() === new Date().toDateString();

  // ===== HEMAT: data tiap segmen baru ditarik saat segmennya memang dibuka =====
  const visited = useRef<Set<string>>(new Set());
  visited.current.add(effSec);              // tandai segmen yang sudah pernah dibuka
  const keep = (k: string) => visited.current.has(k);

  const areaArgs = isSuper && areaChip !== "ALL" ? { area: areaChip as any } : {};

  // ===== SPK SALES: 30 baris dulu; cari ≥2 huruf → dilempar ke server =====
  const storeAreaArg = isSuper
    ? (areaChip === "ALL" ? undefined : (areaChip as any))
    : (viewer as any)?.area;
  const storeQ = qDeb;
  const searchMode = storeQ.length >= 2;
  const salesOn = !!viewer && !isOwner && keep("sales");

  const storesPaged = useQuery(
    api.stores.listStoresPage,
    salesOn && !searchMode ? ({ area: storeAreaArg, take: storeTake } as any) : "skip"
  ) as any;
  const storesFound = useQuery(
    api.stores.searchStores,
    salesOn && searchMode ? ({ q: storeQ, area: storeAreaArg, limit: 30 } as any) : "skip"
  ) as any;
  const stores = searchMode ? storesFound : storesPaged;

  const piutangArgs = viewer && usesPiutang && keep("admin") ? areaArgs : "skip";
  const active = useQuery(api.piutang.listActive, piutangArgs as any) as any;

  const doneArgs = viewer && usesHist && keep("done") ? { ...areaArgs, from: dayStart, to: dayEnd } : "skip";
  const done = useQuery(api.piutang.listDone, doneArgs as any) as any;

  // ===== Follow-up orderan hari ini + riwayatnya =====
  const orderArgs = viewer && usesPiutang && keep("admin") ? areaArgs : "skip";
  const orderActive = useQuery(api.orderFollowups.listActive, orderArgs as any) as any;

  const orderDoneArgs = viewer && usesHist && keep("done") ? { ...areaArgs, from: dayStart, to: dayEnd } : "skip";
  const orderDone = useQuery(api.orderFollowups.listDone, orderDoneArgs as any) as any;


  // Badge jumlah: pakai query ringan (TabBar juga sudah memakainya, jadi praktis gratis)
  const pCount = useQuery(api.piutang.pendingCount, usesPiutang ? undefined : "skip") as any;
  const oCount = useQuery(api.orderFollowups.pendingCount, usesPiutang ? undefined : "skip") as any;
  const fuCounts = useQuery(api.activeStores.counts, !isOwner && !isField ? {} : "skip") as any;

  const canRvFilter = !!viewer && (isTele || isSuper || isOwner);
  const histArgs = effSec === "riwayat"
    ? { from: dayStart, to: dayEnd, ...(rvSalesId ? { salesId: rvSalesId as any } : {}) }
    : "skip";
  const hist = useQuery(api.visits.listHistory, histArgs as any) as any;

  // Daftar sales hanya perlu saat modal kunjungan manual dibuka
  const fieldSales = useQuery(api.visits.listFieldSales, isSuper && showManual ? undefined : "skip") as any;

  // Daftar sales untuk chip filter Riwayat Kunjungan (supervisor: semua; telemarketing: area sendiri; owner: semua)
  const rvSalesList = useQuery(
    api.users.listFieldSales,
    canRvFilter && effSec === "riwayat" ? (isTele ? { area: (viewer as any).area as any } : {}) : "skip"
  ) as any;

  const allStoresArgs = isSuper && showManual ? {} : "skip";
  const allStores = useQuery(api.stores.listStores, allStoresArgs as any) as any;

  // Sekali per sesi per hari: buat follow-up orderan dari kunjungan sales H-1 (idempoten).
  const todayKey = isoDay(new Date());
  useEffect(() => {
    if (!viewer || !usesPiutang) return;
    const key = `${viewer._id ?? "u"}:${todayKey}`;
    if (ensuredOrderKey === key) return;
    ensuredOrderKey = key;
    ensureOrder({}).catch(() => {
      if (ensuredOrderKey === key) ensuredOrderKey = null;   // gagal → boleh dicoba lagi
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, usesPiutang, todayKey]);

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }
  const areaLabel = viewer.area ?? "Semua Area";
  const isTodayStr = (d: string) => d === new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const anyToday = (done ?? []).some((it: any) => it.task.day && isTodayStr(it.task.day));
  const piutangPending = active !== undefined ? active.length : (pCount?.count ?? 0);

  const dkw = dq.trim().toLowerCase();
  const matchQ = (it: any) =>
    !dkw ||
    (it.task.storeName || "").toLowerCase().includes(dkw) ||
    (it.salesName || "").toLowerCase().includes(dkw);

  const piutangDoneRows = (done ?? []).filter(
    (it: any) => it.task.doneAt >= dayStart && it.task.doneAt <= dayEnd
  );
  const orderDoneRows = (orderDone ?? []).filter(
    (it: any) => it.task.doneAt >= dayStart && it.task.doneAt <= dayEnd
  );

  // ===== GABUNG PIUTANG + ORDERAN: 1 toko = 1 kartu =====
  const histGroups = groupHist([
    ...piutangDoneRows.filter(matchQ).map((it: any) => ({ kind: "piutang" as const, item: it, task: it.task })),
    ...orderDoneRows.filter(matchQ).map((it: any) => ({ kind: "order" as const, item: it, task: it.task })),
  ]);

  // ===== GABUNG SPK ADMIN: 1 toko = 1 kartu =====
  // Kunci: area + nama toko dinormalisasi. Kalau tidak ketemu pasangan → tampil
  // kartu terpisah (orderan saja), jadi tidak pernah salah gabung.
  const nk = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const groupMap = new Map<string, any>();
  for (const t of (active ?? [])) {
    const k = `${t.area}::${nk(t.storeName)}`;
    const g = groupMap.get(k) ?? { key: k, area: t.area, storeName: t.storeName, piutang: null, order: null };
    if (!g.piutang || (t.usia ?? 0) > (g.piutang.usia ?? 0)) g.piutang = t;
    groupMap.set(k, g);
  }
  for (const o of (orderActive ?? [])) {
    const k = `${o.area}::${o.nameKey || nk(o.storeName)}`;
    let g = groupMap.get(k);
    if (!g) {
      // Pass 2: cari yang namanya saling mengandung (mis. "WN Petshop" vs "WN Petshop Solo")
      const short = nk(o.storeName);
      const cand = Array.from(groupMap.values()).filter(
        (x: any) => x.area === o.area && x.piutang && !x.order &&
          (x.key.endsWith("::" + short) || x.key.includes(short + " ") || short.includes(x.key.split("::")[1]))
      );
      if (cand.length === 1) g = cand[0];
    }
    if (!g) {
      g = { key: k, area: o.area, storeName: o.storeName, piutang: null, order: null };
      groupMap.set(k, g);
    }
    if (!g.order || (o.visitedAt ?? 0) > (g.order.visitedAt ?? 0)) g.order = o;
  }
  const grouped = Array.from(groupMap.values()).sort((a: any, b: any) => {
    const pa = a.piutang ? 1 : 0, pb = b.piutang ? 1 : 0;
    if (pa !== pb) return pb - pa;                                // kartu ber-piutang naik ke atas
    if (a.piutang && b.piutang) return (b.piutang.usia ?? 0) - (a.piutang.usia ?? 0);
    return (a.storeName || "").localeCompare(b.storeName || "");   // orderan saja: urut nama toko
  });
  const orderPending = orderActive !== undefined ? orderActive.length : (oCount?.count ?? 0);
  const adminCount = piutangPending + orderPending;
  const adminShown = grouped.filter((g: any) =>
    adminFilter === "all" ? true : adminFilter === "piutang" ? !!g.piutang : !!g.order
  );

  const onSync = async () => {
    setSyncing(true);
    try {
      const r: any = await sync();
      // Sekalian buat follow-up orderan dari kunjungan sales H-1
      await ensureOrder({}).catch(() => {});
      Alert.alert("Selesai", `Data ditarik: ${r?.inserted ?? 0} baru, ${r?.updated ?? 0} diperbarui.`);
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setSyncing(false);
    }
  };

  // ← FASE 1: tutup tugas piutang (INPG → CLSD). Setelah CLSD petugas tidak bisa edit.
  const onCloseTask = (t: any) => {
    Alert.alert(
      "Setujui tugas ini? (CLSD)",
      `Piutang "${t.storeName}" akan ditutup dan pindah ke Riwayat. Petugas tidak bisa mengedit lagi.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, CLSD",
          onPress: async () => {
            try {
              await closeTask({ taskId: t._id });
              Alert.alert("Beres", "Tugas sudah CLSD.");
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  const onReopen = (t: any) => {
    Alert.alert(
      "Kembalikan ke Belum?",
      `Riwayat "${t.storeName}" akan kembali ke daftar Belum hari ini. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Kembalikan",
          style: "destructive",
          onPress: async () => {
            try {
              await reopenTask({ taskId: t._id });
              Alert.alert("Berhasil", "Berpindah ke daftar Belum.");
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  const openEdit = (t: any) => {
    setEdHasil(t.hasil ?? "");
    setEdDate(t.promiseDate ?? "");
    setEdMethod(t.payMethod ?? "");
    setEdNotes(t.notes ?? "");
    setEd(t);
  };

  const saveEdit = async () => {
    if (!ed) return;
    if (!edHasil) { Alert.alert("Hasil", "Pilih hasil follow-up."); return; }
    if (edHasil === "janji_bayar" && !edDate.trim()) { Alert.alert("Tanggal", "Isi tanggal janji bayar (YYYY-MM-DD)."); return; }
    if ((edHasil === "lunas" || edHasil === "cicil") && !edMethod) { Alert.alert("Metode", "Pilih Tunai / Transfer."); return; }
    try {
      await editResult({
        taskId: ed._id,
        hasil: edHasil as any,
        promiseDate: edHasil === "janji_bayar" ? edDate.trim() : undefined,
        payMethod: (edHasil === "lunas" || edHasil === "cicil") ? (edMethod as any) : undefined,
        notes: edNotes.trim() || undefined,
      });
      Alert.alert("Tersimpan", "Hasil follow-up diperbarui.");
      setEd(null);
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    }
  };

  const doExport = async () => {
    if (!expFrom || !expTo) { Alert.alert("Rentang", "Pilih tanggal awal & akhir."); return; }
    if (expFrom.getTime() > expTo.getTime()) { Alert.alert("Rentang", "Tanggal awal lebih baru dari tanggal akhir."); return; }
    const fromMs = new Date(expFrom.getFullYear(), expFrom.getMonth(), expFrom.getDate()).getTime();
    const toMs = new Date(expTo.getFullYear(), expTo.getMonth(), expTo.getDate(), 23, 59, 59, 999).getTime();
    const HASIL_X: any = { janji_bayar: "Janji bayar", lunas: "Lunas", cicil: "Cicil", no_respon: "No respon" };
    const MET_X: any = { owner: "Owner", karyawan: "Karyawan", pic: "PIC", keluarga: "Keluarga", toko_tutup: "Toko Tutup" };
    const REASON_X: any = { stok_cukup: "Stok cukup", baru_order: "Baru order trip lalu", kalah_harga: "Kalah harga", harga_dipelajari: "Harga dipelajari", owner_tidak_ada: "Owner tidak ada", piutang: "Ada piutang" };
    setExpBusy(true);
    try {
      if (expSec === "done") {
        const data: any[] = await convex.query(api.piutang.exportDoneTasks, {
          from: fromMs,
          to: toMs,
          ...(isSuper && areaChip !== "ALL" ? { area: areaChip as any } : {}),
        });
        const rows = data.map((r: any) => [
          new Date(r.doneAt).toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          r.area, r.toko, r.total, r.piutang, r.cicil ?? "", r.retur ?? "", r.usia ?? "",
          HASIL_X[r.hasil] ?? r.hasil, r.janjiBayar, r.metode, r.catatan, r.sales,
        ]);
        const res = await exportCsv({
          fileName: `riwayat-followup_${isoDay(expFrom)}_${isoDay(expTo)}`,
          header: ["Tanggal", "Area", "Toko", "Total", "Piutang", "Cicil", "Retur", "Usia (hari)", "Hasil", "Janji Bayar", "Metode", "Catatan", "Dikerjakan"],
          rows,
          dialogTitle: "Ekspor Riwayat Follow-up Piutang",
        });
        Alert.alert("Ekspor selesai", `${res.rows} baris • ${res.file}`);
      } else {
        const data: any[] = await convex.query(api.visits.exportVisits, { from: fromMs, to: toMs });
        const rows = data.map((r: any) => [
          new Date(r.tanggal).toLocaleDateString("id-ID"),
          new Date(r.tanggal).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          r.sales, r.area, r.toko, MET_X[r.bertemu] ?? r.bertemu, r.bayar,
          r.nominal != null ? "Rp" + Number(r.nominal).toLocaleString("id-ID") : "",
          r.metode, r.janjiBayar, r.order, REASON_X[r.alasan] ?? r.alasan, r.trend, r.keterangan, r.durasiMenit,
        ]);
        const res = await exportCsv({
          fileName: `riwayat-kunjungan_${isoDay(expFrom)}_${isoDay(expTo)}`,
          header: ["Tanggal", "Jam", "Sales", "Area", "Toko", "Bertemu", "Bayar", "Nominal", "Metode", "Janji Bayar", "Order", "Alasan Tidak Order", "Trend", "Keterangan", "Durasi (mnt)"],
          rows,
          dialogTitle: "Ekspor Riwayat Kunjungan Sales",
        });
        Alert.alert("Ekspor selesai", `${res.rows} baris • ${res.file}`);
      }
    } catch (e: any) {
      Alert.alert("Ekspor Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setExpBusy(false);
    }
  };

  const shiftDay = (n: number) =>
    setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));

  const openManual = () => {
    setMvSalesId(null);
    setMvStoreId(null);
    setMvStoreQ("");
    setMvNotes("");
    setShowManual(true);
  };

  const saveManual = async () => {
    if (!mvSalesId) { Alert.alert("Sales", "Pilih sales terlebih dahulu."); return; }
    if (!mvStoreId) { Alert.alert("Toko", "Pilih toko terlebih dahulu."); return; }
    setMvBusy(true);
    try {
      await addManual({
        salesId: mvSalesId as any,
        storeId: mvStoreId as any,
        dayMs: dayStart,
        notes: mvNotes.trim() || undefined,
      });
      Alert.alert("Tersimpan", `Kunjungan manual untuk ${fmtTgl(day)} berhasil ditambahkan.`);
      setShowManual(false);
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setMvBusy(false);
    }
  };

  // Hasil pencarian server sudah tersaring; mode daftar disaring di HP (kata kunci 1 huruf)
  const filtered = searchMode
    ? (stores ?? [])
    : (stores ?? []).filter((s: any) => {
        const t = storeQ.toLowerCase();
        return !t || s.name.toLowerCase().includes(t) || (s.address || "").toLowerCase().includes(t);
      });

  // ===== Kartu SPK Sales (daftar toko) =====
  const renderSales = ({ item }: any) => {
    const hasLoc = item.lat != null;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/store/${item._id}`)} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            {isSuper && item.area ? (
              <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.area] ?? "#F2F4F7" }]}>
                <Text style={[styles.areaChipText, { color: AREA_TX[item.area] ?? GRAY }]}>{item.area}</Text>
              </View>
            ) : null}
          </View>
          {item.address ? <Text style={styles.cardAddr} numberOfLines={2}>{item.address}</Text> : null}
          <View style={[styles.coordPill, hasLoc ? styles.coordPillOk : styles.coordPillNo]}>
            <Text style={[styles.coordPillText, hasLoc ? styles.coordPillTextOk : styles.coordPillTextNo]}>
              {hasLoc ? "📍 Ada koordinat" : "⚠ Belum ada koordinat"}
            </Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.checkinHint}>Check-in</Text>
          <Text style={styles.arrowTxt}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ===== Kartu SPK Admin: 1 toko = 1 kartu (piutang + orderan) — ringkas → rinci =====
  const renderAdminGroup = ({ item: g }: any) => {
    const p = g.piutang;
    const od = g.order;
    const open = admOpen === g.key;
    const st = (p as any)?.workflowStatus ?? (od as any)?.workflowStatus ?? "OPEN";
    const jenisWf = bulkJenis === "p" ? (p as any)?.workflowStatus : (od as any)?.workflowStatus;
    const bisaPilih = bulk.pilih && !!bulkJenis && jenisWf === "INPG";

    return (
      <View style={styles.admCard}>
        <TouchableOpacity
          activeOpacity={bisaPilih ? 0.6 : 0.85}
          onPress={() => (bisaPilih ? bulk.toggle(g.key) : setAdmOpen(open ? null : g.key))}
        >
          <View style={styles.admHead}>
            {bulk.pilih ? <SelectBox checked={bulk.terpilih.has(g.key) && bisaPilih} /> : null}
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.cardName} numberOfLines={2}>{g.storeName}</Text>

              <View style={styles.admBadgeRow}>
                {p ? (
                  <View style={[styles.admBadge, { backgroundColor: "#FFF1F0", borderColor: "#FECDCA" }]}>
                    <Text style={[styles.admBadgeText, { color: "#B42318" }]}>PIUTANG</Text>
                  </View>
                ) : null}
                {od ? (
                  <View style={[styles.admBadge, { backgroundColor: "#E0F2FE", borderColor: "#B2DDFF" }]}>
                    <Text style={[styles.admBadgeText, { color: "#026AA2" }]}>ORDERAN</Text>
                  </View>
                ) : null}
                {p?.usia != null ? (
                  <View style={[styles.admBadge, { backgroundColor: p.usia >= 90 ? "#FEE4E2" : "#F2F4F7", borderColor: p.usia >= 90 ? "#FECDCA" : "#EAECF0" }]}>
                    <Text style={[styles.admBadgeText, { color: p.usia >= 90 ? RED : GRAY }]}>{p.usia} hari</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.admRight}>
              <View style={styles.admRightRow}>
                {(isSuper || isOwner) && g.area ? (
                  <View style={[styles.areaChip, { backgroundColor: AREA_BG[g.area] ?? "#F2F4F7" }]}>
                    <Text style={[styles.areaChipText, { color: AREA_TX[g.area] ?? GRAY }]}>{g.area}</Text>
                  </View>
                ) : null}
                <SpkStatusBadge status={st} />
              </View>
              <Text style={styles.admChev}>{open ? "▴" : "▾"}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {open ? (
          <View style={styles.admBody}>
            {p ? (
              <View style={styles.admBodyRow}>
                <Text style={styles.admBodyTitle}>PIUTANG</Text>
                <Text style={styles.admBodyLine}>
                  Sisa {rupiah(p.piutang ?? p.total)} • Total {rupiah(p.total)} • Cicil {rupiah(p.cicil)} • Retur {rupiah(p.retur)}
                </Text>
                {p.tanggal ? <Text style={styles.admBodyLine}>Tgl tagihan: {p.tanggal}</Text> : null}
                {p.usia != null ? <Text style={styles.admBodyLine}>Usia: {p.usia} hari</Text> : null}

                {(p as any).workflowStatus === "INPG" ? (
                  <View style={styles.reviewBox}>
                    <Text style={styles.reviewTitle}>HASIL DIISI PETUGAS</Text>
                    <Text style={styles.reviewLine}>Hasil: {(HASIL_LABEL as any)[p.hasil] ?? p.hasil ?? "-"}</Text>
                    {p.hasil === "janji_bayar" && p.promiseDate ? <Text style={styles.reviewLine}>Janji bayar: {p.promiseDate}</Text> : null}
                    {p.payMethod ? <Text style={styles.reviewLine}>Metode: {p.payMethod}</Text> : null}
                    {p.notes ? <Text style={styles.reviewLine}>Catatan: {p.notes}</Text> : null}
                    {p.doneByName ? <Text style={styles.reviewLine}>Diisi oleh: {p.doneByName}</Text> : null}
                    {(p as any).photoUrl ? (
                      <TouchableOpacity style={styles.badgeRow} onPress={() => setOdView((p as any).photoUrl)}>
                        <Image source={{ uri: (p as any).photoUrl }} style={styles.shotThumbSm} />
                        <Text style={[styles.cardSub, { marginLeft: 8, color: "#7A2E0E" }]}>Bukti • ketuk untuk perbesar</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.reviewLine}>Bukti: tidak ada</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.admBodyLine}>
                    {(p as any).workflowStatus === "CLSD" ? "Sudah CLSD (disetujui)." : "Belum ada hasil dari petugas."}
                  </Text>
                )}

                <TouchableOpacity style={styles.actBtn} onPress={() => router.push(`/spk/${p._id}` as any)}>
                  <AppIcon name="edit" size={13} color="#344054" style={{ marginRight: 5 }} />
                  <Text style={styles.actBtnText}>Buka SPK Piutang</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {od ? (
              <View style={styles.admBodyRow}>
                <Text style={[styles.admBodyTitle, { color: "#026AA2" }]}>ORDERAN</Text>
                <Text style={styles.admBodyLine}>
                  Kunjungan {od.visitDay || "H-1"} • {od.salesName || "-"}{od.visitCount > 1 ? ` (${od.visitCount}x)` : ""}
                </Text>
                <Text style={styles.admBodyLine}>
                  {od.ordered === true
                    ? `Order ${od.orderItems?.length ?? 0} produk`
                    : od.visitMetWith === "toko_tutup"
                      ? "Toko tutup saat dikunjungi"
                      : (od.visitReason ? (REASON_LABEL[od.visitReason] ?? od.visitReason) : "Tidak order")}
                </Text>

                {(od as any).workflowStatus === "INPG" ? (
                  <View style={styles.reviewBox}>
                    <Text style={styles.reviewTitle}>HASIL DIISI PETUGAS</Text>
                    <Text style={styles.reviewLine}>Hasil: {(ORDER_HASIL_LABEL as any)[od.hasil] ?? od.hasil ?? "-"}</Text>
                    {od.notes ? <Text style={styles.reviewLine}>Catatan: {od.notes}</Text> : null}
                    {od.doneByName ? <Text style={styles.reviewLine}>Diisi oleh: {od.doneByName}</Text> : null}
                    {(od as any).photoUrl ? (
                      <TouchableOpacity style={styles.badgeRow} onPress={() => setOdView((od as any).photoUrl)}>
                        <Image source={{ uri: (od as any).photoUrl }} style={styles.shotThumbSm} />
                        <Text style={[styles.cardSub, { marginLeft: 8, color: "#7A2E0E" }]}>Bukti chat WA • ketuk untuk perbesar</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.reviewLine}>Bukti chat: tidak ada</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.admBodyLine}>
                    {(od as any).workflowStatus === "CLSD" ? "Sudah CLSD (disetujui)." : "Belum ada hasil dari petugas."}
                  </Text>
                )}

                <View style={styles.actRow}>
                  {(od as any).workflowStatus === "OPEN" && !bulk.pilih ? (
                    <TouchableOpacity
                      style={[styles.actBtn, { backgroundColor: "#026AA2", borderColor: "#026AA2" }]}
                      onPress={() => openOrder(od, false)}
                    >
                      <AppIcon name="edit" size={13} color="#fff" style={{ marginRight: 5 }} />
                      <Text style={[styles.actBtnText, { color: "#fff" }]}>Kerjakan</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.actBtn} onPress={() => router.push(`/spk-detail-order/${od._id}` as any)}>
                    <AppIcon name="eye" size={13} color="#344054" style={{ marginRight: 5 }} />
                    <Text style={styles.actBtnText}>Buka Detail Orderan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {!bulk.pilih && isSuper && ((p as any)?.workflowStatus === "INPG" || (od as any)?.workflowStatus === "INPG") ? (
          <View style={styles.actRow}>
            {p && (p as any).workflowStatus === "INPG" ? (
              <TouchableOpacity style={styles.actBtn} onPress={() => onCloseTask(p)}>
                <AppIcon name="check" size={13} color="#067647" style={{ marginRight: 5 }} />
                <Text style={[styles.actBtnText, { color: "#067647" }]}>Setujui Piutang</Text>
              </TouchableOpacity>
            ) : null}
            {od && (od as any).workflowStatus === "INPG" ? (
              <TouchableOpacity style={styles.actBtn} onPress={() => onCloseOrder(od)}>
                <AppIcon name="check" size={13} color="#067647" style={{ marginRight: 5 }} />
                <Text style={[styles.actBtnText, { color: "#067647" }]}>Setujui Orderan</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };


  // ===== Label warna =====
  const HASIL_LABEL: any = { janji_bayar: "Janji bayar", lunas: "Lunas", cicil: "Cicil", no_respon: "No Respon" };
  const HASIL_BG: any = { janji_bayar: "#FEF0C7", lunas: "#DCFAE6", cicil: "#E0F2FE", no_respon: "#F2F4F7" };
  const HASIL_TX: any = { janji_bayar: "#B54708", lunas: "#067647", cicil: "#026AA2", no_respon: "#475467" };
  const ORDER_HASIL_LABEL: any = { order_masuk: "Order masuk", order_tambah: "Order tambahan", tidak_order: "Tidak order", no_respon: "No Respon" };
  const ORDER_HASIL_BG: any = { order_masuk: "#DCFAE6", order_tambah: "#E0F2FE", tidak_order: "#FEE4E2", no_respon: "#F2F4F7" };
  const ORDER_HASIL_TX: any = { order_masuk: "#067647", order_tambah: "#026AA2", tidak_order: "#B42318", no_respon: "#475467" };

  // ===== Follow-up orderan: handler =====
  const openOrder = (t: any, edit: boolean, screenshotUrl?: string, doneByName?: string) => {
    setOdHasil(t.hasil ?? "");
    setOdNotes(t.notes ?? "");
    setOdShot(null);
    setOdShotId(t.screenshot ?? "");
    setOdUrl(screenshotUrl ?? "");
    setOdDoneBy(doneByName ?? "");
    setOdEdit(edit);
    setOd(t);
  };

  // Tutup + bersihkan, supaya buka berikutnya selalu mulai dari mode detail/form
  const closeOrder = () => {
    setOd(null);
    setOdEdit(false);
    setOdShot(null);
    setOdShotId("");
    setOdUrl("");
    setOdDoneBy("");
  };

  const takeOrderShot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin Galeri", "Aktifkan izin galeri untuk memilih bukti chat WA.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    setOdShot({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  };

  const uploadOrderShot = async (): Promise<string> => {
    if (!odShot) throw new Error("Belum ada bukti yang dipilih.");
    const url = await generateUploadUrl();
    const file = new File(odShot.uri);
    const up = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": odShot.mime },
      body: file,
    });
    if (!up.ok) throw new Error("Upload bukti gagal (" + up.status + ").");
    const json: any = await up.json();
    return json.storageId;
  };

  const saveOrder = async () => {
    if (!od) return;
    if (!odHasil) { Alert.alert("Hasil", "Pilih hasil follow-up."); return; }
    if (!odShot && !odShotId) { Alert.alert("Bukti chat WA", "Lampirkan bukti chat WhatsApp dulu."); return; }
    setOdBusy(true);
    try {
      let shotId = odShotId;
      if (odShot) shotId = await uploadOrderShot();
      await completeOrder({ taskId: od._id, hasil: odHasil as any, notes: odNotes.trim() || undefined, screenshot: shotId });
      Alert.alert("Tersimpan", "Follow-up orderan tersimpan — menunggu review supervisor.");
      closeOrder();
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setOdBusy(false);
    }
  };

  const saveOrderEdit = async () => {
    if (!od) return;
    if (!odHasil) { Alert.alert("Hasil", "Pilih hasil follow-up."); return; }
    setOdBusy(true);
    try {
      let shotId = odShotId;
      if (odShot) shotId = await uploadOrderShot();
      await editOrderResult({ taskId: od._id, hasil: odHasil as any, notes: odNotes.trim() || undefined, screenshot: shotId || undefined });
      Alert.alert("Tersimpan", "Hasil follow-up orderan diperbarui.");
      closeOrder();
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setOdBusy(false);
    }
  };

  const onCloseOrder = (t: any) => {
    Alert.alert(
      "Setujui tugas ini? (CLSD)",
      `Orderan "${t.storeName}" akan ditutup. Petugas tidak bisa mengedit lagi.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, CLSD",
          onPress: async () => {
            try {
              await closeOrderTask({ taskId: t._id });
              Alert.alert("Beres", "Tugas sudah CLSD.");
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  const onReopenOrder = (t: any) => {
    Alert.alert(
      "Kembalikan ke Belum?",
      `Orderan "${t.storeName}" akan kembali ke daftar Belum hari ini. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Kembalikan",
          style: "destructive",
          onPress: async () => {
            try {
              await reopenOrder({ taskId: t._id });
              Alert.alert("Berhasil", "Berpindah ke daftar Belum.");
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  // ===== Kartu Riwayat Follow-up: 1 toko = 1 kartu (piutang + orderan) =====
  const renderHistGroup = ({ item: g }: any) => {
    const piuRows: any[] = Array.isArray(g.piutang) ? g.piutang : [];
    const ordRows: any[] = Array.isArray(g.order) ? g.order : [];
    const sisaTotal = piuRows.reduce((s: number, r: any) => s + (Number(r?.task?.piutang) || 0), 0);
    const adaSisa = piuRows.some((r: any) => r?.task?.piutang != null);

    // status ringkas untuk badge di pojok kanan (INPG > OPEN > CLSD)
    const allRows = [...piuRows, ...ordRows];
    const wfsG = allRows.some((r: any) => r?.task?.workflowStatus === "INPG")
      ? "INPG"
      : allRows.some((r: any) => r?.task?.workflowStatus === "OPEN")
        ? "OPEN"
        : "CLSD";

    return (
      <View style={styles.histCard}>
        {/* Header: nama toko + area + status */}
        <View style={styles.cardHead}>
          <Text style={[styles.cardName, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{g.storeName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            {g.area ? (
              <View style={[styles.areaChip, { backgroundColor: AREA_BG[g.area] ?? "#F2F4F7" }]}>
                <Text style={[styles.areaChipText, { color: AREA_TX[g.area] ?? GRAY }]}>{g.area}</Text>
              </View>
            ) : null}
            <SpkStatusBadge status={wfsG} style={{ marginLeft: 6 }} />
          </View>
        </View>

        {/* Ringkasan: sisa piutang & jumlah tugas orderan */}
        {(piuRows.length > 0 || ordRows.length > 0) ? (
          <View style={styles.histStatRow}>
            {piuRows.length > 0 ? (
              <View style={[styles.histStatBox, ordRows.length === 0 && styles.histStatBoxLast]}>
                <Text style={styles.histStatLabel}>{adaSisa ? "SISA PIUTANG" : "PIUTANG"}</Text>
                <Text
                  style={[styles.histStatValue, adaSisa && sisaTotal > 0 && { color: RED }]}
                  numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                >
                  {adaSisa ? rupiah(sisaTotal) : `${piuRows.length} tugas`}
                </Text>
              </View>
            ) : null}
            {ordRows.length > 0 ? (
              <View style={[styles.histStatBox, styles.histStatBoxLast]}>
                <Text style={styles.histStatLabel}>ORDERAN</Text>
                <Text style={styles.histStatValue} numberOfLines={1}>{ordRows.length} tugas</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {piuRows.map((r: any) => {
          const t = r.task;
          return (
            <View key={"p" + t._id} style={styles.subRow}>
              <TouchableOpacity onPress={() => router.push(`/spk-detail/${t._id}`)}>
                <View style={styles.subHead}>
                  <View style={[styles.typeChip, { backgroundColor: "#FFF1F0" }]}>
                    <Text style={[styles.typeChipText, { color: "#B42318" }]}>PIUTANG</Text>
                  </View>
                  <View style={[styles.hasilChip, { backgroundColor: HASIL_BG[t.hasil] ?? "#F2F4F7" }]}>
                    <Text style={[styles.hasilText, { color: HASIL_TX[t.hasil] ?? GRAY }]}>
                      {HASIL_LABEL[t.hasil] ?? t.hasil ?? "-"}
                      {t.hasil === "janji_bayar" && t.promiseDate ? " • " + t.promiseDate : ""}
                      {t.payMethod ? " • " + t.payMethod : ""}
                    </Text>
                  </View>
                </View>

                {t.total != null || t.piutang != null ? (
                  <Text style={styles.cardSub2}>
                    {t.total != null ? `Total ${rupiah(t.total)} • Sisa ${rupiah(t.piutang)}` : `Sisa ${rupiah(t.piutang)}`}
                    {t.usia != null ? ` • usia ${t.usia} hari` : ""}
                  </Text>
                ) : null}
                {t.notes ? <Text style={styles.cardSub} numberOfLines={2}>{t.notes}</Text> : null}

                <View style={styles.badgeRow}>
                  <AppIcon name="check" size={13} color={GREEN} style={{ marginRight: 5 }} />
                  <Text style={styles.doneBy}>
                    {r.salesName || r.item?.salesName || "-"} • {t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </Text>
                  <Text style={styles.arrowTxt}>›</Text>
                </View>
              </TouchableOpacity>

              {isSuper ? (
                <View style={styles.actRow}>
                  <TouchableOpacity style={styles.actBtn} onPress={() => onReopen(t)}>
                    <AppIcon name="refresh" size={13} color="#344054" style={{ marginRight: 5 }} />
                    <Text style={styles.actBtnText}>Buka Kembali</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actBtn} onPress={() => openEdit(t)}>
                    <AppIcon name="edit" size={13} color="#344054" style={{ marginRight: 5 }} />
                    <Text style={styles.actBtnText}>Edit Hasil</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {ordRows.map((r: any) => {
          const t = r.task;
          const shot = r.screenshotUrl || r.item?.screenshotUrl || "";
          const oleh = r.salesName || r.item?.salesName || "";
          return (
            <View key={"o" + t._id} style={styles.subRow}>
              <TouchableOpacity onPress={() => router.push(`/spk-detail-order/${t._id}` as any)}>
                <View style={styles.subHead}>
                  <View style={[styles.typeChip, { backgroundColor: "#E0F2FE" }]}>
                    <Text style={[styles.typeChipText, { color: "#026AA2" }]}>ORDERAN</Text>
                  </View>
                  <View style={[styles.hasilChip, { backgroundColor: ORDER_HASIL_BG[t.hasil] ?? "#F2F4F7" }]}>
                    <Text style={[styles.hasilText, { color: ORDER_HASIL_TX[t.hasil] ?? GRAY }]}>
                      {ORDER_HASIL_LABEL[t.hasil] ?? t.hasil ?? "-"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardSub2} numberOfLines={1}>
                  dikunjungi {t.salesName || "-"}{t.visitDay ? ` (${t.visitDay})` : ""}
                </Text>
                {t.notes ? <Text style={styles.cardSub} numberOfLines={2}>{t.notes}</Text> : null}
                {shot ? (
                  <TouchableOpacity style={styles.badgeRow} onPress={() => setOdView(shot)}>
                    <Text style={styles.cardSub}>📎 Bukti chat WA — ketuk untuk lihat detail</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.badgeRow}>
                  <AppIcon name="check" size={13} color={GREEN} style={{ marginRight: 5 }} />
                  <Text style={styles.doneBy}>
                    {oleh || "-"} • {t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </Text>
                  <Text style={styles.arrowTxt}>›</Text>
                </View>
              </TouchableOpacity>

              {isSuper ? (
                <View style={styles.actRow}>
                  <TouchableOpacity style={styles.actBtn} onPress={() => onReopenOrder(t)}>
                    <AppIcon name="refresh" size={13} color="#344054" style={{ marginRight: 5 }} />
                    <Text style={styles.actBtnText}>Buka Kembali</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actBtn} onPress={() => openOrder(t, true, shot, oleh)}>
                    <AppIcon name="edit" size={13} color="#344054" style={{ marginRight: 5 }} />
                    <Text style={styles.actBtnText}>Edit Hasil</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  // ===== Hapus kunjungan (supervisor) =====
  const onDeleteVisit = (v: any) => {
    Alert.alert("Hapus Kunjungan?", "Kunjungan ini akan dihapus permanen dari riwayat. Lanjutkan?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya, Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVisit({ visitId: v._id });
            Alert.alert("Terhapus", "Kunjungan dihapus.");
          } catch (e: any) {
            Alert.alert("Gagal", toFriendlyError(e));
          }
        },
      },
    ]);
  };

  // ===== Kartu Riwayat Kunjungan =====
  const renderHist = ({ item }: any) => {
    const v = item.visit;
    const dur = Number(v.durationMin || 0);
    const storeName = item.store?.name ?? "Toko terhapus";

    // Kotak hasil: bayar / janji bayar + order / tidak order
    const hasil: any[] = [];
    if (v.paid) hasil.push({ key: "bayar", label: "BAYAR", value: `${rupiah(v.paidAmount ?? 0)} • ${v.payMethod === "tunai" ? "Tunai" : "Transfer"}`, tone: "ok" });
    else if (v.promiseDate) hasil.push({ key: "janji", label: "JANJI BAYAR", value: String(v.promiseDate), tone: "warn" });
    if (v.ordered) hasil.push({ key: "order", label: "ORDER", value: `${v.orderItems?.length ?? 0} produk`, tone: "info" });
    else if (v.noOrderReason) hasil.push({ key: "noorder", label: "TIDAK ORDER", value: REASON_LABEL[v.noOrderReason] ?? String(v.noOrderReason), tone: "bad" });

    return (
      <View style={styles.rvCard}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push(`/visit-detail/${v._id}`)}>
          {/* Header: toko + sales, foto di kanan */}
          <View style={styles.cardHead}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={styles.rvNameRow}>
                {isSuper && (v as any).isMock ? <View style={styles.rvDot} /> : null}
                <Text style={styles.cardName} numberOfLines={2}>{storeName}</Text>
                <SpkStatusBadge status={(v as any).workflowStatus} style={{ marginLeft: 6 }} />
              </View>
              <Text style={styles.rvMetaLine} numberOfLines={1}>
                {item.salesName || "-"}{item.store?.area ? ` • ${item.store.area}` : ""}
              </Text>
            </View>
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <AppIcon name={item.hasSelfie ? "image" : "camera"} size={16} color={item.hasSelfie ? RED : GRAY} />
            </View>
          </View>

          {/* Tag: bertemu, jam, penanda khusus supervisor */}
          <View style={styles.rvTagRow}>
            <View style={styles.metChip}><Text style={styles.metChipText}>{MET_LABEL[v.metWith] ?? "-"}</Text></View>
            <View style={styles.timeChip}>
              <AppIcon name="clock" size={12} color="#475467" style={{ marginRight: 4 }} />
              <Text style={styles.timeChipText}>
                {fmtTime(v.checkinAt)}–{v.checkoutAt ? fmtTime(v.checkoutAt) : "-"}{dur > 0 ? ` • ${dur} mnt` : ""}
              </Text>
            </View>
            {isSuper && (v as any).source === "manual" ? (
              <View style={[styles.rvTag, { backgroundColor: "#DBEAFE" }]}>
                <Text style={[styles.rvTagText, { color: "#1D4ED8" }]}>manual • migrasi</Text>
              </View>
            ) : null}
          </View>

          {/* Kotak hasil kunjungan */}
          {hasil.length > 0 ? (
            <View style={styles.rvResultRow}>
              {hasil.map((h, i) => (
                <View key={h.key} style={[styles.rvResultBox, RV_TONE[h.tone], i === hasil.length - 1 && styles.rvResultBoxLast]}>
                  <Text style={[styles.rvResultLabel, { color: RV_TONE_TX[h.tone] }]}>{h.label}</Text>
                  <Text
                    style={[styles.rvResultValue, { color: RV_TONE_TX[h.tone] }]}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                  >
                    {h.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {(v as any).manualNote ? (
            <Text style={styles.rvNote} numberOfLines={2}>📝 {(v as any).manualNote}</Text>
          ) : null}

          <Text style={styles.rvMore}>Lihat detail ›</Text>
        </TouchableOpacity>

        {/* ← #8: aksi jadi 2 ikon (hapus + review) */}
        {isSuper ? (
          <View style={styles.rvActRow}>
            <TouchableOpacity style={styles.rvIconBtn} onPress={() => onDeleteVisit(v)} hitSlop={6}>
              <AppIcon name="trash" size={17} color="#B42318" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.rvIconBtn} onPress={() => router.push(`/visit-detail/${v._id}`)} hitSlop={6}>
              <AppIcon name="eye" size={17} color="#175CD3" />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  // ===== CLSD massal: setujui banyak tugas sekaligus =====
  const onCloseMany = () => {
    if (!bulkJenis) return;
    const ids = adminShown
      .filter((g: any) => bulk.terpilih.has(g.key))
      .map((g: any) => (bulkJenis === "p" ? g.piutang?._id : g.order?._id))
      .filter(Boolean) as any[];
    if (!ids.length) return;
    Alert.alert(
      `Setujui ${ids.length} tugas sekaligus? (CLSD)`,
      "Tugas terpilih akan ditutup dan pindah ke Riwayat. Petugas tidak bisa mengedit lagi.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, CLSD",
          onPress: async () => {
            try {
              const r: any = bulkJenis === "p"
                ? await closeTaskMany({ taskIds: ids })
                : await closeOrderTaskMany({ taskIds: ids });
              bulk.reset();
              Alert.alert(
                "Tersimpan",
                `${r?.closed ?? ids.length} tugas disetujui${r?.skippedCount ? `, ${r.skippedCount} dilewati (status berubah).` : "."}`
              );
            } catch (e: any) {
              Alert.alert("Gagal menyetujui", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  // ===== Sel kalender bulan ini (dipakai modal kalender) =====
  const calFirst = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const calDays = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 0).getDate();
  const calCells: (Date | null)[] = [];
  for (let i = 0; i < calFirst.getDay(); i++) calCells.push(null);
  for (let d = 1; d <= calDays; d++) calCells.push(new Date(calCursor.getFullYear(), calCursor.getMonth(), d));
  const sameDay = (a: Date | null, b: Date | null) =>
    !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const pickDate = (d: Date) => {
    if (calTarget === "day") setDay(d);
    else if (calTarget === "expFrom") setExpFrom(d);
    else setExpTo(d);
    setShowCal(false);
  };

    // ===== Filter area (supervisor) — dipakai di Sales, Admin, Riwayat Follow-up =====
  const AreaChipRow = (
    <View style={[styles.chipRow, { paddingHorizontal: 16, marginTop: 6 }]}>
      {["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => {
        const on = areaChip === a;
        return (
          <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setAreaChip(a)}>
            <Text style={[styles.chipText, on && styles.chipTextActive]}>{a === "ALL" ? "Semua" : a}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ===== Navigasi tanggal (Riwayat Follow-up & Riwayat Kunjungan) =====
  const dateNav = (
    <View style={styles.dateNav}>
      <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDay(-1)}>
        <Text style={styles.dateArrowText}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => { setCalTarget("day"); setCalCursor(day); setShowCal(true); }}>
        <Text style={styles.dateLabel}>{fmtTgl(day)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDay(1)}>
        <Text style={styles.dateArrowText}>›</Text>
      </TouchableOpacity>
    </View>
  );

  const emptyBox = (title: string, sub?: string) => (
    <View style={[styles.center, { paddingVertical: 40 }]}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {sub ? <Text style={styles.meta}>{sub}</Text> : null}
    </View>
  );

  const storeRows = (filtered ?? []) as any[];

  // Ikon riwayat di header: tampil untuk SEMUA role (termasuk sales lapangan).
  // Khusus owner saat masih di hub: disembunyikan, karena Riwayat Kunjungan &
  // Riwayat Follow-up sudah jadi kartu menu di hub.
  const showHistIcons = isOwner ? !hubOpen : (isSuper || isTele || isField);

  return (
    <View style={styles.screen}>
      {/* ================= HEADER ================= */}
      <View style={styles.topbar}>
        <View style={styles.topRow}>
          {hubOpen ? (
            <Text style={styles.topTitle}>Menu SPK</Text>
          ) : (
            <TouchableOpacity onPress={() => { setHubOpen(true); bulk.reset(); }} hitSlop={8}>
              <Text style={styles.backText}>‹ Menu</Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {showAreaFilter ? (
              <View style={styles.areaBadge}>
                <Text style={styles.areaBadgeText}>
                  {areaChip !== "ALL" ? areaChip : "Semua Area"}
                </Text>
              </View>
            ) : null}

            {showHistIcons ? (
              <TouchableOpacity style={styles.hdrIconBtn} onPress={() => { setSec("done"); setHubOpen(false); }}>
                <AppIcon name="check" size={19} color={C.primary} />
              </TouchableOpacity>
            ) : null}
            {showHistIcons ? (
              <TouchableOpacity style={styles.hdrIconBtn} onPress={() => { setSec("riwayat"); setHubOpen(false); }}>
                <AppIcon name="eye" size={19} color={C.primary} />
              </TouchableOpacity>
            ) : null}
            {effSec === "admin" && !hubOpen && isSuper ? (
              <TouchableOpacity style={styles.hdrIconBtn} onPress={onSync} disabled={syncing}>
                <AppIcon name="refresh" size={18} color={syncing ? GRAY : C.primary} />
              </TouchableOpacity>
            ) : null}
            {showHistIcons ? (
              <TouchableOpacity
                style={styles.hdrIconBtn}
                onPress={() => { setExpSec(isField ? "riwayat" : "done"); setExpFrom(day); setExpTo(day); setShowExp(true); }}
              >
                <AppIcon name="download" size={17} color={C.primary} />
              </TouchableOpacity>
            ) : null}
            {effSec === "riwayat" && !hubOpen && isSuper ? (
              <TouchableOpacity style={styles.hdrIconBtn} onPress={openManual}>
                <AppIcon name="plus" size={17} color={C.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {hubOpen ? null : <Text style={styles.title}>{secLabel}</Text>}
        <Text style={styles.meta}>{areaLabel} • {ROLE_LABEL[role] ?? role}</Text>
      </View>


      <View style={{ flex: 1 }}>
        {!hubOpen && showAreaFilter ? AreaChipRow : null}
        {/* ================= HUB MENU ================= */}
        {hubOpen ? (

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
            {HUB.map((h: any) => {
              const badge = h.key === "admin" ? adminCount : h.key === "toko" ? (fuCounts?.total?.open ?? 0) : 0;
              return (
                <TouchableOpacity
                  key={h.key}
                  style={styles.hubCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (h.key === "toko") { router.push("/toko-aktif" as any); return; }
                    if (h.key === "jadwal") { router.push("/jadwal" as any); return; }
                    setSec(h.key);
                    setHubOpen(false);
                  }}
                >
                  <View style={[styles.hubEmoji, { backgroundColor: h.bg ?? "#F2F4F7" }]}>
                    <Text style={{ fontSize: 22 }}>{h.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hubTitle}>{h.label}</Text>
                    <Text style={styles.hubDesc}>{h.desc}</Text>
                  </View>
                  {badge > 0 ? (
                    <View style={styles.hubBadge}><Text style={styles.hubBadgeText}>{badge}</Text></View>
                  ) : null}
                  <Text style={styles.arrowTxt}>›</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : effSec === "sales" ? (
          /* ================= SPK SALES ================= */
          <>
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="Cari nama toko / alamat..."
                placeholderTextColor="#98A2B3"
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {showAreaFilter ? (
              <View style={[styles.chipRow, { paddingHorizontal: 16, marginTop: 8 }]}>
                {["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => {
                  const on = areaChip === a;
                  return (
                    <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setAreaChip(a)}>
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>{a === "ALL" ? "Semua Area" : a}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <Text style={styles.listMeta}>
              {stores === undefined ? "Memuat toko…" : searchMode ? `${storeRows.length} hasil pencarian` : `${storeRows.length} toko`}
            </Text>
            <FlatList
              style={{ flex: 1 }}
              data={storeRows}
              keyExtractor={(item: any) => item._id}
              renderItem={renderSales}
              contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                !searchMode && storeRows.length >= storeTake ? (
                  <TouchableOpacity style={styles.moreBtn} onPress={() => setStoreTake(storeTake + 30)}>
                    <Text style={styles.moreBtnText}>Muat 30 toko lagi</Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                stores === undefined
                  ? <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
                  : emptyBox("Toko tidak ditemukan", "Coba kata kunci lain atau ubah filter area.")
              }
            />
          </>
        ) : effSec === "admin" ? (
          /* ================= SPK ADMIN ================= */
          <FlatList
            style={{ flex: 1 }}
            data={adminShown}
            keyExtractor={(g: any) => g.key}
            renderItem={renderAdminGroup}
            extraData={bulkKey}
            contentContainerStyle={{ padding: 16, paddingBottom: bulk.pilih ? 200 : 110 }}
            ListHeaderComponent={
              <>
                <View style={styles.chipRow}>
                  {([["all", `Semua (${adminCount})`], ["piutang", `Piutang (${piutangPending})`], ["order", `Orderan (${orderPending})`]] as any[]).map(([k, l]) => {
                    const on = adminFilter === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        style={[styles.chip, on && styles.chipActive]}
                        onPress={() => { if (!bulk.pilih) { setAdminFilter(k); bulk.reset(); } }}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextActive]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {adminCount > 0 ? (
                  <View style={styles.alertBanner}>
                    <AppIcon name="warn" size={15} color="#B42318" style={{ marginRight: 6 }} />
                    <Text style={styles.alertText}>Pengingat: {adminCount} follow-up belum dikerjakan hari ini.</Text>
                  </View>
                ) : null}

                {isSuper && !bulk.pilih && adminShown.length > 0 ? (
                  bulkJenis ? (
                    <View style={{ marginBottom: 10 }}>
                      <BulkToggle onPress={bulk.buka} />
                      <Text style={styles.cronNote}>
                        Hanya tugas berstatus menunggu review (INPG) yang bisa dipilih.
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.cronNote}>
                      Pilih filter Piutang atau Orderan untuk menyetujui banyak tugas sekaligus.
                    </Text>
                  )
                ) : null}
              </>
            }
            ListEmptyComponent={emptyBox("Tidak ada tugas hari ini", isSuper ? "Tekan ikon ⟳ di header untuk menarik data terbaru." : undefined)}
          />
        ) : effSec === "done" ? (
          /* ================= RIWAYAT FOLLOW-UP ================= */
          <>
            {dateNav}
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="Cari toko / petugas..."
                placeholderTextColor="#98A2B3"
                value={dq}
                onChangeText={setDq}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <FlatList
              style={{ flex: 1 }}
              data={histGroups}
              keyExtractor={(g: any) => g.key}
              renderItem={renderHistGroup}
              contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
              ListHeaderComponent={
                isTodaySel && (anyToday || orderDoneRows.length > 0) ? (
                  <View style={styles.okBanner}>
                    <AppIcon name="check" size={15} color="#067647" style={{ marginRight: 6 }} />
                    <Text style={styles.okText}>Ada yang sudah dikerjakan hari ini. Kerja bagus!</Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                done === undefined
                  ? <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
                  : emptyBox("Belum ada hasil follow-up", "Ubah tanggal atau kata kunci pencarian.")
              }
            />
          </>
        ) : (
          /* ================= RIWAYAT KUNJUNGAN ================= */
          <>
            {dateNav}
            {canRvFilter && (rvSalesList ?? []).length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46 }} contentContainerStyle={styles.salesWrap}>
                <TouchableOpacity
                  style={[styles.salesChip, !rvSalesId && styles.salesChipOn]}
                  onPress={() => setRvSalesId(undefined)}
                >
                  <Text style={[styles.salesChipText, !rvSalesId && styles.salesChipTextOn]} numberOfLines={1}>Semua sales</Text>
                </TouchableOpacity>
                {(rvSalesList ?? []).map((s: any) => {
                  const on = rvSalesId === s._id;
                  return (
                    <TouchableOpacity key={s._id} style={[styles.salesChip, on && styles.salesChipOn]} onPress={() => setRvSalesId(s._id)}>
                      <Text style={[styles.salesChipText, on && styles.salesChipTextOn]} numberOfLines={1}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
            <FlatList
              style={{ flex: 1 }}
              data={(hist ?? []) as any[]}
              keyExtractor={(it: any) => it.visit._id}
              renderItem={renderHist}
              contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
              ListEmptyComponent={
                hist === undefined
                  ? <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
                  : emptyBox("Belum ada kunjungan", "Tidak ada kunjungan pada tanggal ini.")
              }
            />
          </>
        )}
      </View>

      <TabBar active="spk" />

      {/* ================= BULK BAR (CLSD massal) ================= */}
      {bulk.pilih && bulkJenis ? (
        <BulkBar
          label={bulkJenis === "p" ? "Setujui tagihan" : "Setujui orderan"}
          count={bulk.terpilih.size}
          onAll={() =>
            bulk.pilihSemua(
              adminShown
                .filter((g: any) => (bulkJenis === "p" ? g.piutang : g.order)?.workflowStatus === "INPG")
                .map((g: any) => g.key)
            )
          }
          onCancel={bulk.reset}
          onClose={onCloseMany}
        />
      ) : null}

      {/* ================= MODAL: KALENDER ================= */}
      <Modal visible={showCal} transparent animationType="fade" onRequestClose={() => setShowCal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.calCard}>
            <View style={styles.calNav}>
              <TouchableOpacity style={styles.dateArrow} onPress={() => setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1))}>
                <Text style={styles.dateArrowText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calHeadText}>{MONTHS[calCursor.getMonth()]} {calCursor.getFullYear()}</Text>
              <TouchableOpacity style={styles.dateArrow} onPress={() => setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1))}>
                <Text style={styles.dateArrowText}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calGrid}>
              {DOW.map((d) => <Text key={d} style={styles.calDowText}>{d}</Text>)}
              {calCells.map((c, i) => {
                if (!c) return <View key={"e" + i} style={styles.calCell} />;
                const on =
                  calTarget === "day" ? sameDay(c, day)
                    : calTarget === "expFrom" ? sameDay(c, expFrom)
                      : sameDay(c, expTo);
                return (
                  <TouchableOpacity key={c.getTime()} style={[styles.calCell, on && styles.calCellOn]} onPress={() => pickDate(c)}>
                    <Text style={[styles.calCellText, on && styles.calCellTextOn]}>{c.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.edActions}>
              <TouchableOpacity style={[styles.edBtn, styles.edBtnCancel]} onPress={() => setShowCal(false)}>
                <Text style={styles.edBtnCancelText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EKSPOR ================= */}
      <Modal visible={showExp} transparent animationType="fade" onRequestClose={() => setShowExp(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ekspor Excel (CSV)</Text>
            <Text style={styles.modalSub}>Pilih jenis data & rentang tanggal.</Text>

            <View style={styles.chipRow}>
              {([["done", "Riwayat Follow-up"], ["riwayat", "Riwayat Kunjungan"]] as any[]).map(([k, l]) => {
                const on = expSec === k;
                return (
                  <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setExpSec(k)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.expLabel}>Dari</Text>
            <TouchableOpacity style={styles.expPick} onPress={() => { setCalTarget("expFrom"); setCalCursor(expFrom ?? new Date()); setShowCal(true); }}>
              <Text style={styles.expPickText}>{expFrom ? fmtTgl(expFrom) : "Pilih tanggal"}</Text>
            </TouchableOpacity>

            <Text style={styles.expLabel}>Sampai</Text>
            <TouchableOpacity style={styles.expPick} onPress={() => { setCalTarget("expTo"); setCalCursor(expTo ?? new Date()); setShowCal(true); }}>
              <Text style={styles.expPickText}>{expTo ? fmtTgl(expTo) : "Pilih tanggal"}</Text>
            </TouchableOpacity>

            {(!expFrom || !expTo) ? <Text style={styles.expErr}>Pilih tanggal awal & akhir.</Text> : null}

            <View style={styles.expActions}>
              <TouchableOpacity style={[styles.expBtn, styles.expBtnCancel]} onPress={() => setShowExp(false)}>
                <Text style={styles.expBtnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.expBtn, styles.expBtnSave, expBusy && { opacity: 0.6 }]}
                disabled={expBusy || !expFrom || !expTo}
                onPress={doExport}
              >
                <Text style={styles.expBtnSaveText}>{expBusy ? "Menyiapkan…" : "Ekspor"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: KUNJUNGAN MANUAL ================= */}
      <Modal visible={showManual} transparent animationType="fade" onRequestClose={() => setShowManual(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tambah Kunjungan Manual</Text>
            <Text style={styles.modalSub}>{fmtTgl(day)}</Text>

            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.edLabel}>Sales</Text>
              <View style={styles.chipRow}>
                {(fieldSales ?? []).map((s: any) => {
                  const on = mvSalesId === s._id;
                  return (
                    <TouchableOpacity key={s._id} style={[styles.chip, on && styles.chipActive]} onPress={() => setMvSalesId(s._id)}>
                      <Text style={[styles.chipText, on && styles.chipTextActive]} numberOfLines={1}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.edLabel}>Toko</Text>
              <TextInput
                style={styles.edInput}
                placeholder="Cari nama toko..."
                placeholderTextColor="#98A2B3"
                value={mvStoreQ}
                onChangeText={setMvStoreQ}
                autoCapitalize="none"
              />
              <View style={{ marginTop: 6 }}>
                {(allStores ?? [])
                  .filter((s: any) => !mvStoreQ.trim() || s.name.toLowerCase().includes(mvStoreQ.trim().toLowerCase()))
                  .slice(0, 20)
                  .map((s: any) => {
                    const on = mvStoreId === s._id;
                    return (
                      <TouchableOpacity
                        key={s._id}
                        style={[styles.odChip, on && { backgroundColor: "#FEE4E2", borderColor: "#FECDCA" }]}
                        onPress={() => setMvStoreId(s._id)}
                      >
                        <Text style={[styles.cardSub, on && { color: "#B42318", fontWeight: "800" }]} numberOfLines={1}>{s.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>

              <Text style={styles.edLabel}>Catatan</Text>
              <TextInput
                style={styles.edInput}
                placeholder="Catatan (opsional)"
                placeholderTextColor="#98A2B3"
                value={mvNotes}
                onChangeText={setMvNotes}
                multiline
              />
            </ScrollView>

            <View style={styles.edActions}>
              <TouchableOpacity style={[styles.edBtn, styles.edBtnCancel]} onPress={() => setShowManual(false)}>
                <Text style={styles.edBtnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.edBtn, styles.edBtnSave, mvBusy && { opacity: 0.6 }]}
                disabled={mvBusy}
                onPress={saveManual}
              >
                <Text style={styles.edBtnSaveText}>{mvBusy ? "Menyimpan…" : "Simpan"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: FOLLOW-UP ORDERAN ================= */}
      <Modal visible={!!od} transparent animationType="fade" onRequestClose={closeOrder}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{odEdit ? "Edit Hasil Orderan" : "Follow-up Orderan"}</Text>
            <Text style={styles.modalSub} numberOfLines={2}>{od?.storeName ?? ""}</Text>

            <ScrollView style={{ maxHeight: 430 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.edLabel}>Hasil follow-up</Text>
              <View style={styles.chipRow}>
                {Object.keys(ORDER_HASIL_LABEL).map((k) => {
                  const on = odHasil === k;
                  return (
                    <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setOdHasil(k)}>
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>{ORDER_HASIL_LABEL[k]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.edLabel}>Catatan</Text>
              <TextInput
                style={styles.edInput}
                placeholder="Catatan (opsional)"
                placeholderTextColor="#98A2B3"
                value={odNotes}
                onChangeText={setOdNotes}
                multiline
              />

              <Text style={styles.edLabel}>Bukti chat WA</Text>
              {(odUrl || odShot || odShotId) ? (
                <TouchableOpacity style={styles.shotRow} onPress={() => { if (odUrl || odShot) setOdView(odUrl || odShot?.uri || null); }}>
                  {odShot ? (
                    <Image source={{ uri: odShot.uri }} style={styles.shotImg} />
                  ) : (
                    <View style={[styles.shotImg, styles.thumbEmpty]}>
                      <AppIcon name="image" size={18} color={GRAY} />
                    </View>
                  )}
                  <Text style={styles.cardSub}>{odShot ? "Bukti baru dipilih" : "Bukti sudah tersimpan"}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.shotAdd} onPress={takeOrderShot}>
                <AppIcon name="camera" size={16} color={C.primary} style={{ marginRight: 6 }} />
                <Text style={styles.shotAddText}>{(odUrl || odShot || odShotId) ? "Ganti bukti" : "Pilih bukti chat WA"}</Text>
              </TouchableOpacity>

              {odDoneBy ? <Text style={styles.odInfo}>Dikerjakan: {odDoneBy}</Text> : null}
            </ScrollView>

            <View style={styles.edActions}>
              <TouchableOpacity style={[styles.edBtn, styles.edBtnCancel]} onPress={closeOrder}>
                <Text style={styles.edBtnCancelText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.edBtn, styles.edBtnSave, odBusy && { opacity: 0.6 }]}
                disabled={odBusy}
                onPress={odEdit ? saveOrderEdit : saveOrder}
              >
                <Text style={styles.edBtnSaveText}>{odBusy ? "Menyimpan…" : "Simpan"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: EDIT HASIL PIUTANG ================= */}
      <Modal visible={!!ed} transparent animationType="fade" onRequestClose={() => setEd(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Hasil Follow-up</Text>
            <Text style={styles.modalSub} numberOfLines={2}>{ed?.storeName ?? ""}</Text>

            <Text style={styles.edLabel}>Hasil</Text>
            <View style={styles.chipRow}>
              {Object.keys(HASIL_LABEL).map((k) => {
                const on = edHasil === k;
                return (
                  <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setEdHasil(k)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{HASIL_LABEL[k]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {edHasil === "janji_bayar" ? (
              <>
                <Text style={styles.edLabel}>Tanggal janji bayar (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.edInput}
                  placeholder="2026-10-05"
                  placeholderTextColor="#98A2B3"
                  value={edDate}
                  onChangeText={setEdDate}
                  autoCapitalize="none"
                />
              </>
            ) : null}

            {(edHasil === "lunas" || edHasil === "cicil") ? (
              <>
                <Text style={styles.edLabel}>Metode</Text>
                <View style={styles.chipRow}>
                  {([["tunai", "Tunai"], ["transfer", "Transfer"]] as any[]).map(([k, l]) => {
                    const on = edMethod === k;
                    return (
                      <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setEdMethod(k)}>
                        <Text style={[styles.chipText, on && styles.chipTextActive]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.edLabel}>Catatan</Text>
            <TextInput
              style={styles.edInput}
              placeholder="Catatan (opsional)"
              placeholderTextColor="#98A2B3"
              value={edNotes}
              onChangeText={setEdNotes}
              multiline
            />

            <View style={styles.edActions}>
              <TouchableOpacity style={[styles.edBtn, styles.edBtnCancel]} onPress={() => setEd(null)}>
                <Text style={styles.edBtnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.edBtn, styles.edBtnSave]} onPress={saveEdit}>
                <Text style={styles.edBtnSaveText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL: LIHAT BUKTI ================= */}
      <Modal visible={!!odView} transparent animationType="fade" onRequestClose={() => setOdView(null)}>
        <View style={styles.viewWrap}>
          {odView ? <Image source={{ uri: odView }} style={styles.viewImg} resizeMode="contain" /> : null}
          <TouchableOpacity style={styles.viewClose} onPress={() => setOdView(null)}>
            <Text style={styles.edBtnSaveText}>Tutup</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center" },
  meta: { fontSize: 12, color: GRAY, marginTop: 3 },

  // ===== Header =====
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 38 },
  backText: { color: RED, fontSize: 15, fontWeight: "800" },
  topTitle: { fontSize: 18, fontWeight: "900", color: C.ink, letterSpacing: 0.5 },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, marginTop: 6 },
  hdrIconBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", marginLeft: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border },
  areaBadge: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginRight: 4 },
  areaBadgeText: { fontSize: 11, fontWeight: "800", color: GRAY },

  // ===== Hub menu =====
  hubCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  hubEmoji: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  hubTitle: { fontSize: 16, fontWeight: "800", color: C.ink },
  hubDesc: { fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 17 },
  hubBadge: { backgroundColor: RED, borderRadius: 999, minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, alignItems: "center", marginLeft: 8 },
  hubBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  arrowTxt: { fontSize: 22, color: "#98A2B3", marginLeft: 8 },

  // ===== Filter / pencarian =====
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6, backgroundColor: C.surface },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  searchBox: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 11, fontSize: 15, color: C.ink },
  listMeta: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, fontSize: 12, fontWeight: "700", color: C.inkMuted },
  moreBtn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  moreBtnText: { color: C.inkSoft, fontWeight: "800", fontSize: 13 },

  // ===== Kartu umum / SPK Sales =====
  card: { flexDirection: "row", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardName: { fontSize: 15, fontWeight: "800", color: C.ink, marginRight: 6, flexShrink: 1 },
  cardAddr: { fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 18 },
  cardRight: { alignItems: "center", justifyContent: "center", marginLeft: 10 },
  checkinHint: { fontSize: 11, color: C.primary, fontWeight: "800" },
  coordPill: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, marginTop: 9, borderWidth: 1 },
  coordPillOk: { backgroundColor: "#ECFDF3", borderColor: "#ABEFC6" },
  coordPillNo: { backgroundColor: "#FFFAEB", borderColor: "#FEDF89" },
  coordPillText: { fontSize: 11, fontWeight: "700" },
  coordPillTextOk: { color: "#067647" },
  coordPillTextNo: { color: "#B54708" },
  areaChip: { borderRadius: R.xs, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 },
  areaChipText: { fontSize: 10, fontWeight: "800" },

  // ===== Kartu SPK Admin =====
  admCard: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  admHead: { flexDirection: "row", alignItems: "flex-start" },
  admBadgeRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
  admBadge: { borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4, borderWidth: 1 },
  admBadgeText: { fontSize: 10, fontWeight: "800" },
  actRow: { flexDirection: "row", marginTop: 8, flexWrap: "wrap" },
  actBtn: { flexDirection: "row", alignItems: "center", backgroundColor: C.status.neutral.bg, borderRadius: R.xs, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginBottom: 6 },
  actBtnText: { color: C.inkSoft, fontSize: 12, fontWeight: "800" },
  admRight: { alignItems: "flex-end" },
  admRightRow: { flexDirection: "row", alignItems: "center" },
  admChev: { fontSize: 12, color: C.inkFaint, fontWeight: "800", marginTop: 6 },
  admBody: { marginTop: 10 },
  admBodyRow: { paddingTop: 10 },
  admBodyTitle: { fontSize: 10, fontWeight: "900", color: "#B42318", letterSpacing: 0.4 },
  admBodyLine: { fontSize: 12, color: C.inkSoft, marginTop: 3, lineHeight: 17 },
  reviewBox: { backgroundColor: "#FFFAEB", borderWidth: 1, borderColor: "#FEDF89", borderRadius: R.md, padding: 10, marginTop: 8 },
  reviewTitle: { fontSize: 10, fontWeight: "900", color: "#B54708", letterSpacing: 0.4 },
  reviewLine: { fontSize: 12, color: "#7A2E0E", marginTop: 3 },
  shotThumbSm: { width: 44, height: 44, borderRadius: 8 },


  // ===== Banner =====
  alertBanner: { flexDirection: "row", alignItems: "center", backgroundColor: C.status.danger.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.status.danger.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  alertText: { color: C.status.danger.fg, fontSize: 13, fontWeight: "700", flex: 1 },
  okBanner: { flexDirection: "row", alignItems: "center", backgroundColor: C.status.success.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.status.success.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  okText: { color: C.status.success.fg, fontSize: 13, fontWeight: "700", flex: 1 },
  cronNote: { fontSize: 11, color: GRAY, marginTop: 2 },

  // ===== Navigasi tanggal =====
  dateNav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  dateArrow: { paddingHorizontal: 14, paddingVertical: 4 },
  dateArrowText: { fontSize: 24, color: C.primary, fontWeight: "800" },
  dateLabel: { fontSize: 15, fontWeight: "800", color: C.ink, textAlign: "center" },

  // ===== Chip filter sales =====
  salesWrap: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  salesChip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 8, backgroundColor: C.surface, maxWidth: 160 },
  salesChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  salesChipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  salesChipTextOn: { color: "#fff" },

  // ===== Riwayat Follow-up =====
  histCard: { backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  histStatRow: { flexDirection: "row", marginTop: 10 },
  histStatBox: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: R.md, padding: 9, marginRight: 8, borderWidth: 1, borderColor: C.divider },
  histStatBoxLast: { marginRight: 0 },
  histStatLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted },
  histStatValue: { fontSize: 15, fontWeight: "900", color: C.ink, marginTop: 2 },
  subRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 10 },
  subHead: { flexDirection: "row", alignItems: "center", marginBottom: 4, flexWrap: "wrap" },
  typeChip: { borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 },
  typeChipText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  hasilChip: { borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 },
  hasilText: { fontSize: 11, fontWeight: "800" },
  cardSub: { fontSize: 12, color: C.inkMuted, flex: 1 },
  cardSub2: { fontSize: 12, color: C.inkSoft, fontWeight: "600", flex: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  doneBy: { fontSize: 11, color: C.inkMuted, fontWeight: "600", flex: 1 },

  // ===== Riwayat Kunjungan =====
  rvCard: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  rvMetaLine: { fontSize: 12, color: C.inkMuted, marginTop: 3 },
  rvNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  rvDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#12B76A", marginRight: 7 },
  rvTagRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 10 },
  rvTag: { backgroundColor: C.chip.warning.bg, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 },
  rvTagText: { fontSize: 10, fontWeight: "800" },
  timeChip: { flexDirection: "row", alignItems: "center", backgroundColor: C.status.neutral.bg, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 },
  timeChipText: { fontSize: 11, fontWeight: "700", color: C.inkSoft },
  metChip: { backgroundColor: C.chip.danger.bg, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 },
  metChipText: { fontSize: 11, fontWeight: "800", color: C.chip.danger.fg },
  rvResultRow: { flexDirection: "row", marginTop: 10 },
  rvResultBox: { flex: 1, borderRadius: R.md, padding: 9, marginRight: 8, borderWidth: 1 },
  rvResultBoxLast: { marginRight: 0 },
  rvResultLabel: { fontSize: 10, fontWeight: "800" },
  rvResultValue: { fontSize: 13, fontWeight: "900", marginTop: 2 },
  rvNote: { fontSize: 12, color: C.inkSoft, marginTop: 8, lineHeight: 17 },
  rvMore: { fontSize: 12, color: C.primary, fontWeight: "800", marginTop: 10 },
  thumb: { width: 46, height: 46, borderRadius: 23, marginTop: 6 },
  thumbEmpty: { backgroundColor: C.status.neutral.bg, alignItems: "center", justifyContent: "center" },
  rvActRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  rvIconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: 8, backgroundColor: "#F8F9FB", borderWidth: 1, borderColor: "#EAECF0" },

  // ===== Modal umum =====
  modalWrap: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(16,24,40,0.45)" },
  modalCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: C.ink },
  modalSub: { fontSize: 12, color: GRAY, marginTop: 3, marginBottom: 10 },

  edLabel: { fontSize: 12, fontWeight: "800", color: C.inkMuted, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  edInput: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 12, fontSize: 15, color: C.ink, minHeight: 44 },
  edActions: { flexDirection: "row", marginTop: 22 },
  edBtn: { flex: 1, borderRadius: R.md, paddingVertical: 14, alignItems: "center", marginHorizontal: 4 },
  edBtnCancel: { backgroundColor: C.status.neutral.bg },
  edBtnCancelText: { color: C.inkSoft, fontWeight: "800", fontSize: 14 },
  edBtnSave: { backgroundColor: C.primary },
  edBtnSaveText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // ===== Modal ekspor =====
  expLabel: { fontSize: 12, fontWeight: "800", color: C.inkMuted, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  expPick: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14 },
  expPickText: { fontSize: 15, color: C.ink, fontWeight: "600" },
  expErr: { fontSize: 12, color: C.status.danger.fg, marginTop: 8, fontWeight: "600" },
  expActions: { flexDirection: "row", marginTop: 22 },
  expBtn: { flex: 1, borderRadius: R.md, paddingVertical: 14, alignItems: "center", marginHorizontal: 4 },
  expBtnCancel: { backgroundColor: C.status.neutral.bg },
  expBtnCancelText: { color: C.inkSoft, fontWeight: "800", fontSize: 14 },
  expBtnSave: { backgroundColor: C.status.success.fg },
  expBtnSaveText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // ===== Bukti chat =====
  shotRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceAlt, borderRadius: R.md, padding: 10, borderWidth: 1, borderColor: C.border },
  shotImg: { width: 56, height: 56, borderRadius: 10, marginRight: 10 },
  shotAdd: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingVertical: 12, marginTop: 8 },
  shotAddText: { fontSize: 13, fontWeight: "800", color: C.primary },
  odChip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 11, marginBottom: 6 },
  odInfo: { fontSize: 12, color: C.inkMuted, marginTop: 10, lineHeight: 17 },

  // ===== Lihat bukti =====
  viewWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", padding: 16 },
  viewImg: { width: "100%", height: "80%" },
  viewClose: { alignSelf: "center", backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: 30, paddingVertical: 12, marginTop: 18 },

  // ===== Kalender =====
  calCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: 16 },
  calNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  calHeadText: { fontSize: 16, fontWeight: "800", color: C.ink },
  calGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  calDowText: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "800", color: C.inkMuted, paddingVertical: 6 },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  calCellOn: { backgroundColor: C.primary },
  calCellText: { fontSize: 14, fontWeight: "700", color: C.ink },
  calCellTextOn: { color: "#fff" },
});
