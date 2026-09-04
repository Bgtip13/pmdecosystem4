import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";

const RED = "#D92D20";
const GRAY = "#667085";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  type?: "info" | "success" | "error";
  onClose: () => void;
};

export default function CleanAlert({ visible, title, message, type = "info", onClose }: Props) {
  const icon = type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️";
  const color = type === "success" ? "#067647" : type === "error" ? RED : "#344054";

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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(16,24,40,0.5)", justifyContent: "center", alignItems: "center", padding: 28 },
  card: { width: "100%", maxWidth: 340, backgroundColor: "#fff", borderRadius: 22, padding: 24, alignItems: "center" },
  icon: { fontSize: 36 },
  title: { fontSize: 17, fontWeight: "800", marginTop: 10, textAlign: "center" },
  message: { fontSize: 14, color: GRAY, lineHeight: 20, textAlign: "center", marginTop: 8 },
  btn: { marginTop: 20, borderRadius: 12, paddingVertical: 13, width: "100%", alignItems: "center" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
