import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";

const ROLE_BG: any = { supervisor: "#E0F2FE", field: "#DCFAE6", telemarketing: "#FEF0C7" };
const ROLE_TX: any = { supervisor: "#026AA2", field: "#067647", telemarketing: "#B54708" };
const ROLE_LABEL: any = { supervisor: "Supervisor", field: "Sales Lapangan", telemarketing: "Telemarketing" };

export default function KelolaAkun() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("ALL");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useQuery(api.users.listUsersManage, {
    ...(debounced ? { q: debounced } : {}),
    ...(role !== "ALL" ? { role: role as any } : {}),
  }) as any;

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/kelola-akun/${item._id}`)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.email}>{item.email?.replace("@pmd.local", "") ?? "-"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <View style={[styles.roleChip, { backgroundColor: ROLE_BG[item.role] ?? "#F2F4F7" }]}>
            <Text style={[styles.roleChipText, { color: ROLE_TX[item.role] ?? GRAY }]}>
              {ROLE_LABEL[item.role] ?? item.role}
            </Text>
          </View>
          {item.area ? (
            <View style={[styles.areaChip, { backgroundColor: "#F2F4F7" }]}>
              <Text style={styles.areaChipText}>{item.area}</Text>
            </View>
          ) : null}
          {item.mustChangePassword ? (
            <Text style={styles.mustText}>⚠ wajib ganti password</Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Kelola Akun</Text>
        <Text style={styles.meta}>Ketuk akun untuk ubah peran / area</Text>
        <View style={styles.searchBox}>
          <TextInput style={styles.searchInput} placeholder="Cari nama / ID..."
            value={q} onChangeText={setQ} autoCapitalize="none" />
        </View>
        <View style={styles.chipRow}>
          {[["ALL", "Semua"], ["supervisor", "SPV"], ["field", "Field"], ["telemarketing", "Telmark"]].map(([k, lbl]: any) => {
            const on = role === k;
            return (
              <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setRole(k)}>
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {rows === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(u: any) => u._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Akun tidak ditemukan</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  searchBox: { backgroundColor: "#F2F4F7", borderRadius: 12, marginTop: 12, paddingHorizontal: 14 },
  searchInput: { paddingVertical: 10, fontSize: 14, color: "#111" },
  chipRow: { flexDirection: "row", marginTop: 10, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFE4E6", justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: "800", color: RED },
  name: { fontSize: 15, fontWeight: "800", color: "#111" },
  email: { fontSize: 12, color: GRAY, marginTop: 1 },
  roleChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 },
  roleChipText: { fontSize: 11, fontWeight: "800" },
  areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  areaChipText: { fontSize: 11, fontWeight: "800", color: "#475467" },
  mustText: { fontSize: 11, fontWeight: "700", color: ORANGE, marginLeft: 6 },
  arrow: { fontSize: 20, color: "#98A2B3", fontWeight: "700", marginLeft: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333" },
});
