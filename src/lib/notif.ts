import { Platform } from "react-native";

// ===== NOTIFIKASI (khusus APK/native) =====
// expo-notifications TIDAK didukung di Expo Go Android sejak SDK 53 (sekadar import = crash).
// Strategi: deteksi Expo Go via expo-constants → kalau Expo Go, JANGAN import
// expo-notifications sama sekali (semua fungsi no-op).
// Begitu app di-build jadi APK asli, baru import jalan dan notifikasi aktif.
//
// Sejak perubahan aturan notifikasi, pengingat lokal hanya untuk 5 aturan dan
// berjalan SENIN–SABTU (Minggu libur → tidak ada notifikasi sistem).
// Pengingat lama (janji bayar 08.00, checkout, approval lokasi, SPK 15.00 lama,
// kunjungan 17.00, rekap 20.00) sudah DIHENTIKAN — identitasnya dibatalkan
// sekali lewat cancelLegacyReminders() supaya APK yang sudah terpasang berhenti.

let notifModule: any = null;
let decided = false;
let canUse = false;
let channelsReady = false;

async function isExpoGo(): Promise<boolean> {
  try {
    const mod = require("expo-constants");
    const Constants = mod?.default ?? mod;
    return Constants?.executionEnvironment === "storeClient";
  } catch {
    return false;
  }
}

async function getNotif(): Promise<any> {
  if (notifModule) return notifModule;
  if (!decided) {
    decided = true;
    canUse = !(await isExpoGo());
    if (canUse) {
      try {
        const m = await import("expo-notifications");
        notifModule = m;
      } catch {
        notifModule = null;
      }
    }
  }
  return notifModule;
}

// Buat channel Android sekali (wajib sebelum schedule, kalau tidak notif dibuang diam-diam)
async function ensureChannels(N: any) {
  if (channelsReady || Platform.OS !== "android") return;
  try {
    await N.setNotificationChannelAsync?.("pmd-reminders", {
      name: "Pengingat PMD",
      importance: N.AndroidImportance?.HIGH ?? 4,
    });
    await N.setNotificationChannelAsync?.("pmd-chat", {
      name: "Pesan Baru",
      importance: N.AndroidImportance?.MAX ?? 5,
      sound: "default",
      vibrationPattern: [0, 250, 200, 250],
      enableVibrate: true,
    });
    channelsReady = true;
  } catch {}
}

async function ensurePermission(N: any): Promise<boolean> {
  try {
    const cur = await N.getPermissionsAsync?.();
    if (cur?.granted) return true;
    const req = await N.requestPermissionsAsync?.();
    return !!req?.granted;
  } catch {
    return false;
  }
}

// ===== PANGGIL SEKALI DI ROOT (src/app/_layout.tsx) =====
export async function initNotifications(): Promise<boolean> {
  const N = await getNotif();
  if (!N) return false; // Expo Go → diam
  try {
    if (N.setNotificationHandler) {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    await ensureChannels(N);
    return await ensurePermission(N);
  } catch {
    return false;
  }
}

// ===== TOKEN PUSH PERANGKAT (dipakai server utk kirim notif) =====
export async function getPushToken(): Promise<string | null> {
  const N = await getNotif();
  if (!N) return null;
  const ok = await ensurePermission(N);
  if (!ok) return null;
  try {
    const tokenData = await N.getExpoPushTokenAsync?.();
    return tokenData?.data ?? null;
  } catch {
    return null;
  }
}

// ===== PENGINGAT HARIAN JAM TETAP — SENIN s/d SABTU (Minggu libur) =====
// expo-notifications memakai weekday 1 = Minggu … 7 = Sabtu, jadi 2..7 = Senin..Sabtu.
const WEEKDAYS = [2, 3, 4, 5, 6, 7];

export async function scheduleWeekdayReminder(opts: {
  id: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
  channel?: string;
}): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    await ensureChannels(N);
    if (!(await ensurePermission(N))) return;
    await cancelWeekdayReminder(opts.id);

    const type = N.SchedulableTriggerInputTypes?.WEEKLY ?? "weekly";
    for (const weekday of WEEKDAYS) {
      await N.scheduleNotificationAsync?.({
        identifier: `${opts.id}-w${weekday}`,
        content: {
          title: opts.title,
          body: opts.body,
          sound: "default",
          data: { kind: "daily", id: opts.id },
        },
        trigger: {
          type,
          weekday,
          hour: opts.hour,
          minute: opts.minute,
          channelId: opts.channel ?? "pmd-reminders",
        },
      });
    }
  } catch {}
}

export async function cancelWeekdayReminder(id: string): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync?.(id);
    for (const weekday of WEEKDAYS) {
      await N.cancelScheduledNotificationAsync?.(`${id}-w${weekday}`);
    }
  } catch {}
}

// ===== PEMBERSIHAN PENGINGAT LAMA (dijalankan sekali tiap app dibuka) =====
// APK yang sudah terpasang masih menyimpan jadwal notifikasi versi lama.
// Kalau tidak dibatalkan, notifikasi yang sudah dihentikan akan terus muncul.
const LEGACY_IDS = [
  "pmd-checkout",              // pengingat lupa check-out
  "pmd-approval",              // approval lokasi toko
  "pmd-janjibayar-0800",       // janji bayar 08.00
  "pmd-spk-admin-1500",        // versi lama: SPK admin 15.00 (dijadwalkan ulang di bawah)
  "pmd-kunjungan-1700",        // versi lama: kunjungan 17.00
  "pmd-rekap-2000",            // rekap harian 20.00
];

export async function cancelLegacyReminders(): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    for (const id of LEGACY_IDS) {
      await N.cancelScheduledNotificationAsync?.(id);
      for (const weekday of WEEKDAYS) {
        await N.cancelScheduledNotificationAsync?.(`${id}-w${weekday}`);
      }
    }
  } catch {}
}

// ===== TAP NOTIFIKASI → BUKA LAYAR TUJUAN (data.link) =====
export async function setNotificationTapHandler(onTap: (link: string) => void): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    N.addNotificationResponseReceivedListener?.((resp: any) => {
      const link = resp?.notification?.request?.content?.data?.link;
      if (link) onTap(String(link));
    });
  } catch {}
}
