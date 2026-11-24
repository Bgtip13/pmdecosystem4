import { Image, type StyleProp, type ImageStyle } from "react-native";

/**
 * Logo PMD untuk splash & layar loading.
 *
 * Memakai assets/splash-logo.png — versi transparan dengan sudut membulat yang
 * sudah dipotong dari logo.png. logo.png sendiri adalah kanvas gelap persegi
 * (tanpa alpha), makanya dulu tampil sebagai "kotak" di splash.
 */
export default function BrandMark({
  size = 132,
  style,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={require("../../assets/splash-logo.png")}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
