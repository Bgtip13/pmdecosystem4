import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import AppIcon from "../components/AppIcon";
import DesktopShell from "../components/desktop/DesktopShell";
import {
  Avatar, Card, DataTable, EmptyState, IconTile, Kpi, Panel, Pill, SegBar, WebButton,
} from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { TONES } from "../components/desktop/ui";
import { A, FONT } from "../components/desktop/tokens";
import { AreaChart, Donut, HBarList, MiniBars, RadialClock } from "../components/desktop/charts";
import { ActivityRow } from "../components/desktop/feedItems";
import { KIND_META, kindOf, labelOf } from "../lib/activityMeta";
import { pcpAreas, pcpTotals, pcpWeekly, usePcpBulanan, usePcpMingguan } from "../components/home/usePcp";
import { isOwnerLike, ROLE_LABEL } from "../lib/roles";
import { EXTERNAL_LINKS, openExternal } from "../lib/externalLinks";
import PiutangCard from "../components/home/PiutangCard.web";

const TARGET = 7;
const web = (o: any) => o as any;

// ===== Bantuan format & tanggal =====
function todayRangeWIB() {
  const n = new Date(Date.now() + 7 * 3600 * 1000);
  const y = n.getUTCFullYear();
  const m = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  const from = Date.parse(`${y}-${m}-${d}T00:00:00+07:00`);
  return { from, to: from + 86400000 - 1, day: `${y}-${m}-${d}` };
}
function monthKeyWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}
function monthLabel(mk: string) {
  const [y, m] = mk.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}
const rp = (n?: number | null) =>
  n == null || isNaN(Number(n)) ? "–" : "Rp" + Math.round(Number(n)).toLocaleString("id-ID");
function compactRp(n?: number | null) {
  if (n == null || isNaN(Number(n))) return "–";
  const v = Number(n);
  if (Math.abs(v) >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return rp(v);
}
const pctText = (p?: number | null) => (p == null ? "–" : `${Math.round(p)}%`);
const tone = (p?: number | null) => (p == null ? A.muted : p < 50 ? A.red : p < 80 ? A.orange : A.green);
const toneKey = (p?: number | null): Tone => (p == null ? "gray" : p < 50 ? "red" : p < 80 ? "amber" : "green");
const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "–";
function fmtDur(ms: number) {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}
const upper = (v: any) => String(v ?? "").trim().toUpperCase();
function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 19 ? "Selamat sore" : "Selamat malam";
}
const firstName = (n?: string) => String(n ?? "").trim().split(/\s+/)[0] || "";
const dateLong = () =>
  new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ===== Kerangka halaman =====
export default function BerandaWeb() {
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return (
      <View style={s.loading}>
        <IOSSpinner size="large" color={A.ink} />
      </View>
    );
  }

  const role = viewer.role;
  const title = `${greeting()}, ${firstName(viewer.name)}`;
  const subtitle = `${dateLong()} • ${ROLE_LABEL[role] ?? role}${viewer.area ? ` • ${viewer.area}` : " • Semua area"}`;

  return (
    <DesktopShell active="beranda" title={title} subtitle={subtitle}>
      <View style={s.stack}>
        {role === "field" ? (
          <FieldHome />
        ) : role === "telemarketing" ? (
          <TeleHome viewer={viewer} />
        ) : role === "supervisor" ? (
          <SupervisorHome />
        ) : isOwnerLike(role) ? (
          <OwnerHome />
        ) : (
          <FallbackHome />
        )}

        {/* Piutang semua area (kartu menyembunyikan diri untuk peran yang tidak berhak) */}
        {role === "supervisor" || isOwnerLike(role) ? <PiutangCard /> : null}

        {/* Shortcut aplikasi lain: Cek Ekspedisi & Portal Aplikasi PMD (semua akun) */}
        <Panel title="Shortcut aplikasi" sub="Buka aplikasi PMD lain di tab baru">
          <View style={s.quickGrid}>
            {EXTERNAL_LINKS.map((it) => (
              <QuickLink key={it.key} icon={it.icon} tone="blue" label={it.label} desc={it.desc} onPress={() => openExternal(it.url)} />
            ))}
          </View>
        </Panel>
      </View>
    </DesktopShell>
  );
}

// ============================================================================
// SALES LAPANGAN
// ============================================================================
function FieldHome() {
  const router = useRouter();
  const range = useMemo(() => todayRangeWIB(), []);
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const summary = useQuery(api.visits.todaySummary, {}) as any;
  const history = useQuery(api.visits.listHistory, { from: range.from, to: range.to }) as any;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const pos = (summary?.doneCount ?? 0) + (ongoing?.visit ? 1 : 0);
  const pct = Math.min(100, (pos / TARGET) * 100);
  const reached = pos >= TARGET;
  const color = reached ? A.green : A.amber;
  const elapsed = ongoing?.visit ? now - ongoing.visit.checkinAt : 0;
  const rows = ((history ?? []) as any[]).slice(0, 8);
  const loading = summary === undefined || ongoing === undefined;
  const orders = rows.filter((it) => it.visit?.ordered === true).length;

  const cols: Col<any>[] = [
    { key: "t", label: "Toko", flex: 2, render: (it) => <Text style={s.cellStrong} numberOfLines={1}>{it.store?.name ?? "Toko"}</Text> },
    { key: "o", label: "Check-out", width: 100, render: (it) => <Text style={s.cell}>{fmtTime(it.visit?.checkoutAt)}</Text> },
    { key: "d", label: "Durasi", width: 100, render: (it) => <Text style={s.cell}>{fmtDur((it.visit?.checkoutAt ?? 0) - (it.visit?.checkinAt ?? 0))}</Text> },
    {
      key: "h", label: "Hasil", width: 130, align: "right",
      render: (it) => {
        const v = it.visit ?? {};
        const closed = v.metWith === "toko_tutup";
        return <Pill text={closed ? "Toko tutup" : v.ordered ? "Order" : "Tidak order"} tone={closed ? "gray" : v.ordered ? "green" : "amber"} dot size="sm" />;
      },
    },
  ];

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi icon="flag" tone={reached ? "green" : "amber"} label="Target harian" value={`${pos}/${TARGET}`} hint={reached ? "Target tercapai" : `${TARGET - pos} toko lagi`} viz={<SegBar parts={[{ value: pos, color }, { value: Math.max(0, TARGET - pos), color: A.borderSoft }]} height={8} />} />
        <Kpi icon="check" tone="green" label="Kunjungan selesai" value={summary?.doneCount ?? 0} hint="Hari ini" />
        <Kpi icon="clock" tone="blue" label="Total durasi" value={fmtDur(summary?.durMs ?? 0)} hint="Waktu di toko" />
        <Kpi icon="cart" tone="violet" label="Berorder" value={orders} hint={`dari ${rows.length} kunjungan selesai`} />
      </View>

      <View style={s.grid}>
        <Panel title="Target & kunjungan hari ini" sub="Kunjungan berjalan dihitung satu sampai check-out" basis={560}>
          {loading ? (
            <Loading text="Memuat kunjungan…" />
          ) : (
            <View style={s.heroRow}>
              <Donut parts={[{ value: pos, color }, { value: Math.max(0, TARGET - pos), color: A.borderSoft }]} size={150} stroke={16} center={`${pos}/${TARGET}`} sub="toko" />
              <View style={{ flex: 1, minWidth: 220, gap: 8 }}>
                {ongoing?.visit ? (
                  <>
                    <Pill text="Sedang berkunjung" tone="blue" dot />
                    <Text style={s.heroTitle} numberOfLines={2}>{ongoing.store?.name ?? "Toko"}</Text>
                    <Text style={s.muted}>
                      Sejak {fmtTime(ongoing.visit.checkinAt)} • {fmtDur(elapsed)}
                      {elapsed >= 45 * 60000 ? " • sudah cukup lama, segera isi hasil" : ""}
                    </Text>
                    <View style={s.actions}>
                      <WebButton label="Lanjut isi SPK" icon="clipboard" onPress={() => router.push(`/visit/${ongoing.visit._id}` as any)} />
                      <WebButton label="Riwayat" icon="clock" variant="ghost" onPress={() => router.push("/riwayat" as any)} />
                    </View>
                  </>
                ) : (
                  <>
                    <Pill text={reached ? "Target tercapai" : pos === 0 ? "Belum mulai" : "Dalam proses"} tone={reached ? "green" : "amber"} dot />
                    <Text style={s.heroTitle}>{reached ? "Kerja bagus!" : pos === 0 ? "Mulai dari SPK Jadwal" : `${TARGET - pos} toko lagi`}</Text>
                    <Text style={s.muted}>
                      {pos === 0 ? "Belum ada kunjungan hari ini." : reached ? "Lanjutkan bila masih ada toko." : "untuk mencapai target harian."}
                    </Text>
                    <View style={s.actions}>
                      <WebButton label="Mulai kunjungan" icon="calendar" onPress={() => router.push("/jadwal" as any)} />
                      <WebButton label="Toko baru" icon="plus" variant="ghost" onPress={() => router.push("/toko-baru" as any)} />
                    </View>
                  </>
                )}
              </View>
            </View>
          )}
        </Panel>

        <Panel title="Aksi cepat" sub="Pintasan yang paling sering dipakai" basis={300}>
          <QuickLink icon="calendar" tone="blue" label="SPK Jadwal" desc="Jadwal kunjungan & isi hasilnya" onPress={() => router.push("/jadwal" as any)} />
          <QuickLink icon="plus" tone="green" label="Toko baru" desc="Daftarkan toko yang belum ada" onPress={() => router.push("/toko-baru" as any)} />
          <QuickLink icon="clock" tone="violet" label="Riwayat" desc="Kunjungan & follow-up terdahulu" onPress={() => router.push("/riwayat" as any)} />
        </Panel>
      </View>

      <Panel title="Kunjungan hari ini" tag={`${rows.length} selesai`} right={<WebButton label="Lihat semua" icon="chevron" variant="ghost" size="sm" onPress={() => router.push("/riwayat" as any)} />} flush>
        {history === undefined ? <Loading text="Memuat riwayat hari ini…" /> : (
          <DataTable cols={cols} rows={rows} keyOf={(it, i) => String(it.visit?._id ?? i)} empty={<EmptyState icon="pin" title="Belum ada kunjungan selesai" desc="Kunjungan yang sudah check-out hari ini muncul di sini." />} />
        )}
      </Panel>
    </View>
  );
}

// ============================================================================
// TELEMARKETING
// ============================================================================
function TeleHome({ viewer }: { viewer: any }) {
  const router = useRouter();
  const range = useMemo(() => todayRangeWIB(), []);
  const piuFu = useQuery(api.piutang.todayByArea, {}) as any;
  const ordFu = useQuery(api.orderFollowups.todayByArea, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;
  const history = useQuery(api.visits.listHistory, { from: range.from, to: range.to }) as any;

  const area = upper(viewer?.area);
  const piu = ((piuFu ?? []) as any[]).find((r) => upper(r.area) === area);
  const ord = ((ordFu ?? []) as any[]).find((r) => upper(r.area) === area);
  const piuPending = Number(piu?.pending ?? 0), piuDone = Number(piu?.done ?? 0);
  const ordPending = Number(ord?.pending ?? 0), ordDone = Number(ord?.done ?? 0);
  const pending = piuPending + ordPending;
  const done = piuDone + ordDone;
  const total = pending + done;
  const pct = total > 0 ? (done / total) * 100 : 100;
  const loading = piuFu === undefined || ordFu === undefined;
  const allDone = !loading && pending === 0;
  const color = allDone ? A.green : A.amber;
  const visits = ((history ?? []) as any[]).slice(0, 8);

  const cols: Col<any>[] = [
    { key: "t", label: "Toko", flex: 2, render: (it) => <Text style={s.cellStrong} numberOfLines={1}>{it.store?.name ?? "Toko"}</Text> },
    { key: "s", label: "Sales", flex: 1.3, render: (it) => <Text style={s.cell} numberOfLines={1}>{it.salesName || "–"}</Text> },
    { key: "i", label: "Masuk", width: 90, render: (it) => <Text style={s.cell}>{fmtTime(it.visit?.checkinAt)}</Text> },
    { key: "o", label: "Check-out", width: 100, align: "right", render: (it) => <Text style={s.cell}>{fmtTime(it.visit?.checkoutAt)}</Text> },
  ];

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi icon="hourglass" tone={allDone ? "green" : "amber"} label="Belum selesai" value={loading ? "…" : pending} hint="Tugas hari ini" viz={<SegBar parts={[{ value: done, color: A.green }, { value: pending, color: A.amber }]} height={8} />} />
        <Kpi icon="check" tone="green" label="Selesai" value={loading ? "…" : done} hint={`dari ${total} tugas`} />
        <Kpi icon="wallet" tone={piuPending > 0 ? "red" : "green"} label="Piutang" value={loading ? "…" : piuPending} hint={`${piuDone} selesai`} />
        <Kpi icon="cart" tone={ordPending > 0 ? "amber" : "green"} label="SPK Sales H+1" value={loading ? "…" : ordPending} hint={`${ordDone} selesai`} />
      </View>

      <View style={s.grid}>
        <Panel title={`Antrean tugas • ${area || "area kamu"}`} sub="Piutang dan SPK Sales H+1 yang harus ditindaklanjuti" basis={560}>
          {loading ? <Loading text="Menghitung tugas hari ini…" /> : (
            <View style={s.heroRow}>
              <Donut parts={[{ value: done, color: A.green }, { value: pending, color: A.amber }]} size={150} stroke={16} center={pctText(pct)} sub="selesai" />
              <View style={{ flex: 1, minWidth: 220, gap: 10 }}>
                <Pill text={allDone ? "Semua beres" : `${pending} belum selesai`} tone={allDone ? "green" : "amber"} dot />
                <Text style={s.muted}>
                  {total === 0 ? "Belum ada tugas follow-up untuk area ini hari ini." : allDone ? `Semua ${total} tugas hari ini sudah selesai.` : `${done} dari ${total} tugas selesai.`}
                </Text>
                <HBarList items={[
                  { label: "Piutang", value: piuDone, max: Math.max(1, piuDone + piuPending), color: A.rose, right: `${piuDone}/${piuDone + piuPending}` },
                  { label: "SPK Sales H+1", value: ordDone, max: Math.max(1, ordDone + ordPending), color: A.amber, right: `${ordDone}/${ordDone + ordPending}` },
                ]} />
                <View style={s.actions}>
                  <WebButton label={allDone ? "Buka SPK Admin" : "Kerjakan tugas"} icon="clipboard" variant={allDone ? "ghost" : "primary"} onPress={() => router.push("/spk?sec=admin" as any)} />
                  <WebButton label="Riwayat" icon="clock" variant="ghost" onPress={() => router.push("/riwayat" as any)} />
                </View>
              </View>
            </View>
          )}
        </Panel>

        <Panel title="FU Toko bulan ini" sub="Toko yang belum ambil — hubungi & catat hasilnya" basis={300}>
          {fuToko === undefined ? <Loading text="Memuat FU Toko…" /> : !fuToko ? <Empty text="Data FU Toko belum tersedia." /> : (
            <View style={{ gap: 14 }}>
              <HBarList items={[
                { label: "OPEN", value: fuToko.open, max: Math.max(1, fuToko.total), color: A.rose, right: String(fuToko.open) },
                { label: "INPG", value: fuToko.inpg, max: Math.max(1, fuToko.total), color: A.amber, right: String(fuToko.inpg) },
                { label: "CLSD", value: fuToko.clsd, max: Math.max(1, fuToko.total), color: A.teal, right: String(fuToko.clsd) },
              ]} />
              <Text style={s.muted}>{fuToko.pending > 0 ? `${fuToko.pending} dari ${fuToko.total} toko belum CLSD.` : `Semua ${fuToko.total} toko sudah CLSD.`}</Text>
              <WebButton label={fuToko.pending > 0 ? "Lanjutkan FU Toko" : "Riwayat FU Toko"} icon="store" onPress={() => router.push((fuToko.pending > 0 ? "/toko-aktif" : "/fu-toko-riwayat") as any)} />
            </View>
          )}
        </Panel>
      </View>

      <Panel title="Kunjungan area hari ini" tag={`${visits.length} terbaru`} right={<WebButton label="Lihat semua" icon="chevron" variant="ghost" size="sm" onPress={() => router.push("/riwayat" as any)} />} flush>
        {history === undefined ? <Loading text="Memuat kunjungan area…" /> : (
          <DataTable cols={cols} rows={visits} keyOf={(it, i) => String(it.visit?._id ?? i)} empty={<EmptyState icon="pin" title="Belum ada kunjungan" desc={`Belum ada kunjungan sales di area ${area || "ini"} hari ini.`} />} />
        )}
      </Panel>
    </View>
  );
}

// ============================================================================
// SUPERVISOR — dashboard utama (mengikuti tata letak video referensi)
// ============================================================================
function SupervisorHome() {
  const router = useRouter();
  const ov = useQuery(api.dashboard.supervisorTodayOverview, {}) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;
  const stats = useQuery(api.activity.stats, {}) as any;
  const feed = useQuery(api.activity.feed, { limit: 6 }) as any;
  const locPending = useQuery(api.locationRequests.listPendingRequests) as any;
  const jadwalPending = useQuery(api.jadwalRequests.pendingCount) as any;
  const pcp = usePcpBulanan(true);
  const totals = pcpTotals(pcp.data?.rows);

  const t = ov?.totals;
  const excItems = ((exc?.items ?? []) as any[]);
  const need = exc?.summary?.total ?? 0;
  const locN = Number(locPending?.length ?? 0);
  const jadN = Number(jadwalPending ?? 0);
  const critical = excItems.filter((i) => i.severity === "danger").length;
  const queueTotal = need + locN + jadN;

  // titik jam radial dari aktivitas hari ini
  const dots = ((stats?.todayHours ?? []) as any[]).map((h) => ({
    hour: h.hour,
    color: TONES[KIND_META[kindOf(h.action)].tone].dot,
    label: `${h.actorName}: ${labelOf(h.action)}`,
  }));

  const queue: { key: string; icon: string; tone: Tone; title: string; sub: string; tag: string; tagTone: Tone; cta: string; href: string }[] = [];
  if (locN > 0) queue.push({ key: "loc", icon: "pin", tone: "blue", title: "Usulan lokasi toko", sub: `${locN} usulan dari sales menunggu persetujuan`, tag: `${locN} menunggu`, tagTone: "amber", cta: "Tinjau", href: "/spv-approval" });
  if (jadN > 0) queue.push({ key: "jad", icon: "calendar", tone: "violet", title: "Pengajuan jadwal", sub: `${jadN} permintaan pindah / batal jadwal`, tag: `${jadN} menunggu`, tagTone: "amber", cta: "Tinjau", href: "/spv-approval" });
  excItems.slice(0, 5).forEach((it, i) =>
    queue.push({
      key: `e${i}`, icon: "warn", tone: it.severity === "danger" ? "red" : "amber",
      title: it.userName ? `${it.userName}${it.area ? ` • ${it.area}` : ""}` : it.title,
      sub: it.userName ? `${it.title} — ${it.description ?? ""}` : it.description ?? "",
      tag: it.severity === "danger" ? "Kritis" : "Perhatian", tagTone: it.severity === "danger" ? "red" : "amber",
      cta: "Buka", href: it.link,
    }));

  const salesCols: Col<any>[] = [
    {
      key: "n", label: "Sales", flex: 1.6,
      render: (r) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Avatar name={r.name} size={30} />
          <View style={{ minWidth: 0 }}>
            <Text style={s.cellStrong} numberOfLines={1}>{r.name}</Text>
            <Text style={s.cellSub}>{r.area || "–"}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "k", label: "Kunjungan", width: 150,
      render: (r) => {
        const ok = r.visitCount >= TARGET;
        return (
          <View style={{ width: 120 }}>
            <Text style={s.cellStrong}>{r.visitCount}/{TARGET}</Text>
            <SegBar parts={[{ value: r.visitCount, color: r.excused ? A.amber : ok ? A.teal : A.violet }, { value: Math.max(0, TARGET - r.visitCount), color: A.borderSoft }]} height={5} />
          </View>
        );
      },
    },
    {
      key: "st", label: "Status", width: 130,
      render: (r) => {
        const ok = r.visitCount >= TARGET;
        return <Pill text={r.excused ? "Izin" : r.ongoing ? "Berkunjung" : ok ? "Target" : "Kurang"} tone={r.excused ? "amber" : r.ongoing ? "blue" : ok ? "green" : "red"} dot size="sm" />;
      },
    },
    {
      key: "ket", label: "Keterangan", flex: 1.6,
      render: (r) => (
        <Text style={s.cell} numberOfLines={1}>
          {r.excused ? "Dikecualikan dari target" : r.ongoing ? `Di ${r.ongoing.storeName ?? "toko"} • ${r.ongoing.minutes} mnt` : r.visitCount === 0 ? "Belum mulai" : `${r.orderedCount} order • ${r.visitCount - r.orderedCount} tanpa order`}
        </Text>
      ),
    },
  ];

  const sub = ov?.sales ? `${t?.visitsDone ?? 0} kunjungan • ${t?.salesStarted ?? 0}/${t?.eligibleSales ?? t?.activeSales ?? 0} sales sudah mulai` : "";

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi
          icon="list" tone="violet" label="Aktivitas tim hari ini"
          value={stats ? stats.todayCount : "…"}
          hint={stats ? `${stats.logins} login • semua akun` : ""}
          viz={stats ? <MiniBars values={(stats.days ?? []).map((d: any) => d.count)} color={A.ink} /> : null}
          onPress={() => router.push("/notifikasi?tab=aktivitas" as any)}
        />
        <Kpi
          icon="hourglass" tone="amber" label="Menunggu Anda"
          value={exc === undefined ? "…" : queueTotal}
          hint={queueTotal === 0 ? "Semua beres" : `${critical} kritis • ${locN + jadN} persetujuan`}
          viz={<SegBar parts={[{ value: critical, color: A.red }, { value: Math.max(0, need - critical), color: A.amber }, { value: locN + jadN, color: A.violet }]} height={8} />}
          onPress={() => router.push("/notifikasi" as any)}
        />
        <Kpi
          icon="users" tone="blue" label="Sales sudah mulai"
          value={t ? `${t.salesStarted}/${t.eligibleSales ?? t.activeSales}` : "…"}
          hint={t ? `${t.salesNotStarted} belum mulai` : ""}
          viz={t ? <SegBar parts={[{ value: t.salesStarted, color: A.teal }, { value: t.salesNotStarted, color: A.borderSoft }]} height={8} /> : null}
        />
        <Kpi
          icon="trend" tone="green" label="PCP bulan ini"
          value={pcp.state === "loading" && !totals ? "…" : totals ? pctText(totals.pct) : "–"}
          hint={totals ? `${compactRp(totals.act)} / ${compactRp(totals.tgt)}` : "Menarik data sheet…"}
          onPress={() => router.push("/laporan-pcp" as any)}
        />
      </View>

      <View style={s.grid}>
        <Panel title="Aktivitas hari ini" sub="Satu hari dalam satu jam. Setiap titik adalah satu kejadian dari semua akun." basis={620}
          right={<WebButton label="Buka feed" icon="chevron" variant="ghost" size="sm" onPress={() => router.push("/notifikasi?tab=aktivitas" as any)} />}>
          <View style={s.clockWrap}>
            <RadialClock dots={dots} size={290} />
            <View style={{ flex: 1, minWidth: 260 }}>
              <View style={s.legend}>
                {(["login", "create", "update", "delete", "download", "approve"] as const).map((k) => (
                  <View key={k} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: TONES[KIND_META[k].tone].dot }]} />
                    <Text style={s.legendText}>{KIND_META[k].label}</Text>
                  </View>
                ))}
              </View>
              {feed === undefined ? <Loading text="Memuat aktivitas…" /> : (feed.items as any[]).length === 0 ? (
                <Empty text="Belum ada aktivitas tercatat." />
              ) : (
                <View style={{ marginHorizontal: -14 }}>
                  {(feed.items as any[]).map((e) => <ActivityRow key={String(e._id)} e={e} compact onPress={() => router.push("/notifikasi?tab=aktivitas" as any)} />)}
                </View>
              )}
            </View>
          </View>
        </Panel>

        <Panel title="Menunggu Anda" tag={`${queueTotal} item`} sub="Persetujuan dan pengecualian yang butuh keputusan" basis={400}>
          {exc === undefined ? <Loading text="Menyiapkan antrean…" /> : queue.length === 0 ? (
            <EmptyState icon="check" title="Semua beres" desc="Kunjungan sales, SPK, dan FU Toko sudah sesuai." />
          ) : (
            <View style={{ gap: 10 }}>
              {queue.map((q) => (
                <View key={q.key} style={s.queueCard}>
                  <IconTile icon={q.icon} tone={q.tone} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.cellStrong} numberOfLines={1}>{q.title}</Text>
                    <Text style={s.cellSub} numberOfLines={1}>{q.sub}</Text>
                  </View>
                  <Pill text={q.tag} tone={q.tagTone} size="sm" />
                  <WebButton label={q.cta} size="sm" onPress={() => router.push(q.href as any)} />
                </View>
              ))}
            </View>
          )}
        </Panel>
      </View>

      <Panel title="Progres kunjungan sales" sub={sub || "Target 7 toko per sales per hari"} tag={ov?.sales ? `${ov.sales.length} sales` : undefined}
        right={<WebButton label="Kelola izin" icon="calendar" variant="ghost" size="sm" onPress={() => router.push("/izin" as any)} />} flush>
        {ov === undefined ? <Loading text="Memuat progres sales…" /> : (
          <DataTable cols={salesCols} rows={(ov?.sales ?? []) as any[]} keyOf={(r) => String(r.userId)} minWidth={720} empty={<EmptyState icon="users" title="Belum ada sales lapangan" />} />
        )}
      </Panel>

      <View style={s.grid}>
        <Panel title="Pantau berikutnya" sub="Pekerjaan yang paling dekat jatuh tempo" basis={440}>
          <HBarList items={[
            { label: "SPK Admin & piutang", value: t ? t.spkAdminPending + t.piutangPending : 0, max: Math.max(10, t ? t.spkAdminPending + t.piutangPending : 0), color: A.rose, right: t ? `${t.spkAdminPending} SPK • ${t.piutangPending} piutang` : "…" },
            { label: "FU Toko belum CLSD", value: fuToko?.pending ?? 0, max: Math.max(1, fuToko?.total ?? 1), color: A.amber, right: fuToko ? `${fuToko.open} OPEN • ${fuToko.inpg} INPG` : "…" },
            { label: "Izin sales hari ini", value: t?.excusedSales ?? 0, max: Math.max(1, t?.eligibleSales ?? 1), color: A.violet, right: t ? `${t.excusedSales} sales` : "…" },
            { label: "Sales kurang target", value: t?.salesBelowTarget ?? 0, max: Math.max(1, t?.eligibleSales ?? 1), color: A.red, right: t ? `${t.salesBelowTarget} sales` : "…" },
          ]} />
          <View style={[s.actions, { marginTop: 18 }]}>
            <WebButton label="Menu Supervisor" icon="shield" onPress={() => router.push("/spv" as any)} />
            <WebButton label="Live monitor" icon="eye" variant="ghost" onPress={() => router.push("/live" as any)} />
          </View>
        </Panel>

        <Panel title="Siapa paling aktif" sub="Akun dengan aktivitas terbanyak 7 hari terakhir" basis={440}>
          {stats === undefined ? <Loading text="Menghitung…" /> : !stats?.topActors?.length ? <Empty text="Belum ada data." /> : (
            <View style={{ gap: 12 }}>
              {(stats.topActors as any[]).map((a, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar name={a.name} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.cellStrong} numberOfLines={1}>{a.name}</Text>
                    <SegBar parts={[{ value: a.count, color: A.violet }, { value: Math.max(0, stats.topActors[0].count - a.count), color: A.borderSoft }]} height={5} />
                  </View>
                  <Text style={s.cellStrong}>{a.count}</Text>
                </View>
              ))}
            </View>
          )}
        </Panel>
      </View>
    </View>
  );
}

// ============================================================================
// OWNER / HR / AKUNTING
// ============================================================================
function OwnerHome() {
  const router = useRouter();
  const bulanan = usePcpBulanan(true);
  const mingguan = usePcpMingguan(true);
  const tim = useQuery(api.visits.monthlyKpi, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;

  const totals = pcpTotals(bulanan.data?.rows);
  const areas = pcpAreas(bulanan.data?.rows);
  const weeks = pcpWeekly(mingguan.data?.rows, mingguan.data?.weekLabels);
  const timRows = (tim ?? []) as any[];
  const onTrack = timRows.filter((r) => Number(r.skor ?? 0) >= 70).length;
  const avgScore = timRows.length ? Math.round(timRows.reduce((sum, r) => sum + Number(r.skor ?? 0), 0) / timRows.length) : 0;
  const loadingPcp = bulanan.state === "loading" && !totals;
  const pcpError = bulanan.state === "err" && !totals;

  const timCols: Col<any>[] = [
    { key: "n", label: "Sales", flex: 1.5, render: (r) => (<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Avatar name={r.salesName} size={28} /><Text style={s.cellStrong} numberOfLines={1}>{r.salesName}</Text></View>) },
    { key: "a", label: "Area", width: 100, render: (r) => <Text style={s.cell}>{r.area || "–"}</Text> },
    { key: "k", label: "Kunjungan", width: 120, render: (r) => <Text style={s.cell}>{r.kunjungan}</Text> },
    { key: "s", label: "Skor", width: 90, align: "right", render: (r) => <Pill text={String(r.skor)} tone={Number(r.skor) >= 70 ? "green" : "amber"} size="sm" /> },
  ];

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi icon="cash" tone={toneKey(totals?.pct)} label="Omset bulan ini" value={loadingPcp ? "…" : totals ? compactRp(totals.act) : "–"} hint={monthLabel(monthKeyWIB())} />
        <Kpi icon="flag" tone="gray" label="Target bulan ini" value={totals ? compactRp(totals.tgt) : "–"} hint="Dari Sheet PCP" />
        <Kpi icon="trend" tone={toneKey(totals?.pct)} label="Pencapaian" value={totals ? pctText(totals.pct) : "–"} hint="Aktual vs target" viz={totals ? <SegBar parts={[{ value: Math.min(100, totals.pct ?? 0), color: tone(totals.pct) }, { value: Math.max(0, 100 - (totals.pct ?? 0)), color: A.borderSoft }]} height={8} /> : null} />
        <Kpi icon="hourglass" tone="amber" label="Sisa kejar" value={totals ? compactRp(Math.max(0, totals.tgt - totals.act)) : "–"} hint="Menuju 100%" />
      </View>

      <View style={s.grid}>
        <Panel title={`Omset ${monthLabel(monthKeyWIB())}`} sub="Tren pencapaian mingguan (PCP Mingguan)" basis={620}
          right={<WebButton label="Laporan lengkap" icon="chart" variant="ghost" size="sm" onPress={() => router.push("/laporan" as any)} />}>
          {loadingPcp ? <Loading text="Menarik data PCP…" /> : pcpError || !totals ? (
            <EmptyState icon="trend" title="Data omset belum bisa ditarik" desc="Sheet PCP belum merespons." action={<WebButton label="Buka Laporan PCP" onPress={() => router.push("/laporan-pcp" as any)} />} />
          ) : (
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <Text style={s.bigNum}>{compactRp(totals.act)}</Text>
                <Pill text={pctText(totals.pct)} tone={toneKey(totals.pct)} />
                <Text style={s.muted}>dari target {rp(totals.tgt)}</Text>
              </View>
              {weeks.length === 0 ? (
                <Text style={s.muted}>{mingguan.state === "loading" ? "Menarik tren mingguan…" : "Tren mingguan belum tersedia."}</Text>
              ) : (
                <AreaChart values={weeks.map((w) => Math.round(w.pct ?? 0))} labels={weeks.map((w) => w.label)} color={A.violet} target={100} height={200} width={600} />
              )}
              <Text style={s.cellSub}>Omset mingguan memakai rata-rata kiriman (9 kiriman/bulan). Garis hijau putus-putus = 100% target.</Text>
            </View>
          )}
        </Panel>

        <Panel title="Pencapaian per area" sub="Aktual dibanding target" basis={360} right={<WebButton label="Detail" icon="chevron" variant="ghost" size="sm" onPress={() => router.push("/laporan-pcp" as any)} />}>
          {bulanan.state === "loading" && areas.length === 0 ? <Loading text="Memuat area…" /> : areas.length === 0 ? <Empty text="Rincian area belum tersedia." /> : (
            <HBarList items={areas.map((a) => ({
              label: a.area, value: a.pct ?? 0, max: 100, color: tone(a.pct) === A.green ? A.teal : tone(a.pct) === A.orange ? A.amber : A.rose,
              right: pctText(a.pct), sub: `${compactRp(a.act)} dari ${compactRp(a.tgt)} • ${a.sdm} SDM`,
            }))} />
          )}
        </Panel>
      </View>

      <View style={s.grid}>
        <Panel title="Tim" tag={`${timRows.length} sales`} sub={`${onTrack} on track • rata-rata skor ${avgScore}`} basis={560}
          right={<WebButton label="Rapor sales" icon="star" variant="ghost" size="sm" onPress={() => router.push("/spv-penilaian" as any)} />} flush>
          {tim === undefined ? <Loading text="Memuat data tim…" /> : (
            <DataTable cols={timCols} rows={timRows.slice(0, 6)} keyOf={(r, i) => String(r.salesId ?? i)} minWidth={460} empty={<EmptyState icon="users" title="Belum ada data sales bulan ini" />} />
          )}
        </Panel>

        <Panel title="Operasional" sub="Ringkasan lintas modul" basis={360}>
          <QuickLink icon="store" tone="amber" label="FU Toko" desc={fuToko ? `${fuToko.pending} belum • ${fuToko.open} OPEN • ${fuToko.inpg} INPG` : "Memuat…"} onPress={() => router.push("/toko-aktif" as any)} />
          <QuickLink icon="users" tone="green" label="Sales on track" desc={`${onTrack}/${timRows.length} skor kunjungan ≥ 70`} onPress={() => router.push("/spv-penilaian" as any)} />
          <QuickLink icon="trend" tone="violet" label="Laporan PCP" desc="Bulanan, mingguan, target vs aktual" onPress={() => router.push("/laporan-pcp" as any)} />
          <QuickLink icon="chart" tone="blue" label="Laporan lengkap" desc="Semua rekap dalam satu tempat" onPress={() => router.push("/laporan" as any)} />
        </Panel>
      </View>
    </View>
  );
}

// ===== Fallback role lain =====
function FallbackHome() {
  const router = useRouter();
  return (
    <View style={s.stack}>
      <Panel title="Akses cepat" sub="Menu yang tersedia untuk peran Anda">
        <View style={s.quickGrid}>
          <QuickLink icon="chart" tone="green" label="Laporan" desc="PCP, DAP, target toko" onPress={() => router.push("/laporan" as any)} />
          <QuickLink icon="store" tone="blue" label="Kelola Toko" desc="Cari & lihat data toko" onPress={() => router.push("/kelola-toko" as any)} />
          <QuickLink icon="clipboard" tone="gray" label="SPK" desc="SPK Sales & SPK Admin" onPress={() => router.push("/spk" as any)} />
          <QuickLink icon="chat" tone="violet" label="Chat internal" desc="Pesan dengan tim" onPress={() => router.push("/chat" as any)} />
        </View>
      </Panel>
    </View>
  );
}

// ===== Komponen kecil =====
function Loading({ text }: { text: string }) {
  return (
    <View style={s.loadingRow}>
      <IOSSpinner size="small" color={A.ink} />
      <Text style={s.muted}>{text}</Text>
    </View>
  );
}
function Empty({ text }: { text: string }) {
  return <Text style={[s.muted, { paddingVertical: 6 }]}>{text}</Text>;
}
function QuickLink({ icon, label, desc, tone: tn = "gray", onPress }: any) {
  const [hov, setHov] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHov(true)}
      onHoverOut={() => setHov(false)}
      style={web([s.quickLink, hov && { backgroundColor: A.surfaceAlt }, { cursor: "pointer" }])}
    >
      <IconTile icon={icon} tone={tn} size={38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.cellStrong} numberOfLines={1}>{label}</Text>
        <Text style={s.cellSub} numberOfLines={1}>{desc}</Text>
      </View>
      <AppIcon name="chevron" size={14} color={A.mutedSoft} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: A.page },
  stack: { gap: 16 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  heroRow: { flexDirection: "row", flexWrap: "wrap", gap: 24, alignItems: "center" },
  heroTitle: { fontSize: 22, fontWeight: "800", color: A.ink, letterSpacing: -0.6, fontFamily: FONT },
  bigNum: { fontSize: 34, fontWeight: "800", color: A.ink, letterSpacing: -1.2, fontFamily: FONT },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  muted: { fontSize: 13, color: A.muted, lineHeight: 19, fontFamily: FONT },
  cell: { fontSize: 13, color: A.inkSoft, fontFamily: FONT },
  cellStrong: { fontSize: 13.5, fontWeight: "700", color: A.ink, fontFamily: FONT },
  cellSub: { fontSize: 12, color: A.muted, marginTop: 1, fontFamily: FONT },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 4 },
  clockWrap: { flexDirection: "row", flexWrap: "wrap", gap: 22, alignItems: "flex-start" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: A.muted, fontFamily: FONT, fontWeight: "600" },
  queueCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickLink: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, flexGrow: 1 },
});
