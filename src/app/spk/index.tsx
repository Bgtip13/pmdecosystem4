import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  FlatList, ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import TabBar from "../../components/TabBar";
import { toFriendlyError } from "../../lib/msg";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const BLUE = "#1D4ED8";
const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };
const ROLE_LABEL: any = { field: "Sales Lapangan", telemarketing: "Telemarketing", supervisor: "Supervisor" };

const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + n.toLocaleString("id-ID"));
const fmtTgl = (d: Date) =>
  d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";

export default function Spk() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const sync = useAction(api.piutang.manualSync);

  const [sec, setSec] = useState("sales");
  const [areaChip, setAreaChip] = useState("ALL");
  const [q, setQ] = useState("");
  const [day, setDay] = useState(() => new Date());
  const [syncing, setSyncing] = useState(false);

  const role = viewer?.role;
  const isField = role === "field";
  const isTele = role === "telemarketing";
  const isSuper = role === "supervisor";
  const usesPiutang = isTele || isSuper;

  const SEGS: any[] = [];
  if (role !== "telemarketing") SEGS.push({ key: "sales", label: "SPK Sales" });
  if (role !== "field") SEGS.push({ key: "admin", label: "SPK Admin" });
  if (role !== "field") SEGS.push({ key: "done", label: "Riwayat Follow-up" });
  SEGS.push({ key: "riwayat", label: "Riwayat Kunjungan" });
  const effSec = SEGS.some((s) => s.key === sec) ? sec : SEGS[0]?.key ?? "sales";

  const showAreaFilter = isSuper && (effSec === "sales" || effSec === "admin" || effSec === "done");

  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 86400000 - 1;
  const isTodaySel = day.toDateString() === new Date().toDateString();

  const storeArea = viewer
    ? { area: isSuper ? (areaChip === "ALL" ? undefined : (areaChip as any)) : viewer.area }
    : "skip";
  const stores = useQuery(api.stores.listStores, storeArea as any) as any;

  const piutangArgs = viewer && usesPiutang
    ? (isSuper && areaChip !== "ALL" ? { area: areaChip as any } : {})
    : "skip";
  const active = useQuery(api.piutang.listActive, piutangArgs as any) as any;
  const done = useQuery(api.piutang.listDone, piutangArgs as any) as any;

  const histArgs = effSec === "riwayat" ? { from: dayStart, to: dayEnd } : "skip";
  const hist = useQuery(api.visits.listHistory, histArgs as any) as any;

  if (!viewer) {
    return <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>;
  }

  const areaLabel = viewer.area ?? "Semua Area";
  const isTodayStr = (d: string) => d === new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const anyToday = (done ?? []).some((it: any) => it.task.day && isTodayStr(it.task.day));
  const count = active === undefined ? null : active.length;

  const onSync = async () => {
    setSyncing(true);
    try {
      const r: any = await sync();
      Alert.alert("Selesai ✅", `Data ditarik: ${r?.inserted ?? 0} baru, ${r?.updated ?? 0} diperbarui.`);
    } catch (e: any) {
      Alert.alert("Gagal", toFriendlyError(e));
    } finally {
      setSyncing(false);
    }
  };

  const shiftDay = (n: number) =>
    setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));

  const filtered = (stores ?? []).filter((s: any) => {
    const t = q.toLowerCase();
    return s.name.toLowerCase().includes(t) || (s.address || "").toLowerCase().includes(t);
  });

  // ===== Kartu SPK Sales (daftar toko) =====
  const renderSales = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/store/${item._id}`)}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {isSuper && item.area ? (
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.area] ?? "#F2F4F7" }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[item.area] ?? GRAY }]}>{item.area}</Text>
            </View>
          ) : null}
        </View>
        {item.address ? <Text style={styles.cardAddr} numberOfLines={2}>{item.address}</Text> : null}
        <Text style={[styles.locBadge, item.lat ? styles.locOk : styles.locNo]}>
          {item.lat ? "📍 Ada koordinat" : "📍 Belum ada koordinat"} • Ketuk untuk check-in →
        </Text>
      </View>
    </TouchableOpacity>
  );

  // ===== Kartu SPK Admin (piutang belum dikerjakan) =====
  const renderAdmin = ({ item }: any) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/spk/${item._id}`)}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.cardName} numberOfLines={1}>{item.storeName}</Text>
          {isSuper ? (
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.area] ?? "#F2F4F7" }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[item.area] ?? GRAY }]}>{item.area}</Text>
            </View>
          ) : null}
          {item.usia != null ? (
            <View style={[styles.usiaChip, { backgroundColor: item.usia >= 90 ? "#FEE4E2" : "#F2F4F7" }]}>
              <Text style={[styles.usiaText, { color: item.usia >= 90 ? RED : GRAY }]}>{item.usia} hari</Text>
            </View>
          ) : null}
        </View>
        {item.tanggal ? <Text style={styles.cardSub}>Tgl tagihan: {item.tanggal}</Text> : null}
        <Text style={styles.cardSub2}>Total {rupiah(item.total)} • Cicil {rupiah(item.cicil)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.piutang}>{rupiah(item.piutang)}</Text>
        <Text style={styles.piutangLabel}>sisa tagihan</Text>
      </View>
    </TouchableOpacity>
  );

  // ===== Kartu Riwayat Follow-up =====
  const HASIL_LABEL: any = { janji_bayar: "Janji bayar", lunas: "Lunas", cicil: "Cicil" };
  const HASIL_BG: any = { janji_bayar: "#FEF0C7", lunas: "#DCFAE6", cicil: "#E0F2FE" };
  const HASIL_TX: any = { janji_bayar: "#B54708", lunas: "#067647", cicil: "#026AA2" };
  const renderDone = ({ item }: any) => {
    const t = item.task;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/spk-detail/${t._id}`)}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.cardName} numberOfLines={1}>{t.storeName}</Text>
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[t.area] ?? "#F2F4F7" }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[t.area] ?? GRAY }]}>{t.area}</Text>
            </View>
          </View>
          <View style={styles.hasilRow}>
            <View style={[styles.hasilChip, { backgroundColor: HASIL_BG[t.hasil] ?? "#F2F4F7" }]}>
              <Text style={[styles.hasilText, { color: HASIL_TX[t.hasil] ?? GRAY }]}>
                {HASIL_LABEL[t.hasil] ?? t.hasil}
                {t.hasil === "janji_bayar" && t.promiseDate ? " • " + t.promiseDate : ""}
                {t.payMethod ? " • " + t.payMethod : ""}
              </Text>
            </View>
          </View>
          {t.notes ? <Text style={styles.cardSub}>📝 {t.notes}</Text> : null}
          <Text style={styles.doneBy}>
            ✓ {item.salesName} • {t.doneAt ? new Date(t.doneAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ===== Kartu Riwayat Kunjungan =====
  const renderHist = ({ item }: any) => {
    const v = item.visit;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/visit-detail/${v._id}`)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>{item.store?.name ?? "Toko terhapus"}</Text>
          {(isTele || isSuper) && item.salesName ? (
            <Text style={styles.cardSub}>👤 {item.salesName}{item.store?.area ? ` • ${item.store.area}` : ""}</Text>
          ) : null}
          <Text style={styles.cardSub2}>
            🕐 {fmtTime(v.checkinAt)} → {v.checkoutAt ? fmtTime(v.checkoutAt) : "-"} • {v.durationMin ?? 0} mnt
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const AreaChipRow = (
    <View style={styles.chipRow}>
      {["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => {
        const on = areaChip === a;
        return (
          <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setAreaChip(a)}>
            <Text style={[styles.chipText, on && styles.chipTextActive]}>{a === "ALL" ? "Semua" : a}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>PMD Ecosystem 4.0</Text>
            <Text style={styles.title}>SPK</Text>
            <Text style={styles.meta}>{ROLE_LABEL[role] ?? role} • {areaLabel}</Text>
          </View>
          {isField || isSuper ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/toko-baru")}>
              <Text style={styles.addBtnText}>+ Toko</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Segmen */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segRow}>
          {SEGS.map((s) => {
            const on = effSec === s.key;
            return (
              <TouchableOpacity key={s.key} style={[styles.seg, on && styles.segActive]} onPress={() => setSec(s.key)}>
                <Text style={[styles.segText, on && styles.segTextActive]}>
                  {s.label}
                  {s.key === "admin" && count !== null && count > 0 ? ` (${count})` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {showAreaFilter ? AreaChipRow : null}
      </View>

      {/* ===== BODY ===== */}
      {effSec === "sales" ? (
        stores === undefined ? (
          <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
        ) : (
          <>
            <View style={styles.searchBox}>
              <TextInput style={styles.searchInput} placeholder="Cari nama / alamat toko..."
                value={q} onChangeText={setQ} autoCapitalize="none" />
            </View>
            <Text style={styles.count}>{`${filtered.length} toko`}</Text>
            {filtered.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Tidak ada toko</Text>
                <Text style={styles.meta}>Coba kata kunci lain.</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(s: any) => s._id}
                renderItem={renderSales}
                contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
              />
            )}
          </>
        )
      ) : null}

      {effSec === "admin" ? (
        active === undefined ? (
          <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
        ) : (
          <FlatList
            data={active}
            keyExtractor={(t: any) => t._id}
            renderItem={renderAdmin}
            contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
            ListHeaderComponent={
              <>
                {isSuper ? (
                  <View style={styles.syncBox}>
                    <TouchableOpacity style={[styles.syncBtn, syncing && { opacity: 0.6 }]} onPress={onSync} disabled={syncing}>
                      <Text style={styles.syncBtnText}>{syncing ? "Menarik data..." : "🔄 Tarik Data dari Google Sheets"}</Text>
                    </TouchableOpacity>
                    <Text style={styles.cronNote}>Cron otomatis tiap 04:00 WIB • tombol ini untuk tarik manual</Text>
                  </View>
                ) : null}
                {count !== null && count > 0 ? (
                  <View style={styles.alertBanner}>
                    <Text style={styles.alertText}>⚠ Pengingat: {count} toko belum dikerjakan hari ini. Segera follow-up!</Text>
                  </View>
                ) : null}
                {active.length === 0 ? (
                  <View style={[styles.center, { paddingVertical: 40 }]}>
                    <Text style={styles.emptyTitle}>Tidak ada tugas hari ini 🎉</Text>
                    {isSuper ? <Text style={styles.meta}>Tekan "Tarik Data" untuk mengambil daftar piutang terbaru.</Text> : null}
                  </View>
                ) : null}
              </>
            }
          />
        )
      ) : null}

      {effSec === "done" ? (
        done === undefined ? (
          <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
        ) : (
          <FlatList
            data={done}
            keyExtractor={(it: any) => it.task._id}
            renderItem={renderDone}
            contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
            ListHeaderComponent={
              isTodaySel && anyToday ? (
                <View style={styles.okBanner}>
                  <Text style={styles.okText}>✅ Ada yang sudah dikerjakan hari ini. Kerja bagus!</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={[styles.center, { paddingVertical: 40 }]}>
                <Text style={styles.emptyTitle}>Belum ada riwayat follow-up</Text>
              </View>
            }
          />
        )
      ) : null}

      {effSec === "riwayat" ? (
        <>
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>‹</Text></TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, alignItems: "center" }} onPress={() => shiftDay(0)}>
              <Text style={styles.dateLabel}>{isTodaySel ? "Hari Ini" : fmtTgl(day)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shiftDay(1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>›</Text></TouchableOpacity>
          </View>
          {hist === undefined ? (
            <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
          ) : hist.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Belum ada kunjungan</Text>
              <Text style={styles.meta}>Tidak ada kunjungan selesai pada tanggal ini.</Text>
            </View>
          ) : (
            <FlatList
              data={hist}
              keyExtractor={(it: any) => it.visit._id}
              renderItem={renderHist}
              contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
            />
          )}
        </>
      ) : null}

      <TabBar active="spk" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  screen: { flex: 1, backgroundColor: "#F8F9FB" },
  topbar: { backgroundColor: "#fff", paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  brand: { fontSize: 12, fontWeight: "800", color: RED },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 2 },
  meta: { fontSize: 12, color: GRAY, marginTop: 2 },
  addBtn: { backgroundColor: RED, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  segRow: { paddingTop: 10, paddingBottom: 4 },
  seg: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: "#EEF0F3" },
  segActive: { backgroundColor: RED },
  segText: { fontSize: 13, fontWeight: "800", color: GRAY },
  segTextActive: { color: "#fff" },
  chipRow: { flexDirection: "row", marginTop: 8 },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, marginRight: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipText: { fontSize: 12, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  searchBox: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 12, padding: 11, fontSize: 15 },
  count: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, color: GRAY, fontSize: 13, fontWeight: "600" },
  card: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  cardName: { fontSize: 15, fontWeight: "800", color: "#111", marginRight: 6, flexShrink: 1 },
  cardAddr: { fontSize: 13, color: GRAY, marginTop: 6, lineHeight: 18 },
  locBadge: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  locOk: { color: "#067647" },
  locNo: { color: "#B54708" },
  areaChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 },
  areaChipText: { fontSize: 10, fontWeight: "800" },
  usiaChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  usiaText: { fontSize: 10, fontWeight: "800" },
  cardSub: { fontSize: 12, color: GRAY, marginTop: 5 },
  cardSub2: { fontSize: 12, color: "#475467", marginTop: 2, fontWeight: "600" },
  piutang: { fontSize: 15, fontWeight: "900", color: RED },
  piutangLabel: { fontSize: 10, color: GRAY, marginTop: 1 },
  hasilRow: { flexDirection: "row", marginTop: 6, flexWrap: "wrap" },
  hasilChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginTop: 2 },
  hasilText: { fontSize: 11, fontWeight: "800" },
  doneBy: { fontSize: 11, color: GRAY, marginTop: 6, fontWeight: "600" },
  syncBox: { marginBottom: 4 },
  syncBtn: { backgroundColor: GREEN, borderRadius: 10, padding: 12, alignItems: "center", marginTop: 4 },
  syncBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cronNote: { fontSize: 11, color: GRAY, marginTop: 6 },
  alertBanner: { backgroundColor: "#FFF1F0", borderRadius: 10, borderWidth: 1, borderColor: "#FECDCA", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  alertText: { color: "#B42318", fontSize: 13, fontWeight: "700" },
  okBanner: { backgroundColor: "#DCFAE6", borderRadius: 10, borderWidth: 1, borderColor: "#ABEFC6", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  okText: { color: "#067647", fontSize: 13, fontWeight: "700" },
  dateNav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  dateArrow: { paddingHorizontal: 16, paddingVertical: 4 },
  dateArrowText: { fontSize: 26, color: RED, fontWeight: "800" },
  dateLabel: { fontSize: 15, fontWeight: "800", color: "#111", textAlign: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333", textAlign: "center" },
});
