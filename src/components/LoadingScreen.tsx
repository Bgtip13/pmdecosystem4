import { useEffect } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const RED = "#D92D20";
const RED_DARK = "#B42318";
const GRAY = "#667085";
const GRAY_LIGHT = "#98A2B3";

const TILE = 96;
const STAGE = 168;

/**
 * Layar loading khas aplikasi: logo di kartu putih yang "bernapas",
 * dua gelombang ring yang menyebar, indikator progres dan tiga titik berdenyut.
 * Dipakai saat sesi/akun sedang dimuat sebelum masuk ke beranda.
 */
export default function LoadingScreen() {
  // 0 → 1: logo mengembang lalu kembali (napas halus, looping)
  const breath = useSharedValue(0);
  // 0 → 1: satu siklus ring menyebar
  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  // 0 → 1: kilau progress bar berjalan dari kiri ke kanan
  const sweep = useSharedValue(0);
  // 0 → 1: denyut tiap titik "memuat"
  const dotA = useSharedValue(0);
  const dotB = useSharedValue(0);
  const dotC = useSharedValue(0);

  useEffect(() => {
    const loop = (delay: number) =>
      withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        ),
      );

    breath.value = loop(0);

    ringA.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    ringB.value = withDelay(
      1300,
      withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );

    sweep.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );

    dotA.value = loop(0);
    dotB.value = loop(180);
    dotC.value = loop(360);

    return () => {
      [breath, ringA, ringB, sweep, dotA, dotB, dotC].forEach(cancelAnimation);
    };
  }, [breath, ringA, ringB, sweep, dotA, dotB, dotC]);

  const tileStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.045 }],
  }));

  const ringAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringA.value, [0, 0.12, 1], [0, 0.45, 0]),
    transform: [{ scale: interpolate(ringA.value, [0, 1], [0.82, 1.4]) }],
  }));

  const ringBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ringB.value, [0, 0.12, 1], [0, 0.45, 0]),
    transform: [{ scale: interpolate(ringB.value, [0, 1], [0.82, 1.4]) }],
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

  return (
    <Animated.View
      style={styles.screen}
      exiting={FadeOut.duration(260)}
      accessibilityRole="progressbar"
      accessibilityLabel="Memuat aplikasi"
    >
      <LinearGradient
        colors={["#FFFFFF", "#FFF6F5", "#FCFAFA"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Dekorasi lembut di latar */}
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <View style={styles.content}>
        <View style={styles.stage}>
          <Animated.View style={[styles.ring, ringAStyle]} />
          <Animated.View style={[styles.ring, ringBStyle]} />
          <View style={styles.glow} />

          <Animated.View style={[styles.tile, tileStyle]}>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        <Animated.View
          entering={FadeInDown.duration(520).delay(120)}
          style={styles.brand}
        >
          <Text style={styles.title}>PMD Ecosystem</Text>
          <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(520).delay(240)}
          style={styles.progressWrap}
        >
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
      </View>

      <Animated.View
        entering={FadeIn.duration(600).delay(420)}
        style={styles.footer}
      >
        <View style={styles.footerLine} />
        <Text style={styles.footerText}>APLIKASI INTERNAL</Text>
        <View style={styles.footerLine} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FCFAFA",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  content: { alignItems: "center", paddingHorizontal: 32 },

  blob: {
    position: "absolute",
    backgroundColor: "#FEF3F2",
    borderRadius: 999,
  },
  blobTop: { width: 320, height: 320, top: -140, right: -130 },
  blobBottom: { width: 240, height: 240, bottom: -110, left: -100 },

  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: STAGE - 24,
    height: STAGE - 24,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: RED,
  },
  glow: {
    position: "absolute",
    width: 148,
    height: 148,
    borderRadius: 999,
    backgroundColor: "rgba(217,45,32,0.05)",
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F6E7E5",
    shadowColor: RED_DARK,
    shadowOpacity: Platform.OS === "android" ? 0.18 : 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  logo: { width: 68, height: 68 },

  brand: { alignItems: "center", marginTop: 4 },
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

  progressWrap: { alignItems: "center", marginTop: 34 },
  track: {
    width: 168,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#F4E5E3",
    overflow: "hidden",
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

  footer: {
    position: "absolute",
    bottom: 38,
    flexDirection: "row",
    alignItems: "center",
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
