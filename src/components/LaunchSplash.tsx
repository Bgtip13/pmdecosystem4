import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { LinearGradient } from "expo-linear-gradient";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import BrandMark from "./BrandMark";
import SplashProgress from "./SplashProgress";
import { api } from "../../convex/_generated/api";
import { theme } from "../lib/theme";

// Ukuran logo di splash native (app.json → expo-splash-screen.imageWidth).
// Overlay mulai dari ukuran ini juga, jadi tidak ada logo yang "melompat".
const NATIVE_MARK = 200;
// Ukuran akhir logo — dipakai juga oleh LoadingScreen lewat mode `inline`.
const BRAND_MARK = 120;
const MARK_SCALE = NATIVE_MARK / BRAND_MARK;
const RISE = 78;
// Jarak atas blok teks dari titik tengah layar (lihat styles.content).
const CONTENT_TOP = -RISE + BRAND_MARK / 2 + 22;

const MIN_SHOW = 1150;   // animasi pembuka sempat terlihat
const MAX_WAIT = 6500;   // jangan menahan aplikasi kalau sesi lambat
const FADE_OUT = 340;

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

type Props = {
  /** Dipakai LoadingScreen: tampil statis tanpa menunggu sesi & tanpa fade. */
  inline?: boolean;
};

/**
 * Animasi pembuka yang sama untuk APK dan web.
 *
 * Urutannya satu tarikan napas, tanpa tumpang tindih:
 *   1. splash native (logo diam 200pt) → overlay mengambil alih di frame yang sama;
 *   2. logo menyusut ke 120pt sambil naik, teks merek menyusul;
 *   3. satu garis progres tipis berjalan (bukan spinner + ring sekaligus);
 *   4. overlay menunggu sesi siap, lalu fade ke halaman aplikasi.
 *
 * Karena overlay baru dilepas setelah sesi siap, LoadingScreen tidak muncul
 * berbarengan di belakangnya — tidak ada logo/teks/spinner ganda.
 */
export default function LaunchSplash({ inline = false }: Props) {
  const [gone, setGone] = useState(false);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const startedAt = useRef(0);
  const faded = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  // Sesi selesai dimuat: tidak sedang login, atau profil sudah datang.
  const appReady = !isLoading && !(isAuthenticated && viewer === undefined);

  const logoScale = useSharedValue(MARK_SCALE);
  const logoY = useSharedValue(RISE);
  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(12);
  const haloOpacity = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      [logoScale, logoY, contentOpacity, contentY, haloOpacity, fade].forEach(cancelAnimation);
    };
  }, [logoScale, logoY, contentOpacity, contentY, haloOpacity, fade]);

  const beginFade = useCallback(() => {
    if (inline || faded.current) return;
    faded.current = true;
    fade.value = withTiming(1, { duration: FADE_OUT, easing: Easing.inOut(Easing.quad) });
    timers.current.push(setTimeout(() => setGone(true), FADE_OUT + 40));
  }, [fade, inline]);

  // Mulai animasi hanya sekali. Splash native baru dilepas setelah overlay ada.
  const start = useCallback(() => {
    if (inline || startedRef.current) return;
    startedRef.current = true;
    startedAt.current = Date.now();
    setStarted(true);

    if (Platform.OS !== "web") SplashScreen.hideAsync().catch(() => {});

    // Logo mengecil dari ukuran splash native ke ukuran merek, naik sedikit.
    logoScale.value = withTiming(1, { duration: 620, easing: EASE_OUT });
    logoY.value = withTiming(0, { duration: 620, easing: EASE_OUT });

    // Teks menyusul setelah logo mulai bergerak.
    contentOpacity.value = withDelay(200, withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) }));
    contentY.value = withDelay(200, withTiming(0, { duration: 460, easing: EASE_OUT }));

    // Halo lembut muncul setelah logo diam, lalu berdenyut pelan.
    haloOpacity.value = withDelay(
      600,
      withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }), -1, true),
    );

    // Pengaman: aplikasi tidak boleh tertahan splash selamanya.
    timers.current.push(setTimeout(beginFade, MAX_WAIT));
  }, [beginFade, contentOpacity, contentY, haloOpacity, inline, logoScale, logoY]);

  // Dismiss hanya setelah animasi minimum selesai DAN sesi siap.
  useEffect(() => {
    if (!started || inline) return;
    const remaining = Math.max(0, MIN_SHOW - (Date.now() - startedAt.current));
    const t = setTimeout(() => {
      if (appReady) beginFade();
    }, remaining);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [appReady, beginFade, started, inline]);

  // Di web onLayout bisa tidak terpanggil saat hidrasi; timer ini menjaganya.
  useEffect(() => {
    if (inline || Platform.OS !== "web") return;
    const t = setTimeout(start, 0);
    return () => clearTimeout(t);
  }, [inline, start]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: inline ? 1 : 1 - fade.value }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: logoY.value }, { scale: logoScale.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + haloOpacity.value * 0.5,
  }));

  if (gone) return null;

  const animated = !inline;

  return (
    <Animated.View
      style={[styles.root, inline ? styles.rootInline : styles.rootOverlay, rootStyle]}
      onLayout={inline ? undefined : start}
      accessibilityRole="progressbar"
      accessibilityLabel="Membuka PMD Ecosystem"
      pointerEvents={inline ? "none" : "auto"}
    >
      <LinearGradient
        colors={["#FCFAFA", "#FCFAFA", "#FFF6F5"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      {/* Halo di posisi akhir logo — tidak ikut mengecil agar tidak bertumpuk. */}
      {animated ? (
        <Animated.View style={[styles.halo, haloStyle]} />
      ) : (
        <View style={[styles.halo, { opacity: 0.6 }]} />
      )}

      {animated ? (
        <Animated.View style={[styles.anchor, logoStyle]}>
          <BrandMark size={BRAND_MARK} />
        </Animated.View>
      ) : (
        <View style={styles.anchor}>
          <BrandMark size={BRAND_MARK} />
        </View>
      )}

      {animated ? (
        <Animated.View style={[styles.content, contentStyle]}>
          <Text style={styles.title}>PMD Ecosystem</Text>
          <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>
          <SplashProgress style={styles.progress} />
        </Animated.View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>PMD Ecosystem</Text>
          <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>
          <SplashProgress style={styles.progress} />
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Text style={styles.footerText}>APLIKASI INTERNAL</Text>
        <View style={styles.footerLine} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.bg,
    overflow: "hidden",
  },
  rootOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  rootInline: {
    flex: 1,
  },

  blob: { position: "absolute", backgroundColor: "#FEF3F2", borderRadius: 999 },
  blobTop: { width: 340, height: 340, top: -160, right: -150 },
  blobBottom: { width: 250, height: 250, bottom: -120, left: -110 },

  // Pusat logo setelah animasi: 78pt di atas titik tengah layar.
  halo: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 172,
    height: 172,
    marginLeft: -86,
    marginTop: -RISE - 86,
    borderRadius: 999,
    backgroundColor: "rgba(217,45,32,0.06)",
    borderWidth: 1,
    borderColor: "rgba(217,45,32,0.10)",
  },

  anchor: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: BRAND_MARK,
    marginTop: -RISE - BRAND_MARK / 2,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: CONTENT_TOP,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: theme.colors.ink,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    color: theme.colors.inkMuted,
    marginTop: 5,
    textAlign: "center",
  },
  progress: { marginTop: 24 },

  footer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerLine: {
    width: 22,
    height: 1,
    backgroundColor: "#F0DAD7",
    marginHorizontal: 10,
  },
  footerText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: "#C7B4B1",
  },
});
