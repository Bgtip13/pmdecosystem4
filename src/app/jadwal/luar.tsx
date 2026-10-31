import IOSSpinner from "../../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../../components/AppIcon";
import DatePickerModal from "../../components/DatePickerModal";
import { theme } from "../../lib/theme";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = "#067647";

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayKeyWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function fmtShort(dk?: string | null) {
  if (!dk) return "-";
  const [, m, d] = dk.split("-").map(Number);
  return `${pad2(d)} ${BULAN_SHORT[m - 1]}`;
}

function fmtTanggal(dk: string) {
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dt.getUTCDay()];
  return `${hari}, ${pad2(d)} ${BULAN_SHORT[m - 1]} ${y}`;
}

// ==========================================================================
// TAMBAH TOKO DI LUAR JADWAL
//
// HANYA MENAMBAH baris ke jadwal — tidak memaksa check-in. Dulu layar ini
// langsung memulai kunjungan (butuh GPS & radius toko), sehingga sales tidak
// bisa menyiapkan rencana kunjungan tambahan. Check-in sekarang dilakukan
// kapan saja dari kartu SPK toko tersebut.
// ==========================================================================
export default function TambahLuarJadwal() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [dk, setDk] = useState(todayKeyWIB());
  const [calOpen, setCalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const addAdHoc = useMutation(api.jadwal.addAdHocSchedule);

  // tunggu 500 ms setelah berhenti mengetik, baru cari ke server
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 500);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery(
    api.jadwal.searchStores,
    qDeb.length >= 2 ? { q: qDeb, limit: 20 } : "skip"
  ) as any;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/jadwal" as any);
  };

  const doAdd = async (store: any) => {
    setBusyId(store._id);
    try {
      const res: any = await addAdHoc({
        storeId: store._id,
        dateKey: dk,
      });
      Alert.alert(
        "Toko ditambahkan ✅",
        `"${store.name}" masuk ke jadwal ${fmtTanggal(res?.dateKey ?? dk)}.\n\nCheck-in bisa dilakukan nanti dari kartu SPK toko ini — tidak harus sekarang.`,
        [
          { text: "Nanti", style: "cancel" },
          { text: "Buka kartu", onPress: () => router.push(`/jadwal/${res.scheduleId}?dk=${res.dateKey}` as any) },
        ]
      );
    } catch (e: any) {
      Alert.alert("Gagal menambahkan", toFriendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  const onPick = (store: any) => {
    if (store.jadwalBulanIni) {
      Alert.alert(
        "Sudah ada di jadwal",
        `"${store.name}" sudah dijadwalkan pada ${store.jadwalBulanIni.tanggal}. Aturannya 1 toko 1 baris per bulan — kalau mau pindah, buka kartu SPK-nya lalu ajukan geser tanggal.`,
        [
          { text: "Tutup", style: "cancel" },
          {
            text: "Buka kartu",
            onPress: () => router.push(`/jadwal/${store.jadwalBulanIni.scheduleId}?dk=${store.jadwalBulanIni.dateKey}` as any),
          },
        ]
      );
      return;
    }
    if (store.sudahDikunjungi) {
      Alert.alert(
        "Sudah dikunjungi bulan ini",
        `"${store.name}" sudah dikunjungi ${store.kunjunganBulanIni}x bulan ini. Aturannya 1 toko 1x per bulan.`
      );
      return;
    }
    Alert.alert(
      "Tambah ke jadwal?",
      `"${store.name}" akan ditambahkan ke jadwal ${fmtTanggal(dk)}.\n\nBelum check-in — check-in dilakukan nanti dari kartu SPK.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Tambahkan", onPress: () => doAdd(store) },
      ]
    );
  };

  const renderItem = ({ item }: any) => {
    const busy = busyId === item._id;
    const blocked = !!item.jadwalBulanIni || item.sudahDikunjungi;
    return (
      <TouchableOpacity
        style={[styles.card, blocked && { opacity: 0.6 }]}
        activeOpacity={0.85}
        disabled={busy}
        onPress={() => onPick(item)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: "#F2F4F7" }]}>
              <Text style={[styles.badgeText, { color: GRAY }]}>{item.area}</Text>
            </View>
            {item.jadwalBulanIni ? (
              <View style={[styles.badge, { backgroundColor: "#EFF8FF", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: "#175CD3" }]}>
                  Sudah di jadwal {fmtShort(item.jadwalBulanIni.dateKey)}
                </Text>
              </View>
            ) : null}
            {item.sudahDikunjungi ? (
              <View style={[styles.badge, { backgroundColor: "#FEE4E2", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: "#B42318" }]}>sudah dikunjungi</Text>
              </View>
            ) : null}
            {!item.lat ? (
              <View style={[styles.badge, { backgroundColor: "#FEF0C7", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: "#B54708" }]}>tanpa koordinat</Text>
              </View>
            ) : null}
          </View>
          {item.address ? <Text style={styles.addr} numberOfLines={2}>{item.address}</Text> : null}
        </View>
        {busy ? (
          <IOSSpinner size="small" color={RED} />
        ) : blocked ? (
          <Text style={styles.blockedText}>{item.jadwalBulanIni ? "Terjadwal" : "Selesai"}</Text>
        ) : (
          <View style={styles.addChip}>
            <AppIcon name="plus" size={12} color={GREEN} style={{ marginRight: 3 }} />
            <Text style={styles.addChipText}>Tambah</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={back}><Text style={styles.backText}>‹ Kembali</Text></TouchableOpacity>
        <Text style={styles.title}>Tambah Toko di Luar Jadwal</Text>
        <Text style={styles.meta}>
          Toko ditambahkan sebagai rencana kunjungan. Check-in tidak wajib sekarang — lakukan nanti dari kartu SPK.
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setCalOpen(true)} activeOpacity={0.85}>
          <AppIcon name="calendar" size={15} color={RED} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>Tanggal tujuan</Text>
            <Text style={styles.dateValue}>{fmtTanggal(dk)}</Text>
          </View>
          <Text style={styles.dateHint}>Ubah</Text>
        </TouchableOpacity>

        <View style={styles.searchBox}>
          <AppIcon name="search" size={16} color={GRAY} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama toko (min. 2 huruf)…"
            placeholderTextColor="#98A2B3"
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {qDeb.length < 2 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Cari toko yang mau ditambahkan</Text>
          <Text style={styles.emptySub}>
            Ketik minimal 2 huruf. Toko diambil dari master Kelola Toko sesuai area kamu. Belum punya tokonya?
            Daftarkan dulu lewat menu Toko Baru.
          </Text>
          <TouchableOpacity style={styles.newStoreBtn} onPress={() => router.push("/toko-baru" as any)}>
            <AppIcon name="plus" size={14} color={RED} style={{ marginRight: 6 }} />
            <Text style={styles.newStoreText}>Daftarkan toko baru</Text>
          </TouchableOpacity>
        </View>
      ) : results === undefined ? (
        <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>
      ) : (results as any[]).length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tidak ada toko yang cocok</Text>
          <Text style={styles.emptySub}>Kalau tokonya baru, daftarkan dulu lewat tombol di bawah.</Text>
          <TouchableOpacity style={styles.newStoreBtn} onPress={() => router.push("/toko-baru" as any)}>
            <AppIcon name="plus" size={14} color={RED} style={{ marginRight: 6 }} />
            <Text style={styles.newStoreText}>Daftarkan toko baru</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results as any[]}
          keyExtractor={(it: any) => it._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <DatePickerModal
        visible={calOpen}
        value={dk}
        minDate={todayKeyWIB()}
        onClose={() => setCalOpen(false)}
        onPick={(d: string) => { setDk(d); setCalOpen(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  topbar: {
    backgroundColor: "#FFF7F5",
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
  backText: { color: "#D92D20", fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: "#101828", letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 12, color: "#667085", marginTop: 4, lineHeight: 18 },

  controls: { paddingHorizontal: 16, paddingTop: 12 },
  dateBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  dateLabel: { fontSize: 10, fontWeight: "800", color: GRAY, letterSpacing: 0.4 },
  dateValue: { fontSize: 13.5, fontWeight: "800", color: C.ink, marginTop: 1 },
  dateHint: { fontSize: 10, fontWeight: "800", color: RED, backgroundColor: "#FDE8E6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },

  searchBox: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: R.md,
    paddingHorizontal: 12, marginTop: 10,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: C.ink },

  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  name: { fontSize: 15, fontWeight: "800", color: C.ink },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 5 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  addr: { fontSize: 11, color: GRAY, marginTop: 4, lineHeight: 16 },
  addChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF3", borderWidth: 1, borderColor: "#ABEFC6", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8 },
  addChipText: { fontSize: 10.5, fontWeight: "800", color: GREEN },
  blockedText: { fontSize: 10.5, fontWeight: "800", color: GRAY, marginLeft: 8 },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center" },
  emptySub: { fontSize: 13, color: GRAY, lineHeight: 19, textAlign: "center", marginTop: 8 },
  newStoreBtn: { flexDirection: "row", alignItems: "center", marginTop: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#FECDCA", borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 10 },
  newStoreText: { fontSize: 12.5, fontWeight: "800", color: "#B42318" },
});
