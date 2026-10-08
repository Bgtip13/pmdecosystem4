import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const VIOLET = "#6D28D9";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const TYPES: { key: string; label: string }[] = [
  { key: "sakit", label: "Sakit" },
  { key: "izin", label: "Izin" },
  { key: "cuti", label: "Cuti" },
  { key: "dinas_luar", label: "Dinas luar" },
  { key: "libur", label: "Libur" },
];
const SCOPES: { key: string; label: string }[] = [
  { key: "tidak_masuk", label: "Tidak masuk" },
  { key: "tidak_keliling", label: "Tidak keliling" },
];
const TYPE_LABEL: any = { sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur" };
const SCOPE_LABEL: any = { tidak_masuk: "Tidak masuk", tidak_keliling: "Tidak keliling" };

export default function Izin() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  const [day, setDay] = useState(new Date());
  const [salesId, setSalesId] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [scope, setScope] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const isSuper = viewer?.role === "supervisor";

  const salesList = useQuery(api.visits.listFieldSales, isSuper ? undefined : "skip") as any;
  const leaves = useQuery(api.leaves.listByDay, (isSuper ? ({ day: dayKey } as any) : "skip") as any) as any;

  const setLeave = useMutation(api.leaves.setLeave);
  const clearLeave = useMutation(api.leaves.clearLeave);

  if (!viewer) return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;

  if (!isSuper) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Khusus Supervisor</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/spv"); };
  const shiftDay = (n: number) => {
    setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));
    setSalesId(null); setType(""); setScope(""); setNote("");
  };
  const isToday = day.toDateString() === new Date().toDateString();
  const label = isToday ? "Hari Ini" : `${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear()}`;

  const rows = (salesList ?? []) as any[];
  const savedOf = (id: string) => (leaves ?? []).find((l: any) => String(l.salesId) === id) ?? null;

  const pickSales = (s: any) => {
    const sv = savedOf(String(s._id));
    setSalesId(String(s._id));
    setType(sv?.type ?? "");
    setScope(sv?.scope ?? "");
    setNote(sv?.note ?? "");
  };

  const onSave = async () => {
    if (!salesId) return Alert.alert("Pilih sales", "Ketuk nama sales dulu.");
    if (!type) return Alert.alert("Jenis izin", "Pilih jenis izinnya.");
    if (!scope) return Alert.alert("Keterangan", "Pilih \"Tidak masuk\" atau \"Tidak keliling\".");
    setBusy("FORM");
    try {
      await setLeave({
        salesId: salesId as any,
        day: dayKey,
        type: type as any,
        scope: scope as any,
        note: note.trim() || undefined,
      });
      const s = rows.find((x: any) => String(x._id) === salesId);
      Alert.alert("Tersimpan ✅", `${s?.name ?? "Sales"}: ${TYPE_LABEL[type]} · ${SCOPE_LABEL[scope]}.`);
      setSalesId(null); setType(""); setScope(""); setNote("");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(null);
    }
  };

  const doClear = (id: string, name: string) => {
    Alert.alert("Batalkan izin?", `${name} akan kembali dihitung target kunjungan.`, [
      { text: "Tidak", style: "cancel" },
      {
        text: "Ya, Batalkan",
        style: "destructive",
        onPress: async () => {
          setBusy(id);
          try {
            await clearLeave({ salesId: id as any, day: dayKey });
            if (salesId === id) { setSalesId(null); setType(""); setScope(""); setNote(""); }
          } catch (e: any) {
            Alert.alert("Gagal", e?.message ?? "Coba lagi.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const selectedSaved = salesId ? savedOf(salesId) : null;
  const formDisabled = busy === "FORM";

  return (
    <View style={styles.screen}>
      {/* ===== Header + filter tanggal ===== */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={goBack}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Izin Sales</Text>
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>‹</Text></TouchableOpacity>
          <Text style={styles.dateLabel}>{label}</Text>
          <TouchableOpacity onPress={() => shiftDay(1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>›</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
        {salesList === undefined ? (
          <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
        ) : (
          <>
            {/* ===== FORM ===== */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tambah / Ubah Izin</Text>

              <Text style={styles.groupLabel}>SALES</Text>
              <View style={styles.chipWrap}>
                {rows.map((s: any) => {
                  const on = salesId === String(s._id);
                  const sv = savedOf(String(s._id));
                  return (
                    <TouchableOpacity
                      key={s._id}
                      style={[styles.aChip, on && styles.aChipOn]}
                      onPress={() => pickSales(s)}
                      disabled={formDisabled}
                    >
                      <Text style={[styles.aChipText, on && styles.aChipTextOn]}>
                        {s.name}{s.area ? ` • ${s.area}` : ""}{sv ? " ✓" : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedSaved ? (
                <Text style={styles.hint}>Sales ini sudah punya izin untuk {label} — menyimpan akan menggantinya.</Text>
              ) : null}

              <Text style={styles.groupLabel}>JENIS IZIN</Text>
              <View style={styles.chipWrap}>
                {TYPES.map((t) => {
                  const on = type === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.aChip, on && styles.aChipOn]}
                      onPress={() => setType(t.key)}
                      disabled={formDisabled}
                    >
                      <Text style={[styles.aChipText, on && styles.aChipTextOn]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.groupLabel}>KETERANGAN</Text>
              <View style={styles.chipWrap}>
                {SCOPES.map((sc) => {
                  const on = scope === sc.key;
                  return (
                    <TouchableOpacity
                      key={sc.key}
                      style={[styles.aChip, on && styles.aChipOn]}
                      onPress={() => setScope(sc.key)}
                      disabled={formDisabled}
                    >
                      <Text style={[styles.aChipText, on && styles.aChipTextOn]}>{sc.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.groupLabel}>CATATAN (OPSIONAL)</Text>
              <TextInput
                style={styles.input}
                placeholder="contoh: demam, surat dokter ada"
                value={note}
                onChangeText={setNote}
                editable={!formDisabled}
              />

              <TouchableOpacity
                style={[styles.saveBtn, formDisabled && { opacity: 0.6 }]}
                onPress={onSave}
                disabled={formDisabled}
              >
                <Text style={styles.saveBtnText}>{formDisabled ? "Menyimpan..." : "Simpan Izin"}</Text>
              </TouchableOpacity>
            </View>

            {/* ===== DAFTAR IZIN ===== */}
            <Text style={styles.sectionTitle}>
              Izin {isToday ? "Hari Ini" : label} {(leaves ?? []).length > 0 ? `(${leaves.length})` : ""}
            </Text>

            {leaves === undefined ? (
              <ActivityIndicator size="small" color={VIOLET} style={{ marginVertical: 8 }} />
            ) : (leaves ?? []).length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.meta}>Belum ada izin untuk tanggal ini.</Text>
              </View>
            ) : (
              (leaves ?? []).map((l: any) => (
                <View key={String(l.salesId)} style={styles.rowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {l.name}{l.area ? ` • ${l.area}` : ""}
                    </Text>
                    <Text style={styles.rowSub}>
                      {TYPE_LABEL[l.type] ?? l.type} · {SCOPE_LABEL[l.scope] ?? l.scope}
                      {l.note ? ` • ${l.note}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => doClear(String(l.salesId), l.name)}
                    disabled={busy === String(l.salesId)}
                  >
                    <Text style={styles.cancelText}>{busy === String(l.salesId) ? "..." : "Batalkan"}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#F5F3FF", paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 12 },
  backText: { color: VIOLET, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#EEF0F3", paddingHorizontal: 4 },
  dateArrow: { paddingHorizontal: 18, paddingVertical: 6 },
  dateArrowText: { fontSize: 22, color: VIOLET, fontWeight: "800" },
  dateLabel: { fontSize: 14, fontWeight: "800", color: "#111" },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  meta: { fontSize: 12, color: GRAY, marginTop: 4 },

  groupLabel: { fontSize: 10, fontWeight: "800", color: GRAY, letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap" },
  aChip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: "#fff" },
  aChipOn: { backgroundColor: VIOLET, borderColor: VIOLET },
  aChipText: { fontSize: 12, color: "#344054", fontWeight: "700" },
  aChipTextOn: { color: "#fff" },
  hint: { fontSize: 11, color: "#B54708", fontWeight: "700", marginTop: 2 },

  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 10, padding: 11, fontSize: 13 },
  saveBtn: { backgroundColor: VIOLET, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  rowCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: "#EEF0F3" },
  name: { fontSize: 14, fontWeight: "800", color: "#111" },
  rowSub: { fontSize: 12, color: GRAY, marginTop: 3 },
  cancelBtn: { backgroundColor: "#FEF3F2", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 10 },
  cancelText: { fontSize: 12, fontWeight: "800", color: "#B42318" },

  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
});
