import { Platform } from "react-native";

// ===== NOTIFIKASI =====
// expo-notifications TIDAK didukung di Expo Go Android sejak SDK 53 (sekadar import = crash).
// Strategi: deteksi Expo Go via expo-constants → kalau Expo Go, JANGAN import
// expo-notifications sama sekali (semua fungsi no-op).
// Begitu app di-build jadi APK asli (development/production build), baru import jalan
// dan notifikasi aktif. Package expo-notifications TIDAK perlu dihapus.

let notifModule: any = null;
let decided = false;
let canUse = false;

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

export async function scheduleCheckoutReminder(storeName?: string) {
  const N = await getNotif();
  if (!N) return; // Expo Go → diam
  try {
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync?.("pmd-reminders", {
        name: "Pengingat PMD",
        importance: N.AndroidImportance?.HIGH ?? 4,
      });
    }
    const cur = await N.getPermissionsAsync?.();
    if (cur && !cur.granted) {
      const req = await N.requestPermissionsAsync?.();
      if (!req?.granted) return;
    }
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
