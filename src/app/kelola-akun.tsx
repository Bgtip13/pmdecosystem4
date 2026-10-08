import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Modal, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { theme } from "../lib/theme";
import { toFriendlyError } from "../lib/msg";
import AppIcon from "../components/AppIcon";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R } = theme;

const SHADOW = {
  shadowColor: "#101828",
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = C.status.success.fg;
const ORANGE = C.status.warning.fg;


const ROLE_BG: any = { owner: "#EDE9FE", supervisor: "#E0F2FE", field: "#DCFAE6", telemarketing: "#FEF0C7" };
const ROLE_TX: any = { owner: "#5B21B6", supervisor: "#026AA2", field: "#067647", telemarketing: "#B54708" };
const ROLE_LABEL: any = { owner: "Owner", supervisor: "Supervisor", field: "Sales Lapangan", telemarketing: "Telemarketing" };
const ROLES = [
  ["owner", "Owner"],
  ["field", "Sales Lapangan"],
  ["telemarketing", "Telemarketing"],
  ["supervisor", "Supervisor"],
];
// Role yang tidak terikat area tertentu
const NO_AREA_ROLES = ["supervisor", "owner"];
const AREAS = ["SOLO", "DIY", "SEMARANG"];

export default function KelolaAkun() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("ALL");
  const createUser = useAction(api.users.createUserByAdmin);
  const deleteUser = useMutation(api.users.deleteUserByAdmin);

  // State modal Tambah Akun
  const [showAdd, setShowAdd] = useState(false);
  const [uName, setUName] = useState("");
  const [uFull, setUFull] = useState("");
  const [uRole, setURole] = useState("field");
  const [uArea, setUArea] = useState("SOLO");
  const [saving, setSaving] = useState(false);

  const onDelete = (item: any) => {
    Alert.alert(
      "Hapus Akun?",
      `"${item.name}" akan dihapus permanen beserta semua sesi loginnya. Riwayat kunjungan lama tetap tersimpan. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Ya, Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUser({ userId: item._id });
              Alert.alert("Terhapus", `Akun "${item.name}" telah dihapus.`);
            } catch (e: any) {
              Alert.alert("Gagal", toFriendlyError(e));
            }
          },
        },
      ]
    );
  };

  const onCreate = async () => {
    const uname = uName.trim().toLowerCase();
    const name = uFull.trim();
    if (!uname || !name) { Alert.alert("Lengkapi Data", "ID dan nama wajib diisi."); return; }
    setSaving(true);
    try {
      const noArea = NO_AREA_ROLES.includes(uRole);
      await createUser({
        username: uname,
        name,
        role: uRole as any,
        area: noArea ? undefined : (uArea as any),
      });
      Alert.alert("Akun Dibuat", `ID "${uname}" • password awal pmd123 • wajib ganti saat login pertama.`);
      setShowAdd(false);
      setUName(""); setUFull(""); setURole("field"); setUArea("SOLO");
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setSaving(false);
    }
  };

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
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6 }}>
              <AppIcon name="warn" size={12} color={ORANGE} style={{ marginRight: 3 }} />
              <Text style={styles.mustText}>wajib ganti password</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity style={styles.delBtn} onPress={() => onDelete(item)}>
          <AppIcon name="trash" size={17} color="#B42318" />
        </TouchableOpacity>
        <AppIcon name="chevron" size={18} color="#98A2B3" style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="back" size={16} color={RED} style={{ marginRight: 4 }} />
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Kelola Akun</Text>
            <Text style={styles.meta}>Kelola akun sales lapangan & telemarketing</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <AppIcon name="plus" size={15} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.addBtnText}>Tambah</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <TextInput style={styles.searchInput} placeholder="Cari nama / ID..."
            value={q} onChangeText={setQ} autoCapitalize="none" />
        </View>
        <View style={styles.chipRow}>
                    {[["ALL", "Semua"], ["owner", "Owner"], ["supervisor", "SPV"], ["field", "Field"], ["telemarketing", "Telmark"]].map(([k, lbl]: any) => {
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

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalWrap}>
          <ScrollView style={styles.modalCard} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Tambah Akun</Text>
            <Text style={styles.modalSub}>Password awal otomatis pmd123 & wajib diganti saat login pertama.</Text>

            <Text style={styles.label}>ID LOGIN</Text>
            <TextInput style={styles.input} value={uName} onChangeText={setUName}
              placeholder="contoh: budi" autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.label}>NAMA</Text>
            <TextInput style={styles.input} value={uFull} onChangeText={setUFull}
              placeholder="Nama lengkap" />

            <Text style={styles.label}>PERAN</Text>
            <View style={styles.chipRow}>
              {ROLES.map(([k, lbl]: any) => (
                <TouchableOpacity key={k} style={[styles.chip, uRole === k && styles.chipActive]}
                  onPress={() => setURole(k)}>
                  <Text style={[styles.chipText, uRole === k && styles.chipTextActive]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {NO_AREA_ROLES.includes(uRole) ? (
              <Text style={styles.note}>
                {uRole === "owner"
                  ? "Owner = akun pemilik perusahaan — melihat semua data tanpa aksi operasional."
                    : "Supervisor melihat semua area — tidak terikat area tertentu."}
              </Text>
            ) : (
              <>
                <Text style={styles.label}>AREA</Text>
                <View style={styles.chipRow}>
                  {AREAS.map((a) => (
                    <TouchableOpacity key={a} style={[styles.chip, uArea === a && styles.chipActive]}
                      onPress={() => setUArea(a)}>
                      <Text style={[styles.chipText, uArea === a && styles.chipTextActive]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowAdd(false)} disabled={saving}>
                <Text style={styles.modalBtnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave, saving && { opacity: 0.6 }]}
                onPress={onCreate} disabled={saving}>
                <Text style={styles.modalBtnSaveText}>{saving ? "Membuat..." : "Buat Akun"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: { backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F2DAD5" },
  backBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  headRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: RED, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, ...SHADOW },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  delBtn: { padding: 8, marginRight: 2, backgroundColor: C.status.danger.bg, borderRadius: R.sm },
  searchBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, marginTop: 12, paddingHorizontal: 14 },
  searchInput: { paddingVertical: 11, fontSize: 14, color: C.ink },
  chipRow: { flexDirection: "row", marginTop: 10, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, marginBottom: 6, backgroundColor: C.surface },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 13, color: C.inkSoft, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...SHADOW },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: "800", color: RED },
  name: { fontSize: 15, fontWeight: "800", color: C.ink },
  email: { fontSize: 12, color: GRAY, marginTop: 1 },
  roleChip: { borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 },
  roleChipText: { fontSize: 11, fontWeight: "800" },
  areaChip: { borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: C.status.neutral.bg },
  areaChipText: { fontSize: 11, fontWeight: "800", color: C.inkSoft },
  mustText: { fontSize: 11, fontWeight: "700", color: ORANGE },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  modalWrap: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(16,24,40,0.45)" },
  modalCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: 20, maxHeight: "90%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.ink },
  modalSub: { fontSize: 12, color: GRAY, marginTop: 4, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 13, fontSize: 15, color: C.ink },
  note: { fontSize: 12, color: GRAY, marginTop: 8, lineHeight: 17 },
  modalActions: { flexDirection: "row", marginTop: 22 },
  modalBtn: { flex: 1, borderRadius: R.md, paddingVertical: 14, alignItems: "center", marginHorizontal: 4 },
  modalBtnCancel: { backgroundColor: C.status.neutral.bg },
  modalBtnCancelText: { color: C.inkSoft, fontWeight: "800", fontSize: 14 },
  modalBtnSave: { backgroundColor: RED },
  modalBtnSaveText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

