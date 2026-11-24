import { Modal, View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./AppText";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  type?: "info" | "success" | "error";
  onClose: () => void;
};

export default function CleanAlert({ visible, title, message, type = "info", onClose }: Props) {
  const C = useColors();
  const styles = useStyles(createStyles);
  const icon = type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️";
  const color = type === "success" ? C.status.success.fg : type === "error" ? C.status.danger.fg : C.inkSoft;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={[styles.title, { color }]}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: color }]} onPress={onClose}>
            <Text style={styles.btnText}>OK, Mengerti</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(16,24,40,0.5)", justifyContent: "center", alignItems: "center", padding: 28 },
  card: { width: "100%", maxWidth: 340, backgroundColor: C.card, borderRadius: 22, padding: 24, alignItems: "center" },
  icon: { fontSize: 36 },
  title: { fontSize: 17, fontWeight: "800", marginTop: 10, textAlign: "center" },
  message: { fontSize: 14, color: C.inkMuted, lineHeight: 20, textAlign: "center", marginTop: 8 },
  btn: { marginTop: 20, borderRadius: 12, paddingVertical: 13, width: "100%", alignItems: "center" },
  btnText: { color: C.onPrimary, fontSize: 15, fontWeight: "800" },
});
