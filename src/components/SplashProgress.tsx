import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { theme } from "../lib/theme";

const TRACK = 132;
const THUMB = 46;

/**
 * Garis progres tipis pengganti spinner.
 *
 * Satu elemen bergerak saja (bukan cincin berdenyut + spinner sekaligus),
 * jadi splash tetap tenang dan tidak terlihat bertumpuk. Dipakai bersama oleh
 * LaunchSplash dan LoadingScreen supaya peralihannya tidak berkedip.
 */
export default function SplashProgress({ style }: { style?: StyleProp<ViewStyle> }) {
  const x = useSharedValue(0);

  useEffect(() => {
    x.value = withRepeat(
      withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(x);
      x.value = 0;
    };
  }, [x]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [0, 1], [0, TRACK - THUMB]) }],
  }));

  return (
    <View
      style={[s.track, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Memuat aplikasi"
    >
      <Animated.View style={[s.thumb, thumbStyle]} />
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    width: TRACK,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(217,45,32,0.14)",
    overflow: "hidden",
  },
  thumb: {
    width: THUMB,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
});
