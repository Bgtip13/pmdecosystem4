import { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { A, FONT } from "../components/desktop/tokens";
import {
  Avatar, Card, DataTable, EmptyState, FilterChip, Pill, SearchField, Segmented, WebButton,
} from "../components/desktop/ui";
import type { Col } from "../components/desktop/ui";
import { KIND_META, KIND_ORDER, domainOf, kindOf, labelOf } from "../lib/activityMeta";
import type { Kind } from "../lib/activityMeta";
import { ROLE_LABEL, isOwnerLike } from "../lib/roles";
import { downloadCsv } from "../lib/downloadCsv";
import { ActivityDialog } from "./notifikasi.web";

const DAY = 86400000;
const fmtFull = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function AuditWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const [range, setRange] = useState<"1" | "7" | "30" | "all">("7");
  const [area, setArea] = useState<string | undefined>(undefined);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const from = useMemo(() => {
    if (range === "all") return undefined;
    const startOfToday = Date.parse(new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) + "T00:00:00+07:00");
    return startOfToday - (Number(range) - 1) * DAY;
  }, [range]);

  const res = useQuery(api.audit.listAuditEvents, { from, area: area as any, limit: 300 }) as any;
  const items: any[] = res?.items ?? [];

  const allowed = viewer && (viewer.role === "supervisor" || isOwnerLike(viewer.role));

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((e) =>
      (kinds.length === 0 || kinds.includes(kindOf(e.action))) &&
      (!kw || `${e.actorName} ${e.summary} ${labelOf(e.action)} ${domainOf(e.action)} ${e.entityId}`.toLowerCase().includes(kw)));
  }, [items, kinds, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of items) { const k = kindOf(e.action); c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [items]);

  const toggle = (k: Kind) => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const exportCsv = () => {
    downloadCsv(
      `log-aktivitas-${new Date().toISOString().slice(0, 10)}`,
      ["Waktu", "Pengguna", "Peran", "Jenis", "Aksi", "Modul", "Area", "Ringkasan"],
      rows.map((e) => [fmtFull(e.createdAt), e.actorName, ROLE_LABEL[e.actorRole] ?? e.actorRole ?? "", KIND_META[kindOf(e.action)].label, labelOf(e.action), domainOf(e.action), e.area ?? "", e.summary]),
    );
  };

  const cols: Col<any>[] = [
    { key: "t", label: "Waktu", width: 168, render: (e) => <Text style={s.cellMono}>{fmtFull(e.createdAt)}</Text> },
    {
      key: "u", label: "Pengguna", flex: 1.2,
      render: (e) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Avatar name={e.actorName} size={28} />
          <View style={{ minWidth: 0 }}>
            <Text style={s.cellStrong} numberOfLines={1}>{e.actorName}</Text>
            <Text style={s.cellSub} numberOfLines={1}>{ROLE_LABEL[e.actorRole] ?? e.actorRole ?? "Sistem"}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "a", label: "Aksi", flex: 1.2,
      render: (e) => {
        const m = KIND_META[kindOf(e.action)];
        return (
          <View style={{ gap: 4 }}>
            <Pill text={m.label} tone={m.tone} size="sm" dot />
            <Text style={s.cellSub} numberOfLines={1}>{labelOf(e.action)}</Text>
          </View>
        );
      },
    },
    { key: "s", label: "Ringkasan", flex: 2.4, render: (e) => <Text style={s.cell} numberOfLines={2}>{e.summary}</Text> },
    { key: "m", label: "Modul", width: 120, render: (e) => <Pill text={domainOf(e.action)} tone="gray" size="sm" /> },
    { key: "r", label: "Area", width: 90, render: (e) => <Text style={s.cell}>{e.area ?? "–"}</Text> },
  ];

  if (!viewer) return null;

  return (
    <DesktopShell
      active="spv"
      title="Log Aktivitas"
      subtitle="Siapa menambah, mengubah, menghapus, mengunduh, login & logout — dari semua akun"
      right={<WebButton label="Unduh CSV" icon="download" onPress={exportCsv} disabled={rows.length === 0} />}
    >
      {!allowed ? (
        <Card><EmptyState icon="lock" title="Khusus Supervisor" desc="Akun Anda tidak memiliki akses ke log aktivitas."
          action={<WebButton label="Kembali ke Beranda" onPress={() => router.replace("/beranda" as any)} />} /></Card>
      ) : (
        <View style={{ gap: 16 }}>
          <View style={s.toolbar}>
            <Segmented
              value={range}
              onChange={(k) => setRange(k as any)}
              options={[{ key: "1", label: "Hari ini" }, { key: "7", label: "7 hari" }, { key: "30", label: "30 hari" }, { key: "all", label: "Semua" }]}
            />
            <Segmented
              value={area ?? ""}
              onChange={(k) => setArea(k || undefined)}
              options={[{ key: "", label: "Semua area" }, { key: "SOLO", label: "Solo" }, { key: "DIY", label: "DIY" }, { key: "SEMARANG", label: "Semarang" }]}
            />
            <View style={{ flex: 1 }} />
            <SearchField value={q} onChangeText={setQ} placeholder="Cari pengguna, aksi, ringkasan…" width={300} />
          </View>

          <View style={s.toolbar}>
            {KIND_ORDER.map((k) => (
              <FilterChip key={k} label={KIND_META[k].label} on={kinds.includes(k)} onPress={() => toggle(k)} count={counts[k] ?? 0} />
            ))}
            {kinds.length > 0 ? <FilterChip label="Reset" onPress={() => setKinds([])} /> : null}
          </View>

          <Card pad={0} style={{ overflow: "hidden" }}>
            <View style={s.head}>
              <Text style={s.title}>Catatan aktivitas</Text>
              <Text style={s.sub}>{rows.length} baris{res?.hasMore ? " • ada lebih banyak (persempit rentang)" : ""} • klik baris untuk detail</Text>
            </View>
            {res === undefined ? (
              <Text style={[s.sub, { padding: 24 }]}>Memuat…</Text>
            ) : (
              <DataTable
                cols={cols}
                rows={rows}
                keyOf={(e) => String(e._id)}
                onRowPress={setDetail}
                minWidth={860}
                empty={<EmptyState icon="list" title="Tidak ada catatan" desc="Coba lebarkan rentang waktu atau hapus filter." />}
              />
            )}
          </Card>
        </View>
      )}
      <ActivityDialog e={detail} onClose={() => setDetail(null)} />
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  head: { padding: 20, paddingBottom: 14 },
  title: { fontSize: 16, fontWeight: "700", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  sub: { fontSize: 12.5, color: A.muted, marginTop: 3, fontFamily: FONT },
  cell: { fontSize: 13, color: A.inkSoft, fontFamily: FONT, lineHeight: 18 },
  cellMono: { fontSize: 12.5, color: A.inkSoft, fontFamily: FONT, fontVariant: ["tabular-nums"] },
  cellStrong: { fontSize: 13, fontWeight: "700", color: A.ink, fontFamily: FONT },
  cellSub: { fontSize: 11.5, color: A.muted, fontFamily: FONT },
});
