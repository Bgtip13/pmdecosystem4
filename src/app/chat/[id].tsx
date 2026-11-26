import IOSSpinner from "../../components/IOSSpinner";
import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import { TOP_PAD } from "../../lib/layout";

import { useColors, useStyles } from "../../lib/themeContext";
import type { Colors } from "../../lib/colors";
const fmtTime = (ms: number) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export default function ChatRoom() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const info = useQuery(api.chat.getRoomInfo, id ? { roomId: id as any } : "skip") as any;
  const msgs = useQuery(api.chat.getMessages, id ? { roomId: id as any } : "skip") as any;
  const markRead = useMutation(api.chat.markRead);
  const sendMessage = useAction(api.chat.sendMessage);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);
  const myId = viewer?._id;

  // Tandai dibaca setiap ada pesan baru
  useEffect(() => {
    if (!id || !myId) return;
    const t = setTimeout(() => { markRead({ roomId: id as any }); }, 400);
    return () => clearTimeout(t);
  }, [id, msgs?.length, myId, markRead]);

  const onSend = async () => {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await sendMessage({ roomId: id as any, text: clean });
      setText("");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  if (info === undefined || msgs === undefined || !viewer) {
    return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;
  }
  if (!info) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Percakapan tidak ditemukan</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = [...(msgs ?? [])].reverse(); // inverted list → terbaru di bawah

  const renderItem = ({ item }: any) => {
    const own = String(item.senderId) === String(myId);
    return (
      <View style={[styles.msgRow, own ? styles.msgRowOwn : styles.msgRowOther]}>
        {!own && info.isGroup ? <Text style={styles.sender}>{item.senderName}</Text> : null}
        <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.msgText, own && styles.msgTextOwn]}>{item.text}</Text>
          <Text style={[styles.msgTime, own && styles.msgTimeOwn]}>{fmtTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="back" size={16} color={C.primary} style={{ marginRight: 4 }} />
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{info.title}</Text>
        <Text style={styles.meta}>{info.isGroup ? "Grup" : "Percakapan pribadi"}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(m: any) => m._id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ padding: 12 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Tulis pesan…"
            value={text}
            onChangeText={setText}
            multiline
            onSubmitEditing={onSend}
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.5 }]} onPress={onSend} disabled={!text.trim() || busy}>
            <AppIcon name="send" size={17} color={C.onPrimary} style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
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
  msgRow: { marginBottom: 8, maxWidth: "82%" },
  msgRowOwn: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgRowOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  sender: { fontSize: 11, color: C.inkMuted, fontWeight: "700", marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleOwn: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: C.card, borderWidth: 1, borderColor: C.divider, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, color: C.ink0 },
  msgTextOwn: { color: C.onPrimary },
  msgTime: { fontSize: 10, color: C.inkMuted, marginTop: 3, alignSelf: "flex-end" },
  msgTimeOwn: { color: C.primaryTint },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.borderTint },
  input: { flex: 1, backgroundColor: C.status.neutral.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, maxHeight: 100, color: C.ink0 },
  sendBtn: { backgroundColor: C.primary, width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.ink3, textAlign: "center" },
  btnOutline: { borderWidth: 1, borderColor: C.primary, borderRadius: 12, padding: 12, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: C.primary, fontWeight: "800", fontSize: 15 },
});
