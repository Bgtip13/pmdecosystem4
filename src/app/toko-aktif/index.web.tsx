import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import IOSSpinner from "../../components/IOSSpinner";
import AppIcon from "../../components/AppIcon";
import DesktopShell from "../../components/desktop/DesktopShell";
import {
  Card, DataTable, Dialog, EmptyState, FilterChip, Kpi, Pill, SearchField, Segmented, WebButton,
} from "../../components/desktop/ui";
import type { Col, Tone } from "../../components/desktop/ui";
import { A } from "../../components/desktop/tokens";
import { useBulkSelect } from "../../components/BulkSelect";
import { toFriendlyError } from "../../lib/msg";
import { downloadCsv } from "../../lib/downloadCsv";
import { isOwnerLike } from "../../lib/roles";

const RESULT_LABEL: Record<string, string> = {
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
const WF_TONE: Record<string, Tone> = { OPEN: "amber", INPG: "blue", CLSD: "green" };
const AREA_TONE: Record<string, Tone> = { SOLO: "red", DIY: "blue", SEMARANG: "green" };
const rupiah = (n: any) => (n == null || isNaN(n) ? "–" : "Rp" + Number(n).toLocaleString("id-ID"));
const monthLabel = (mk?: string) => {
  if (!mk) return "–";
  const [y, m] = mk.split("-");
  const nm = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${nm[Number(m) - 1] ?? m} ${y}`;
};
const web = (o: any) => o as any;

type Notice = { tone: "ok" | "err"; text: string } | null;

export default function TokoAktifListWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  const isSuper = viewer?.role === "supervisor";
  const isTele = viewer?.role === "telemarketing";
  const isOwner = isOwnerLike(viewer?.role);
  const bolehLihat = isSuper || isTele || isOwner;

  const [areaChip, setAreaChip] = useState("ALL");
  const [wf, setWf] = useState<"ALL" | "OPEN" | "INPG" | "CLSD">("ALL");
  const [q, setQ] = useState("");
  const [orderFilter, setOrderFilter] = useState<"ALL" | "ORDER" | "BELUM">("ALL");
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmOne, setConfirmOne] = useState<any | null>(null);
  const [confirmMany, setConfirmMany] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useQuery(
    api.activeStores.list,
    bolehLihat
      ? {
          ...(isSuper && areaChip !== "ALL" ? { area: areaChip as any } : {}),
          ...(wf !== "ALL" ? { wf } : {}),
          ...(q.trim() ? { q: q.trim() } : {}),
        }
      : "skip"
  ) as any;
  const counts = useQuery(api.activeStores.counts, bolehLihat ? {} : "skip") as any;
  const lastSync = useQuery(api.activeStoreSync.getLastSyncStatus, isSuper ? {} : "skip") as any;

  const doSync = useAction(api.activeStoreSync.manualSync);
  const closeTask = useMutation(api.activeStores.supervisorClose);
  const closeMany = useMutation(api.activeStores.supervisorCloseMany);
  const markCall = useMutation(api.activeStores.markCall);
  const bulk = useBulkSelect();

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;
  if (!bolehLihat) {
    return (
      <DesktopShell active="beranda" title="FU Toko" subtitle="Tidak ada akses">
        <EmptyState icon="shield" title="Tidak ada akses" desc="Akun ini tidak punya akses ke FU Toko."
          action={<WebButton label="Ke Beranda" onPress={() => router.replace("/beranda")} />} />
      </DesktopShell>
    );
  }

  const items: any[] = list?.items ?? [];
  const total = counts?.total ?? { open: 0, inpg: 0, closed: 0, all: 0, sudahOrder: 0 };
  // Bisa ditutup supervisor: INPG (menunggu review) atau OPEN yang tokonya sudah order (bypass langsung CLSD).
  const bisaTutup = (t: any) => {
    const w = t.workflowStatus ?? "OPEN";
    return w === "INPG" || (w === "OPEN" && !!t.sudahOrder);
  };
  const tutupIds = items.filter(bisaTutup).map((t) => t._id as string);
  const inpgCount = items.filter((t) => t.workflowStatus === "INPG").length;
  const autoCount = counts?.total?.sudahOrder ?? items.filter((t) => t.sudahOrder).length;
  const shown = items.filter((t) => (orderFilter === "ALL" ? true : orderFilter === "ORDER" ? !!t.sudahOrder : !t.sudahOrder));
  const open = (t: any) => router.push(`/toko-aktif/${t._id}` as any);

  const onSync = async () => {
    setSyncing(true); setNotice(null);
    try {
      const r: any = await doSync();
      setNotice({ tone: "ok", text: `Sinkron selesai — ${monthLabel(r?.monthKey)}: ${r?.inserted ?? 0} baru, ${r?.updated ?? 0} diperbarui, ${r?.deletedOpen ?? 0} OPEN dihapus.` });
    } catch (e: any) {
      setNotice({ tone: "err", text: `Gagal sinkron: ${toFriendlyError(e)}` });
    } finally {
      setSyncing(false);
    }
  };

  const onQuickCall = async (t: any) => {
    setNotice(null);
    try {
      await markCall({ taskId: t._id });
      setNotice({ tone: "ok", text: `Toko “${t.storeName}” ditandai sedang dihubungi.` });
    } catch (e: any) {
      setNotice({ tone: "err", text: `Gagal mencatat panggilan: ${toFriendlyError(e)}` });
    }
  };

  const doCloseOne = async () => {
    if (!confirmOne) return;
    setBusy(true);
    try {
      await closeTask({ taskId: confirmOne._id });
      setNotice({ tone: "ok", text: `“${confirmOne.storeName}” disetujui (CLSD).` });
    } catch (e: any) {
      setNotice({ tone: "err", text: `Gagal menyetujui: ${toFriendlyError(e)}` });
    } finally {
      setBusy(false); setConfirmOne(null);
    }
  };

  const doCloseMany = async () => {
    const ids = [...bulk.terpilih] as any;
    if (!ids.length) return;
    setBusy(true);
    try {
      const r: any = await closeMany({ taskIds: ids });
      bulk.reset();
      setNotice({ tone: "ok", text: `${r.closed} toko disetujui${r.skippedCount ? `, ${r.skippedCount} dilewati (status berubah).` : "."}` });
    } catch (e: any) {
      setNotice({ tone: "err", text: `Gagal menyetujui: ${toFriendlyError(e)}` });
    } finally {
      setBusy(false); setConfirmMany(false);
    }
  };

  const onExport = () => {
    if (!shown.length) return;
    const header = [
      "Area", "Pelanggan", "Kelas Toko", "Kelas Bayar", "Target",
      "Status", "Status Sheet", "Jml Dihubungi", "Hasil", "Rencana Order",
      "Disimpan oleh", "Disimpan pada", "Catatan Review",
      "Sudah Order (ACT)", "ACT (SPK Jadwal)", "Tanggal ACT",
    ];
    const body = shown.map((t) => [
      t.area, t.storeName, t.storeClass ?? "", t.paymentClass ?? "", t.target ?? "",
      t.workflowStatus ?? "OPEN", t.sourceStatus ?? "", t.callCount ?? 0,
      RESULT_LABEL[t.result] ?? "", t.plannedOrderDate ?? "",
      t.doneByName ?? "", t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID") : "",
      t.reviewNote ?? "",
      t.sudahOrder ? "Ya" : "Tidak", t.act ?? "", t.actTanggal ?? "",
    ]);
    const ok = downloadCsv(`fu-toko_${list?.monthKey ?? "bulan"}`, header, body);
    setNotice(ok ? { tone: "ok", text: `${body.length} baris diunduh.` } : { tone: "err", text: "Browser tidak mendukung unduhan." });
  };

  // ===== Kolom tabel =====
  const cols: Col[] = [];
  if (bulk.pilih) {
    cols.push({
      key: "sel", label: "", width: 44,
      render: (t: any) => {
        const can = bisaTutup(t);
        const on = can && bulk.terpilih.has(t._id);
        return (
          <View style={[s.box, on && s.boxOn, !can && { opacity: 0.35 }]}>
            {on ? <AppIcon name="check" size={13} color="#fff" /> : null}
          </View>
        );
      },
    });
  }
  cols.push(
    {
      key: "storeName", label: "Pelanggan", flex: 2.6,
      render: (t: any) => (
        <View style={{ gap: 4, width: "100%" }}>
          <Text style={s.name} numberOfLines={1}>{t.storeName}</Text>
          <View style={s.chips}>
            {t.sudahOrder ? <Pill text={t.sumberOrder === "produk" ? "Sudah order (Produk)" : "Sudah order (ACT)"} tone="green" size="sm" /> : null}
            {t.storeClass ? <Pill text={`Kelas ${t.storeClass}`} tone="gray" size="sm" /> : null}
            {t.paymentClass ? <Pill text={t.paymentClass} tone="gray" size="sm" /> : null}
          </View>
        </View>
      ),
    },
  );
  if (isSuper || isOwner) {
    cols.push({ key: "area", label: "Area", width: 100, render: (t: any) => (t.area ? <Pill text={t.area} tone={AREA_TONE[t.area] ?? "gray"} size="sm" /> : <Text style={s.cell}>–</Text>) });
  }
  cols.push(
    { key: "wf", label: "Status", width: 90, render: (t: any) => { const w = t.workflowStatus ?? "OPEN"; return <Pill text={w} tone={WF_TONE[w] ?? "gray"} size="sm" dot />; } },
    { key: "target", label: "Target", width: 120, align: "right", render: (t: any) => <Text style={s.cell}>{rupiah(t.target)}</Text> },
    {
      key: "info", label: "Aktivitas", flex: 2.2,
      render: (t: any) => {
        const w = t.workflowStatus ?? "OPEN";
        if (t.sudahOrder) {
          return (
            <Text style={s.good} numberOfLines={2}>
              {t.sumberOrder === "produk" ? `Penjualan ${rupiah(t.produkRp)} (${t.produkQty ?? 0} pcs) dari data Produk` : `ACT ${rupiah(t.act)} dari SPK Jadwal${t.actTanggal ? ` (${t.actTanggal})` : ""}`}
            </Text>
          );
        }
        if (w === "INPG") {
          return <Text style={s.cell} numberOfLines={2}>Hasil: {RESULT_LABEL[t.result] ?? t.result ?? "–"}{t.result === "plan_order" && t.plannedOrderDate ? ` (${t.plannedOrderDate})` : ""} • {t.doneByName || "–"}</Text>;
        }
        if (w === "CLSD" && t.reviewNote) return <Text style={s.cell} numberOfLines={2}>💬 {t.reviewNote}</Text>;
        return t.calledAt
          ? <Text style={s.cell} numberOfLines={1}>📞 Dihubungi {t.callCount ?? 1}× • {t.calledByName || "–"}</Text>
          : <Text style={s.warn}>Belum ditelepon</Text>;
      },
    },
    {
      key: "act", label: "Aksi", width: bulk.pilih ? 0.01 : 250, align: "right",
      render: (t: any) => {
        if (bulk.pilih) return null;
        const w = t.workflowStatus ?? "OPEN";
        return (
          <View style={s.actions}>
            {w !== "CLSD" && !t.sudahOrder ? <WebButton label="Call" icon="phone" variant="ghost" size="sm" onPress={() => onQuickCall(t)} /> : null}
            {w !== "CLSD" ? <WebButton label={t.sudahOrder ? "Detail" : "Isi hasil"} variant="soft" size="sm" onPress={() => open(t)} /> : null}
            {isSuper && bisaTutup(t) ? <WebButton label={w === "OPEN" ? "Tutup (sudah order)" : "Setujui"} icon="check" size="sm" onPress={() => setConfirmOne(t)} /> : null}
          </View>
        );
      },
    },
  );
  const visibleCols = bulk.pilih ? cols.filter((c) => c.key !== "act") : cols;

  return (
    <DesktopShell
      active="toko-aktif"
      title="FU Toko"
      subtitle={`${monthLabel(list?.monthKey ?? counts?.monthKey)} • Toko belum ambil bulan ini`}
      right={
        <View style={s.actions}>
          {isSuper ? <WebButton label={syncing ? "Menarik data…" : "Sinkron Toko_aktif"} icon="refresh" variant="soft" disabled={syncing} onPress={onSync} /> : null}
          <WebButton label="Unduh CSV" icon="download" variant="ghost" disabled={!shown.length} onPress={onExport} />
        </View>
      }
    >
      <View style={s.stack}>
        {notice ? (
          <View style={[s.notice, notice.tone === "ok" ? s.noticeOk : s.noticeErr]}>
            <Text style={[s.noticeText, { color: notice.tone === "ok" ? A.green : A.red }]}>{notice.text}</Text>
          </View>
        ) : null}

        <View style={s.kpis}>
          <Kpi icon="store" tone="violet" label="Semua toko" value={total.all} hint={isSuper ? (lastSync?.hasSync ? `Sinkron ${new Date(lastSync.requestedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : "Belum pernah sinkron") : undefined} />
          <Kpi icon="clock" tone="amber" label="OPEN" value={total.open} hint="belum dikerjakan" />
          <Kpi icon="clipboard" tone="blue" label="INPG" value={total.inpg} hint="menunggu review" />
          <Kpi icon="check" tone="green" label="CLSD" value={total.closed} hint="sudah disetujui" />
          <Kpi icon="cart" tone="green" label="Sudah order" value={autoCount} hint="tidak perlu di-FU" />
        </View>

        <Card pad={16}>
          <View style={s.toolbar}>
            <Segmented
              value={wf}
              onChange={(k) => { if (!bulk.pilih) setWf(k as any); }}
              options={[
                { key: "ALL", label: "Semua", count: total.all },
                { key: "OPEN", label: "OPEN", count: total.open },
                { key: "INPG", label: "INPG", count: total.inpg },
                { key: "CLSD", label: "CLSD", count: total.closed },
              ]}
            />
            <SearchField value={q} onChangeText={(v: string) => { if (!bulk.pilih) setQ(v); }} placeholder="Cari nama pelanggan…" width={300} />
          </View>
          <View style={[s.toolbar, { marginTop: 12 }]}>
            <View style={s.chips}>
              {([["ALL", "Semua"], ["ORDER", `Sudah order (${autoCount})`], ["BELUM", "Belum order"]] as const).map(([k, l]) => (
                <FilterChip key={k} label={l} on={orderFilter === k} onPress={() => { if (!bulk.pilih) setOrderFilter(k); }} />
              ))}
            </View>
            {isSuper ? (
              <View style={s.chips}>
                {["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => (
                  <FilterChip key={a} label={a === "ALL" ? "Semua area" : a} on={areaChip === a} onPress={() => { if (!bulk.pilih) setAreaChip(a); }} />
                ))}
              </View>
            ) : null}
          </View>
        </Card>

        {/* Bar mode pilih (supervisor) */}
        {isSuper && list !== undefined && tutupIds.length > 0 ? (
          bulk.pilih ? (
            <View style={s.bulkBar}>
              <Text style={s.bulkText}>{bulk.terpilih.size} dipilih • maksimal 20 per kali</Text>
              <View style={s.actions}>
                <WebButton label="Pilih semua" variant="ghost" size="sm" onPress={() => bulk.pilihSemua(tutupIds)} />
                <WebButton label="Batal" variant="ghost" size="sm" onPress={bulk.reset} />
                <WebButton label={`Setujui ${bulk.terpilih.size || ""}`.trim()} icon="check" size="sm" disabled={!bulk.terpilih.size} onPress={() => setConfirmMany(true)} />
              </View>
            </View>
          ) : (
            <View style={s.bulkBar}>
              <Text style={s.bulkText}>{inpgCount} toko menunggu review{tutupIds.length - inpgCount > 0 ? ` • ${tutupIds.length - inpgCount} toko sudah order dan bisa langsung ditutup` : ""} — bisa diproses sekaligus.</Text>
              <WebButton label="Pilih banyak" icon="checkDone" variant="soft" size="sm" onPress={bulk.buka} />
            </View>
          )
        ) : null}

        <Card pad={0}>
          {list === undefined ? (
            <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
          ) : (
            <>
              <Text style={s.count}>{shown.length} toko • {autoCount} sudah order</Text>
              <DataTable
                cols={visibleCols}
                rows={shown}
                keyOf={(t: any) => String(t._id)}
                minWidth={bulk.pilih ? 760 : 980}
                onRowPress={(t: any) => {
                  if (bulk.pilih) { if (bisaTutup(t)) bulk.toggle(t._id); }
                  else open(t);
                }}
                empty={
                  <EmptyState
                    icon="store"
                    title="Belum ada data FU Toko"
                    desc={isSuper ? "Tekan “Sinkron Toko_aktif” untuk menarik daftar dari Google Sheet." : "Daftar diisi supervisor lewat tombol Sinkron."}
                  />
                }
              />
            </>
          )}
        </Card>
      </View>

      <Dialog
        visible={!!confirmOne}
        onClose={() => setConfirmOne(null)}
        title={confirmOne && (confirmOne.workflowStatus ?? "OPEN") === "OPEN" ? "Tutup langsung? (OPEN → CLSD)" : "Setujui tugas ini? (CLSD)"}
        subtitle={confirmOne ? ((confirmOne.workflowStatus ?? "OPEN") === "OPEN" ? `“${confirmOne.storeName}” sudah order, tidak perlu di-follow-up. Tugas dikunci dan dihitung berhasil order setelah FU.` : `FU Toko “${confirmOne.storeName}” akan dikunci dan pindah ke Riwayat.`) : undefined}
        icon="check" tone="green" width={460}
        footer={<View style={s.dlgFoot}>
          <WebButton label="Batal" variant="ghost" onPress={() => setConfirmOne(null)} />
          <WebButton label="Ya, CLSD" disabled={busy} onPress={doCloseOne} />
        </View>}
      />
      <Dialog
        visible={confirmMany}
        onClose={() => setConfirmMany(false)}
        title={`Setujui ${bulk.terpilih.size} toko sekaligus? (CLSD)`}
        subtitle="Toko terpilih akan dikunci dan pindah ke Riwayat. Petugas tidak bisa mengedit lagi."
        icon="check" tone="green" width={480}
        footer={<View style={s.dlgFoot}>
          <WebButton label="Batal" variant="ghost" onPress={() => setConfirmMany(false)} />
          <WebButton label="Ya, CLSD" disabled={busy} onPress={doCloseMany} />
        </View>}
      />
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  stack: { gap: 16 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "flex-end" },
  pad: { padding: 40, alignItems: "center" },
  count: { fontSize: 12.5, color: A.muted, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 },
  name: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  cell: { fontSize: 13, color: A.inkSoft },
  good: { fontSize: 12.5, color: A.green, fontWeight: "600" },
  warn: { fontSize: 12.5, color: A.orange, fontWeight: "600" },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: A.mutedSoft, alignItems: "center", justifyContent: "center", backgroundColor: A.surface },
  boxOn: { backgroundColor: A.ink, borderColor: A.ink },
  bulkBar: {
    flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between",
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10,
  },
  bulkText: { fontSize: 13, color: A.inkSoft, fontWeight: "600" },
  notice: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  noticeOk: { backgroundColor: A.greenSoft, borderColor: A.greenBorder },
  noticeErr: { backgroundColor: A.redSoft, borderColor: "#F7C9C5" },
  noticeText: { fontSize: 13, fontWeight: "600" },
  dlgFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
});
