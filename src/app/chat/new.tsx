import IOSSpinner from "../../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import { TOP_PAD } from "../../lib/layout";

import { useColors, useStyles } from "../../lib/themeContext";
import type { Colors } from "../../lib/colors";
const ROLE_LABEL: any = { supervisor: "SPV", field: "Sales", telemarketing: "Telmark" };

export default function NewChat() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const contacts = useQuery(api.chat.listContacts) as any;
  const createRoom = useMutation(api.chat.findOrCreateRoom);
  const [sel, setSel] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const isSuper = viewer?.role === "supervisor";

  const toggle = (id: string) => {
    if (isSuper) {
      setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSel([id]);
    }
  };

  const onCreate = async () => {
    if (sel.length === 0) { Alert.alert("Pilih dulu", "Pilih minimal 1 orang."); return; }
    setBusy(true);
    try {
      const r: any = await createRoom({
        memberIds: sel as any,
        name: isSuper && sel.length > 1 && name.trim() ? name.trim() : undefined,
      });
      router.replace(`/chat/${r.roomId}`);
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="back" size={16} color={C.primary} style={{ marginRight: 4 }} />
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chat Baru</Text>
        <Text style={styles.meta}>
          {isSuper ? "Supervisor: pilih beberapa orang untuk buat grup." : "Pilih 1 orang (supervisor / se-area)."}
        </Text>
      </View>

      {contacts === undefined ? (
        <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
          {isSuper && sel.length > 1 ? (
            <TextInput
              style={styles.groupInput}
              placeholder="Nama grup (opsional)"
              value={name}
              onChangeText={setName}
            />
          ) : null}

          {contacts.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Tidak ada yang bisa diajak chat</Text>
            </View>
          ) : (
            contacts.map((c: any) => {
              const on = sel.includes(c._id);
              return (
                <TouchableOpacity key={c._id} style={[styles.card, on && styles.cardOn]} onPress={() => toggle(c._id)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(c.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{c.name}</Text>
                    <Text style={styles.meta}>
                      {ROLE_LABEL[c.role] ?? c.role}{c.area ? ` • ${c.area}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <AppIcon name="check" size={13} color={C.onPrimary} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity
            style={[styles.btnPrimary, (busy || sel.length === 0) && { opacity: 0.5 }]}
            onPress={onCreate}
            disabled={busy || sel.length === 0}
          >
            <Text style={styles.btnText}>{busy ? "Membuat..." : "Buat Chat"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { padding: 40, alignItems: "center" },
  topbar: {
    backgroundColor: C.surfaceTint,
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  backBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  groupInput: { backgroundColor: C.card, borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 12 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.divider },
  cardOn: { borderColor: C.primary, backgroundColor: C.surfaceTint },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primaryTint, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: "800", color: C.primary },
  name: { fontSize: 15, fontWeight: "800", color: C.ink0 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.status.neutral.border, justifyContent: "center", alignItems: "center" },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 12 },
  btnText: { color: C.onPrimary, fontSize: 15, fontWeight: "800" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.ink3, textAlign: "center" },
});
