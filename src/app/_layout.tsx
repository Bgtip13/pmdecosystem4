import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { Stack, router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { Platform, LogBox, View } from "react-native";
import { useEffect } from "react";
import { initNotifications, setNotificationTapHandler } from "../lib/notif";
import WebFrame from "../components/WebFrame";
import LaunchSplash from "../components/LaunchSplash";
import { ThemeProvider, useColors, useTheme } from "../lib/themeContext";

// Bungkam peringatan sementara dari expo-router saat redirect pertama (dev only)
LogBox.ignoreLogs(["Can't perform a React state update on a component that hasn't mounted yet"]);

const IS_WEB = Platform.OS === "web";

// Tahan splash native di APK sampai animasi pembuka (LaunchSplash) siap.
// Tanpa ini splash langsung hilang sebelum frame pertama React tampil.
if (!IS_WEB) {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

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

// Ikon status bar mengikuti tema: gelap di tema terang, terang di tema gelap.
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

function ThemedStack() {
  const C = useColors();
  // Latar jendela native ikut tema → tidak ada kilatan putih saat berpindah layar / buka keyboard.
  useEffect(() => {
    if (IS_WEB) return;
    SystemUI.setBackgroundColorAsync(C.bg).catch(() => {});
  }, [C.bg]);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}

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
    <ThemeProvider>
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      {/* Ikon status bar (jam/baterai) menyesuaikan tema */}
      <ThemedStatusBar />

      {/* Bingkai web: membatasi lebar + latar netral di desktop.
          Di HP komponen ini hanya meneruskan children apa adanya. */}
      <WebFrame>
        <View style={{ flex: 1 }}>
          <ThemedStack />

          {/* Animasi pembuka APK:logo menyusut, ring berdenyut, lalu fade ke aplikasi */}
          <LaunchSplash />
        </View>
      </WebFrame>
    </ConvexAuthProvider>
    </ThemeProvider>
  );
}
