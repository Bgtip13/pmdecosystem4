import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
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

const RED = "#D92D20";
const GRAY = "#667085";
const GRAY_LIGHT = "#98A2B3";

// Ukuran ini HARUS sama dengan `imageWidth` splash di app.json supaya
// frame pertama animasi pas dengan splash native (tidak ada lompatan).
const SPLASH_LOGO = 220;

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Animasi pembuka. Tampil menutupi router sejak frame pertama, mengambil alih
 * splash native, lalu fade ke layar aplikasi.
 * Dipakai di APK (iOS/Android) DAN di tampilan web. Waktunya sama; di web hanya
 * pelepasan splash native yang dilewati karena browser tidak memilikinya.
 */
export default function LaunchSplash() {
  return <NativeLaunchSplash />;
}

function NativeLaunchSplash() {
  const [gone, setGone] = useState(false);
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const logoScale = useSharedValue(1);
  const logoY = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(16);
  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  const sweep = useSharedValue(0);
  const dotA = useSharedValue(0);
  const dotB = useSharedValue(0);
  const dotC = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      [
        logoScale,
        logoY,
        contentOpacity,
        contentY,
        ringA,
        ringB,
        sweep,
        dotA,
        dotB,
        dotC,
        fade,
      ].forEach(cancelAnimation);
    };
  }, [
    logoScale,
    logoY,
    contentOpacity,
    contentY,
    ringA,
    ringB,
    sweep,
    dotA,
    dotB,
    dotC,
    fade,
  ]);

  const start = () => {
    if (started.current) return;
    started.current = true;

    // Splash native baru dilepas setelah overlay ini siap di layar.
    // Di web tidak ada splash native — kalau tetap dipanggil, expo-splash-screen
    // akan menolak, jadi lebih aman dilewati.
    if (Platform.OS !== "web") SplashScreen.hideAsync().catch(() => {});

    const breathe = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );

    // Logo menyusut dari posisi splash native ke posisi brand.
    logoScale.value = withDelay(
      140,
      withTiming(0.62, { duration: 620, easing: EASE_OUT }),
    );
    logoY.value = withDelay(
      140,
      withTiming(-64, { duration: 620, easing: EASE_OUT }),
    );

    // Teks & progress menyusul.
    contentOpacity.value = withDelay(
      380,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }),
    );
    contentY.value = withDelay(
      380,
      withTiming(0, { duration: 480, easing: EASE_OUT }),
    );

    ringA.value = withDelay(
      700,
      withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
    ringB.value = withDelay(
      1800,
      withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );

    sweep.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
    dotA.value = breathe(700);
    dotB.value = breathe(880);
    dotC.value = breathe(1060);

    // Seluruh overlay fade, lalu dilepas dari layar.
    fade.value = withDelay(
      1350,
      withTiming(1, { duration: 340, easing: Easing.inOut(Easing.quad) }),
    );
    timers.current.push(setTimeout(() => setGone(true), 1710));
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

  const rootStyle = useAnimatedStyle(() => ({
    opacity: 1 - fade.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: logoScale.value },
      { translateY: logoY.value },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  const ringAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringA.value, [0, 0.14, 1], [0, 0.35, 0]),
    transform: [{ scale: interpolate(ringA.value, [0, 1], [0.75, 1.35]) }],
  }));

  const ringBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringB.value, [0, 0.14, 1], [0, 0.35, 0]),
    transform: [{ scale: interpolate(ringB.value, [0, 1], [0.75, 1.35]) }],
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-64, 168]) }],
    opacity: interpolate(sweep.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
  }));

  const dotAStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + dotA.value * 0.75,
    transform: [{ translateY: -3 * dotA.value }],
  }));
  const dotBStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + dotB.value * 0.75,
    transform: [{ translateY: -3 * dotB.value }],
  }));
  const dotCStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + dotC.value * 0.75,
    transform: [{ translateY: -3 * dotC.value }],
  }));

  if (gone) return null;

  return (
    <Animated.View
      style={[styles.root, rootStyle]}
      onLayout={start}
      accessibilityRole="progressbar"
      accessibilityLabel="Membuka PMD Ecosystem"
    >
      <View style={styles.anchor}>
        <Animated.View style={[styles.ring, ringAStyle]} />
        <Animated.View style={[styles.ring, ringBStyle]} />

        <Animated.View style={[styles.logoBox, logoStyle]}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      <Animated.View style={[styles.content, contentStyle]}>
        <Text style={styles.title}>PMD Ecosystem</Text>
        <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>

        <View style={styles.track}>
          <Animated.View style={[styles.sweep, sweepStyle]} />
        </View>

        <View style={styles.loadingRow}>
          <Text style={styles.loadingText}>Memuat</Text>
          <View style={styles.dots}>
            <Animated.View style={[styles.dot, dotAStyle]} />
            <Animated.View style={[styles.dot, dotBStyle]} />
            <Animated.View style={[styles.dot, dotCStyle]} />
          </View>
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
    backgroundColor: "#FFFFFF",
    zIndex: 1000,
    elevation: 1000,
  },

  // Titik pusat layar — sama dengan posisi logo di splash native.
  anchor: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: SPLASH_LOGO,
    marginTop: -SPLASH_LOGO / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  logoBox: {
    width: SPLASH_LOGO,
    height: SPLASH_LOGO,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: SPLASH_LOGO, height: SPLASH_LOGO },
  ring: {
    position: "absolute",
    width: SPLASH_LOGO,
    height: SPLASH_LOGO,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: RED,
  },

  content: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: 30,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 23,
    fontWeight: "900",
    color: "#101828",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: GRAY,
    marginTop: 5,
    textAlign: "center",
  },

  track: {
    width: 168,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#F4E5E3",
    overflow: "hidden",
    marginTop: 30,
  },
  sweep: {
    width: 64,
    height: 5,
    borderRadius: 999,
    backgroundColor: RED,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    height: 18,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "700",
    color: GRAY_LIGHT,
    letterSpacing: 0.3,
  },
  dots: { flexDirection: "row", alignItems: "flex-end", marginLeft: 5 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: RED,
    marginHorizontal: 2,
  },
});
