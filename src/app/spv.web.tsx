import IOSSpinner from "../components/IOSSpinner";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { A } from "../components/desktop/tokens";

const GROUPS: any[] = [
  {
    title: "Pantau",
    items: [
      { icon: "clock", color: A.purple, bg: "#F3EFFC", label: "Audit Aktivitas", desc: "Siapa mengubah / menghapus / menyetujui apa, kapan", to: "/audit" },
      { icon: "chart", color: A.green, bg: "#F0FDF4", label: "Penilaian Sales & Telemarketing", desc: "On-track/tidak per sales • kunjungan • follow-up", to: "/spv-penilaian" },
    ],
  },
  {
    title: "Persetujuan",
    items: [
      { icon: "location", color: A.red, bg: "#FDF2F2", label: "Approval Lokasi Toko", desc: "Setujui / tolak usulan perbarui koordinat dari sales", to: "/spv-approval", badge: "pending" },
    ],
  },
  {
    title: "Kelola",
    items: [
      { icon: "calendar", color: A.orange, bg: "#FFF3E0", label: "Izin Sales", desc: "Tandai sales tidak masuk / tidak keliling (bebas target harian)", to: "/izin" },
      { icon: "key", color: A.blue, bg: A.blueSoft, label: "Kelola Akun Sales", desc: "Ubah peran / area, reset password", to: "/kelola-akun" },
    ],
  },
];

export default function SpvWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const pending = useQuery(api.locationRequests.listPendingRequests) as any;

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.blue} /></View>;
  }

  if (viewer.role !== "supervisor") {
    return (
      <DesktopShell active="spv" title="Menu Supervisor" subtitle="Halaman ini khusus supervisor">
        <View style={s.card}>
          <Text style={s.emptyTitle}>Khusus Supervisor</Text>
          <Text style={s.emptyDesc}>Akun Anda tidak memiliki akses ke menu ini.</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.replace("/beranda" as any)}>
            <Text style={s.btnText}>Kembali ke Dashboard</Text>
          </TouchableOpacity>
        </View>
      </DesktopShell>
    );
  }

  const pendingCount = pending === undefined ? null : pending.length;

  return (
    <DesktopShell
      active="spv"
      title="Menu Supervisor"
      subtitle={`Halo, ${viewer.name} — kelola semua aktivitas di sini`}
    >
      {GROUPS.map((g) => (
        <View key={g.title} style={s.group}>
          <View style={s.groupHead}>
            <Text style={s.groupTitle}>{g.title}</Text>
            <Text style={s.groupCount}>{g.items.length} menu</Text>
          </View>
          <View style={s.grid}>
            {g.items.map((m: any) => (
              <TouchableOpacity key={m.to} style={s.card} onPress={() => router.push(m.to as any)} activeOpacity={0.85}>
                <View style={[s.iconBox, { backgroundColor: m.bg }]}>
                  <AppIcon name={m.icon} size={18} color={m.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.label}>{m.label}</Text>
                  <Text style={s.desc} numberOfLines={2}>{m.desc}</Text>
                </View>
                {m.badge === "pending" && pendingCount ? (
                  <View style={s.badge}><Text style={s.badgeText}>{pendingCount}</Text></View>
                ) : null}
                <AppIcon name="chevron" size={16} color={A.muted} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <View style={s.note}>
        <Text style={s.noteText}>Kelola Toko sekarang ada di Dashboard → Akses Cepat.</Text>
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  group: { gap: 8 },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 },
  groupTitle: { fontSize: 11, fontWeight: "800", color: A.inkSoft, letterSpacing: 0.7, textTransform: "uppercase" },
  groupCount: { fontSize: 10.5, color: A.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flexBasis: 340, flexGrow: 1, minWidth: 260,
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.surface,
    borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 13,
  },
  iconBox: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 12 },
  label: { fontSize: 12.5, fontWeight: "700", color: A.ink },
  desc: { fontSize: 10.5, color: A.muted, marginTop: 3, lineHeight: 15 },
  badge: {
    backgroundColor: A.red, borderRadius: 10, minWidth: 20, height: 20,
    paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginLeft: 6,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  note: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10, padding: 12 },
  noteText: { fontSize: 11, color: A.muted, lineHeight: 17 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: A.ink },
  emptyDesc: { fontSize: 11.5, color: A.muted, marginTop: 4 },
  btn: { backgroundColor: A.brand, borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 12 },
  btnText: { color: "#fff", fontSize: 11.5, fontWeight: "700" },
});
