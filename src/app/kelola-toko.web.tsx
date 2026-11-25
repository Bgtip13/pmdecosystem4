import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import {
  Card, DataTable, Dialog, EmptyState, FilterChip, Kpi, Pill, SearchField, WebButton,
} from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { A } from "../components/desktop/tokens";
import { downloadCsv } from "../lib/downloadCsv";
import { toFriendlyError } from "../lib/msg";
import { isOwnerLike } from "../lib/roles";

const AREAS = ["SOLO", "DIY", "SEMARANG"];
const VIEW_ROLES = ["supervisor", "owner", "hr", "akunting", "field", "telemarketing"];
const AREA_TONE: Record<string, Tone> = { SOLO: "red", DIY: "blue", SEMARANG: "green" };
const SRC_LABEL: Record<string, string> = {
  sales_registered: "Dari sales",
  supervisor: "Diisi supervisor",
  approved: "Disetujui supervisor",
  unverified: "Belum diverifikasi",
};
const PAGE = 150;
const fmtDateTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

// ===== Parser CSV (sama dengan versi HP) =====
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
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return {};
  return { lat, lng };
}

// Pemilih berkas browser (tanpa library)
function pickCsvFile(): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/plain";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

type Notice = { tone: "ok" | "err"; text: string } | null;
type ImportPlan = { stores: any[]; bad: number; prev: any } | null;

export default function KelolaTokoWeb() {
  const router = useRouter();
  const convex = useConvex();
  const viewer = useQuery(api.users.viewer) as any;
  const bulkImport = useMutation(api.stores.bulkImport);

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [area, setArea] = useState("ALL");
  const [statusF, setStatusF] = useState<"ALL" | "active" | "disabled">("ALL");
  const [limit, setLimit] = useState(PAGE);
  const [notice, setNotice] = useState<Notice>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importProg, setImportProg] = useState("");
  const [plan, setPlan] = useState<ImportPlan>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { setLimit(PAGE); }, [debounced, area, statusF]);

  const role = viewer?.role;
  const isManager = role === "supervisor";
  const allowed = VIEW_ROLES.includes(role);
  const showAreaChips = role === "supervisor" || isOwnerLike(role);

  const rows = useQuery(api.stores.listManageStores, {
    ...(debounced ? { q: debounced } : {}),
    ...(showAreaChips && area !== "ALL" ? { area: area as any } : {}),
  }) as any;

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;
  if (!allowed) {
    return (
      <DesktopShell active="beranda" title="Kelola Toko" subtitle="Akses khusus">
        <EmptyState icon="shield" title="Akses khusus" desc="Fitur ini hanya untuk supervisor, owner, sales, dan telemarketing."
          action={<WebButton label="Ke Beranda" onPress={() => router.replace("/beranda")} />} />
      </DesktopShell>
    );
  }

  const list = (rows ?? []) as any[];
  const shownRows = list.filter((x) => statusF === "ALL" || x.status === statusF);
  const countOf = (k: "ALL" | "active" | "disabled") => (k === "ALL" ? list.length : list.filter((x) => x.status === k).length);
  const noCoord = shownRows.filter((x) => x.lat == null).length;
  const visible = shownRows.slice(0, limit);

  // ===== Template =====
  const onTemplate = () => {
    downloadCsv(
      "template-import-toko",
      ["Nama", "Alamat", "Area", "No HP", "PIC", "Latlong"],
      [
        ["Toko Contoh 1", "Jl. Malioboro 12", "SOLO", "081234567890", "Bu Sari", "-7.7821, 110.3601"],
        ["Toko Contoh 2", "", "DIY", "", "", ""],
      ],
    );
  };

  // ===== Import: pilih berkas → pratinjau → pilih mode =====
  const onPickImport = async () => {
    if (importBusy) return;
    setNotice(null);
    setImportBusy(true);
    try {
      const file = await pickCsvFile();
      if (!file) return;
      const grid = parseCsv(await file.text());
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
      if (stores.length === 0) throw new Error("Tidak ada baris valid. Butuh Nama + Area (SOLO/DIY/SEMARANG).");

      const prev: any = await convex.query(api.stores.previewImport, {
        rows: stores.map((x) => ({ name: x.name, area: x.area })),
      });
      setPlan({ stores, bad, prev });
    } catch (e: any) {
      setNotice({ tone: "err", text: `Import gagal: ${e?.message ?? "Coba lagi."}` });
    } finally {
      setImportBusy(false);
    }
  };

  const runImport = async (mode: "tambah" | "ganti") => {
    if (!plan) return;
    const { stores } = plan;
    setPlan(null);
    setConfirmReplace(false);
    setImportBusy(true);
    try {
      const CHUNK = 1000;
      const batchId = `imp-${Date.now()}`;
      let added = 0, skipped = 0, updated = 0;
      for (let i = 0; i < stores.length; i += CHUNK) {
        setImportProg(`Import ${Math.min(i + CHUNK, stores.length)}/${stores.length}…`);
        const r: any = await bulkImport({ stores: stores.slice(i, i + CHUNK), mode, ...(mode === "ganti" ? { batchId } : {}) });
        added += r?.added ?? 0;
        skipped += r?.skipped ?? 0;
        updated += r?.updated ?? 0;
      }
      let disabled = 0;
      if (mode === "ganti") {
        setImportProg("Menonaktifkan toko lama…");
        const f: any = await convex.mutation(api.stores.finishImportReplace, { batchId });
        disabled = f?.disabled ?? 0;
      }
      setNotice({
        tone: "ok",
        text: mode === "ganti"
          ? `Import selesai: ${added} toko baru • ${updated} diperbarui • ${disabled} toko lama dinonaktifkan.`
          : `Import selesai: ${added} toko ditambahkan • ${skipped} dilewati (duplikat).`,
      });
    } catch (e: any) {
      setNotice({ tone: "err", text: `Import terhenti: ${e?.message ?? "Coba lagi."} Sebagian data mungkin sudah tersimpan.` });
    } finally {
      setImportBusy(false);
      setImportProg("");
    }
  };

  // ===== Ekspor =====
  const onExport = async () => {
    if (exportBusy || !isManager) return;
    setExportBusy(true);
    setNotice(null);
    try {
      const res: any = await convex.query(api.stores.listStoresForExport, {
        ...(debounced ? { q: debounced } : {}),
        ...(showAreaChips && area !== "ALL" ? { area: area as any } : {}),
        ...(statusF !== "ALL" ? { status: statusF } : {}),
      });
      const out: any[] = res?.rows ?? [];
      if (out.length === 0) throw new Error("Tidak ada toko pada filter ini.");
      const name = ["master-toko", showAreaChips && area !== "ALL" ? area : "", statusF !== "ALL" ? statusF : ""].filter(Boolean).join("-");
      const ok = downloadCsv(
        name,
        ["Nama", "Area", "Alamat", "No HP", "PIC", "Latitude", "Longitude", "Sumber Koordinat", "Status", "Dibuat", "Diperbarui"],
        out.map((x: any) => [
          x.name, x.area, x.address, x.phone, x.pic, x.lat ?? "", x.lng ?? "",
          SRC_LABEL[x.latSource] ?? x.latSource ?? "-",
          x.status === "active" ? "Aktif" : "Nonaktif",
          fmtDateTime(x.createdAt), x.updatedAt ? fmtDateTime(x.updatedAt) : "-",
        ]),
      );
      if (!ok) throw new Error("Browser tidak mendukung unduhan.");
      setNotice({ tone: "ok", text: `${out.length} toko diekspor${res?.truncated ? " (dibatasi 2000 baris pertama)" : ""}.` });
    } catch (e: any) {
      setNotice({ tone: "err", text: toFriendlyError(e) });
    } finally {
      setExportBusy(false);
    }
  };

  const cols: Col[] = [
    {
      key: "name", label: "Toko", flex: 2.6,
      render: (x: any) => (
        <View style={{ gap: 3, width: "100%" }}>
          <Text style={s.name} numberOfLines={1}>{x.name}</Text>
          <Text style={s.addr} numberOfLines={1}>{x.address || "–"}</Text>
        </View>
      ),
    },
    { key: "area", label: "Area", width: 100, render: (x: any) => <Pill text={x.area} tone={AREA_TONE[x.area] ?? "gray"} size="sm" /> },
    {
      key: "contact", label: "Kontak", flex: 1.4,
      render: (x: any) => <Text style={s.cell} numberOfLines={2}>{[x.phone, x.pic].filter(Boolean).join(" • ") || "–"}</Text>,
    },
    {
      key: "coord", label: "Koordinat", width: 150,
      render: (x: any) => x.lat != null
        ? <Pill text="Ada koordinat" tone="green" size="sm" icon="pin" />
        : <Pill text="Tanpa koordinat" tone="amber" size="sm" icon="warn" />,
    },
    {
      key: "status", label: "Status", width: 100,
      render: (x: any) => <Pill text={x.status === "active" ? "Aktif" : "Nonaktif"} tone={x.status === "active" ? "green" : "gray"} size="sm" dot />,
    },
  ];

  const prev = plan?.prev;
  const nonaktif = prev?.akanDinonaktifkan ?? 0;
  const banyak = !!prev && prev.totalToko > 0 && nonaktif > prev.totalToko * 0.5;

  return (
    <DesktopShell
      active="kelola-toko"
      title="Kelola Toko"
      subtitle={isManager ? "Klik toko untuk edit data, koordinat, dan status" : `Mode lihat • ${viewer?.area ?? "Semua area"} — hanya supervisor yang bisa mengubah data`}
      right={
        isManager ? (
          <View style={s.actions}>
            <WebButton label="Template" icon="download" variant="ghost" onPress={onTemplate} />
            <WebButton label={exportBusy ? "Menyiapkan…" : "Ekspor CSV"} icon="download" variant="soft" disabled={exportBusy} onPress={onExport} />
            <WebButton label={importBusy ? (importProg || "Memproses…") : "Import data"} icon="upload" disabled={importBusy} onPress={onPickImport} />
          </View>
        ) : undefined
      }
    >
      <View style={s.stack}>
        {notice ? (
          <View style={[s.notice, notice.tone === "ok" ? s.noticeOk : s.noticeErr]}>
            <Text style={[s.noticeText, { color: notice.tone === "ok" ? A.green : A.red, flex: 1 }]}>{notice.text}</Text>
            <WebButton icon="close" variant="ghost" size="sm" onPress={() => setNotice(null)} />
          </View>
        ) : null}

        <View style={s.kpis}>
          <Kpi icon="store" tone="violet" label="Toko ditampilkan" value={rows === undefined ? "…" : shownRows.length} hint={rows === undefined ? undefined : `dari ${list.length} hasil`} />
          <Kpi icon="check" tone="green" label="Aktif" value={rows === undefined ? "…" : countOf("active")} />
          <Kpi icon="clock" tone="gray" label="Nonaktif" value={rows === undefined ? "…" : countOf("disabled")} />
          <Kpi icon="pin" tone={noCoord > 0 ? "amber" : "green"} label="Tanpa koordinat" value={rows === undefined ? "…" : noCoord} hint={noCoord > 0 ? "perlu dilengkapi" : "semua lengkap"} />
        </View>

        <Card pad={16}>
          <View style={s.toolbar}>
            <View style={s.chips}>
              {showAreaChips
                ? ["ALL", "SOLO", "DIY", "SEMARANG"].map((a) => (
                    <FilterChip key={a} label={a === "ALL" ? "Semua area" : a} on={area === a} onPress={() => setArea(a)} />
                  ))
                : <FilterChip label={viewer?.area ?? "–"} on onPress={() => {}} />}
            </View>
            <SearchField value={q} onChangeText={setQ} placeholder="Cari nama / alamat / no HP…" width={320} />
          </View>
          <View style={[s.chips, { marginTop: 12 }]}>
            {(["ALL", "active", "disabled"] as const).map((k) => (
              <FilterChip
                key={k}
                label={k === "ALL" ? "Semua status" : k === "active" ? "Aktif" : "Nonaktif"}
                on={statusF === k}
                count={rows === undefined ? null : countOf(k)}
                onPress={() => setStatusF(k)}
              />
            ))}
          </View>
        </Card>

        <Card pad={0}>
          {rows === undefined ? (
            <View style={s.pad}><IOSSpinner size="large" color={A.ink} /></View>
          ) : (
            <>
              <DataTable
                cols={cols}
                rows={visible}
                keyOf={(x: any) => String(x._id)}
                minWidth={820}
                onRowPress={(x: any) => router.push(`/kelola-toko/${x._id}` as any)}
                empty={<EmptyState icon="store" title="Toko tidak ditemukan" desc="Coba kata kunci atau filter lain." />}
              />
              {shownRows.length > visible.length ? (
                <View style={s.more}>
                  <Text style={s.moreText}>Menampilkan {visible.length} dari {shownRows.length} toko</Text>
                  <WebButton label="Tampilkan lebih banyak" variant="soft" size="sm" onPress={() => setLimit((l) => l + PAGE)} />
                </View>
              ) : null}
            </>
          )}
        </Card>
      </View>

      {/* ===== Dialog pilih mode import ===== */}
      <Dialog
        visible={!!plan && !confirmReplace}
        onClose={() => setPlan(null)}
        title="Pilih mode import"
        subtitle={plan ? `Di file: ${plan.stores.length} toko${plan.bad ? ` (${plan.bad} baris dilewati: nama/area kosong)` : ""}` : undefined}
        icon="upload"
        tone="blue"
        width={520}
        footer={
          <View style={s.dlgFoot}>
            <WebButton label="Batal" variant="ghost" onPress={() => setPlan(null)} />
            <WebButton label="Ganti semua" variant="danger" onPress={() => setConfirmReplace(true)} />
            <WebButton label="Tambah saja" onPress={() => runImport("tambah")} />
          </View>
        }
      >
        {prev ? (
          <View style={s.sumList}>
            <View style={s.sumRow}><Text style={s.sumLabel}>Toko baru</Text><Text style={s.sumVal}>{prev.baru}</Text></View>
            <View style={s.sumRow}><Text style={s.sumLabel}>Sudah terdaftar</Text><Text style={s.sumVal}>{prev.sama}</Text></View>
            {prev.dobelDiFile ? <View style={s.sumRow}><Text style={s.sumLabel}>Dobel di dalam file (diabaikan)</Text><Text style={s.sumVal}>{prev.dobelDiFile}</Text></View> : null}
          </View>
        ) : null}
        <Text style={s.help}><Text style={s.helpB}>Tambah saja</Text> — toko baru ditambah, yang sudah ada dilewati (tanpa duplikat).</Text>
        <Text style={s.help}><Text style={s.helpB}>Ganti semua</Text> — data dari file jadi acuan; toko lama yang tidak ada di file dinonaktifkan.</Text>
      </Dialog>

      {/* ===== Dialog konfirmasi ganti semua ===== */}
      <Dialog
        visible={!!plan && confirmReplace}
        onClose={() => setConfirmReplace(false)}
        title="Ganti semua toko?"
        subtitle={`${nonaktif} toko aktif yang tidak ada di file akan DINONAKTIFKAN.`}
        icon="warn"
        tone="red"
        width={520}
        footer={
          <View style={s.dlgFoot}>
            <WebButton label="Batal" variant="ghost" onPress={() => setConfirmReplace(false)} />
            <WebButton label="Ya, ganti semua" variant="danger" onPress={() => runImport("ganti")} />
          </View>
        }
      >
        <Text style={s.help}>Riwayat kunjungan tetap tersimpan dan toko bisa diaktifkan lagi.</Text>
        <Text style={s.help}>{prev?.sama ?? 0} toko diperbarui • {prev?.baru ?? 0} toko ditambahkan.</Text>
        {banyak ? <Text style={[s.help, { color: A.red, fontWeight: "700" }]}>⚠ Lebih dari separuh toko akan nonaktif. Pastikan file yang dipilih sudah benar.</Text> : null}
      </Dialog>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  stack: { gap: 16 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  pad: { padding: 40, alignItems: "center" },
  name: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  addr: { fontSize: 12.5, color: A.muted },
  cell: { fontSize: 13, color: A.inkSoft },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderTopWidth: 1, borderTopColor: A.borderSoft },
  moreText: { fontSize: 12.5, color: A.muted },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  noticeOk: { backgroundColor: A.greenSoft, borderColor: A.greenBorder },
  noticeErr: { backgroundColor: A.redSoft, borderColor: "#F7C9C5" },
  noticeText: { fontSize: 13, fontWeight: "600" },
  dlgFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  sumList: { borderWidth: 1, borderColor: A.border, borderRadius: 14, overflow: "hidden", marginBottom: 14 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  sumLabel: { fontSize: 13, color: A.inkSoft },
  sumVal: { fontSize: 13.5, fontWeight: "800", color: A.ink },
  help: { fontSize: 13, color: A.inkSoft, lineHeight: 19, marginBottom: 8 },
  helpB: { fontWeight: "800", color: A.ink },
});
