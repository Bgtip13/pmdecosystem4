import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SectionList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// ← BARU: ikon + warna per jenis notifikasi (kind). Kind tak dikenal → 🔔 abu.
const KIND: any = {
  manual: { emoji: "✉️", bg: "#FEE4E2" },
  approval: { emoji: "📍", bg: "#E0F2FE" },
  daily: { emoji: "⏰", bg: "#FEF0C7" },
};
const kindOf = (k?: string | null) => KIND[k ?? ""] ?? { emoji: "🔔", bg: "#F2F4F7" };

export default function Notifikasi() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const rows = useQuery(api.notifications.listMine) as any;
  const markRead = useMutation(api.notifications.markRead);
  const remove = useMutation(api.notifications.remove);

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  const isSuper = viewer.role === "supervisor";

  const list = (rows ?? []) as any[];
  const unread = list.filter((it) => !it.readAt).length;

  // ← BARU: kelompokkan per hari (urutan asli tetap: terbaru dulu)
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 86400000);
  const map = new Map<string, any[]>();
  for (const it of list) {
    const k = dayKey(it.createdAt);
    const arr = map.get(k);
    if (arr) arr.push(it);
    else map.set(k, [it]);
  }
  const sections = Array.from(map.entries()).map(([k, data]) => ({
    key: k,
    title:
      k === today
        ? "Hari ini"
        : k === yesterday
          ? "Kemarin"
          : new Date(data[0].createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
    data,
  }));

  // Tandai dibaca, lalu lompat ke layar tujuan kalau ada `link`
  const onOpen = async (it: any) => {
    if (!it.readAt) await markRead({ notifId: it._id }).catch(() => {});
    if (it.link) {
      try { router.push(it.link as any); } catch {}
    }
  };

  const onDelete = (it: any) => {
    Alert.alert("Hapus Notifikasi?", "Hapus notifikasi ini?", [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => remove({ notifId: it._id }).catch(() => {}) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>

        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notifikasi</Text>
            <Text style={styles.sub}>
              {rows === undefined
                ? "Memuat…"
                : unread > 0
                  ? `${unread} belum dibaca dari ${list.length} pesan`
                  : `Semua sudah dibaca • ${list.length} pesan`}
            </Text>
          </View>
          {unread > 0 ? (
            <View style={styles.headBadge}><Text style={styles.headBadgeText}>{unread}</Text></View>
          ) : null}
          {isSuper ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/notifikasi-kirim")}>
              <Text style={styles.addBtnText}>＋ Kirim</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {rows === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🔕</Text>
          <Text style={styles.empty}>Belum ada notifikasi</Text>
          <Text style={styles.emptySub}>Pesan dari supervisor akan muncul di sini.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(it: any) => it._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }: any) => (
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>{section.title}</Text>
              <Text style={styles.secCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const belum = !item.readAt;
            const k = kindOf(item.kind);
            return (
              <TouchableOpacity
                style={[styles.card, belum && styles.cardUnread]}
                onPress={() => onOpen(item)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: k.bg }]}>
                    <Text style={styles.iconEmoji}>{k.emoji}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, belum && styles.cardTitleUnread]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardMeta}>{item.fromName} • {fmtTime(item.createdAt)}</Text>
                  </View>

                  {belum ? <View style={styles.dotUnread} /> : null}

                  <TouchableOpacity
                    style={styles.delBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => onDelete(item)}
                  >
                    <Text style={styles.delText}>🗑</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.cardBody}>{item.body}</Text>

                {item.link ? <Text style={styles.linkHint}>Ketuk untuk buka →</Text> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F0D9D5" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  headRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  sub: { fontSize: 12, color: GRAY, marginTop: 2 },
  headBadge: { backgroundColor: RED, borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", marginRight: 8 },
  headBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  addBtn: { backgroundColor: RED, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  emptyEmoji: { fontSize: 34, marginBottom: 6 },
  empty: { fontSize: 15, fontWeight: "700", color: "#333" },
  emptySub: { fontSize: 12, color: GRAY, marginTop: 4, textAlign: "center" },

  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 8, paddingHorizontal: 2 },
  secTitle: { fontSize: 12, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.6 },
  secCount: { fontSize: 11, fontWeight: "800", color: GRAY },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3", borderLeftWidth: 3, borderLeftColor: "#EEF0F3" },
  cardUnread: { backgroundColor: "#FFFBF5", borderColor: "#FEDF89", borderLeftColor: RED },
  cardTop: { flexDirection: "row", alignItems: "center" },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 10 },
  iconEmoji: { fontSize: 16 },
  dotUnread: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED, marginLeft: 6 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#344054", lineHeight: 19 },
  cardTitleUnread: { fontWeight: "900", color: "#111" },
  cardMeta: { fontSize: 11, color: GRAY, marginTop: 3 },
  cardBody: { fontSize: 13, color: "#344054", marginTop: 8, lineHeight: 18 },
  linkHint: { fontSize: 11, fontWeight: "800", color: RED, marginTop: 8 },
  delBtn: { padding: 4, marginLeft: 4 },
  delText: { fontSize: 14 },
});
