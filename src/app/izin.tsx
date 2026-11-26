import IOSSpinner from "../components/IOSSpinner";
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { TOP_PAD } from "../lib/layout";

import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
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
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  const [day, setDay] = useState(new Date());
  const [salesId, setSalesId] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [scope, setScope] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const isSuper = viewer?.role === "supervisor" || viewer?.role === "hr"; // supervisor & HR boleh kelola izin

  const salesList = useQuery(api.visits.listFieldSales, isSuper ? undefined : "skip") as any;
  const leaves = useQuery(api.leaves.listByDay, (isSuper ? ({ day: dayKey } as any) : "skip") as any) as any;

  const setLeave = useMutation(api.leaves.setLeave);
  const clearLeave = useMutation(api.leaves.clearLeave);

  // ===== Event target kunjungan (khusus supervisor) =====
  const isSpv = viewer?.role === "supervisor";
  const events = useQuery(api.visitEvents.listByDay, (isSpv ? ({ day: dayKey } as any) : "skip") as any) as any;
  const createEvent = useMutation(api.visitEvents.create);
  const removeEvent = useMutation(api.visitEvents.remove);
  const [evTitle, setEvTitle] = useState("");
  const [evTarget, setEvTarget] = useState("");
  const [evArea, setEvArea] = useState<string>("");   // "" = semua area

  if (!viewer) return <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>;

  if (!isSuper) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Khusus Supervisor / HR</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda"); }}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace(viewer?.role === "hr" ? "/beranda" : "/spv"); };
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

  const onSaveEvent = async () => {
    const t = parseInt(evTarget, 10);
    if (!evTitle.trim()) return Alert.alert("Judul event", "Isi judul event, mis. Meeting dadakan.");
    if (evTarget.trim() === "" || isNaN(t) || t < 0 || t > 50) return Alert.alert("Target kunjungan", "Isi target 0–50 toko untuk hari ini.");
    setBusy("EVENT");
    try {
      await createEvent({ day: dayKey, title: evTitle.trim(), target: t, area: (evArea || undefined) as any });
      Alert.alert("Tersimpan ✅", `Event “${evTitle.trim()}”: target kunjungan ${t} toko. Penilaian ikut menyesuaikan.`);
      setEvTitle(""); setEvTarget(""); setEvArea("");
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(null);
    }
  };

  const doRemoveEvent = (id: string, title: string) => {
    Alert.alert("Hapus event?", `“${title}” dihapus dan target hari itu kembali ke bawaan (7 toko).`, [
      { text: "Tidak", style: "cancel" },
      {
        text: "Ya, Hapus",
        style: "destructive",
        onPress: async () => {
          setBusy(id);
          try {
            await removeEvent({ eventId: id as any });
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
          <View style={styles.center}><IOSSpinner size="large" color={C.primary} /></View>
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
              <IOSSpinner size="small" color={C.violetDark} style={{ marginVertical: 8 }} />
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

            {/* ===== EVENT & TARGET KUNJUNGAN (supervisor) ===== */}
            {isSpv ? (
              <>
                <Text style={styles.sectionTitle}>
                  Event & Target Kunjungan {(events ?? []).length > 0 ? `(${events.length})` : ""}
                </Text>
                <View style={styles.card}>
                  <Text style={styles.meta}>
                    Untuk {label}. Target bawaan 7 toko (Minggu libur). Event mengganti target hari itu dan otomatis dipakai penilaian.
                    Isi 0 bila hari itu tanpa kewajiban kunjungan.
                  </Text>

                  <Text style={styles.groupLabel}>JUDUL EVENT</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="contoh: Meeting dadakan"
                    value={evTitle}
                    onChangeText={setEvTitle}
                    editable={busy !== "EVENT"}
                  />

                  <Text style={styles.groupLabel}>TARGET KUNJUNGAN HARI ITU (TOKO)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="contoh: 4"
                    keyboardType="number-pad"
                    value={evTarget}
                    onChangeText={(x) => setEvTarget(x.replace(/[^0-9]/g, ""))}
                    editable={busy !== "EVENT"}
                  />

                  <Text style={styles.groupLabel}>BERLAKU UNTUK</Text>
                  <View style={styles.chipWrap}>
                    {["", "SOLO", "DIY", "SEMARANG"].map((a) => {
                      const on = evArea === a;
                      return (
                        <TouchableOpacity key={a || "ALL"} style={[styles.aChip, on && styles.aChipOn]} onPress={() => setEvArea(a)} disabled={busy === "EVENT"}>
                          <Text style={[styles.aChipText, on && styles.aChipTextOn]}>{a || "Semua area"}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, busy === "EVENT" && { opacity: 0.6 }]}
                    onPress={onSaveEvent}
                    disabled={busy === "EVENT"}
                  >
                    <Text style={styles.saveBtnText}>{busy === "EVENT" ? "Menyimpan..." : "Simpan Event"}</Text>
                  </TouchableOpacity>
                </View>

                {events === undefined ? (
                  <IOSSpinner size="small" color={C.violetDark} style={{ marginVertical: 8 }} />
                ) : (events ?? []).length === 0 ? (
                  <View style={styles.card}>
                    <Text style={styles.meta}>Belum ada event untuk tanggal ini — target kunjungan memakai bawaan.</Text>
                  </View>
                ) : (
                  (events ?? []).map((e: any) => (
                    <View key={String(e._id)} style={styles.rowCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>{e.title}</Text>
                        <Text style={styles.rowSub}>
                          Target {e.target} toko • {e.area ?? "Semua area"}{e.createdByName ? ` • oleh ${e.createdByName}` : ""}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => doRemoveEvent(String(e._id), e.title)} disabled={busy === String(e._id)}>
                        <Text style={styles.cancelText}>{busy === String(e._id) ? "..." : "Hapus"}</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
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
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.divider, paddingHorizontal: 4 },
  dateArrow: { paddingHorizontal: 18, paddingVertical: 6 },
  dateArrowText: { fontSize: 22, color: C.violetDark, fontWeight: "800" },
  dateLabel: { fontSize: 14, fontWeight: "800", color: C.ink0 },

  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.divider },
  cardTitle: { fontSize: 14, fontWeight: "800", color: C.ink0 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  meta: { fontSize: 12, color: C.inkMuted, marginTop: 4 },

  groupLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap" },
  aChip: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: C.card },
  aChipOn: { backgroundColor: C.violetDark, borderColor: C.violetDark },
  aChipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  aChipTextOn: { color: C.onPrimary },
  hint: { fontSize: 11, color: C.status.warning.fg, fontWeight: "700", marginTop: 2 },

  input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 10, padding: 11, fontSize: 13 },
  saveBtn: { backgroundColor: C.violetDark, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  saveBtnText: { color: C.onPrimary, fontWeight: "800", fontSize: 13 },

  rowCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: C.divider },
  name: { fontSize: 14, fontWeight: "800", color: C.ink0 },
  rowSub: { fontSize: 12, color: C.inkMuted, marginTop: 3 },
  cancelBtn: { backgroundColor: C.status.danger.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 10 },
  cancelText: { fontSize: 12, fontWeight: "800", color: C.status.danger.fg },

  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink3 },
  btnOutline: { borderWidth: 1, borderColor: C.primary, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: C.primary, fontWeight: "800", fontSize: 15 },
});
