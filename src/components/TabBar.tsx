import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { scheduleCheckoutReminder, cancelCheckoutReminder } from "../lib/notif";

const RED = "#D92D20";
const GRAY = "#667085";

export default function TabBar({ active }: { active: string }) {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const pending = useQuery(api.piutang.pendingCount) as any;
  const [schedFor, setSchedFor] = useState<string | null>(null);

  const role = viewer?.role;
  const isSuper = role === "supervisor";
  const withSpkBadge = role === "telemarketing" || role === "supervisor";
  const badge = withSpkBadge && pending?.count > 0 ? pending.count : 0;

  // Pengingat lupa check-out: jadwalkan 30 mnt saat ada kunjungan berjalan,
  // batalkan saat tidak ada (termasuk setelah check-out).
  useEffect(() => {
    if (ongoing === undefined || !viewer) return;
    if (ongoing?.visit) {
      if (schedFor !== ongoing.visit._id) {
        scheduleCheckoutReminder(ongoing.store?.name);
        setSchedFor(ongoing.visit._id);
      }
    } else {
      cancelCheckoutReminder();
      setSchedFor(null);
    }
  }, [ongoing, viewer, schedFor]);

  // Susunan tab: Dashboard, SPK, [SPV khusus supervisor], Laporan, Akun
  const TABS: any[] = [
    { key: "beranda", label: "Dashboard", icon: "🏠" },
    { key: "spk", label: "SPK", icon: "📞" },
  ];
  if (isSuper) TABS.push({ key: "spv", label: "SPV", icon: "🛡️" });
  TABS.push({ key: "laporan", label: "Laporan", icon: "📊" });
  TABS.push({ key: "akun", label: "Akun", icon: "👤" });

  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity key={t.key} style={styles.item} onPress={() => router.replace(`/${t.key}`)}>
            <View>
              <Text style={styles.icon}>{t.icon}</Text>
              {t.key === "spk" && badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: "#EEE",
    paddingBottom: 24, paddingTop: 8,
  },
  item: { flex: 1, alignItems: "center" },
  icon: { fontSize: 20 },
  label: { fontSize: 11, color: GRAY, marginTop: 2, fontWeight: "600" },
  labelOn: { color: RED, fontWeight: "800" },
  badge: {
    position: "absolute", top: -6, right: -12, backgroundColor: RED,
    borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 4,
    justifyContent: "center", alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
