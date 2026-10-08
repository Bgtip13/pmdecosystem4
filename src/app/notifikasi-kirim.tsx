import { useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";

export default function KirimNotifikasi() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const users = useQuery(api.users.listUsersManage, {}) as any;
  const send = useMutation(api.notifications.send);

  const [target, setTarget] = useState<"all" | "users">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  if (viewer.role !== "supervisor") {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Khusus Supervisor</Text>
      </View>
    );
  }

  const kw = q.trim().toLowerCase();
  const filtered = (users ?? []).filter((u: any) =>
    !kw || (u.name || "").toLowerCase().includes(kw) || (u.email || "").toLowerCase().includes(kw)
  );

  const toggle = (id: string) =>
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const doSend = async () => {
    if (!title.trim() || !body.trim()) { Alert.alert("Lengkapi", "Judul & isi wajib diisi."); return; }
    if (target === "users" && sel.length === 0) { Alert.alert("Pilih User", "Pilih minimal 1 penerima."); return; }
    setBusy(true);
    try {
      const r: any = await send({
        title: title.trim(),
        body: body.trim(),
        target,
        userIds: target === "users" ? (sel as any) : undefined,
      });
      Alert.alert("Terkirim ✅", `Notifikasi terkirim ke ${r?.count ?? 0} user.`);
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Kirim Notifikasi</Text>
        <Text style={styles.sub}>Pilih penerima, lalu tulis pesan</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={styles.label}>PENERIMA *</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, target === "all" && styles.chipOn]} onPress={() => setTarget("all")}>
            <Text style={[styles.chipText, target === "all" && styles.chipTextOn]}>📣 Semua User</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, target === "users" && styles.chipOn]} onPress={() => setTarget("users")}>
            <Text style={[styles.chipText, target === "users" && styles.chipTextOn]}>👥 Pilih User</Text>
          </TouchableOpacity>
        </View>

        {target === "users" ? (
          <>
            <Text style={styles.label}>PILIH USER {sel.length > 0 ? `(${sel.length} dipilih)` : ""}</Text>
            <TextInput style={styles.search} placeholder="Cari nama / ID..."
              value={q} onChangeText={setQ} autoCapitalize="none" />
            {users === undefined ? (
              <ActivityIndicator size="small" color={RED} style={{ marginVertical: 10 }} />
            ) : (
              filtered.map((u: any) => {
                const on = sel.includes(u._id);
                return (
                  <TouchableOpacity key={u._id} style={styles.userRow} onPress={() => toggle(u._id)}>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? <Text style={styles.checkText}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userMeta}>{u.role === "supervisor" ? "Supervisor" : u.role === "field" ? "Sales Lapangan" : "Telemarketing"}{u.area ? " • " + u.area : ""}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : null}

        <Text style={styles.label}>JUDUL *</Text>
        <TextInput style={styles.input} placeholder="contoh: Briefing mingguan" value={title} onChangeText={setTitle} />

        <Text style={styles.label}>ISI PESAN *</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Tulis pesan untuk tim..."
          value={body} onChangeText={setBody} multiline />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={doSend} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Mengirim..." : "📨 Kirim Notifikasi"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F0D9D5" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  sub: { fontSize: 12, color: GRAY, marginTop: 2 },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipOn: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  search: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 10 },
  userRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#EEF0F3" },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#D0D5DD", marginRight: 12, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: RED, borderColor: RED },
  checkText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  userName: { fontSize: 14, fontWeight: "800", color: "#111" },
  userMeta: { fontSize: 11, color: GRAY, marginTop: 2 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 13, fontSize: 15 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  empty: { fontSize: 15, fontWeight: "700", color: "#333" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
