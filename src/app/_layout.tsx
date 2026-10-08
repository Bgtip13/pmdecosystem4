import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { Platform, LogBox } from "react-native";
import { useEffect } from "react";
import { initNotifications, setNotificationTapHandler } from "../lib/notif";
import WebFrame from "../components/WebFrame";

// Bungkam peringatan sementara dari expo-router saat redirect pertama (dev only)
LogBox.ignoreLogs(["Can't perform a React state update on a component that hasn't mounted yet"]);

const IS_WEB = Platform.OS === "web";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

// Penyimpanan sesi:
// - HP/APK (native)  → SecureStore (aman)
// - Web/browser      → localStorage (karena SecureStore tidak ada di web)
const secureStorage = IS_WEB
  ? {
      getItem: async (key: string) => {
        if (typeof localStorage === "undefined") return null;
        return localStorage.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        if (typeof localStorage !== "undefined") localStorage.removeItem(key);
      },
    }
  : {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    };

export default function RootLayout() {
  // Pasang handler notifikasi + minta izin + buat channel SEKALI saat app dibuka.
  // Di browser tidak ada notifikasi native, jadi seluruh blok ini dilewati.
  useEffect(() => {
    if (IS_WEB) return;

    initNotifications()
      .then((ok) => {
        if (__DEV__) console.log("[notif] siap:", ok);
      })
      .catch(() => {});

    // Kalau notifikasi diketuk, langsung buka layar tujuannya
    setNotificationTapHandler((link) => {
      try { router.push(link as any); } catch {}
    });
  }, []);

  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      {/* Ikon status bar (jam/baterai) selalu gelap → kelihatan di header terang */}
      <StatusBar style="dark" />

      {/* Bingkai web: membatasi lebar + latar netral di desktop.
          Di HP komponen ini hanya meneruskan children apa adanya. */}
      <WebFrame>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#FCFAFA" },
          }}
        />
      </WebFrame>
    </ConvexAuthProvider>
  );
}
