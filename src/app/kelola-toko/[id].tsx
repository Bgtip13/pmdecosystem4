import IOSSpinner from "../../components/IOSSpinner";
import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toFriendlyError } from "../../lib/msg";
import { TOP_PAD } from "../../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const VIEW_ROLES = ["supervisor", "owner", "hr", "akunting", "field", "telemarketing"];

const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };
const SRC_LABEL: any = {
  sales_registered: "Dari sales",
  supervisor: "Diisi supervisor",
  approved: "Disetujui supervisor",
  unverified: "Belum diverifikasi",
};
const fmtDateTime = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "-";

// Konfirmasi yang jalan di HP (Alert) dan di web (window.confirm — Alert tidak
// melakukan apa-apa di peramban).
function confirmAsync(title: string, message: string, yesLabel: string): Promise<boolean> {
  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : false;
    void yesLabel;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Batal", style: "cancel", onPress: () => resolve(false) },
      { text: yesLabel, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export default function EditToko() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const viewer = useQuery(api.users.viewer) as any;
  const store = useQuery(api.stores.getStore, { storeId: id as any }) as any;
  const updateStore = useMutation(api.stores.updateStore);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pic, setPic] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [area, setArea] = useState("SOLO");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!store) return;
    const next = {
      name: store.name ?? "",
      phone: store.phone ?? "",
      pic: store.pic ?? "",
      address: store.address ?? "",
      lat: store.lat != null ? String(store.lat) : "",
      lng: store.lng != null ? String(store.lng) : "",
      area: store.area ?? "SOLO",
      status: store.status ?? "active",
    };
    setName(next.name);
    setPhone(next.phone);
    setPic(next.pic);
    setAddress(next.address);
    setLat(next.lat);
    setLng(next.lng);
    setArea(next.area);
    setStatus(next.status);
    setSnapshot(JSON.stringify(next));
  }, [store]);

  const role = viewer?.role;
  const canEdit = role === "supervisor";
  const allowed = VIEW_ROLES.includes(role);

  const current = useMemo(
    () => JSON.stringify({ name, phone, pic, address, lat, lng, area, status }),
    [name, phone, pic, address, lat, lng, area, status]
  );
  const dirty = snapshot !== "" && current !== snapshot;

  if (!store || !viewer) return <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>;
  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Akses khusus</Text>
        <TouchableOpacity style={styles.btnOutline} onPress={() => router.back()}>
          <Text style={styles.btnOutlineText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const doPatch = async (payload: any) => {
    await updateStore({
      storeId: id as any,
      name: name.trim() || store.name,
      phone,
      pic,
      address: address.trim() || store.address,
      lat: payload.lat,
      lng: payload.lng,
      area: area as any,
      status: payload.status,
    });
  };

  const onSave = async () => {
    const latV = lat.trim() === "" ? undefined : parseFloat(lat.replace(",", "."));
    const lngV = lng.trim() === "" ? undefined : parseFloat(lng.replace(",", "."));
    if ((latV === undefined) !== (lngV === undefined)) {
      setNotice({ tone: "err", text: "Isi latitude & longitude sekaligus, atau kosongkan keduanya." });
      return;
    }
    if (latV !== undefined && (isNaN(latV) || latV < -90 || latV > 90)) {
      setNotice({ tone: "err", text: "Latitude tidak valid (rentang -90 s.d. 90)." });
      return;
    }
    if (lngV !== undefined && (isNaN(lngV) || lngV < -180 || lngV > 180)) {
      setNotice({ tone: "err", text: "Longitude tidak valid (rentang -180 s.d. 180)." });
      return;
    }
    if (!name.trim()) { setNotice({ tone: "err", text: "Nama toko wajib diisi." }); return; }
    if (!address.trim()) { setNotice({ tone: "err", text: "Alamat wajib diisi." }); return; }

    setSaving(true);
    setNotice(null);
    try {
      await doPatch({ lat: latV, lng: lngV, status });
      setSnapshot(JSON.stringify({ name, phone, pic, address, lat, lng, area, status }));
      setNotice({ tone: "ok", text: "Perubahan tersimpan." });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setSaving(false);
    }
  };

  const quickToggle = async (next: string) => {
    const turningOff = next === "disabled";
    const ok = await confirmAsync(
      turningOff ? "Nonaktifkan Toko?" : "Aktifkan Toko?",
      turningOff
        ? `"${store.name}" tidak akan muncul di daftar kunjungan sales & tidak bisa di-check-in. Lanjutkan?`
        : `"${store.name}" akan aktif kembali dan muncul di daftar kunjungan sales. Lanjutkan?`,
      turningOff ? "Ya, Nonaktifkan" : "Ya, Aktifkan"
    );
    if (!ok) return;

    setSaving(true);
    setNotice(null);
    try {
      await doPatch({ lat: store.lat, lng: store.lng, status: next });
      setStatus(next);
      setSnapshot(JSON.stringify({ name, phone, pic, address, lat, lng, area, status: next }));
      setNotice({ tone: "ok", text: turningOff ? "Toko dinonaktifkan." : "Toko diaktifkan." });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setSaving(false);
    }
  };

  const hasLoc = lat.trim() !== "" && lng.trim() !== "";
  const openMaps = () => {
    const q = store.lat != null && store.lng != null ? `${store.lat},${store.lng}` : address.trim();
    if (!q) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    Linking.openURL(url).catch(() => setNotice({ tone: "err", text: "Tidak bisa membuka peta." }));
  };

  const inputStyle = [styles.input, !canEdit && styles.inputReadonly];

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{canEdit ? "Edit Toko" : "Detail Toko"}</Text>
        <Text style={styles.storeName} numberOfLines={2}>{store.name}</Text>
        <View style={styles.headChips}>
          <View style={[styles.chipTag, { backgroundColor: AREA_BG[store.area] ?? "#F2F4F7" }]}>
            <Text style={[styles.chipTagText, { color: AREA_TX[store.area] ?? GRAY }]}>{store.area}</Text>
          </View>
          <View style={[styles.chipTag, { backgroundColor: store.status === "active" ? "#DCFAE6" : "#F2F4F7" }]}>
            <Text style={[styles.chipTagText, { color: store.status === "active" ? GREEN : GRAY }]}>
              {store.status === "active" ? "Aktif" : "Nonaktif"}
            </Text>
          </View>
          <View style={[styles.chipTag, { backgroundColor: store.lat != null ? "#EFF8FF" : "#FFF7ED" }]}>
            <Text style={[styles.chipTagText, { color: store.lat != null ? "#175CD3" : "#B54708" }]}>
              {store.lat != null ? "Ada koordinat" : "Tanpa koordinat"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: canEdit ? 150 : 40 }} keyboardShouldPersistTaps="handled">
        {!canEdit ? (
          <View style={styles.viewBanner}>
            <Text style={styles.viewBannerText}>👀 Mode lihat — perubahan data toko hanya bisa dilakukan supervisor.</Text>
          </View>
        ) : store.status === "disabled" ? (
          <View style={styles.offBanner}>
            <Text style={styles.offBannerText}>Toko ini NONAKTIF — tidak muncul di daftar kunjungan sales.</Text>
          </View>
        ) : null}

        {notice ? (
          <View style={[styles.notice, notice.tone === "ok" ? styles.noticeOk : styles.noticeErr]}>
            <Text style={[styles.noticeText, { color: notice.tone === "ok" ? GREEN : RED }]}>{notice.text}</Text>
            <TouchableOpacity onPress={() => setNotice(null)} hitSlop={8}>
              <Text style={[styles.noticeClose, { color: notice.tone === "ok" ? GREEN : RED }]}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ===== Informasi toko ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informasi Toko</Text>

          <Text style={styles.label}>NAMA TOKO *</Text>
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Nama toko" editable={canEdit} />

          <Text style={styles.label}>AREA *</Text>
          {canEdit ? (
            <View style={styles.chipRow}>
              {AREAS.map((a) => {
                const on = area === a;
                return (
                  <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setArea(a)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.readValue}>{area || "-"}</Text>
          )}

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>NO HP</Text>
              <TextInput style={inputStyle} value={phone} onChangeText={setPhone} placeholder="No HP toko" keyboardType="phone-pad" editable={canEdit} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PIC</Text>
              <TextInput style={inputStyle} value={pic} onChangeText={setPic} placeholder="Nama PIC" editable={canEdit} />
            </View>
          </View>
        </View>

        {/* ===== Alamat & lokasi ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alamat & Lokasi</Text>

          <Text style={styles.label}>ALAMAT *</Text>
          <TextInput style={[inputStyle, styles.inputMultiline]} value={address} onChangeText={setAddress} placeholder="Alamat lengkap" multiline editable={canEdit} />

          <Text style={styles.label}>KOORDINAT (LATITUDE, LONGITUDE)</Text>
          {canEdit ? (
            <View style={styles.coordRow}>
              <TextInput style={[inputStyle, { flex: 1 }]} value={lat} onChangeText={setLat} placeholder="Lat, cth: -7.6000" keyboardType="numbers-and-punctuation" />
              <TextInput style={[inputStyle, { flex: 1 }]} value={lng} onChangeText={setLng} placeholder="Lng, cth: 110.8800" keyboardType="numbers-and-punctuation" />
            </View>
          ) : hasLoc ? (
            <Text style={styles.readValue}>{lat}, {lng}</Text>
          ) : (
            <Text style={styles.readEmpty}>Belum ada titik lokasi.</Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Sumber: {SRC_LABEL[store.latSource] ?? store.latSource ?? "-"}
            </Text>
            <TouchableOpacity style={styles.mapBtn} onPress={openMaps} disabled={!hasLoc && !address.trim()}>
              <Text style={styles.mapBtnText}>🗺️ Buka di Maps</Text>
            </TouchableOpacity>
          </View>
          {canEdit ? (
            <Text style={styles.hint}>
              Ambil titik dari Google Maps: tekan lama lokasi → salin angka “lat, lng”. Kosongkan dua-duanya
              kalau belum tahu.
            </Text>
          ) : null}

          <View style={styles.divider} />
          <View style={styles.metaGrid}>
            <Text style={styles.metaLabel}>Dibuat</Text>
            <Text style={styles.metaValue}>{fmtDateTime(store.createdAt)}</Text>
            <Text style={styles.metaLabel}>Diperbarui</Text>
            <Text style={styles.metaValue}>{store.updatedAt ? fmtDateTime(store.updatedAt) : "Belum pernah"}</Text>
          </View>
        </View>

        {/* ===== Status ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status Toko</Text>
          {canEdit ? (
            <>
              <View style={styles.chipRow}>
                {[["active", "Aktif"], ["disabled", "Nonaktif"]].map(([k, lbl]: any) => {
                  const on = status === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      style={[styles.chip, on && k === "active" && styles.chipActive, on && k === "disabled" && styles.chipDisable]}
                      onPress={() => setStatus(k)}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>{lbl}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.note}>
                {status === "disabled"
                  ? "Toko nonaktif tidak bisa di-check-in oleh sales dan tidak muncul di daftar kunjungan."
                  : "Toko aktif muncul di daftar kunjungan sales."}
              </Text>

              {status === "active" ? (
                <TouchableOpacity style={[styles.btnDanger, saving && { opacity: 0.6 }]} onPress={() => quickToggle("disabled")} disabled={saving}>
                  <Text style={styles.btnDangerText}>{saving ? "Menyimpan..." : "✕ Nonaktifkan Toko"}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.btnRestore, saving && { opacity: 0.6 }]} onPress={() => quickToggle("active")} disabled={saving}>
                  <Text style={styles.btnRestoreText}>{saving ? "Menyimpan..." : "✓ Aktifkan Toko"}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={[styles.readChip, { backgroundColor: status === "active" ? "#DCFAE6" : "#F2F4F7", alignSelf: "flex-start" }]}>
              <Text style={[styles.readChipText, { color: status === "active" ? GREEN : GRAY }]}>
                {status === "active" ? "✓ Aktif" : "Nonaktif"}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {canEdit ? (
        <View style={styles.footer}>
          <Text style={[styles.footerHint, { color: dirty ? "#B54708" : GRAY }]}>
            {dirty ? "Ada perubahan belum disimpan" : "Belum ada perubahan"}
          </Text>
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.btnGhost, saving && { opacity: 0.6 }]}
              onPress={() => router.back()}
              disabled={saving}
            >
              <Text style={styles.btnGhostText}>Kembali</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, (!dirty || saving) && { opacity: 0.5 }]}
              onPress={onSave}
              disabled={!dirty || saving}
            >
              <Text style={styles.btnText}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#FCFAFA" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
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
  backBtn: { alignSelf: "flex-start" },
  backText: { color: "#D92D20", fontSize: 15, fontWeight: "700" },
  title: { fontSize: 12, fontWeight: "800", color: RED, letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
  storeName: { fontSize: 20, fontWeight: "800", color: "#101828", letterSpacing: -0.2, marginTop: 2 },
  headChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chipTag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipTagText: { fontSize: 10.5, fontWeight: "800" },

  card: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#EEF0F3",
    padding: 16, marginBottom: 12,
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#111", letterSpacing: 0.2 },

  label: { fontSize: 11.5, fontWeight: "800", color: GRAY, marginTop: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 13, fontSize: 15, color: "#111" },
  inputReadonly: { backgroundColor: "#F9FAFB", color: "#475467" },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: 10 },
  coordRow: { flexDirection: "row", gap: 8 },

  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipDisable: { backgroundColor: "#475467", borderColor: "#475467" },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },

  readValue: { fontSize: 15, color: "#111", fontWeight: "600", paddingVertical: 4 },
  readEmpty: { fontSize: 13, color: GRAY, paddingVertical: 4, fontStyle: "italic" },
  readChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  readChipText: { fontSize: 12, fontWeight: "800" },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10 },
  metaText: { fontSize: 11.5, color: GRAY, fontWeight: "700", flexShrink: 1 },
  mapBtn: { backgroundColor: "#EFF8FF", borderWidth: 1, borderColor: "#B2DDFF", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  mapBtnText: { color: "#175CD3", fontSize: 12, fontWeight: "800" },
  hint: { fontSize: 11.5, color: GRAY, marginTop: 10, lineHeight: 17 },

  divider: { height: 1, backgroundColor: "#EEF0F3", marginTop: 14, marginBottom: 12 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 4 },
  metaLabel: { fontSize: 11.5, color: GRAY, width: 90 },
  metaValue: { fontSize: 11.5, color: "#344054", fontWeight: "700", flex: 1 },

  note: { fontSize: 12, color: GRAY, marginTop: 10, lineHeight: 17 },
  viewBanner: { backgroundColor: "#E0F2FE", borderRadius: 10, borderWidth: 1, borderColor: "#BAE6FD", padding: 12, marginBottom: 12 },
  viewBannerText: { color: "#026AA2", fontSize: 13, fontWeight: "700" },
  offBanner: { backgroundColor: "#FFF1F0", borderRadius: 10, borderWidth: 1, borderColor: "#FECDCA", padding: 12, marginBottom: 12 },
  offBannerText: { color: "#B42318", fontSize: 13, fontWeight: "700" },

  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 },
  noticeOk: { backgroundColor: "#F0FDF4", borderColor: "#ABEFC6" },
  noticeErr: { backgroundColor: "#FDF2F2", borderColor: "#F3D6D6" },
  noticeText: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  noticeClose: { fontSize: 14, fontWeight: "900" },

  btnDanger: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#FECDCA", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 18 },
  btnDangerText: { color: "#B42318", fontWeight: "800", fontSize: 14 },
  btnRestore: { backgroundColor: "#DCFAE6", borderWidth: 1, borderColor: "#ABEFC6", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 18 },
  btnRestoreText: { color: GREEN, fontWeight: "800", fontSize: 14 },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#F0F0F0",
  },
  footerHint: { fontSize: 11.5, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  footerRow: { flexDirection: "row", gap: 10 },
  btnGhost: { flex: 1, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 14, padding: 16, alignItems: "center", backgroundColor: "#fff" },
  btnGhostText: { color: "#344054", fontSize: 15, fontWeight: "800" },
  btnPrimary: { flex: 2, backgroundColor: RED, borderRadius: 14, padding: 16, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  btnOutline: { borderWidth: 1, borderColor: RED, borderRadius: 12, padding: 14, paddingHorizontal: 30, marginTop: 14 },
  btnOutlineText: { color: RED, fontWeight: "800", fontSize: 15 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333", textAlign: "center" },
});
