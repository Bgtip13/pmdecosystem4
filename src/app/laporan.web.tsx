import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { A } from "../components/desktop/tokens";

const MENUS = [
  { icon: "chart", color: "#B25E00", bg: "#FFF3E0", label: "PCP Bulanan", desc: "Pencapaian & target per area/bulan", to: "/laporan-pcp", group: "Penjualan" },
  { icon: "calendar", color: A.blue, bg: A.blueSoft, label: "PCP Mingguan", desc: "Pencapaian per minggu (M1–M5)", to: "/laporan-pcp-mingguan", group: "Penjualan" },
  { icon: "trend", color: A.green, bg: "#EAF6EF", label: "Target vs Act", desc: "Pencapaian per toko (DAP)", to: "/laporan-dap", group: "Penjualan" },
  { icon: "store", color: A.red, bg: "#FDF2F2", label: "Rekap FU Toko", desc: "OPEN/INPG/CLSD per area (bulanan)", to: "/laporan-fu-toko", group: "Operasional" },
  { icon: "clock", color: A.purple, bg: "#F3EFFC", label: "Riwayat FU Toko", desc: "Hasil per bulan — September, Oktober, dst.", to: "/fu-toko-riwayat", group: "Operasional" },
];

const GROUP_ORDER = ["Penjualan", "Operasional"];

export default function LaporanWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return <View style={s.center}><ActivityIndicator size="large" color={A.blue} /></View>;
  }

  const isPpic = viewer.role === "ppic";

  return (
    <DesktopShell
      active="laporan"
      title="Laporan"
      subtitle={isPpic ? "Belum ada laporan untuk akun ini" : "Pencapaian penjualan, target, dan operasional"}
    >
      {GROUP_ORDER.map((group) => {
        const items = MENUS.filter((m) => m.group === group);
        if (items.length === 0) return null;
        return (
          <View key={group} style={s.group}>
            <View style={s.groupHead}>
              <Text style={s.groupTitle}>{group}</Text>
              <Text style={s.groupCount}>{items.length} laporan</Text>
            </View>
            <View style={s.grid}>
              {items.map((m) => (
                <TouchableOpacity key={m.to} style={s.card} onPress={() => router.push(m.to as any)} activeOpacity={0.85}>
                  <View style={[s.iconBox, { backgroundColor: m.bg }]}>
                    <AppIcon name={m.icon} size={20} color={m.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.label}>{m.label}</Text>
                    <Text style={s.desc} numberOfLines={2}>{m.desc}</Text>
                  </View>
                  <AppIcon name="chevron" size={16} color={A.muted} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      <View style={s.note}>
        <Text style={s.noteText}>
          {isPpic
            ? "Akun PPIC tidak memiliki menu laporan di sini."
            : viewer.role === "supervisor"
              ? "Anda melihat semua area — pakai filter area di dalam tiap laporan."
              : `Data laporan otomatis mengikuti area Anda (${viewer.area ?? "-"}).`}
        </Text>
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  group: { gap: 8 },
  groupHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 2,
  },
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
  iconBox: {
    width: 38, height: 38, borderRadius: 9,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  label: { fontSize: 12.5, fontWeight: "700", color: A.ink },
  desc: { fontSize: 10.5, color: A.muted, marginTop: 3, lineHeight: 15 },
  note: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 12,
  },
  noteText: { fontSize: 11, color: A.muted, lineHeight: 17 },
});
