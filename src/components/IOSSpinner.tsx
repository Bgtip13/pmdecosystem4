import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const BARS = 12;
const STEP = 360 / BARS;

const PRESET = { small: 20, large: 36 } as const;

type IOSSpinnerProps = {
  /** "small" (20pt) / "large" (36pt) seperti UIActivityIndicatorView, atau angka bebas. */
  size?: number | keyof typeof PRESET;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Spinner gaya iOS (UIActivityIndicatorView): dua belas batang yang berputar
 * 30° per langkah, dengan gradasi opacity membentuk ekor.
 *
 * Diganti dari ActivityIndicator bawaan karena di Android/warnanya jadi cincin
 * berputar yang berbeda dari iOS. Komponen ini identik di iOS, Android dan web.
 */
export default function IOSSpinner({ size = "small", color = "#98A2B3", style }: IOSSpinnerProps) {
  const px = typeof size === "number" ? size : PRESET[size] ?? PRESET.small;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [spin]);

  // Rotasi diskret 12 langkah — ciri khas spinner iOS (bukan putaran halus).
  const rotate = spin.interpolate({
    inputRange: Array.from({ length: BARS + 1 }, (_, i) => i / BARS),
    outputRange: Array.from({ length: BARS + 1 }, (_, i) => `${i * STEP}deg`),
  });

  const barWidth = Math.max(1.6, px * 0.1);
  const barHeight = Math.max(3, px * 0.26);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Memuat"
      style={[{ width: px, height: px }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        {Array.from({ length: BARS }, (_, i) => (
          <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${i * STEP}deg` }] }]}>
            <View
              style={{
                position: "absolute",
                top: px * 0.04,
                alignSelf: "center",
                width: barWidth,
                height: barHeight,
                borderRadius: barWidth,
                backgroundColor: color,
                opacity: 1 - (i / BARS) * 0.86,
              }}
            />
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}
