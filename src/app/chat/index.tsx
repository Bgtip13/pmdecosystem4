import IOSSpinner from "../../components/IOSSpinner";
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import TabBar from "../../components/TabBar";
import AppIcon from "../../components/AppIcon";
import { TOP_PAD } from "../../lib/layout";

import { useColors, useStyles } from "../../lib/themeContext";
import type { Colors } from "../../lib/colors";
const fmtClock = (ms: number) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export default function ChatList() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const rooms = useQuery(api.chat.listRooms) as any;

  if (!viewer) {
    return (
      <View style={styles.center}>
        <IOSSpinner size="large" color={C.primary} />
      </View>
    );
  }

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/chat/${item.roomId}`)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(item.title || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.name} numberOfLines={1}>{item.title}</Text>
          {item.lastMessageAt ? <Text style={styles.time}>{fmtClock(item.lastMessageAt)}</Text> : null}
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {item.lastMessage
            ? `${item.isGroup && item.lastSenderName ? item.lastSenderName + ": " : ""}${item.lastMessage}`
            : "Belum ada pesan"}
        </Text>
      </View>
      {item.unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unread > 9 ? "9+" : item.unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Chat</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/chat/new")}>
            <AppIcon name="plus" size={15} color={C.onPrimary} style={{ marginRight: 4 }} />
            <Text style={styles.addBtnText}>Baru</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.meta}>Balas pesan & notifikasi</Text>
      </View>

      {rooms === undefined ? (
        <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>
      ) : rooms.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Belum ada percakapan</Text>
          <Text style={styles.meta}>Tekan "Baru" untuk mulai chat.</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r: any) => r.roomId}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        />
      )}

      <TabBar active="chat" />
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
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
  brand: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: C.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: C.onPrimary, fontWeight: "800", fontSize: 13 },
  meta: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.divider },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primaryTint, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: "800", color: C.primary },
  name: { fontSize: 15, fontWeight: "800", color: C.ink0, flex: 1 },
  time: { fontSize: 11, color: C.inkMuted, marginLeft: 8 },
  preview: { fontSize: 13, color: C.inkMuted, marginTop: 3 },
  badge: { backgroundColor: C.primary, borderRadius: 11, minWidth: 21, height: 21, paddingHorizontal: 5, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  badgeText: { color: C.onPrimary, fontSize: 11, fontWeight: "800" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.ink3, textAlign: "center" },
});
