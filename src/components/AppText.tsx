import { Text as RNText, TextInput as RNTextInput, type TextProps, type TextInputProps } from "react-native";
import { useColors } from "../lib/themeContext";

// Text / TextInput bawaan RN tanpa warna → hitam (tak terbaca di tema gelap).
// Dua komponen ini sama persis, hanya menambah warna dasar mengikuti tema.
// Warna dari `style` pemanggil tetap menang (ditaruh setelah warna dasar).
export function Text({ style, ...rest }: TextProps) {
  const C = useColors();
  return <RNText {...rest} style={[{ color: C.ink0 }, style]} />;
}

export function TextInput({ style, placeholderTextColor, ...rest }: TextInputProps) {
  const C = useColors();
  return (
    <RNTextInput
      {...rest}
      placeholderTextColor={placeholderTextColor ?? C.inkFaint}
      style={[{ color: C.ink0 }, style]}
    />
  );
}
