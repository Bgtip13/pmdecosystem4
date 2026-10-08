import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { api } from "../../convex/_generated/api";
import { TOP_PAD } from "../lib/layout";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const BLUE = "#1D4ED8";

const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const VIEW_ROLES = ["supervisor", "owner", "field", "telemarketing"];

// ===== Helper CSV =====
const esc = (v: any) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const stripBom = (t: string) => t.replace(/^\uFEFF/, "");
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQ = false;
  const s = stripBom(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}
function parseLatLng(raw: string): { lat?: number; lng?: number } {
  const t = (raw || "").trim();
  if (!t) return {};
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) return {};
  const lat = parseFloat(parts[0].replace(",", "."));
  const lng = parseFloat(parts[1].replace(",", "."));
  if (isNaN(lat) || isNaN(lng)) return {};
  return { lat, lng };
}

export default function KelolaToko() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const bulkImport = useMutation(api.stores.bulkImport);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [area, setArea] = useState("ALL");
  const [statusF, setStatusF] = useState<"ALL" | "active" | "disabled">("ALL"); // ← BARU
  const [importBusy, setImportBusy] = useState(false);
  const [importProg, setImportProg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const role = viewer?.role;
  const isManager = role === "supervisor";
  const allowed = VIEW_ROLES.includes(role);
  const showAreaChips = role === "supervisor" || role === "owner";

  const rows = useQuery(api.stores.listManageStores, {
    ...(debounced ? { q: debounced } : {}),
    ...(showAreaChips && area !== "ALL" ? { area: area as any } : {}),
  }) as any;

  // ← BARU: filter status + ringkasan, semuanya dihitung di HP (tanpa query baru)
  const list = (rows ?? []) as any[];
  const shownRows = list.filter((s: any) => statusF === "ALL" || s.status === statusF);
  const countOf = (k: "ALL" | "active" | "disabled") =>
    k === "ALL" ? list.length : list.filter((s: any) => s.status === k).length;
  const noCoord = shownRows.filter((s: any) => s.lat == null).length;

  const downloadTemplate = async () => {
    try {
      const lines = [
        ["Nama", "Alamat", "Area", "No HP", "PIC", "Latlong"].join(","),
        ['Toko Contoh 1,Jl. Malioboro 12,SOLO,081234567890,Bu Sari,"-7.7821, 110.3601"'],
        ["Toko Contoh 2,,DIY,,,"],
      ].join("\r\n");
      const csv = "\uFEFF" + lines;
      const file = new File(Paths.cache, "template-import-toko.csv");
      file.create({ overwrite: true });
      file.write(csv);
      if (!(await Sharing.isAvailableAsync())) throw new Error("Berbagi file tidak tersedia di perangkat ini.");
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Template Import Toko",
        UTI: "public.comma-separated-values-text",
      });
    } catch (e: any) {
      Alert.alert("Gagal", e?.message ?? "Coba lagi.");
    }
  };

  const doImport = async () => {
    if (importBusy) return;
    setImportBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const file = new File(res.assets[0].uri);
      const text = await file.text();
      const grid = parseCsv(text);
      if (grid.length < 2) throw new Error("File kosong / tidak ada baris data.");

      const stores: any[] = [];
      let bad = 0;
      for (const c of grid.slice(1)) {
        const name = (c[0] ?? "").trim();
        const areaRaw = (c[2] ?? "").trim().toUpperCase();
        if (!name || !AREAS.includes(areaRaw)) { bad++; continue; }
        const ll = parseLatLng(c[5] ?? "");
        stores.push({
          name,
          address: (c[1] ?? "").trim(),
          area: areaRaw,
          phone: (c[3] ?? "").trim() || undefined,
          pic: (c[4] ?? "").trim() || undefined,
          lat: ll.lat,
          lng: ll.lng,
        });
      }
      if (stores.length === 0)
        throw new Error("Tidak ada baris valid. Butuh Nama + Area (SOLO/DIY/SEMARANG).");

      Alert.alert(
        "Konfirmasi Import",
        `Akan diimpor ${stores.length} toko${bad ? ` • ${bad} baris dilewati (nama/area kosong)` : ""}.\nNama yang sama di area yang sama otomatis dilewati. Lanjutkan?`,
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Ya, Import",
            onPress: async () => {
              setImportBusy(true);
              try {
                const CHUNK = 1000;
                let added = 0;
                let skipped = 0;
                for (let i = 0; i < stores.length; i += CHUNK) {
                  const slice = stores.slice(i, i + CHUNK);
                  setImportProg(`Import ${Math.min(i + CHUNK, stores.length)}/${stores.length}...`);
                  const r: any = await bulkImport({ stores: slice });
                  added += r?.added ?? 0;
                  skipped += r?.skipped ?? 0;
                }
                Alert.alert("Import Selesai", `${added} toko ditambahkan • ${skipped} dilewati (duplikat).`);
              } catch (e2: any) {
                Alert.alert("Import Terhenti", (e2?.message ?? "Coba lagi.") + "\n\nSebagian data mungkin sudah tersimpan.");
              } finally {
                setImportBusy(false);
                setImportProg("");
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Import Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setImportBusy(false);
    }
  };

  if (viewer && !allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Akses khusus</Text>
        <Text style={styles.meta}>Fitur ini hanya untuk supervisor, owner, sales & telemarketing.</Text>
        <TouchableOpacity style={styles.backTop} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderItem = ({ item }: any) => {
    const active = item.status === "active";
    const hasLoc = item.lat != null;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/kelola-toko/${item._id}`)} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.areaChip, { backgroundColor: AREA_BG[item.area] ?? "#F2F4F7" }]}>
              <Text style={[styles.areaChipText, { color: AREA_TX[item.area] ?? GRAY }]}>{item.area}</Text>
            </View>
            {!active ? (
              <View style={styles.offChip}><Text style={styles.offChipText}>Nonaktif</Text></View>
            ) : null}
          </View>
          <Text style={styles.addr} numberOfLines={2}>{item.address || "-"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <Text style={[styles.loc, { color: hasLoc ? GREEN : ORANGE }]}>
              {hasLoc ? "📍 Ada koordinat" : "⚠ Tanpa koordinat"}
            </Text>
            {item.phone ? <Text style={styles.phone}> • {item.phone}</Text> : null}
            {item.pic ? <Text style={styles.phone}> • {item.pic}</Text> : null}
          </View>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Kelola Toko</Text>
        <Text style={styles.meta}>
          {isManager
            ? "Ketuk toko untuk edit data, koordinat & status"
            : `Mode lihat • ${viewer?.area ?? "Semua Area"} — hanya supervisor yang bisa mengubah data`}
        </Text>

        {isManager ? (
          <View style={styles.importRow}>
            <TouchableOpacity style={[styles.importBtn, styles.importBtnGhost]} onPress={downloadTemplate}>
              <Text style={styles.importBtnGhostText}>⬇ Download Template</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importBtn, styles.importBtnPrimary, importBusy && { opacity: 0.6 }]}
              onPress={doImport}
              disabled={importBusy}
            >
              <Text style={styles.importBtnPrimaryText}>{importBusy ? (importProg || "Memproses...") : "📥 Import Data"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ← BARU: kotak cari dengan tombol bersihkan */}
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama / alamat / no HP..."
            placeholderTextColor="#98A2B3"
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ("")} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.chipRow}>
          {showAreaChips
            ? ["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => {
                const on = area === a;
                return (
                  <TouchableOpacity key={a} style={[styles.chip, on && styles.chipActive]} onPress={() => setArea(a)}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{a === "ALL" ? "Semua" : a}</Text>
                  </TouchableOpacity>
                );
              })
            : (
              <View style={[styles.chip, styles.chipActive]}>
                <Text style={[styles.chipText, styles.chipTextActive]}>{viewer?.area ?? "-"}</Text>
              </View>
            )}
        </View>

        {/* ← BARU: filter status + ringkasan */}
        <View style={styles.chipRow}>
          {(["ALL", "active", "disabled"] as const).map((k) => {
            const on = statusF === k;
            return (
              <TouchableOpacity key={k} style={[styles.chip, on && styles.chipStatusOn]} onPress={() => setStatusF(k)}>
                <Text style={[styles.chipText, on && styles.chipTextActive]}>
                  {k === "ALL" ? "Semua status" : k === "active" ? "Aktif" : "Nonaktif"}
                  {rows === undefined ? "" : ` (${countOf(k)})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.summary}>
          {rows === undefined
            ? "Memuat..."
            : `${shownRows.length} toko ditampilkan${noCoord > 0 ? ` • ${noCoord} tanpa koordinat` : ""}`}
        </Text>
      </View>

      {rows === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={RED} /></View>
      ) : (
        <FlatList
          data={shownRows}
          keyExtractor={(s: any) => s._id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Toko tidak ditemukan</Text>
              <Text style={styles.meta}>Coba kata kunci / filter lain.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  screen: { flex: 1, backgroundColor: "#FCFAFA" },
  topbar: { backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F0D9D5" },
  backBtn: { alignSelf: "flex-start" },
  backTop: { marginTop: 16, padding: 8 },
  backText: { color: RED, fontSize: 16, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: GRAY, marginTop: 2 },
  importRow: { flexDirection: "row", marginTop: 12 },
  importBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", marginRight: 8, borderWidth: 1 },
  importBtnGhost: { backgroundColor: "#fff", borderColor: "#D0D5DD" },
  importBtnGhostText: { color: "#344054", fontWeight: "800", fontSize: 13 },
  importBtnPrimary: { backgroundColor: RED, borderColor: RED, marginRight: 0 },
  importBtnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#F2F4F7", borderRadius: 12, marginTop: 12, paddingLeft: 14, paddingRight: 6 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: "#111" },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  clearText: { color: GRAY, fontSize: 15, fontWeight: "800" },
  chipRow: { flexDirection: "row", marginTop: 10, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, marginBottom: 6, backgroundColor: "#fff" },
  chipActive: { backgroundColor: RED, borderColor: RED },
  chipStatusOn: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 13, color: "#344054", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  summary: { fontSize: 12, color: GRAY, marginTop: 2, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#EEF0F3" },
  name: { fontSize: 15, fontWeight: "800", color: "#111", marginRight: 8, flexShrink: 1 },
  areaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  areaChipText: { fontSize: 11, fontWeight: "800" },
  offChip: { backgroundColor: "#F2F4F7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  offChipText: { fontSize: 10, fontWeight: "800", color: GRAY },
  addr: { fontSize: 13, color: GRAY, marginTop: 4, lineHeight: 18 },
  loc: { fontSize: 12, fontWeight: "700" },
  phone: { fontSize: 12, color: GRAY },
  arrow: { fontSize: 20, color: "#98A2B3", fontWeight: "700", marginLeft: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#333" },
});
