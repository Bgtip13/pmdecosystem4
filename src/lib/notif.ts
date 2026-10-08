import { Platform } from "react-native";

// ===== NOTIFIKASI =====
// expo-notifications TIDAK didukung di Expo Go Android sejak SDK 53 (sekadar import = crash).
// Strategi: deteksi Expo Go via expo-constants → kalau Expo Go, JANGAN import
// expo-notifications sama sekali (semua fungsi no-op).
// Begitu app di-build jadi APK asli, baru import jalan dan notifikasi aktif.

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
    await N.setNotificationChannelAsync?.("pmd-approval", {
      name: "Persetujuan Lokasi",
      importance: N.AndroidImportance?.MAX ?? 5,
      sound: "default",
      vibrationPattern: [0, 500, 300, 500, 300, 1500],
      enableVibrate: true,
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

// ===== TOKEN PUSH PERANGKAT (dipakai server utk kirim notif chat/approval) =====
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

export async function scheduleCheckoutReminder(storeName?: string) {
  const N = await getNotif();
  if (!N) return; // Expo Go → diam
  try {
    await ensureChannels(N);
    const granted = await ensurePermission(N);
    if (!granted) return;
    await N.cancelScheduledNotificationAsync?.("pmd-checkout");
    await N.scheduleNotificationAsync?.({
      identifier: "pmd-checkout",
      content: {
        title: "Jangan lupa check-out! ⏰",
        body: storeName
          ? `Kunjungan di ${storeName} sudah lama. Selesaikan & check-out ya.`
          : "Kunjunganmu sudah lama. Selesaikan & check-out ya.",
        sound: "default",
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? "timeInterval",
        seconds: 1800,
        channelId: "pmd-reminders",
      },
    });
  } catch {}
}

export async function cancelCheckoutReminder() {
  const N = await getNotif();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync?.("pmd-checkout");
  } catch {}
}

// ===== NOTIF PERSETUJUAN LOKASI (khusus supervisor) =====
export async function scheduleApprovalReminder(count: number) {
  const N = await getNotif();
  if (!N) return; // Expo Go → diam
  if (!count || count <= 0) return;
  try {
    await ensureChannels(N);
    const granted = await ensurePermission(N);
    if (!granted) return;
    await N.cancelScheduledNotificationAsync?.("pmd-approval");
    await N.scheduleNotificationAsync?.({
      identifier: "pmd-approval",
      content: {
        title: `📍 ${count} toko menunggu persetujuan`,
        body: "Ada permintaan perbarui lokasi toko yang menunggu keputusanmu. Buka Menu SPV → Approval Lokasi Toko.",
        sound: "default",
        data: { kind: "approval" },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? "timeInterval",
        seconds: 2,
        channelId: "pmd-approval",
      },
    });
  } catch {}
}

export async function cancelApprovalReminder() {
  const N = await getNotif();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync?.("pmd-approval");
  } catch {}
}

// ===== PENGINGAT HARIAN JAM TETAP (diulang tiap hari, tanpa server) ← BARU =====
export async function scheduleDailyReminder(opts: {
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
    await N.cancelScheduledNotificationAsync?.(opts.id);
    await N.scheduleNotificationAsync?.({
      identifier: opts.id,
      content: {
        title: opts.title,
        body: opts.body,
        sound: "default",
        data: { kind: "daily", id: opts.id },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes?.DAILY ?? "daily",
        hour: opts.hour,
        minute: opts.minute,
        channelId: opts.channel ?? "pmd-reminders",
      },
    });
  } catch {}
}

export async function cancelDailyReminder(id: string) {
  const N = await getNotif();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync?.(id);
  } catch {}
}
// ===== TAP NOTIFIKASI → BUKA LAYAR TUJUAN (data.link) ← BARU =====
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

