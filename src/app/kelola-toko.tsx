import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useConvex } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { api } from "../../convex/_generated/api";
import { exportCsv } from "../lib/csvExport";
import { toFriendlyError } from "../lib/msg";
import { TOP_PAD } from "../lib/layout";
import { isOwnerLike } from "../lib/roles";

const RED = "#D92D20";
const GRAY = "#667085";
const GREEN = "#067647";
const ORANGE = "#B54708";
const BLUE = "#1D4ED8";

const AREA_BG: any = { SOLO: "#FEE4E2", DIY: "#E0F2FE", SEMARANG: "#DCFAE6" };
const AREA_TX: any = { SOLO: "#B42318", DIY: "#026AA2", SEMARANG: "#067647" };
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const VIEW_ROLES = ["supervisor", "owner", "hr", "akunting", "field", "telemarketing"];
const SRC_LABEL: any = {
  sales_registered: "Dari sales",
  supervisor: "Diisi supervisor",
  approved: "Disetujui supervisor",
  unverified: "Belum diverifikasi",
};
const fmtDateTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

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
  const convex = useConvex();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [area, setArea] = useState("ALL");
  const [statusF, setStatusF] = useState<"ALL" | "active" | "disabled">("ALL"); // ← BARU
  const [importBusy, setImportBusy] = useState(false);
  const [importProg, setImportProg] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const role = viewer?.role;
  const isManager = role === "supervisor";
  const allowed = VIEW_ROLES.includes(role);
  const showAreaChips = role === "supervisor" || isOwnerLike(role);

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

      // Pratinjau: berapa baru / sudah ada / akan dinonaktifkan (belum ada yang diubah)
      const prev: any = await convex.query(api.stores.previewImport, {
        rows: stores.map((x) => ({ name: x.name, area: x.area })),
      });
      const ringkas =
        `Di file: ${stores.length} toko${bad ? ` (${bad} baris dilewati: nama/area kosong)` : ""}` +
        (prev
          ? `\n• Toko baru: ${prev.baru}\n• Sudah terdaftar: ${prev.sama}` +
            (prev.dobelDiFile ? `\n• Dobel di dalam file: ${prev.dobelDiFile} (diabaikan)` : "")
          : "") +
        "\n\nTambah saja = toko baru ditambah, yang sudah ada dilewati (tanpa duplikat).\n" +
        "Ganti semua = data toko dari file jadi acuan; toko lama yang tidak ada di file dinonaktifkan.";

      const runImport = async (mode: "tambah" | "ganti") => {
        setImportBusy(true);
        try {
          const CHUNK = 1000;
          const batchId = `imp-${Date.now()}`;
          let added = 0;
          let skipped = 0;
          let updated = 0;
          for (let i = 0; i < stores.length; i += CHUNK) {
            const slice = stores.slice(i, i + CHUNK);
            setImportProg(`Import ${Math.min(i + CHUNK, stores.length)}/${stores.length}...`);
            const r: any = await bulkImport({ stores: slice, mode, ...(mode === "ganti" ? { batchId } : {}) });
            added += r?.added ?? 0;
            skipped += r?.skipped ?? 0;
            updated += r?.updated ?? 0;
          }
          let disabled = 0;
          if (mode === "ganti") {
            setImportProg("Menonaktifkan toko lama...");
            const f: any = await convex.mutation(api.stores.finishImportReplace, { batchId });
            disabled = f?.disabled ?? 0;
          }
          Alert.alert(
            "Import Selesai",
            mode === "ganti"
              ? `${added} toko baru • ${updated} diperbarui • ${disabled} toko lama dinonaktifkan.`
              : `${added} toko ditambahkan • ${skipped} dilewati (duplikat).`
          );
        } catch (e2: any) {
          Alert.alert("Import Terhenti", (e2?.message ?? "Coba lagi.") + "\n\nSebagian data mungkin sudah tersimpan.");
        } finally {
          setImportBusy(false);
          setImportProg("");
        }
      };

      const confirmReplace = () => {
        const nonaktif = prev?.akanDinonaktifkan ?? 0;
        const banyak = prev && prev.totalToko > 0 && nonaktif > prev.totalToko * 0.5;
        Alert.alert(
          "Ganti semua toko?",
          `${nonaktif} toko aktif yang tidak ada di file akan DINONAKTIFKAN (riwayat kunjungan tetap tersimpan, toko bisa diaktifkan lagi).\n` +
            `${prev?.sama ?? 0} toko diperbarui • ${prev?.baru ?? 0} toko ditambahkan.` +
            (banyak ? "\n\n⚠️ Lebih dari separuh toko akan nonaktif. Pastikan file yang dipilih sudah benar." : ""),
          [
            { text: "Batal", style: "cancel" },
            { text: "Ya, ganti semua", style: "destructive", onPress: () => runImport("ganti") },
          ]
        );
      };

      Alert.alert("Pilih mode import", ringkas, [
        { text: "Batal", style: "cancel" },
        { text: "Tambah saja", onPress: () => runImport("tambah") },
        { text: "Ganti semua", style: "destructive", onPress: confirmReplace },
      ]);
    } catch (e: any) {
      Alert.alert("Import Gagal", e?.message ?? "Coba lagi.");
    } finally {
      setImportBusy(false);
    }
  };

  // ===== EKSPOR: unduh master toko sesuai filter (khusus supervisor) =====
  const doExport = async () => {
    if (exportBusy || !isManager) return;
    setExportBusy(true);
    setNotice(null);
    try {
      const res: any = await convex.query(api.stores.listStoresForExport, {
        ...(debounced ? { q: debounced } : {}),
        ...(showAreaChips && area !== "ALL" ? { area: area as any } : {}),
        ...(statusF !== "ALL" ? { status: statusF } : {}),
      });
      const list: any[] = res?.rows ?? [];
      if (list.length === 0) throw new Error("Tidak ada toko pada filter ini.");

      const out = await exportCsv({
        fileName: ["master-toko", showAreaChips && area !== "ALL" ? area : "", statusF !== "ALL" ? statusF : ""]
          .filter(Boolean)
          .join("-"),
        header: [
          "Nama", "Area", "Alamat", "No HP", "PIC",
          "Latitude", "Longitude", "Sumber Koordinat", "Status", "Dibuat", "Diperbarui",
        ],
        rows: list.map((s: any) => [
          s.name,
          s.area,
          s.address,
          s.phone,
          s.pic,
          s.lat ?? "",
          s.lng ?? "",
          SRC_LABEL[s.latSource] ?? s.latSource ?? "-",
          s.status === "active" ? "Aktif" : "Nonaktif",
          fmtDateTime(s.createdAt),
          s.updatedAt ? fmtDateTime(s.updatedAt) : "-",
        ]),
        dialogTitle: "Ekspor Master Toko",
      });

      setNotice({
        tone: "ok",
        text: `${out.rows} toko diekspor ke ${out.file}${res?.truncated ? ` (dibatasi ${2000} baris pertama)` : ""}.`,
      });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setExportBusy(false);
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
              <Text style={styles.importBtnGhostText}>⬇ Template</Text>
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

        {/* Unduh master toko — hanya supervisor, mengikuti filter aktif */}
        {isManager ? (
          <TouchableOpacity
            style={[styles.exportBtn, exportBusy && { opacity: 0.6 }]}
            onPress={doExport}
            disabled={exportBusy}
          >
            <Text style={styles.exportBtnText}>
              {exportBusy ? "Menyiapkan CSV…" : "⬇ Ekspor CSV (sesuai filter)"}
            </Text>
            <Text style={styles.exportBtnSub}>
              {area === "ALL" ? "Semua area" : area}
              {statusF === "ALL" ? " • semua status" : statusF === "active" ? " • aktif" : " • nonaktif"}
              {debounced ? ` • cari “${debounced}”` : ""}
            </Text>
          </TouchableOpacity>
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

        {notice ? (
          <View style={[styles.notice, notice.tone === "ok" ? styles.noticeOk : styles.noticeErr]}>
            <Text style={[styles.noticeText, { color: notice.tone === "ok" ? GREEN : RED }]}>{notice.text}</Text>
            <TouchableOpacity onPress={() => setNotice(null)} hitSlop={8}>
              <Text style={[styles.noticeClose, { color: notice.tone === "ok" ? GREEN : RED }]}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {rows === undefined ? (
        <View style={styles.center}><IOSSpinner size="large" color={RED} /></View>
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
  backTop: { marginTop: 16, padding: 8 },
  backText: { color: "#D92D20", fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: "#101828", letterSpacing: -0.2, marginTop: 2 },
  meta: { fontSize: 13, color: "#667085", marginTop: 3, lineHeight: 18 },
  importRow: { flexDirection: "row", marginTop: 12 },
  importBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", marginRight: 8, borderWidth: 1 },
  importBtnGhost: { backgroundColor: "#fff", borderColor: "#D0D5DD" },
  importBtnGhostText: { color: "#344054", fontWeight: "800", fontSize: 13 },
  importBtnPrimary: { backgroundColor: RED, borderColor: RED, marginRight: 0 },
  importBtnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#D0D5DD",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginTop: 8,
  },
  exportBtnText: { color: "#344054", fontWeight: "800", fontSize: 13 },
  exportBtnSub: { color: GRAY, fontSize: 11, fontWeight: "600", flexShrink: 1, marginLeft: 8, textAlign: "right" },
  notice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10,
  },
  noticeOk: { backgroundColor: "#F0FDF4", borderColor: "#ABEFC6" },
  noticeErr: { backgroundColor: "#FDF2F2", borderColor: "#F3D6D6" },
  noticeText: { flex: 1, fontSize: 11.5, fontWeight: "700", lineHeight: 16 },
  noticeClose: { fontSize: 13, fontWeight: "900" },
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
