import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import TabBar from "../../components/TabBar";
import AppIcon from "../../components/AppIcon";
import { TOP_PAD } from "../../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";

const fmtClock = (ms: number) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export default function ChatList() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const rooms = useQuery(api.chat.listRooms) as any;

  if (!viewer) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={RED} />
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
            <AppIcon name="plus" size={15} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.addBtnText}>Baru</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.meta}>Balas pesan & notifikasi</Text>
      </View>

      {rooms === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#F0D9D5" },
  brand: { fontSize: 12, fontWeight: "800", color: RED },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: RED, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  meta: { fontSize: 12, color: GRAY, marginTop: 2 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#EEF0F3" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FDE8E6", justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: "800", color: RED },
  name: { fontSize: 15, fontWeight: "800", color: "#111", flex: 1 },
  time: { fontSize: 11, color: GRAY, marginLeft: 8 },
  preview: { fontSize: 13, color: GRAY, marginTop: 3 },
  badge: { backgroundColor: RED, borderRadius: 11, minWidth: 21, height: 21, paddingHorizontal: 5, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333", textAlign: "center" },
});
