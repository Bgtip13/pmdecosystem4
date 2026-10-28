import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  getPushToken,
  scheduleWeekdayReminder,
  cancelWeekdayReminder,
  cancelLegacyReminders,
} from "../lib/notif";
import AppIcon from "./AppIcon";

const RED = "#D92D20";
const GRAY = "#667085";

export default function TabBar({ active }: { active: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewer = useQuery(api.users.viewer) as any;
  const registerPush = useMutation(api.chat.registerPushToken);
  const [pushDone, setPushDone] = useState(false);
  const [notifSetupFor, setNotifSetupFor] = useState<string | null>(null);

  const role = viewer?.role;
  const isSuper = role === "supervisor";
  // Badge SPK: hanya telemarketing & supervisor
  const withSpkBadge = role === "telemarketing" || role === "supervisor";

  // ← HEMAT: dulu query ini jalan di SEMUA role & SEMUA layar.
  // Sekarang hanya role yang menampilkan badge, dan hanya di layar SPK/Dashboard.
  const needSpkBadge = withSpkBadge && (active === "spk" || active === "spk-sales" || active === "beranda");
  const pending = useQuery(api.piutang.pendingCount, needSpkBadge ? {} : "skip") as any;
  const badge = withSpkBadge && pending?.count > 0 ? pending.count : 0;

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

  // ===== NOTIFIKASI SISTEM — hanya 5 aturan, lokal Senin–Sabtu (Minggu libur) =====
  //  (2) 15.00 SPK Admin masih OPEN      → telemarketing
  //  (3) 12.00 / 15.00 / 17.00 cek riwayat → supervisor & owner
  //  (5) 15.00 kunjungan < 7 toko        → sales lapangan
  //  (1) piutang selesai disinkron SPV   → telemarketing (dikirim server, bukan di sini)
  //  (4) Minggu: tidak ada notifikasi
  useEffect(() => {
    const r = viewer?.role;
    if (!r || notifSetupFor === r) return;
    setNotifSetupFor(r);

    const isFieldRole = r === "field";
    const isTeleRole = r === "telemarketing";
    const cekRiwayat = r === "supervisor" || r === "owner";

    (async () => {
      // Buang jadwal notifikasi versi lama sekali jalan (janji bayar 08.00, checkout,
      // approval lokasi, SPK 15.00 lama, kunjungan 17.00, rekap 20.00).
      await cancelLegacyReminders();

      // (3) supervisor & owner: cek riwayat kunjungan + follow-up
      const riwayat = [
        { id: "pmd-cek-riwayat-1200", hour: 12, body: "Cek kunjungan sales dan follow-up (SPK sales & SPK admin) hari ini." },
        { id: "pmd-cek-riwayat-1500", hour: 15, body: "Cek kunjungan sales dan follow-up (SPK sales & SPK admin) sore ini." },
        { id: "pmd-cek-riwayat-1700", hour: 17, body: "Cek riwayat kunjungan dan follow-up sebelum tutup hari." },
      ];
      for (const it of riwayat) {
        if (cekRiwayat) {
          await scheduleWeekdayReminder({
            id: it.id,
            hour: it.hour,
            minute: 0,
            title: `Cek riwayat (${it.hour}.00)`,
            body: it.body,
          });
        } else {
          await cancelWeekdayReminder(it.id);
        }
      }

      // (2) telemarketing: SPK Admin yang masih OPEN
      if (isTeleRole) {
        await scheduleWeekdayReminder({
          id: "pmd-spk-admin-1500",
          hour: 15,
          minute: 0,
          title: "Cek SPK Admin 📋",
          body: "Masih ada tugas OPEN hari ini. Kerjakan lalu kirim hasilnya ke SPV.",
        });
      } else {
        await cancelWeekdayReminder("pmd-spk-admin-1500");
      }

      // (5) sales lapangan: kunjungan masih di bawah 7 toko
      if (isFieldRole) {
        await scheduleWeekdayReminder({
          id: "pmd-kunjungan-1500",
          hour: 15,
          minute: 0,
          title: "Cek kunjungan ⏰",
          body: "Target minimal 7 toko/hari. Kalau masih kurang, lanjut kunjungan.",
        });
      } else {
        await cancelWeekdayReminder("pmd-kunjungan-1500");
      }
    })();
  }, [viewer, notifSetupFor]);

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
