import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import IOSSpinner from "../components/IOSSpinner";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { Card, EmptyState, IconTile, Kpi, Pill, WebButton } from "../components/desktop/ui";
import type { Tone } from "../components/desktop/ui";
import { MiniBars } from "../components/desktop/charts";
import { A, FONT } from "../components/desktop/tokens";

type Item = { icon: string; tone: Tone; label: string; desc: string; to: string; badge?: "gabung" };

const GROUPS: { title: string; sub: string; items: Item[] }[] = [
  {
    title: "Pantau",
    sub: "Lihat apa yang terjadi di seluruh tim",
    items: [
      { icon: "bell", tone: "violet", label: "Notifikasi & Aktivitas", desc: "Feed langsung semua tambah, ubah, hapus, unduh, login, dan logout", to: "/notifikasi?tab=aktivitas" },
      { icon: "list", tone: "blue", label: "Log Aktivitas", desc: "Tabel lengkap dengan filter, detail sebelum/sesudah, dan ekspor CSV", to: "/audit" },
      { icon: "chart", tone: "green", label: "Penilaian Sales & Telemarketing", desc: "On-track atau tidak per sales • kunjungan • follow-up", to: "/spv-penilaian" },
    ],
  },
  {
    title: "Persetujuan",
    sub: "Keputusan yang menunggu Anda",
    items: [
      { icon: "check", tone: "amber", label: "Persetujuan", desc: "Perubahan jadwal & usulan lokasi toko dari sales", to: "/spv-approval", badge: "gabung" },
    ],
  },
  {
    title: "Kelola",
    sub: "Data master dan akses",
    items: [
      { icon: "calendar", tone: "amber", label: "Izin Sales", desc: "Tandai sales tidak masuk / tidak keliling (bebas target harian)", to: "/izin" },
      { icon: "key", tone: "gray", label: "Kelola Akun Sales", desc: "Ubah peran / area, reset password, tambah & hapus akun", to: "/kelola-akun" },
      { icon: "store", tone: "blue", label: "Kelola Toko", desc: "Cari, tambah, dan perbarui data toko (nama, alamat, area, titik lokasi)", to: "/kelola-toko" },
      { icon: "send", tone: "violet", label: "Kirim Notifikasi", desc: "Kirim pengumuman ke semua tim atau akun tertentu", to: "/notifikasi" },
    ],
  },
];

export default function SpvWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const pending = useQuery(api.locationRequests.listPendingRequests) as any;
  const jadwalPending = useQuery(api.jadwalRequests.pendingCount) as any;
  const stats = useQuery(api.activity.stats, {}) as any;

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;
  }

  if (viewer.role !== "supervisor") {
    return (
      <DesktopShell active="spv" title="Menu Supervisor" subtitle="Halaman ini khusus supervisor">
        <Card>
          <EmptyState icon="lock" title="Khusus Supervisor" desc="Akun Anda tidak memiliki akses ke menu ini."
            action={<WebButton label="Kembali ke Beranda" onPress={() => router.replace("/beranda" as any)} />} />
        </Card>
      </DesktopShell>
    );
  }

  const pendingCount = pending === undefined ? 0 : pending.length;
  const approvalTotal = pendingCount + Number(jadwalPending ?? 0);
  const sumKind = (re: RegExp) => Object.entries(stats?.byAction ?? {}).reduce((a, [k, n]: any) => a + (re.test(k) ? n : 0), 0);

  return (
    <DesktopShell active="spv" title="Menu Supervisor" subtitle={`Halo, ${viewer.name} — kelola dan pantau semua aktivitas dari sini`}>
      <View style={s.stack}>
        <View style={s.kpiRow}>
          <Kpi icon="list" tone="violet" label="Aktivitas hari ini" value={stats ? stats.todayCount : "…"} hint="Semua akun" viz={stats ? <MiniBars values={(stats.days ?? []).map((d: any) => d.count)} /> : null} onPress={() => router.push("/notifikasi?tab=aktivitas" as any)} />
          <Kpi icon="check" tone="amber" label="Menunggu persetujuan" value={approvalTotal} hint={`${pendingCount} lokasi • ${jadwalPending ?? 0} jadwal`} onPress={() => router.push("/spv-approval" as any)} />
          <Kpi icon="trash" tone="red" label="Penghapusan 7 hari" value={stats ? sumKind(/\.(delete|clear)$/) : "…"} hint="Kunjungan, akun, izin" onPress={() => router.push("/audit" as any)} />
          <Kpi icon="download" tone="violet" label="Unduhan 7 hari" value={stats ? sumKind(/^export\./) : "…"} hint="Ekspor CSV" onPress={() => router.push("/audit" as any)} />
        </View>

        {GROUPS.map((g) => (
          <View key={g.title} style={{ gap: 10 }}>
            <View>
              <Text style={s.groupTitle}>{g.title}</Text>
              <Text style={s.groupSub}>{g.sub}</Text>
            </View>
            <View style={s.grid}>
              {g.items.map((m) => (
                <MenuCard key={m.to} m={m} badge={m.badge === "gabung" ? approvalTotal : 0} onPress={() => router.push(m.to as any)} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </DesktopShell>
  );
}

function MenuCard({ m, badge, onPress }: { m: Item; badge: number; onPress: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHov(true)}
      onHoverOut={() => setHov(false)}
      style={[s.card, hov && s.cardHover, { cursor: "pointer" } as any]}
    >
      <IconTile icon={m.icon} tone={m.tone} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label}>{m.label}</Text>
        <Text style={s.desc} numberOfLines={2}>{m.desc}</Text>
      </View>
      {badge > 0 ? <Pill text={`${badge} menunggu`} tone="red" size="sm" /> : null}
      <AppIcon name="chevron" size={16} color={A.mutedSoft} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  stack: { gap: 22 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  groupTitle: { fontSize: 16, fontWeight: "800", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  groupSub: { fontSize: 12.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    flexBasis: 380, flexGrow: 1, minWidth: 280, flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 20, padding: 16,
    shadowColor: "#1C2033", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 5 },
  },
  cardHover: { borderColor: "#CFD3DE", shadowOpacity: 0.1 },
  label: { fontSize: 14.5, fontWeight: "800", color: A.ink, letterSpacing: -0.2, fontFamily: FONT },
  desc: { fontSize: 12.5, color: A.muted, marginTop: 3, lineHeight: 18, fontFamily: FONT },
});
