import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import BrandMark from "./BrandMark";
import IOSSpinner from "./IOSSpinner";
import { theme } from "../lib/theme";

// Sama dengan `imageWidth` splash native di app.json → frame pertama animasi
// pas dengan splash native, jadi tidak ada logo yang "melompat" atau berubah
// dari kotak bawaan ke logo bertema.
const SPLASH_MARK = 200;
// Ukuran akhir logo: sama dengan ukuran di LoadingScreen, jadi peralihannya mulus.
const BRAND_MARK = 132;
const MARK_SCALE = BRAND_MARK / SPLASH_MARK;
const RISE = 84;

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Animasi pembuka. Tampil menutupi router sejak frame pertama, mengambil alih
 * splash native, lalu fade ke layar aplikasi.
 * Dipakai di APK (iOS/Android) DAN di tampilan web. Waktunya sama; di web hanya
 * pelepasan splash native yang dilewati karena browser tidak memilikinya.
 */
export default function LaunchSplash() {
  const [gone, setGone] = useState(false);
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const logoScale = useSharedValue(1);
  const logoY = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(14);
  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      [logoScale, logoY, contentOpacity, contentY, ringA, ringB, fade].forEach(cancelAnimation);
    };
  }, [logoScale, logoY, contentOpacity, contentY, ringA, ringB, fade]);

  const start = () => {
    if (started.current) return;
    started.current = true;

    // Splash native baru dilepas setelah overlay ini siap di layar.
    // Di web tidak ada splash native — kalau tetap dipanggil, expo-splash-screen
    // akan menolak, jadi lebih aman dilewati.
    if (Platform.OS !== "web") SplashScreen.hideAsync().catch(() => {});

    // Logo menyusut dari ukuran splash native ke ukuran brand, naik sedikit
    // supaya ada ruang untuk teks & spinner di bawahnya.
    logoScale.value = withTiming(MARK_SCALE, { duration: 560, easing: EASE_OUT });
    logoY.value = withTiming(-RISE, { duration: 560, easing: EASE_OUT });

    // Teks & spinner menyusul.
    contentOpacity.value = withDelay(
      220,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
    );
    contentY.value = withDelay(220, withTiming(0, { duration: 420, easing: EASE_OUT }));

    // Dua gelombang ring halus di belakang logo.
    ringA.value = withDelay(
      420,
      withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }), -1, false),
    );
    ringB.value = withDelay(
      1420,
      withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }), -1, false),
    );

    // Seluruh overlay fade, lalu dilepas dari layar.
    fade.value = withDelay(
      1400,
      withTiming(1, { duration: 330, easing: Easing.inOut(Easing.quad) }),
    );
    timers.current.push(setTimeout(() => setGone(true), 1760));
  };

  // Di web onLayout bisa tidak terpanggil (mis. saat halaman masih di-hidrasi),
  // jadi animasi dimulai lewat timer juga. start() hanya jalan sekali, dan tanpa
  // ini overlay pembuka bisa menyangkut menutupi seluruh aplikasi.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const t = setTimeout(start, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }, { translateY: logoY.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  const ringAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringA.value, [0, 0.12, 1], [0, 0.3, 0]),
    transform: [{ scale: interpolate(ringA.value, [0, 1], [0.82, 1.55]) }],
  }));

  const ringBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringB.value, [0, 0.12, 1], [0, 0.3, 0]),
    transform: [{ scale: interpolate(ringB.value, [0, 1], [0.82, 1.55]) }],
  }));

  if (gone) return null;

  return (
    <Animated.View
      style={[styles.root, rootStyle]}
      onLayout={start}
      accessibilityRole="progressbar"
      accessibilityLabel="Membuka PMD Ecosystem"
    >
      <LinearGradient
        colors={["#FFFEFC", "#FCFAFA", "#FFF6F5"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      {/* Logo: mulai persis di posisi & ukuran splash native. */}
      <Animated.View style={[styles.anchor, logoStyle]}>
        <BrandMark size={SPLASH_MARK} />
      </Animated.View>

      {/* Ring dipusatkan pada posisi akhir logo (setelah menyusut & naik). */}
      <View style={styles.ringArea} pointerEvents="none">
        <Animated.View style={[styles.ring, ringAStyle]} />
        <Animated.View style={[styles.ring, ringBStyle]} />
      </View>

      <Animated.View style={[styles.content, contentStyle]}>
        <Text style={styles.title}>PMD Ecosystem</Text>
        <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>

        <View style={styles.loadingRow}>
          <IOSSpinner size="small" color={theme.colors.inkMuted} />
          <Text style={styles.loadingText}>Memuat</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.bg,
    zIndex: 1000,
    elevation: 1000,
    overflow: "hidden",
  },

  blob: { position: "absolute", backgroundColor: "#FEF3F2", borderRadius: 999 },
  blobTop: { width: 320, height: 320, top: -140, right: -130 },
  blobBottom: { width: 240, height: 240, bottom: -110, left: -100 },

  // Titik pusat layar — sama dengan posisi logo di splash native.
  anchor: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: SPLASH_MARK,
    marginTop: -SPLASH_MARK / 2,
    alignItems: "center",
    justifyContent: "center",
  },

  ringArea: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: BRAND_MARK,
    marginTop: -RISE - BRAND_MARK / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: BRAND_MARK,
    height: BRAND_MARK,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },

  content: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: 24,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 23,
    fontWeight: "900",
    color: theme.colors.ink,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.inkMuted,
    marginTop: 5,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    height: 22,
  },
  loadingText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: theme.colors.inkFaint,
    letterSpacing: 0.2,
    marginLeft: 8,
  },
});
