import IOSSpinner from "../components/IOSSpinner";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { A } from "../components/desktop/tokens";

const MENUS = [
  { icon: "chart", color: A.orange, bg: A.orangeSoft, label: "PCP Bulanan", desc: "Pencapaian & target per area/bulan", to: "/laporan-pcp", group: "Penjualan" },
  { icon: "calendar", color: A.info, bg: A.infoSoft, label: "PCP Mingguan", desc: "Pencapaian per minggu (M1–M5)", to: "/laporan-pcp-mingguan", group: "Penjualan" },
  { icon: "trend", color: A.green, bg: A.greenSoft, label: "Target vs Act", desc: "Pencapaian per toko (DAP)", to: "/laporan-dap", group: "Penjualan" },
  { icon: "box", color: "#0F8F84", bg: "#E4F6F4", label: "Produk per Toko", desc: "Produk yang diambil toko per bulan, per brand", to: "/laporan-produk", group: "Penjualan" },
  { icon: "store", color: A.red, bg: A.redSoft, label: "Rekap FU Toko", desc: "OPEN/INPG/CLSD per area (bulanan)", to: "/laporan-fu-toko", group: "Operasional" },
  { icon: "clock", color: A.purple, bg: A.purpleSoft, label: "Riwayat FU Toko", desc: "Hasil per bulan — September, Oktober, dst.", to: "/fu-toko-riwayat", group: "Operasional" },
];

const GROUP_ORDER = ["Penjualan", "Operasional"];

export default function LaporanWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;
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
  group: { gap: 12 },
  groupHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  groupTitle: { fontSize: 16, fontWeight: "800", color: A.ink, letterSpacing: -0.3 },
  groupCount: { fontSize: 12.5, color: A.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    flexBasis: 340, flexGrow: 1, minWidth: 260,
    flexDirection: "row", alignItems: "center",
    backgroundColor: A.surface,
    borderWidth: 1, borderColor: A.border,
    borderRadius: 20, padding: 16, shadowColor: "#1C2033", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 5 },
  },
  iconBox: {
    width: 46, height: 46, borderRadius: 15,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  label: { fontSize: 14.5, fontWeight: "700", color: A.ink },
  desc: { fontSize: 12.5, color: A.muted, marginTop: 3, lineHeight: 18 },
  note: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 16, padding: 14,
  },
  noteText: { fontSize: 12.5, color: A.muted, lineHeight: 17 },
});
