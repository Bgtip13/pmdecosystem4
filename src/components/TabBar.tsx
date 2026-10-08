import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  scheduleCheckoutReminder,
  cancelCheckoutReminder,
  scheduleApprovalReminder,
  cancelApprovalReminder,
  getPushToken,
  scheduleDailyReminder,
  cancelDailyReminder,
} from "../lib/notif";
import AppIcon from "./AppIcon";

const RED = "#D92D20";
const GRAY = "#667085";

// Hindari notif approval spam saat pindah-pindah tab (masih dalam sesi yang sama)
let approvalNotifiedFor = 0;

export default function TabBar({ active }: { active: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewer = useQuery(api.users.viewer) as any;
  const ongoing = useQuery(api.visits.getMyOngoing) as any;
  const registerPush = useMutation(api.chat.registerPushToken);
  const [schedFor, setSchedFor] = useState<string | null>(null);
  const [pushDone, setPushDone] = useState(false);
  const [dailyFor, setDailyFor] = useState<string | null>(null);

  const role = viewer?.role;
  const isSuper = role === "supervisor";
  // Badge SPK: hanya telemarketing & supervisor
  const withSpkBadge = role === "telemarketing" || role === "supervisor";

  // ← HEMAT: dulu query ini jalan di SEMUA role & SEMUA layar.
  // Sekarang hanya role yang menampilkan badge, dan hanya di layar SPK/Dashboard.
  const needSpkBadge = withSpkBadge && (active === "spk" || active === "spk-sales" || active === "beranda");
  const pending = useQuery(api.piutang.pendingCount, needSpkBadge ? {} : "skip") as any;
  const badge = withSpkBadge && pending?.count > 0 ? pending.count : 0;
  const approvals = useQuery(api.locationRequests.listPendingRequests, isSuper ? undefined : "skip") as any;

  // Daftarkan token push perangkat (sekali) supaya bisa terima notif chat
  useEffect(() => {
    if (!viewer || pushDone) return;
    (async () => {
      try {
        const token = await getPushToken();
        if (token) await registerPush({ token });
      } catch {}
      setPushDone(true);
    })();
  }, [viewer, pushDone, registerPush]);

  // Pengingat lupa check-out
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

  // Notif persetujuan lokasi (supervisor)
  useEffect(() => {
    if (!isSuper) {
      approvalNotifiedFor = 0;
      return;
    }
    const n = (approvals ?? []).length;
    if (n === 0) {
      approvalNotifiedFor = 0;
      cancelApprovalReminder();
      return;
    }
    if (n > approvalNotifiedFor) {
      scheduleApprovalReminder(n);
      approvalNotifiedFor = n;
    }
  }, [approvals, isSuper]);

  // Pengingat harian jam tetap sesuai peran (lokal, tidak butuh server/FCM)
  useEffect(() => {
    const r = viewer?.role;
    if (!r || dailyFor === r) return;
    setDailyFor(r);

    const isFieldRole = r === "field";
    const isTeleRole = r === "telemarketing";
    const isSuperRole = r === "supervisor";
    const isOwnerRole = r === "owner";

    // 08:00 — janji bayar jatuh tempo
    if (isTeleRole || isSuperRole) {
      scheduleDailyReminder({
        id: "pmd-janjibayar-0800",
        hour: 8, minute: 0,
        title: "Cek janji bayar hari ini 💰",
        body: "Ada toko yang janji bayarnya jatuh tempo. Buka SPK → Admin.",
        channel: "pmd-reminders",
      });
    } else {
      cancelDailyReminder("pmd-janjibayar-0800");
    }

    // 15:00 — SPK Admin belum beres
    if (isTeleRole || isSuperRole) {
      scheduleDailyReminder({
        id: "pmd-spk-admin-1500",
        hour: 15, minute: 0,
        title: "Cek SPK Admin 📋",
        body: "Pastikan follow-up piutang & orderan hari ini sudah beres semua.",
        channel: "pmd-reminders",
      });
    } else {
      cancelDailyReminder("pmd-spk-admin-1500");
    }

    // 17:00 — target kunjungan
    if (isFieldRole || isSuperRole || isOwnerRole) {
      scheduleDailyReminder({
        id: "pmd-kunjungan-1700",
        hour: 17, minute: 0,
        title: "Target kunjungan ⏰",
        body: isFieldRole
          ? "Cek kunjunganmu hari ini — target minimal 7 toko."
          : "Lihat daftar sales yang kunjungannya masih di bawah 7 toko hari ini.",
        channel: "pmd-reminders",
      });
    } else {
      cancelDailyReminder("pmd-kunjungan-1700");
    }

    // 20:00 — rekap harian (supervisor saja)
    if (isSuperRole) {
      scheduleDailyReminder({
        id: "pmd-rekap-2000",
        hour: 20, minute: 0,
        title: "Rekap harian PMD 📊",
        body: "Rekap kunjungan, orderan & tunai ekspedisi hari ini siap dilihat.",
        channel: "pmd-reminders",
      });
    } else {
      cancelDailyReminder("pmd-rekap-2000");
    }
  }, [viewer, dailyFor]);

  // Susunan tab — Chat TIDAK lagi di sini (pindah ke ikon header via ChatHeaderButton)
  const TABS: any[] = [
    { key: "beranda", label: "Dashboard", icon: "home" },
    { key: "spk", label: "SPK", icon: "clipboard" },
    ...(isSuper ? [{ key: "spv", label: "SPV", icon: "shield" }] : []),
    { key: "laporan", label: "Laporan", icon: "chart" },
    { key: "akun", label: "Akun", icon: "user" },
  ];

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = active === t.key;
        const showBadge = t.key === "spk" ? badge : 0;
        return (
          <TouchableOpacity key={t.key} style={styles.item} onPress={() => router.replace(`/${t.key}` as any)}>
            <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
              <AppIcon name={t.icon} size={19} color={on ? RED : GRAY} />
              {showBadge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{showBadge > 9 ? "9+" : showBadge}</Text>
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

// ===== Tombol Chat untuk HEADER layar (pengganti tab Chat) =====
// Pakai di header mana pun:  <ChatHeaderButton />
export function ChatHeaderButton({ color = RED, size = 21 }: { color?: string; size?: number }) {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  // ← HEMAT: chat.ts sudah dibatasi rentang (dari lastRead) + take(50),
  //   jadi query ini ringan walau tombol ikut terpasang di beberapa header.
  const chatUnread = useQuery(api.chat.totalUnread, viewer ? undefined : "skip") as any;

  const n = (chatUnread as any) ?? 0;

  return (
    <TouchableOpacity style={styles.chatBtn} activeOpacity={0.8} onPress={() => router.push("/chat" as any)}>
      <AppIcon name="chat" size={size} color={color} />
      {n > 0 ? (
        <View style={styles.chatBadge}>
          <Text style={styles.chatBadgeText}>{n > 9 ? "9+" : n}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", backgroundColor: "#FCFAFA",
    borderTopWidth: 1, borderTopColor: "#F0D9D5",
    paddingTop: 8,
    ...(Platform.OS === "web" ? { justifyContent: "center" as const } : {}),
  },
  item: {
    flex: 1,
    alignItems: "center",
    ...(Platform.OS === "web" ? { maxWidth: 180 } : {}),
  },
  iconWrap: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16,
    flexDirection: "row", alignItems: "center",
  },
  iconWrapOn: { backgroundColor: "#FDE8E6" },
  label: { fontSize: 10, color: GRAY, marginTop: 3, fontWeight: "600" },
  labelOn: { color: RED, fontWeight: "800" },
  badge: {
    position: "absolute", top: -4, right: -4, backgroundColor: RED,
    borderRadius: 10, minWidth: 17, height: 17, paddingHorizontal: 3,
    justifyContent: "center", alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // ===== Tombol chat di header =====
  chatBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#FDE8E6",
    alignItems: "center", justifyContent: "center",
  },
  chatBadge: {
    position: "absolute", top: -4, right: -4, backgroundColor: RED,
    borderRadius: 10, minWidth: 17, height: 17, paddingHorizontal: 3,
    justifyContent: "center", alignItems: "center",
  },
  chatBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
});
