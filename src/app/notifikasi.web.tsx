import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { A, FONT } from "../components/desktop/tokens";
import {
  Avatar, Card, Dialog, EmptyState, FilterChip, Kpi, Pill, SearchField, Segmented, WebButton, IconTile,
} from "../components/desktop/ui";
import type { Tone } from "../components/desktop/ui";
import { BarChart, Donut, MiniBars } from "../components/desktop/charts";
import { ActivityRow, NotifRow } from "../components/desktop/feedItems";
import {
  KIND_META, KIND_ORDER, dayKeyWIB, dayLabel, domainOf, kindOf, labelOf, clock, timeAgo,
} from "../lib/activityMeta";
import type { Kind } from "../lib/activityMeta";
import { ROLE_LABEL } from "../lib/roles";
import { toFriendlyError } from "../lib/msg";

const web = (o: any) => o as any;

type TabKey = "tindakan" | "saya" | "aktivitas";

export default function NotifikasiWeb() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const viewer = useQuery(api.users.viewer) as any;
  const isSuper = viewer?.role === "supervisor";
  const canSpk = viewer?.role === "supervisor" || viewer?.role === "telemarketing" || ["owner", "hr", "akunting"].includes(viewer?.role);

  const initial: TabKey = params.tab === "aktivitas" ? "aktivitas" : params.tab === "saya" ? "saya" : "tindakan";
  const [tab, setTab] = useState<TabKey>(initial);
  // Ikuti perubahan ?tab= (mis. dari lonceng saat sudah berada di halaman ini)
  useEffect(() => { setTab(initial); }, [initial]);
  const [composeOpen, setComposeOpen] = useState(false);

  const unread = useQuery(api.notifications.unreadCount) as any;
  const actUnread = useQuery(api.activity.unreadCount, isSuper ? {} : "skip") as any;

  // jumlah "perlu tindakan" untuk badge tab
  const piutang = useQuery(api.piutang.pendingCount, canSpk ? undefined : "skip") as any;
  const order = useQuery(api.orderFollowups.pendingCount, canSpk ? undefined : "skip") as any;
  const exc = useQuery(api.dashboard.todaySpkExceptions, isSuper ? {} : "skip") as any;
  const locPending = useQuery(api.locationRequests.listPendingRequests, isSuper ? undefined : "skip") as any;
  const jadwalPending = useQuery(api.jadwalRequests.pendingCount, isSuper ? undefined : "skip") as any;
  const tindakanCount =
    Number(piutang?.count ?? 0) + Number(order?.count ?? 0) + Number(locPending?.length ?? 0) + Number(jadwalPending ?? 0) +
    Number(exc?.summary?.total ?? 0);

  if (!viewer) return null;

  return (
    <DesktopShell
      active="notifikasi"
      title="Notifikasi"
      subtitle={isSuper ? "Tugas yang menunggu, pesan untuk Anda, dan semua aktivitas tim secara langsung" : "Tugas yang menunggu dan pesan untuk Anda"}
      right={isSuper ? <WebButton label="Kirim notifikasi" icon="send" onPress={() => setComposeOpen(true)} /> : undefined}
    >
      <View style={s.stack}>
        <Segmented
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
          options={[
            { key: "tindakan", label: "Perlu tindakan", icon: "flag", count: tindakanCount },
            { key: "saya", label: "Untuk saya", icon: "bell", count: Number(unread ?? 0) },
            ...(isSuper ? [{ key: "aktivitas", label: "Aktivitas tim", icon: "list", count: Number(actUnread ?? 0) }] : []),
          ]}
        />

        {tab === "tindakan" ? (
          <TindakanTab viewer={viewer} piutang={piutang} order={order} exc={exc} locPending={locPending} jadwalPending={jadwalPending} />
        ) : tab === "saya" ? (
          <SayaTab />
        ) : isSuper ? (
          <AktivitasTab viewerId={String(viewer._id)} />
        ) : null}
      </View>

      {isSuper ? <ComposeDialog visible={composeOpen} onClose={() => setComposeOpen(false)} /> : null}
    </DesktopShell>
  );
}

// ============================================================================
// TAB 1 — PERLU TINDAKAN (tugas yang sedang menunggu, per peran)
// ============================================================================
function TindakanTab({ viewer, piutang, order, exc, locPending, jadwalPending }: any) {
  const router = useRouter();
  const role = viewer.role;
  const items: { icon: string; tone: Tone; title: string; desc: string; count: number; href: string; cta: string }[] = [];

  if (piutang !== undefined && Number(piutang?.count ?? 0) > 0)
    items.push({ icon: "wallet", tone: "red", title: "Piutang belum ditagih", desc: "Tugas follow-up piutang hari ini yang belum dikerjakan.", count: piutang.count, href: "/spk?sec=admin", cta: "Kerjakan" });
  if (order !== undefined && Number(order?.count ?? 0) > 0)
    items.push({ icon: "cart", tone: "amber", title: "SPK Sales H+1 belum dikerjakan", desc: "Follow-up order dari kunjungan sales kemarin.", count: order.count, href: "/spk?sec=admin", cta: "Kerjakan" });
  if (role === "supervisor") {
    if (Number(locPending?.length ?? 0) > 0)
      items.push({ icon: "pin", tone: "blue", title: "Usulan lokasi toko menunggu persetujuan", desc: "Sales mengajukan perubahan titik lokasi toko.", count: locPending.length, href: "/spv-approval", cta: "Tinjau" });
    if (Number(jadwalPending ?? 0) > 0)
      items.push({ icon: "calendar", tone: "violet", title: "Pengajuan jadwal menunggu keputusan", desc: "Permintaan pindah / batal jadwal kunjungan dari sales.", count: jadwalPending, href: "/spv-approval", cta: "Tinjau" });
  }
  const excItems: any[] = (exc?.items ?? []).slice(0, 12);

  const loading = piutang === undefined && order === undefined && (role !== "supervisor" || exc === undefined);
  const nothing = !loading && items.length === 0 && excItems.length === 0;

  return (
    <View style={s.stack}>
      {loading ? (
        <Card><Text style={s.muted}>Memeriksa tugas yang menunggu…</Text></Card>
      ) : nothing ? (
        <Card>
          <EmptyState icon="check" title="Semua beres" desc="Tidak ada tugas yang menunggu tindakan Anda saat ini." />
        </Card>
      ) : null}

      {items.length > 0 ? (
        <View style={s.cardGrid}>
          {items.map((it, i) => (
            <Card key={i} style={s.todoCard} pad={18}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <IconTile icon={it.icon} tone={it.tone} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.todoTitle}>{it.title}</Text>
                  <Text style={s.todoDesc}>{it.desc}</Text>
                </View>
                <Text style={s.todoCount}>{it.count}</Text>
              </View>
              <View style={{ marginTop: 14, flexDirection: "row" }}>
                <WebButton label={it.cta} icon="chevron" size="sm" onPress={() => router.push(it.href as any)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {excItems.length > 0 ? (
        <Card pad={0}>
          <View style={{ padding: 20, paddingBottom: 8 }}>
            <Text style={s.cardTitle}>Pengecualian hari ini</Text>
            <Text style={s.cardSub}>Sales yang kurang target, kunjungan terlalu lama, dan SPK/FU Toko yang perlu ditinjau.</Text>
          </View>
          {excItems.map((it, i) => (
            <Pressable
              key={`${it.kind}-${i}`}
              onPress={() => it.link && router.push(it.link as any)}
              style={web([s.excRow, i === excItems.length - 1 && { borderBottomWidth: 0 }, { cursor: "pointer" }])}
            >
              <IconTile icon="warn" tone={it.severity === "danger" ? "red" : "amber"} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.excTitle} numberOfLines={1}>{it.userName ? `${it.userName}${it.area ? ` • ${it.area}` : ""}` : it.title}</Text>
                <Text style={s.excDesc} numberOfLines={1}>{it.userName ? `${it.title} — ${it.description ?? ""}` : it.description}</Text>
              </View>
              <Pill text={it.severity === "danger" ? "Kritis" : "Perhatian"} tone={it.severity === "danger" ? "red" : "amber"} />
              <AppIcon name="chevron" size={14} color={A.mutedSoft} />
            </Pressable>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

// ============================================================================
// TAB 2 — UNTUK SAYA (tabel notifications)
// ============================================================================
function SayaTab() {
  const router = useRouter();
  const list = useQuery(api.notifications.listMine) as any;
  const markRead = useMutation(api.notifications.markRead);
  const markAll = useMutation(api.notifications.markAllRead);
  const remove = useMutation(api.notifications.remove);
  const [only, setOnly] = useState<"all" | "unread">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return ((list ?? []) as any[]).filter((n) =>
      (only === "all" || !n.readAt) && (!kw || `${n.title} ${n.body} ${n.fromName}`.toLowerCase().includes(kw)));
  }, [list, only, q]);
  const unreadN = ((list ?? []) as any[]).filter((n) => !n.readAt).length;

  const groups = useMemo(() => {
    const m: { key: string; label: string; items: any[] }[] = [];
    for (const n of rows) {
      const k = dayKeyWIB(n.createdAt);
      let g = m.find((x) => x.key === k);
      if (!g) { g = { key: k, label: dayLabel(n.createdAt), items: [] }; m.push(g); }
      g.items.push(n);
    }
    return m;
  }, [rows]);

  const open = async (n: any) => {
    try { if (!n.readAt) await markRead({ notifId: n._id }); } catch {}
    if (n.link) router.push(String(n.link) as any);
  };

  return (
    <View style={s.stack}>
      <View style={s.toolbar}>
        <FilterChip label="Semua" on={only === "all"} onPress={() => setOnly("all")} />
        <FilterChip label="Belum dibaca" on={only === "unread"} onPress={() => setOnly("unread")} count={unreadN} />
        <View style={{ flex: 1 }} />
        <SearchField value={q} onChangeText={setQ} placeholder="Cari notifikasi…" width={260} />
        <WebButton label="Tandai semua dibaca" icon="checkDone" variant="ghost" disabled={unreadN === 0} onPress={() => markAll({}).catch(() => {})} />
      </View>

      {list === undefined ? (
        <Card><Text style={s.muted}>Memuat…</Text></Card>
      ) : groups.length === 0 ? (
        <Card><EmptyState icon="bell" title={only === "unread" ? "Tidak ada yang belum dibaca" : "Belum ada notifikasi"} desc="Pesan dari supervisor dan pengingat sistem akan muncul di sini." /></Card>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 8 }}>
            <Text style={s.dayHead}>{g.label}</Text>
            <Card pad={0} style={{ overflow: "hidden" }}>
              {g.items.map((n: any, i: number) => (
                <View key={String(n._id)} style={[i < g.items.length - 1 && s.rowRule, { flexDirection: "row", alignItems: "center" }]}>
                  <View style={{ flex: 1 }}><NotifRow n={n} onPress={() => open(n)} /></View>
                  <Pressable onPress={() => remove({ notifId: n._id }).catch(() => {})} style={web([s.rowAction, { cursor: "pointer" }])} accessibilityLabel="Hapus">
                    <AppIcon name="trash" size={15} color={A.mutedSoft} />
                  </Pressable>
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </View>
  );
}

// ============================================================================
// TAB 3 — AKTIVITAS TIM (khusus supervisor): semua tambah/ubah/hapus/unduh/login/logout
// ============================================================================
function AktivitasTab({ viewerId }: { viewerId: string }) {
  const router = useRouter();
  const feed = useQuery(api.activity.feed, { limit: 300 }) as any;
  const stats = useQuery(api.activity.stats, {}) as any;
  const markSeen = useMutation(api.activity.markSeen);

  const [kinds, setKinds] = useState<Kind[]>([]);
  const [who, setWho] = useState<string>("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const all: any[] = feed?.items ?? [];
  const seenAt: number = feed?.seenAt ?? 0;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of all) { const k = kindOf(e.action); c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [all]);

  const actors = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of all) m.set(String(e.actorId ?? e.actorName), e.actorName);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return all.filter((e) =>
      (kinds.length === 0 || kinds.includes(kindOf(e.action))) &&
      (!who || String(e.actorId ?? e.actorName) === who) &&
      (!kw || `${e.actorName} ${e.summary} ${labelOf(e.action)} ${domainOf(e.action)}`.toLowerCase().includes(kw)));
  }, [all, kinds, who, q]);

  const groups = useMemo(() => {
    const m: { key: string; label: string; items: any[] }[] = [];
    for (const e of rows) {
      const k = dayKeyWIB(e.createdAt);
      let g = m.find((x) => x.key === k);
      if (!g) { g = { key: k, label: dayLabel(e.createdAt), items: [] }; m.push(g); }
      g.items.push(e);
    }
    return m;
  }, [rows]);

  const toggle = (k: Kind) => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const dayLabels = (stats?.days ?? []).map((d: any) =>
    new Date(d.key + "T00:00:00+07:00").toLocaleDateString("id-ID", { weekday: "short" }));
  const dayData = (stats?.days ?? []).map((d: any, i: number) => ({ label: dayLabels[i], value: d.count, color: i === 6 ? A.ink : "#C9CCD6" }));
  const byAction = stats?.byAction ?? {};
  const sumKind = (ks: Kind[]) => Object.entries(byAction).reduce((a, [act, n]: any) => a + (ks.includes(kindOf(act)) ? n : 0), 0);
  const donutParts = [
    { value: sumKind(["create"]), color: A.green },
    { value: sumKind(["update", "approve"]), color: A.amber },
    { value: sumKind(["delete"]), color: A.red },
    { value: sumKind(["download"]), color: A.violet },
    { value: sumKind(["login", "logout"]), color: A.sky },
  ];
  const donutTotal = donutParts.reduce((a, p) => a + p.value, 0);

  return (
    <View style={s.stack}>
      <View style={s.kpiRow}>
        <Kpi icon="list" tone="violet" label="Aktivitas hari ini" value={stats ? stats.todayCount : "…"} hint="Semua akun" viz={stats ? <MiniBars values={(stats.days ?? []).map((d: any) => d.count)} color={A.ink} /> : null} />
        <Kpi icon="key" tone="blue" label="Login hari ini" value={stats ? stats.logins : "…"} hint="Sesi web" />
        <Kpi icon="trash" tone="red" label="Penghapusan (7 hari)" value={stats ? sumKind(["delete"]) : "…"} hint="Data & akun dihapus" />
        <Kpi icon="download" tone="violet" label="Unduhan (7 hari)" value={stats ? sumKind(["download"]) : "…"} hint="Ekspor CSV" />
      </View>

      <View style={s.grid2}>
        <Card style={{ flex: 2, minWidth: 340 }}>
          <Text style={s.cardTitle}>Volume aktivitas 7 hari</Text>
          <Text style={s.cardSub}>Jumlah kejadian tercatat per hari (WIB)</Text>
          <View style={{ marginTop: 12 }}><BarChart data={dayData} height={170} width={520} /></View>
        </Card>
        <Card style={{ flex: 1, minWidth: 280 }}>
          <Text style={s.cardTitle}>Komposisi aktivitas</Text>
          <Text style={s.cardSub}>7 hari terakhir</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
            <Donut parts={donutParts} size={124} stroke={15} center={String(donutTotal)} sub="kejadian" />
            <View style={{ gap: 8 }}>
              {[
                ["Tambah", A.green, sumKind(["create"])],
                ["Ubah / setujui", A.amber, sumKind(["update", "approve"])],
                ["Hapus", A.red, sumKind(["delete"])],
                ["Unduh", A.violet, sumKind(["download"])],
                ["Login/logout", A.sky, sumKind(["login", "logout"])],
              ].map(([l, c, n]: any) => (
                <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
                  <Text style={{ fontSize: 12.5, color: A.inkSoft, fontFamily: FONT, width: 96 }}>{l}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: "800", color: A.ink, fontFamily: FONT }}>{n}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      </View>

      <Card pad={0} style={{ overflow: "hidden" }}>
        <View style={s.feedHead}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={s.cardTitle}>Aktivitas terbaru</Text>
            <Text style={s.cardSub}>{rows.length} dari {all.length} kejadian • terbaru di atas • otomatis diperbarui</Text>
          </View>
          <SearchField value={q} onChangeText={setQ} placeholder="Cari nama, aksi, ringkasan…" width={260} />
          <WebButton label="Tandai dilihat" icon="checkDone" variant="ghost" onPress={() => markSeen({}).catch(() => {})} />
          <WebButton label="Log lengkap" icon="list" onPress={() => router.push("/audit" as any)} />
        </View>

        <View style={s.filters}>
          {KIND_ORDER.map((k) => (
            <FilterChip key={k} label={KIND_META[k].label} on={kinds.includes(k)} onPress={() => toggle(k)} count={counts[k] ?? 0} />
          ))}
          {kinds.length > 0 ? <FilterChip label="Reset" onPress={() => setKinds([])} /> : null}
        </View>
        <View style={[s.filters, { paddingTop: 0, borderBottomWidth: 1, borderBottomColor: A.borderSoft, paddingBottom: 14 }]}>
          <FilterChip label="Semua akun" on={!who} onPress={() => setWho("")} />
          {actors.slice(0, 10).map(([id, name]) => (
            <FilterChip key={id} label={name} on={who === id} onPress={() => setWho(who === id ? "" : id)} />
          ))}
        </View>

        {feed === undefined ? (
          <Text style={[s.muted, { padding: 24 }]}>Memuat aktivitas…</Text>
        ) : groups.length === 0 ? (
          <EmptyState icon="list" title="Belum ada aktivitas" desc="Coba ubah filter atau kata kunci pencarian." />
        ) : (
          groups.map((g) => (
            <View key={g.key}>
              <View style={s.dayBand}><Text style={s.dayBandText}>{g.label}</Text><Text style={s.dayBandCount}>{g.items.length} kejadian</Text></View>
              {g.items.map((e: any, i: number) => (
                <View key={String(e._id)} style={i < g.items.length - 1 && s.rowRule}>
                  <ActivityRow e={e} isNew={e.createdAt > seenAt && String(e.actorId) !== viewerId} onPress={() => setDetail(e)} />
                </View>
              ))}
            </View>
          ))
        )}
      </Card>

      <ActivityDialog e={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

// ===== Detail satu aktivitas (sebelum/sesudah) =====
export function ActivityDialog({ e, onClose }: { e: any; onClose: () => void }) {
  if (!e) return null;
  const k = kindOf(e.action);
  const meta = KIND_META[k];
  const when = new Date(e.createdAt).toLocaleString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const block = (title: string, obj: any) =>
    obj && Object.keys(obj).length ? (
      <View style={s.kvBlock}>
        <Text style={s.kvTitle}>{title}</Text>
        {Object.entries(obj).map(([key, val]) => (
          <View key={key} style={s.kvRow}>
            <Text style={s.kvKey}>{key}</Text>
            <Text style={s.kvVal} numberOfLines={3}>{typeof val === "object" ? JSON.stringify(val) : String(val ?? "–")}</Text>
          </View>
        ))}
      </View>
    ) : null;
  return (
    <Dialog
      visible
      onClose={onClose}
      title={labelOf(e.action)}
      subtitle={e.summary}
      icon={meta.icon}
      tone={meta.tone}
      footer={<WebButton label="Tutup" variant="ghost" onPress={onClose} />}
    >
      <View style={{ gap: 14 }}>
        <View style={s.actorBox}>
          <Avatar name={e.actorName} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: A.ink, fontFamily: FONT }}>{e.actorName}</Text>
            <Text style={{ fontSize: 12, color: A.muted, fontFamily: FONT }}>{ROLE_LABEL[e.actorRole] ?? e.actorRole ?? "Sistem"}{e.area ? ` • ${e.area}` : ""}</Text>
          </View>
          <Pill text={meta.label} tone={meta.tone} />
        </View>
        <View style={s.kvBlock}>
          <View style={s.kvRow}><Text style={s.kvKey}>Waktu</Text><Text style={s.kvVal}>{when}</Text></View>
          <View style={s.kvRow}><Text style={s.kvKey}>Modul</Text><Text style={s.kvVal}>{domainOf(e.action)}</Text></View>
          <View style={s.kvRow}><Text style={s.kvKey}>Kode aksi</Text><Text style={s.kvVal}>{e.action}</Text></View>
          <View style={s.kvRow}><Text style={s.kvKey}>ID data</Text><Text style={s.kvVal} numberOfLines={1}>{e.entityId}</Text></View>
        </View>
        {block("Sebelum", e.before)}
        {block("Sesudah", e.after)}
        {block("Keterangan tambahan", e.metadata)}
      </View>
    </Dialog>
  );
}

// ============================================================================
// DIALOG KIRIM NOTIFIKASI (supervisor)
// ============================================================================
function ComposeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const users = useQuery(api.users.listUsersManage, visible ? {} : "skip") as any;
  const send = useMutation(api.notifications.send);
  const [target, setTarget] = useState<"all" | "users">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const kw = q.trim().toLowerCase();
  const list = ((users ?? []) as any[]).filter((u) => !kw || `${u.name} ${u.email}`.toLowerCase().includes(kw));
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const doSend = async () => {
    setMsg(null);
    if (!title.trim() || !body.trim()) { setMsg({ ok: false, text: "Judul dan isi wajib diisi." }); return; }
    if (target === "users" && sel.length === 0) { setMsg({ ok: false, text: "Pilih minimal 1 penerima." }); return; }
    setBusy(true);
    try {
      const r: any = await send({ title: title.trim(), body: body.trim(), target, userIds: target === "users" ? (sel as any) : undefined });
      setMsg({ ok: true, text: `Terkirim ke ${r?.count ?? 0} akun.` });
      setTitle(""); setBody(""); setSel([]);
    } catch (e) {
      setMsg({ ok: false, text: toFriendlyError(e) });
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Kirim notifikasi"
      subtitle="Pesan akan muncul di lonceng penerima dan sebagai notifikasi di HP"
      icon="send"
      tone="violet"
      width={620}
      footer={
        <>
          {msg ? <Text style={{ flex: 1, fontSize: 12.5, color: msg.ok ? A.green : A.red, fontFamily: FONT, fontWeight: "600" }}>{msg.text}</Text> : <View style={{ flex: 1 }} />}
          <WebButton label="Tutup" variant="ghost" onPress={onClose} />
          <WebButton label={busy ? "Mengirim…" : "Kirim"} icon="send" disabled={busy} onPress={doSend} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        <Segmented value={target} onChange={(k) => setTarget(k as any)} options={[{ key: "all", label: "Semua tim" }, { key: "users", label: "Pilih akun" }]} />
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Judul</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Mis. Pengumuman rapat Senin" placeholderTextColor={A.mutedSoft} style={web([s.input, { outlineStyle: "none" }])} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Isi pesan</Text>
          <TextInput value={body} onChangeText={setBody} multiline placeholder="Tulis pesan…" placeholderTextColor={A.mutedSoft} style={web([s.input, { height: 96, paddingTop: 11, textAlignVertical: "top", outlineStyle: "none" }])} />
        </View>
        {target === "users" ? (
          <View style={{ gap: 8 }}>
            <SearchField value={q} onChangeText={setQ} placeholder="Cari akun…" width={"100%" as any} />
            <View style={s.userList}>
              {list.length === 0 ? <Text style={[s.muted, { padding: 14 }]}>Tidak ada akun.</Text> : list.slice(0, 60).map((u: any) => {
                const on = sel.includes(String(u._id));
                return (
                  <Pressable key={String(u._id)} onPress={() => toggle(String(u._id))} style={web([s.userRow, on && { backgroundColor: A.surfaceAlt }, { cursor: "pointer" }])}>
                    <Avatar name={u.name} size={28} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: A.ink, fontFamily: FONT }} numberOfLines={1}>{u.name}</Text>
                    <Text style={{ fontSize: 11.5, color: A.muted, fontFamily: FONT }}>{ROLE_LABEL[u.role] ?? u.role}</Text>
                    <View style={[s.check, on && { backgroundColor: A.ink, borderColor: A.ink }]}>{on ? <AppIcon name="check" size={11} color="#fff" /> : null}</View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={s.muted}>{sel.length} akun dipilih</Text>
          </View>
        ) : null}
      </View>
    </Dialog>
  );
}

const s = StyleSheet.create({
  stack: { gap: 16 },
  muted: { fontSize: 13, color: A.muted, fontFamily: FONT },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  todoCard: { flexBasis: 360, flexGrow: 1 },
  todoTitle: { fontSize: 14.5, fontWeight: "800", color: A.ink, fontFamily: FONT, letterSpacing: -0.2 },
  todoDesc: { fontSize: 12.5, color: A.muted, marginTop: 3, lineHeight: 18, fontFamily: FONT },
  todoCount: { fontSize: 30, fontWeight: "800", color: A.ink, letterSpacing: -1, fontFamily: FONT },
  cardTitle: { fontSize: 16, fontWeight: "700", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  cardSub: { fontSize: 12.5, color: A.muted, marginTop: 3, fontFamily: FONT },
  excRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  excTitle: { fontSize: 13.5, fontWeight: "700", color: A.ink, fontFamily: FONT },
  excDesc: { fontSize: 12.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  dayHead: { fontSize: 12.5, fontWeight: "700", color: A.muted, fontFamily: FONT, paddingLeft: 4 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  rowAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: 8 },
  feedHead: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 20, paddingBottom: 14 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 10 },
  dayBand: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 8, backgroundColor: A.headerRow, borderTopWidth: 1, borderBottomWidth: 1, borderColor: A.borderSoft },
  dayBandText: { fontSize: 12, fontWeight: "800", color: A.inkSoft, fontFamily: FONT },
  dayBandCount: { fontSize: 11.5, color: A.mutedSoft, fontFamily: FONT },
  actorBox: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: A.surfaceAlt },
  kvBlock: { borderRadius: 16, borderWidth: 1, borderColor: A.border, paddingHorizontal: 14, paddingVertical: 8 },
  kvTitle: { fontSize: 11.5, fontWeight: "800", color: A.muted, letterSpacing: 0.4, textTransform: "uppercase", paddingVertical: 6, fontFamily: FONT },
  kvRow: { flexDirection: "row", paddingVertical: 7, gap: 12, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  kvKey: { width: 110, fontSize: 12.5, color: A.muted, fontFamily: FONT },
  kvVal: { flex: 1, fontSize: 12.5, color: A.ink, fontWeight: "600", fontFamily: FONT },
  label: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  input: { borderWidth: 1, borderColor: A.border, borderRadius: 12, paddingHorizontal: 13, height: 42, fontSize: 13.5, color: A.ink, backgroundColor: A.surface, fontFamily: FONT } as any,
  userList: { borderWidth: 1, borderColor: A.border, borderRadius: 14, maxHeight: 220, overflow: "hidden" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  check: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, borderColor: A.mutedSoft, alignItems: "center", justifyContent: "center" },
});
