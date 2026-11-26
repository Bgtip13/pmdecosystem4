import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toFriendlyError } from "../lib/msg";
import { TOP_PAD } from "../lib/layout";

import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
export default function KirimNotifikasi() {
  const C = useColors();
  const styles = useStyles(createStyles);
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

  if (!viewer) return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;
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
              <IOSSpinner size="small" color={C.primary} style={{ marginVertical: 10 }} />
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

const createStyles = (C: Colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
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
  backBtn: { alignSelf: "flex-start" },
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  sub: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "800", color: C.inkMuted, marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8, marginBottom: 6, backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.inkSoft, fontWeight: "700" },
  chipTextOn: { color: C.onPrimary },
  search: { backgroundColor: C.card, borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 10 },
  userRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.divider },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.status.neutral.border, marginRight: 12, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  checkText: { color: C.onPrimary, fontWeight: "900", fontSize: 13 },
  userName: { fontSize: 14, fontWeight: "800", color: C.ink0 },
  userMeta: { fontSize: 11, color: C.inkMuted, marginTop: 2 },
  input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 12, padding: 13, fontSize: 15 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  empty: { fontSize: 15, fontWeight: "700", color: C.ink3 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.hairline },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 14, padding: 17, alignItems: "center" },
  btnText: { color: C.onPrimary, fontSize: 16, fontWeight: "800" },
});
