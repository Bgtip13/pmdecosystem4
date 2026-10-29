import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import AppIcon from "../components/AppIcon";
import DesktopShell from "../components/desktop/DesktopShell";
import { Bar, Chip, Kpi, Panel, WebButton } from "../components/desktop/ui";
import { A, FONT } from "../components/desktop/tokens";
import {
  pcpAreas,
  pcpTotals,
  pcpWeekly,
  usePcpBulanan,
  usePcpMingguan,
} from "../components/home/usePcp";

const TARGET = 7;
const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  field: "Sales Lapangan",
  telemarketing: "Telemarketing",
  ppic: "PPIC",
};

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
const tone = (p?: number | null) =>
  p == null ? A.muted : p < 50 ? A.red : p < 80 ? A.orange : A.green;
const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "–";
function fmtDur(ms: number) {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}
const upper = (v: any) => String(v ?? "").trim().toUpperCase();

// ===== Kerangka halaman =====
export default function BerandaWeb() {
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return (
      <View style={s.loading}>
        <IOSSpinner size="large" color={A.brand} />
      </View>
    );
  }

  const role = viewer.role;
  const title =
    role === "owner"
      ? "Dashboard Owner"
      : role === "supervisor"
        ? "Dashboard Supervisor"
        : role === "telemarketing"
          ? "Dashboard Telemarketing"
          : "Dashboard Sales Lapangan";
  const subtitle = `${ROLE_LABEL[role] ?? role}${viewer.area ? ` • ${viewer.area}` : " • Semua area"} • ${new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <DesktopShell active="beranda" title={title} subtitle={subtitle}>
      {role === "field" ? (
        <FieldHome />
      ) : role === "telemarketing" ? (
        <TeleHome viewer={viewer} />
      ) : role === "supervisor" ? (
        <SupervisorHome />
      ) : role === "owner" ? (
        <OwnerHome />
      ) : (
        <FallbackHome />
      )}
    </DesktopShell>
  );
}

// ===== SALES FIELD =====
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
  const pct = (pos / TARGET) * 100;
  const reached = pos >= TARGET;
  const color = reached ? A.green : A.orange;
  const elapsed = ongoing?.visit ? now - ongoing.visit.checkinAt : 0;
  const rows = ((history ?? []) as any[]).slice(0, 6);
  const loading = summary === undefined || ongoing === undefined;

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi label="Target harian" value={`${pos}/${TARGET}`} hint={`${TARGET - Math.min(pos, TARGET)} toko lagi`} color={color} />
        <Kpi label="Kunjungan selesai" value={summary?.doneCount ?? 0} hint="Hari ini" color={A.info} />
        <Kpi label="Total durasi" value={fmtDur(summary?.durMs ?? 0)} hint="Waktu di toko" />
        <Kpi label="Kunjungan berjalan" value={summary?.ongoing ? 1 : 0} hint={ongoing?.store?.name ?? "Tidak ada"} color={ongoing?.visit ? A.info : A.muted} />
      </View>

      <View style={s.grid}>
        <Panel title="Target & kunjungan hari ini" icon="flag" basis={560}>
          {loading ? (
            <Loading text="Memuat kunjungan…" />
          ) : ongoing?.visit ? (
            <>
              <Text style={s.panelLabel}>SEDANG BERKUNJUNGAN</Text>
              <Text style={s.heroStore} numberOfLines={2}>{ongoing.store?.name ?? "Toko"}</Text>
              <Text style={s.muted}>
                Sejak {fmtTime(ongoing.visit.checkinAt)} • {fmtDur(elapsed)}
                {elapsed >= 45 * 60000 ? " • sudah cukup lama, segera isi hasil" : ""}
              </Text>
              <View style={{ marginTop: 12 }}><Bar pct={pct} color={color} height={8} /></View>
              <Text style={s.small}>Target {pos}/{TARGET} toko • {pctText(pct)}</Text>
              <View style={s.actionsRow}>
                <WebButton label="Lanjut isi SPK" icon="clipboard" onPress={() => router.push(`/visit/${ongoing.visit._id}` as any)} />
                <WebButton label="Lihat riwayat" icon="clock" variant="ghost" onPress={() => router.push("/riwayat" as any)} />
              </View>
            </>
          ) : (
            <>
              <Text style={s.heroBig}>{pos}<Text style={s.heroBigOf}>/{TARGET} toko</Text></Text>
              <Bar pct={pct} color={color} height={9} />
              <Text style={s.muted}>
                {pos === 0
                  ? "Belum ada kunjungan hari ini. Mulai dari daftar toko di SPK Sales."
                  : reached
                    ? "Target harian sudah tercapai. Lanjutkan bila masih ada toko."
                    : `${TARGET - pos} toko lagi untuk mencapai target.`}
              </Text>
              <View style={s.actionsRow}>
                <WebButton label="Mulai kunjungan" icon="store" onPress={() => router.push("/spk-sales" as any)} />
                <WebButton label="Toko baru" icon="plus" variant="ghost" onPress={() => router.push("/toko-baru" as any)} />
              </View>
            </>
          )}
        </Panel>

        <Panel title="Aksi cepat" icon="grid" basis={300}>
          <QuickLink icon="clipboard" label="SPK Sales" desc="Daftar toko & isi kunjungan" bg={A.infoSoft} fg={A.info} onPress={() => router.push("/spk-sales" as any)} />
          <QuickLink icon="plus" label="Toko baru" desc="Daftarkan toko yang belum ada" bg={A.brandSoft} fg={A.brand} onPress={() => router.push("/toko-baru" as any)} />
          <QuickLink icon="calendar" label="Riwayat" desc="Kunjungan & follow-up terdahulu" bg={A.purpleSoft} fg={A.purple} onPress={() => router.push("/riwayat" as any)} />
          <Text style={s.note}>Target {TARGET} toko/hari. Kunjungan berjalan dihitung satu sampai check-out.</Text>
        </Panel>
      </View>

      <Panel
        title="Kunjungan hari ini"
        icon="pin"
        right={<WebButton label="Lihat semua" icon="chevron" variant="ghost" onPress={() => router.push("/riwayat" as any)} />}
      >
        {history === undefined ? (
          <Loading text="Memuat riwayat hari ini…" />
        ) : rows.length === 0 ? (
          <Empty text="Belum ada kunjungan selesai hari ini." />
        ) : (
          <View>
            <View style={s.tableHead}>
              <Text style={[s.th, { flex: 2 }]}>TOKO</Text>
              <Text style={[s.th, { width: 100 }]}>CHECK-OUT</Text>
              <Text style={[s.th, { width: 90 }]}>DURASI</Text>
              <Text style={[s.th, { width: 120, textAlign: "right" }]}>HASIL</Text>
            </View>
            {rows.map((it: any, i: number) => {
              const v = it.visit ?? {};
              const closed = v.metWith === "toko_tutup";
              const ordered = v.ordered === true;
              return (
                <View key={String(v._id ?? i)} style={[s.tr, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={[s.td, { flex: 2, fontWeight: "700" }]} numberOfLines={1}>{it.store?.name ?? "Toko"}</Text>
                  <Text style={[s.td, { width: 100 }]}>{fmtTime(v.checkoutAt)}</Text>
                  <Text style={[s.td, { width: 90 }]}>{fmtDur((v.checkoutAt ?? 0) - (v.checkinAt ?? 0))}</Text>
                  <View style={{ width: 120, alignItems: "flex-end" }}>
                    <Chip
                      text={closed ? "Tutup" : ordered ? "Order" : "Tidak order"}
                      bg={closed ? A.surfaceAlt : ordered ? A.greenSoft : A.orangeSoft}
                      fg={closed ? A.muted : ordered ? A.green : A.orange}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Panel>
    </View>
  );
}

// ===== TELEMARKETING =====
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
  const piuPending = Number(piu?.pending ?? 0);
  const piuDone = Number(piu?.done ?? 0);
  const ordPending = Number(ord?.pending ?? 0);
  const ordDone = Number(ord?.done ?? 0);
  const pending = piuPending + ordPending;
  const done = piuDone + ordDone;
  const total = pending + done;
  const pct = total > 0 ? (done / total) * 100 : 100;
  const loading = piuFu === undefined || ordFu === undefined;
  const allDone = !loading && pending === 0;
  const color = allDone ? A.green : A.orange;
  const visits = ((history ?? []) as any[]).slice(0, 6);

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi label="Belum selesai" value={loading ? "…" : pending} hint="Tugas hari ini" color={color} />
        <Kpi label="Selesai" value={loading ? "…" : done} hint={`dari ${total} tugas`} color={A.green} />
        <Kpi label="Piutang" value={loading ? "…" : piuPending} hint={`${piuDone} selesai`} color={piuPending > 0 ? A.brand : A.green} />
        <Kpi label="SPK Sales H+1" value={loading ? "…" : ordPending} hint={`${ordDone} selesai`} color={ordPending > 0 ? A.orange : A.green} />
      </View>

      <View style={s.grid}>
        <Panel title={`Antrean tugas • ${area || "area kamu"}`} icon="clipboard" basis={560}>
          {loading ? (
            <Loading text="Menghitung tugas hari ini…" />
          ) : (
            <>
              <View style={s.heroLine}>
                <Text style={[s.heroBig, { color }]}>{pending}</Text>
                <Text style={s.heroBigOf}>tugas belum selesai</Text>
              </View>
              <Bar pct={pct} color={color} height={9} />
              <Text style={s.muted}>
                {total === 0
                  ? "Belum ada tugas follow-up untuk area ini hari ini."
                  : allDone
                    ? `Semua ${total} tugas hari ini sudah selesai.`
                    : `${done} dari ${total} tugas selesai • ${pctText(pct)}`}
              </Text>
              <View style={s.splitRow}>
                <SplitBox label="PIUTANG" value={piuPending} sub={`${piuDone} selesai`} color={piuPending > 0 ? A.brand : A.green} />
                <SplitBox label="SPK SALES H+1" value={ordPending} sub={`${ordDone} selesai`} color={ordPending > 0 ? A.orange : A.green} />
              </View>
              <View style={s.actionsRow}>
                <WebButton
                  label={allDone ? "Buka SPK Admin" : "Kerjakan tugas"}
                  icon="clipboard"
                  variant={allDone ? "ghost" : "primary"}
                  onPress={() => router.push("/spk?sec=admin" as any)}
                />
                <WebButton label="Riwayat" icon="clock" variant="ghost" onPress={() => router.push("/riwayat" as any)} />
              </View>
            </>
          )}
        </Panel>

        <Panel title="FU Toko bulan ini" icon="store" basis={300}>
          {fuToko === undefined ? (
            <Loading text="Memuat FU Toko…" />
          ) : !fuToko ? (
            <Empty text="Data FU Toko belum tersedia." />
          ) : (
            <>
              <View style={s.triRow}>
                <TriBox label="OPEN" value={fuToko.open} color={fuToko.open > 0 ? A.brand : A.green} />
                <TriBox label="INPG" value={fuToko.inpg} color={fuToko.inpg > 0 ? A.orange : A.green} />
                <TriBox label="CLSD" value={fuToko.clsd} color={A.green} />
              </View>
              <Text style={s.muted}>
                {fuToko.pending > 0
                  ? `${fuToko.pending} dari ${fuToko.total} toko belum CLSD.`
                  : `Semua ${fuToko.total} toko sudah CLSD.`}
              </Text>
              <View style={s.actionsRow}>
                <WebButton
                  label={fuToko.pending > 0 ? "Lanjutkan FU Toko" : "Riwayat FU Toko"}
                  icon="store"
                  onPress={() => router.push((fuToko.pending > 0 ? "/toko-aktif" : "/fu-toko-riwayat") as any)}
                />
              </View>
            </>
          )}
        </Panel>
      </View>

      <Panel
        title="Kunjungan area hari ini"
        icon="pin"
        right={<WebButton label="Lihat semua" icon="chevron" variant="ghost" onPress={() => router.push("/riwayat" as any)} />}
      >
        {history === undefined ? (
          <Loading text="Memuat kunjungan area…" />
        ) : visits.length === 0 ? (
          <Empty text={`Belum ada kunjungan sales di area ${area || "ini"} hari ini.`} />
        ) : (
          <View>
            <View style={s.tableHead}>
              <Text style={[s.th, { flex: 2 }]}>TOKO</Text>
              <Text style={[s.th, { flex: 1.4 }]}>SALES</Text>
              <Text style={[s.th, { width: 100 }]}>MASUK</Text>
              <Text style={[s.th, { width: 110, textAlign: "right" }]}>CHECK-OUT</Text>
            </View>
            {visits.map((it: any, i: number) => (
              <View key={String(it.visit?._id ?? i)} style={[s.tr, i === visits.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={[s.td, { flex: 2, fontWeight: "700" }]} numberOfLines={1}>{it.store?.name ?? "Toko"}</Text>
                <Text style={[s.td, { flex: 1.4 }]} numberOfLines={1}>{it.salesName || "–"}</Text>
                <Text style={[s.td, { width: 100 }]}>{fmtTime(it.visit?.checkinAt)}</Text>
                <Text style={[s.td, { width: 110, textAlign: "right" }]}>{fmtTime(it.visit?.checkoutAt)}</Text>
              </View>
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}

// ===== SUPERVISOR =====
function SupervisorHome() {
  const router = useRouter();
  const ov = useQuery(api.dashboard.supervisorTodayOverview, {}) as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, {}) as any;
  const fuToko = useQuery(api.dashboard.activeStoreMonthly, {}) as any;
  const pcp = usePcpBulanan(true);
  const totals = pcpTotals(pcp.data?.rows);

  const t = ov?.totals;
  const items = ((exc?.items ?? []) as any[]).slice(0, 6);
  const need = exc?.summary?.total ?? 0;

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi label="Sales sudah mulai" value={t ? `${t.salesStarted}/${t.eligibleSales ?? t.activeSales}` : "…"} hint={t ? `${t.salesNotStarted} belum mulai` : ""} color={A.info} />
        <Kpi label="Kunjungan hari ini" value={t ? t.visitsDone : "…"} hint={t ? `${t.ongoingVisits} sedang berkunjung` : ""} color={A.green} />
        <Kpi label="Kurang target" value={t ? t.salesBelowTarget : "…"} hint={`target ${TARGET} toko/hari`} color={t?.salesBelowTarget > 0 ? A.red : A.green} />
        <Kpi label="Izin hari ini" value={t ? t.excusedSales : "…"} hint={t?.locationApprovalPending > 0 ? `${t.locationApprovalPending} approval lokasi` : "Tidak ada approval lokasi"} color={t?.excusedSales > 0 ? A.orange : A.muted} />
      </View>

      <View style={s.grid}>
        <Panel
          title="Perlu tindakan"
          icon="warn"
          basis={620}
          right={
            <Chip
              text={exc === undefined ? "MEMUAT" : need > 0 ? `${need} ITEM` : "SEMUA BERES"}
              bg={exc === undefined ? A.surfaceAlt : need > 0 ? A.brandSoft : A.greenSoft}
              fg={exc === undefined ? A.muted : need > 0 ? A.brand : A.green}
            />
          }
        >
          {exc === undefined ? (
            <Loading text="Menyiapkan daftar pengecualian…" />
          ) : items.length === 0 ? (
            <View style={[s.okBox]}>
              <AppIcon name="check" size={18} color={A.green} />
              <View style={{ flex: 1 }}>
                <Text style={s.okTitle}>Tidak ada yang perlu ditindaklanjuti</Text>
                <Text style={s.muted}>Kunjungan sales, SPK, dan FU Toko sudah sesuai.</Text>
              </View>
            </View>
          ) : (
            items.map((it: any, i: number) => (
              <TouchableOpacity
                key={`${it.kind}-${i}`}
                style={s.excRow}
                activeOpacity={0.85}
                onPress={() => router.push(it.link as any)}
              >
                <View style={[s.excIcon, { backgroundColor: it.severity === "danger" ? A.brandSoft : A.orangeSoft }]}>
                  <AppIcon name="warn" size={14} color={it.severity === "danger" ? A.brand : A.orange} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.excTitle} numberOfLines={1}>
                    {it.userName ? `${it.userName}${it.area ? ` • ${it.area}` : ""}` : it.title}
                  </Text>
                  <Text style={s.excDesc} numberOfLines={1}>
                    {it.userName ? `${it.title} — ${it.description ?? ""}` : it.description}
                  </Text>
                </View>
                <Chip
                  text={it.severity === "danger" ? "Kritis" : "Perhatian"}
                  bg={it.severity === "danger" ? A.brandSoft : A.orangeSoft}
                  fg={it.severity === "danger" ? A.red : A.orange}
                />
                <AppIcon name="chevron" size={14} color={A.mutedSoft} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))
          )}
        </Panel>

        <Panel title="Ringkasan hari ini" icon="list" basis={340}>
          <Line icon="clipboard" label="SPK Admin & piutang" value={t ? `${t.spkAdminPending + t.piutangPending}` : "…"} hint={t ? `${t.spkAdminPending} SPK • ${t.piutangPending} piutang` : ""} onPress={() => router.push("/spk?sec=admin" as any)} />
          <Line icon="store" label="FU Toko" value={fuToko ? `${fuToko.pending}` : "…"} hint={fuToko ? `${fuToko.open} OPEN • ${fuToko.inpg} INPG` : "Memuat…"} onPress={() => router.push("/toko-aktif" as any)} />
          <Line icon="calendar" label="Izin sales" value={t ? `${t.excusedSales}` : "…"} hint={t ? `${t.locationApprovalPending} approval lokasi menunggu` : ""} onPress={() => router.push("/izin" as any)} />
          <Line icon="trend" label="PCP bulan ini" value={pcp.state === "loading" && !totals ? "…" : totals ? pctText(totals.pct) : "–"} hint={totals ? `${compactRp(totals.act)} / ${compactRp(totals.tgt)}` : "Menarik data sheet…"} onPress={() => router.push("/laporan-pcp" as any)} />
          <Line icon="wallet" label="Piutang disinkron" value={ov?.sync?.hasSync ? fmtTime(ov.sync.finishedAt ?? ov.sync.requestedAt) : "Belum"} hint={ov?.sync?.status === "failed" ? "Sinkron terakhir gagal" : "Sinkron terakhir"} onPress={() => router.push("/spv" as any)} />
          <View style={s.actionsRow}>
            <WebButton label="Menu Supervisor" icon="shield" onPress={() => router.push("/spv" as any)} />
            <WebButton label="Live monitor" icon="eye" variant="ghost" onPress={() => router.push("/live" as any)} />
          </View>
        </Panel>
      </View>

      <Panel title="Progres kunjungan sales" icon="users" right={<WebButton label="Kelola izin" icon="calendar" variant="ghost" onPress={() => router.push("/izin" as any)} />}>
        {ov === undefined ? (
          <Loading text="Memuat progres sales…" />
        ) : !ov?.sales?.length ? (
          <Empty text="Belum ada sales lapangan." />
        ) : (
          <View>
            <View style={s.tableHead}>
              <Text style={[s.th, { flex: 1.6 }]}>SALES</Text>
              <Text style={[s.th, { width: 110 }]}>AREA</Text>
              <Text style={[s.th, { width: 120 }]}>KUNJUNGAN</Text>
              <Text style={[s.th, { width: 150 }]}>STATUS</Text>
              <Text style={[s.th, { flex: 1.5 }]}>KETERANGAN</Text>
            </View>
            {(ov.sales as any[]).map((row: any, i: number) => {
              const leave = row.excused;
              const ok = row.visitCount >= TARGET;
              return (
                <View key={String(row.userId)} style={[s.tr, i === ov.sales.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1.6, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[s.dot, { backgroundColor: leave ? A.orange : row.ongoing ? A.info : ok ? A.green : A.brand }]} />
                    <Text style={s.tdName} numberOfLines={1}>{row.name}</Text>
                  </View>
                  <Text style={[s.td, { width: 110 }]}>{row.area || "–"}</Text>
                  <View style={{ width: 120 }}>
                    <Text style={[s.td, { fontWeight: "700" }]}>{row.visitCount}/{TARGET}</Text>
                    <Bar pct={(row.visitCount / TARGET) * 100} color={leave ? A.orange : ok ? A.green : A.brand} height={4} />
                  </View>
                  <View style={{ width: 150 }}>
                    <Chip
                      text={leave ? "IZIN" : row.ongoing ? "BERKUNJUNG" : ok ? "TARGET" : "KURANG"}
                      bg={leave ? A.orangeSoft : row.ongoing ? A.infoSoft : ok ? A.greenSoft : A.brandSoft}
                      fg={leave ? A.orange : row.ongoing ? A.info : ok ? A.green : A.brand}
                    />
                  </View>
                  <Text style={[s.td, { flex: 1.5 }]} numberOfLines={1}>
                    {leave
                      ? "Dikecualikan dari target"
                      : row.ongoing
                        ? `Di ${row.ongoing.storeName ?? "toko"} • ${row.ongoing.minutes} mnt`
                        : row.visitCount === 0
                          ? "Belum mulai"
                          : `${row.orderedCount} order • ${row.visitCount - row.orderedCount} tanpa order`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Panel>
    </View>
  );
}

// ===== OWNER =====
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
  const avgScore = timRows.length
    ? Math.round(timRows.reduce((sum, r) => sum + Number(r.skor ?? 0), 0) / timRows.length)
    : 0;
  const loadingPcp = bulanan.state === "loading" && !totals;
  const pcpError = bulanan.state === "err" && !totals;

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi label="Omset bulan ini" value={loadingPcp ? "…" : totals ? compactRp(totals.act) : "–"} hint={monthLabel(monthKeyWIB())} color={tone(totals?.pct)} />
        <Kpi label="Target bulan ini" value={totals ? compactRp(totals.tgt) : "–"} hint="Dari Sheet PCP" />
        <Kpi label="Pencapaian" value={totals ? pctText(totals.pct) : "–"} hint="Aktual vs target" color={tone(totals?.pct)} />
        <Kpi label="Sisa kejar" value={totals ? compactRp(Math.max(0, totals.tgt - totals.act)) : "–"} hint="Menuju 100%" color={A.orange} />
      </View>

      <View style={s.grid}>
        <Panel title={`Omset ${monthLabel(monthKeyWIB())}`} icon="trend" basis={620}>
          {loadingPcp ? (
            <Loading text="Menarik data PCP…" />
          ) : pcpError || !totals ? (
            <>
              <Empty text="Data omset belum bisa ditarik dari Sheet PCP." />
              <View style={s.actionsRow}>
                <WebButton label="Buka Laporan PCP" icon="trend" onPress={() => router.push("/laporan-pcp" as any)} />
              </View>
            </>
          ) : (
            <>
              <View style={s.heroLine}>
                <Text style={s.heroBig} numberOfLines={1}>{compactRp(totals.act)}</Text>
                <Chip text={pctText(totals.pct)} bg={tone(totals.pct) + "18"} fg={tone(totals.pct)} />
              </View>
              <Text style={s.muted}>
                dari target {rp(totals.tgt)}{totals.kejar > 0 ? ` • sisa ${compactRp(totals.kejar)}` : ""}
              </Text>
              <View style={{ marginTop: 10 }}><Bar pct={totals.pct} color={tone(totals.pct)} height={10} /></View>

              <Text style={[s.panelLabel, { marginTop: 16 }]}>TREN MINGGUAN (PCP MINGGUAN)</Text>
              {weeks.length === 0 ? (
                <Text style={s.muted}>{mingguan.state === "loading" ? "Menarik tren mingguan…" : "Tren mingguan belum tersedia."}</Text>
              ) : (
                <View style={s.weekGrid}>
                  {weeks.map((w) => (
                    <View key={w.label} style={s.weekCol}>
                      <Text style={s.weekPct}>{pctText(w.pct)}</Text>
                      <View style={s.weekBarBg}>
                        <View style={[s.weekBarFill, { height: `${Math.min(100, Math.max(4, w.pct ?? 0))}%`, backgroundColor: tone(w.pct) }]} />
                      </View>
                      <Text style={s.weekLabel}>{w.label}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={s.note}>
                Omset mingguan memakai rata-rata kiriman (9 kiriman/bulan). Rincian per SDM ada di PCP
                Mingguan.
              </Text>
              <View style={s.actionsRow}>
                <WebButton label="Laporan lengkap" icon="chart" onPress={() => router.push("/laporan" as any)} />
                <WebButton label="PCP mingguan" icon="calendar" variant="ghost" onPress={() => router.push("/laporan-pcp-mingguan" as any)} />
              </View>
            </>
          )}
        </Panel>

        <Panel title="Pencapaian per area" icon="map" basis={360} right={<WebButton label="Detail" icon="chevron" variant="ghost" onPress={() => router.push("/laporan-pcp" as any)} />}>
          {bulanan.state === "loading" && areas.length === 0 ? (
            <Loading text="Memuat area…" />
          ) : areas.length === 0 ? (
            <Empty text="Rincian area belum tersedia." />
          ) : (
            areas.map((a, i) => (
              <View key={a.area} style={[s.areaRow, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
                <View style={s.areaTop}>
                  <Text style={s.areaName}>{a.area}</Text>
                  {a.pct != null && a.pct < 70 ? (
                    <Chip text="DI BAWAH TARGET" bg={A.orangeSoft} fg={A.orange} />
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Text style={[s.areaPct, { color: tone(a.pct) }]}>{pctText(a.pct)}</Text>
                </View>
                <Bar pct={a.pct} color={tone(a.pct)} height={5} />
                <Text style={s.small}>
                  {compactRp(a.act)} dari {compactRp(a.tgt)} • {a.sdm} SDM
                </Text>
              </View>
            ))
          )}
        </Panel>
      </View>

      <View style={s.grid}>
        <Panel title="Tim" icon="users" basis={560} right={<WebButton label="Rapor sales" icon="star" variant="ghost" onPress={() => router.push("/spv-penilaian" as any)} />}>
          {tim === undefined ? (
            <Loading text="Memuat data tim…" />
          ) : timRows.length === 0 ? (
            <Empty text="Belum ada data sales bulan ini." />
          ) : (
            <>
              <View style={s.triRow}>
                <TriBox label="ON TRACK" value={onTrack} color={A.green} />
                <TriBox label="DI BAWAH 70" value={timRows.length - onTrack} color={A.orange} />
                <TriBox label="RATA-RATA SKOR" value={avgScore} color={A.ink} />
              </View>
              <View style={{ marginTop: 10 }}>
                {timRows.slice(0, 5).map((r, i) => (
                  <View key={String(r.salesId ?? i)} style={[s.tr, i === 0 && { borderTopWidth: 0 }]}>
                    <Text style={[s.td, { flex: 1, fontWeight: "700" }]} numberOfLines={1}>{r.salesName}</Text>
                    <Text style={[s.td, { width: 90 }]}>{r.area || "–"}</Text>
                    <Text style={[s.td, { width: 100 }]}>{r.kunjungan} kunjungan</Text>
                    <Text style={[s.td, { width: 60, textAlign: "right", fontWeight: "800", color: Number(r.skor) >= 70 ? A.green : A.orange }]}>
                      {r.skor}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Panel>

        <Panel title="Operasional" icon="store" basis={360}>
          <Line icon="store" label="FU Toko" value={fuToko ? `${fuToko.pending} belum` : "…"} hint={fuToko ? `${fuToko.open} OPEN • ${fuToko.inpg} INPG • ${fuToko.clsd} CLSD` : "Memuat…"} onPress={() => router.push("/toko-aktif" as any)} />
          <Line icon="users" label="Sales on track" value={`${onTrack}/${timRows.length}`} hint="Skor kunjungan ≥ 70" onPress={() => router.push("/spv-penilaian" as any)} />
          <Line icon="trend" label="Laporan PCP" value="Buka" hint="Bulanan, mingguan, target vs aktual" onPress={() => router.push("/laporan-pcp" as any)} />
          <Line icon="chart" label="Laporan lengkap" value="Buka" hint="Semua rekap dalam satu tempat" onPress={() => router.push("/laporan" as any)} />
          <Text style={s.note}>Angka omset bersumber dari Sheet PCP dan diperbarui otomatis setiap 5 menit.</Text>
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
      <Panel title="Akses cepat" icon="grid">
        <View style={s.quickGrid}>
          <QuickLink icon="chart" label="Laporan" desc="PCP, DAP, target toko" bg={A.greenSoft} fg={A.green} onPress={() => router.push("/laporan" as any)} />
          <QuickLink icon="store" label="Kelola Toko" desc="Cari & lihat data toko" bg={A.infoSoft} fg={A.info} onPress={() => router.push("/kelola-toko" as any)} />
          <QuickLink icon="clipboard" label="SPK" desc="SPK Sales & SPK Admin" bg={A.brandSoft} fg={A.brand} onPress={() => router.push("/spk" as any)} />
          <QuickLink icon="chat" label="Chat internal" desc="Pesan dengan tim" bg={A.purpleSoft} fg={A.purple} onPress={() => router.push("/chat" as any)} />
        </View>
      </Panel>
    </View>
  );
}

// ===== Komponen kecil =====
function Loading({ text }: { text: string }) {
  return (
    <View style={s.loadingRow}>
      <IOSSpinner size="small" color={A.brand} />
      <Text style={s.muted}>{text}</Text>
    </View>
  );
}
function Empty({ text }: { text: string }) {
  return <Text style={[s.muted, { paddingVertical: 6 }]}>{text}</Text>;
}
function QuickLink({ icon, label, desc, bg, fg, onPress }: any) {
  return (
    <TouchableOpacity style={s.quickLink} activeOpacity={0.82} onPress={onPress}>
      <View style={[s.quickIcon, { backgroundColor: bg }]}>
        <AppIcon name={icon} size={16} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.quickLabel} numberOfLines={1}>{label}</Text>
        <Text style={s.quickDesc} numberOfLines={1}>{desc}</Text>
      </View>
      <AppIcon name="chevron" size={14} color={A.mutedSoft} />
    </TouchableOpacity>
  );
}
function SplitBox({ label, value, sub, color }: any) {
  return (
    <View style={s.splitBox}>
      <Text style={s.splitLabel}>{label}</Text>
      <Text style={[s.splitValue, { color }]}>{value}</Text>
      <Text style={s.small}>{sub}</Text>
    </View>
  );
}
function TriBox({ label, value, color }: any) {
  return (
    <View style={s.triBox}>
      <Text style={[s.triValue, { color }]}>{value}</Text>
      <Text style={s.triLabel}>{label}</Text>
    </View>
  );
}
function Line({ icon, label, value, hint, onPress }: any) {
  return (
    <TouchableOpacity style={s.line} activeOpacity={0.8} onPress={onPress} disabled={!onPress}>
      <View style={s.lineIcon}><AppIcon name={icon} size={14} color={A.inkSoft} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.lineLabel} numberOfLines={1}>{label}</Text>
        {hint ? <Text style={s.lineHint} numberOfLines={1}>{hint}</Text> : null}
      </View>
      <Text style={s.lineValue} numberOfLines={1}>{value}</Text>
      {onPress ? <AppIcon name="chevron" size={13} color={A.mutedSoft} style={{ marginLeft: 5 }} /> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: A.page },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  stack: { gap: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  heroLine: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 4 },
  heroBig: {
    fontSize: 34,
    fontWeight: "800",
    color: A.ink,
    letterSpacing: -1,
    fontFamily: FONT,
  },
  heroBigOf: { fontSize: 13, fontWeight: "700", color: A.muted, marginBottom: 5, fontFamily: FONT },
  heroStore: { fontSize: 20, fontWeight: "800", color: A.ink, letterSpacing: -0.4, fontFamily: FONT, marginTop: 2 },

  panelLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: A.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: FONT,
  },
  muted: { fontSize: 11.5, color: A.muted, lineHeight: 17, fontFamily: FONT, marginTop: 6 },
  small: { fontSize: 10, color: A.muted, marginTop: 4, fontFamily: FONT },
  note: {
    fontSize: 10,
    color: A.mutedSoft,
    lineHeight: 15,
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: A.borderSoft,
    fontFamily: FONT,
  },

  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickLink: {
    flexBasis: 220,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: A.borderSoft,
    backgroundColor: A.surface,
  },
  quickIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11.5, fontWeight: "700", color: A.ink, fontFamily: FONT },
  quickDesc: { fontSize: 9.5, color: A.muted, marginTop: 1, fontFamily: FONT },

  splitRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  splitBox: {
    flex: 1,
    backgroundColor: A.surfaceAlt,
    borderWidth: 1,
    borderColor: A.borderSoft,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  splitLabel: { fontSize: 8.5, fontWeight: "800", color: A.muted, letterSpacing: 0.4, fontFamily: FONT },
  splitValue: { fontSize: 22, fontWeight: "800", marginTop: 2, fontFamily: FONT },

  triRow: { flexDirection: "row", gap: 8 },
  triBox: { flex: 1, backgroundColor: A.surfaceAlt, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  triValue: { fontSize: 19, fontWeight: "800", fontFamily: FONT },
  triLabel: { fontSize: 8, fontWeight: "800", color: A.muted, letterSpacing: 0.35, marginTop: 1, fontFamily: FONT, textAlign: "center" },

  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: A.border,
    marginBottom: 2,
  },
  th: { fontSize: 8.5, fontWeight: "800", color: A.muted, letterSpacing: 0.6, fontFamily: FONT },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: A.borderSoft,
  },
  td: { fontSize: 11, color: A.inkSoft, fontFamily: FONT },
  tdName: { fontSize: 11.5, fontWeight: "700", color: A.ink, fontFamily: FONT },
  dot: { width: 7, height: 7, borderRadius: 4 },

  excRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: A.surfaceAlt,
    borderWidth: 1,
    borderColor: A.borderSoft,
    marginBottom: 6,
  },
  excIcon: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  excTitle: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  excDesc: { fontSize: 10.5, color: A.muted, marginTop: 1, fontFamily: FONT },

  okBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: A.greenSoft,
    borderWidth: 1,
    borderColor: A.greenBorder,
  },
  okTitle: { fontSize: 12, fontWeight: "800", color: A.green, fontFamily: FONT },

  line: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: A.borderSoft,
  },
  lineIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: A.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  lineLabel: { fontSize: 11, fontWeight: "700", color: A.ink, fontFamily: FONT },
  lineHint: { fontSize: 9.5, color: A.muted, marginTop: 1, fontFamily: FONT },
  lineValue: { fontSize: 11.5, fontWeight: "800", color: A.inkSoft, marginLeft: 8, maxWidth: 120, fontFamily: FONT },

  weekGrid: { flexDirection: "row", gap: 10, marginTop: 8 },
  weekCol: { flex: 1, alignItems: "center" },
  weekPct: { fontSize: 11, fontWeight: "800", color: A.ink, fontFamily: FONT },
  weekBarBg: {
    width: "100%",
    height: 58,
    borderRadius: 5,
    backgroundColor: "#F3ECE8",
    justifyContent: "flex-end",
    overflow: "hidden",
    marginTop: 4,
  },
  weekBarFill: { width: "100%", borderRadius: 5 },
  weekLabel: { fontSize: 9, fontWeight: "800", color: A.muted, marginTop: 5, letterSpacing: 0.4, fontFamily: FONT },

  areaRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: A.borderSoft,
  },
  areaTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  areaName: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  areaPct: { fontSize: 13, fontWeight: "800", fontFamily: FONT },
});
