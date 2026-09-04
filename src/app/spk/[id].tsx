import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Alert, Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { api } from "../../../convex/_generated/api";
import { toFriendlyError } from "../../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function FollowUp() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const list = useQuery(api.piutang.listActive, {}) as any;
  const completeTask = useMutation(api.piutang.completeTask);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const task = (list ?? []).find((t: any) => t._id === id);

  const [hasil, setHasil] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [shot, setShot] = useState<{ uri: string; mime: string } | null>(null);
  const [shotId, setShotId] = useState("");
  const [busy, setBusy] = useState(false);

  // kalender janji bayar
  const [showCal, setShowCal] = useState(false);
  const [calCursor, setCalCursor] = useState(new Date());

  useEffect(() => {
    if (viewer?.role === "supervisor") return;
    // telemarketing: data area sendiri
  }, [viewer]);

  if (!task) {
    return (
      <View style={styles.center}>
        {list === undefined ? <ActivityIndicator size="large" color={RED} /> : (
          <>
            <Text style={styles.emptyTitle}>Tugas sudah dikerjakan / tidak ditemukan</Text>
            <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()}>
              <Text style={styles.btnOutlineText}>Kembali</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + n.toLocaleString("id-ID"));

  const takeShot = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Izin Kamera", "Aktifkan izin kamera untuk screenshot WA.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setShot({ uri: asset.uri, mime: asset.mimeType ?? "image/jpeg" });
  };

  const uploadShot = async (): Promise<string | undefined> => {
    if (!shot) return undefined;
    const url = await generateUploadUrl();
    const file = new File(shot.uri);
    const up = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": shot.mime },
      body: file,
    });
    if (!up.ok) throw new Error("Upload screenshot gagal (" + up.status + ").");
    const json: any = await up.json();
    return json.storageId;
  };

  const onSave = async () => {
    if (!hasil) { Alert.alert("Hasil", "Pilih hasil follow-up dulu."); return; }
    if (hasil === "janji_bayar" && !promiseDate) { Alert.alert("Janji Bayar", "Pilih tanggal janji bayar."); return; }
    if ((hasil === "lunas" || hasil === "cicil") && !payMethod) { Alert.alert("Metode", "Pilih Tunai / Transfer."); return; }
    setBusy(true);
    try {
      let screenshot: string | undefined;
      if (shot && !shotId) {
        screenshot = await uploadShot();
        setShotId(screenshot ?? "");
      }
      await completeTask({
        taskId: id as any,
        hasil: hasil as any,
        promiseDate: hasil === "janji_bayar" ? promiseDate : undefined,
        payMethod: (hasil === "lunas" || hasil === "cicil") ? (payMethod as any) : undefined,
        notes: notes || undefined,
        screenshot: screenshot || shotId || undefined,
      });
      Alert.alert("Selesai ✅", "Follow-up tersimpan & masuk riwayat.");
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  const todayKey = keyOf(new Date());

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Follow-up Piutang</Text>
        <Text style={styles.meta}>{task.storeName} • {task.area}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.summaryCard}>
          <Text style={styles.sumLabel}>SISA TAGIHAN</Text>
          <Text style={styles.sumBig}>{rupiah(task.piutang)}</Text>
          <Text style={styles.sumSub}>Total {rupiah(task.total)} • Sudah cicil {rupiah(task.cicil)}{task.usia != null ? ` • Usia ${task.usia} hari` : ""}</Text>
        </View>

        <Text style={styles.label}>HASIL FOLLOW-UP *</Text>
        <View style={styles.chipRow}>
          {[["janji_bayar", "Janji Bayar"], ["lunas", "Lunas"], ["cicil", "Cicil"]].map(([k, lbl]: any) => {
            const on = hasil === k;
            return (
              <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setHasil(k)}>
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {hasil === "janji_bayar" ? (
          <>
            <Text style={styles.label}>TANGGAL JANJI BAYAR *</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowCal(!showCal)}>
              <Text style={[styles.dateText, !promiseDate && { color: GRAY }]}>
                {promiseDate ? "📅 " + promiseDate : "📅 Pilih tanggal"}
              </Text>
            </TouchableOpacity>
            {showCal ? (
              <View style={styles.calBox}>
                <View style={styles.calHead}>
                  <TouchableOpacity onPress={() => setCalCursor(new Date(y, m - 1, 1))}>
                    <Text style={styles.calNav}>◀</Text>
                  </TouchableOpacity>
                  <Text style={styles.calTitle}>{MONTHS[m]} {y}</Text>
                  <TouchableOpacity onPress={() => setCalCursor(new Date(y, m + 1, 1))}>
                    <Text style={styles.calNav}>▶</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.calDowRow}>
                  {DOW.map((d) => <Text key={d} style={styles.calDow}>{d}</Text>)}
                </View>
                <View style={styles.calGrid}>
                  {cells.map((c, i) => {
                    if (c === null) return <View key={i} style={styles.calCell} />;
                    const d = new Date(y, m, c);
                    const k = keyOf(d);
                    const isSel = k === promiseDate;
                    const isPast = k < todayKey;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[styles.calCell, isSel && styles.calCellSel]}
                        onPress={() => { setPromiseDate(k); setShowCal(false); }}
                        disabled={isPast}
                      >
                        <Text style={[styles.calDay, isSel && styles.calDaySel, isPast && styles.calDayPast]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {hasil === "lunas" || hasil === "cicil" ? (
          <>
            <Text style={styles.label}>METODE BAYAR *</Text>
            <View style={styles.chipRow}>
              {[["tunai", "Tunai"], ["transfer", "Transfer"]].map(([k, lbl]: any) => {
                const on = payMethod === k;
                return (
                  <TouchableOpacity key={k} style={[styles.chip, on && styles.chipActive]} onPress={() => setPayMethod(k)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{lbl}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>CATATAN</Text>
        <TextInput style={[styles.input, styles.inputMultiline]} value={notes} onChangeText={setNotes} placeholder="Catatan singkat hasil follow-up" multiline />

        <Text style={styles.label}>SCREENSHOT WHATSAPP (opsional)</Text>
        {shot ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Image source={{ uri: shot.uri }} style={styles.shotThumb} />
            <TouchableOpacity style={styles.shotRemove} onPress={() => { setShot(null); setShotId(""); }}>
              <Text style={styles.shotRemoveText}>✕ Hapus</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity style={styles.shotBtn} onPress={takeShot}>
          <Text style={styles.shotBtnText}>📷 Ambil Screenshot WA</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={onSave} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Menyimpan..." : "Selesai Follow-up"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  topbar: { backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  backBtn: { alignSelf: "flex-start" },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  label: { fontSize: 12, fontWeight: "800", color: GRAY, marginTop: 18, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  summaryCard: { backgroundColor: "#FFF1F0", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#FECDCA" },
  sumLabel: { fontSize: 11, fontWeight: "800", color: "#B42318", textTransform: "uppercase", letterSpacing: 0.5 },
  sumBig: { fontSize: 24, fontWeight: "900", color: RED, marginTop: 2 },
  sumSub: { fontSize: 12, color: "#B54708", marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  dateBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14 },
  dateText: { fontSize: 15, color: "#111", fontWeight: "700" },
  calBox: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#EEF0F3", padding: 12, marginTop: 8 },
  calHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, marginBottom: 8 },
  calNav: { fontSize: 16, color: RED, fontWeight: "800", padding: 6 },
  calTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  calDowRow: { flexDirection: "row" },
  calDow: { width: "14.28%", textAlign: "center", fontSize: 10, color: GRAY, fontWeight: "700", paddingVertical: 4 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", paddingVertical: 6 },
  calCellSel: { backgroundColor: RED, borderRadius: 18, width: 36, height: 36, justifyContent: "center", alignSelf: "center", alignItems: "center" },
  calDay: { fontSize: 13, color: "#111" },
  calDaySel: { color: "#fff", fontWeight: "800" },
  calDayPast: { color: "#D0D5DD" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 13, fontSize: 15, color: "#111" },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  shotThumb: { width: 84, height: 84, borderRadius: 12 },
  shotRemove: { marginLeft: 12 },
  shotRemoveText: { color: RED, fontWeight: "700", fontSize: 13 },
  shotBtn: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 12, padding: 14, alignItems: "center" },
  shotBtnText: { color: "#912018", fontWeight: "800", fontSize: 14 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0" },
  btnPrimary: { backgroundColor: RED, borderRadius: 14, padding: 17, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333", textAlign: "center" },
});
