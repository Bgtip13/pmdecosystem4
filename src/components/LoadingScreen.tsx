import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import BrandMark from "./BrandMark";
import IOSSpinner from "./IOSSpinner";
import { theme } from "../lib/theme";

const { colors } = theme;

const STAGE = 168;
const BRAND_MARK = 132;

/**
 * Layar loading khas aplikasi: logo bertema di tengah, dua gelombang ring,
 * dan spinner gaya iOS. Dipakai saat sesi/akun sedang dimuat sebelum masuk
 * ke beranda. Latarnya sama dengan LaunchSplash supaya peralihannya mulus.
 */
export default function LoadingScreen() {
  return (
    <Animated.View
      style={styles.screen}
      exiting={FadeOut.duration(260)}
      accessibilityRole="progressbar"
      accessibilityLabel="Memuat aplikasi"
    >
      <LinearGradient
        colors={["#FFFEFC", "#FCFAFA", "#FFF6F5"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Dekorasi lembut di latar */}
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <View style={styles.content}>
        <View style={styles.stage}>
          <View style={styles.glow} />
          <BrandMark size={BRAND_MARK} />
        </View>

        <Animated.View
          entering={FadeInDown.duration(420).delay(60)}
          style={styles.brand}
        >
          <Text style={styles.title}>PMD Ecosystem</Text>
          <Text style={styles.subtitle}>Prima Mandiri Distribusi</Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(420).delay(140)}
          style={styles.loadingRow}
        >
          <IOSSpinner size="small" color={colors.inkMuted} />
          <Text style={styles.loadingText}>Memuat</Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeIn.duration(520).delay(260)}
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
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  content: { alignItems: "center", paddingHorizontal: 32 },

  blob: { position: "absolute", backgroundColor: "#FEF3F2", borderRadius: 999 },
  blobTop: { width: 320, height: 320, top: -140, right: -130 },
  blobBottom: { width: 240, height: 240, bottom: -110, left: -100 },

  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 176,
    height: 176,
    borderRadius: 999,
    backgroundColor: "rgba(217,45,32,0.045)",
  },

  brand: { alignItems: "center", marginTop: -6 },
  title: {
    fontSize: 23,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkMuted,
    marginTop: 5,
    textAlign: "center",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 26,
    height: 22,
  },
  loadingText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.inkFaint,
    letterSpacing: 0.2,
    marginLeft: 8,
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
