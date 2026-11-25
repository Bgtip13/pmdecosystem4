import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import DesktopShell from "../components/desktop/DesktopShell";
import { Avatar, Dialog, EmptyState, FilterChip, Panel, Pill, Segmented, WebButton } from "../components/desktop/ui";
import { A, FONT } from "../components/desktop/tokens";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const TYPES = [
  { key: "sakit", label: "Sakit" },
  { key: "izin", label: "Izin" },
  { key: "cuti", label: "Cuti" },
  { key: "dinas_luar", label: "Dinas luar" },
  { key: "libur", label: "Libur" },
];
const SCOPES = [
  { key: "tidak_masuk", label: "Tidak masuk" },
  { key: "tidak_keliling", label: "Tidak keliling" },
];
const TYPE_LABEL: Record<string, string> = { sakit: "Sakit", izin: "Izin", cuti: "Cuti", dinas_luar: "Dinas luar", libur: "Libur" };
const SCOPE_LABEL: Record<string, string> = { tidak_masuk: "Tidak masuk", tidak_keliling: "Tidak keliling" };
const TYPE_TONE: Record<string, any> = { sakit: "red", izin: "amber", cuti: "blue", dinas_luar: "violet", libur: "gray" };
const web = (o: any) => o as any;

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function IzinWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;

  const [day, setDay] = useState(new Date());
  const [salesId, setSalesId] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [scope, setScope] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [salesQ, setSalesQ] = useState("");

  const dayKey = keyOf(day);
  const isSuper = viewer?.role === "supervisor" || viewer?.role === "hr";

  const salesList = useQuery(api.visits.listFieldSales, isSuper ? undefined : "skip") as any;
  const leaves = useQuery(api.leaves.listByDay, (isSuper ? ({ day: dayKey } as any) : "skip") as any) as any;
  const setLeave = useMutation(api.leaves.setLeave);
  const clearLeave = useMutation(api.leaves.clearLeave);

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  if (!isSuper) {
    return (
      <DesktopShell active="beranda" title="Izin Sales" subtitle="Khusus Supervisor / HR">
        <EmptyState icon="shield" title="Khusus Supervisor / HR" desc="Akun ini tidak punya akses untuk mengelola izin sales."
          action={<WebButton label="Ke Beranda" onPress={() => router.replace("/beranda")} />} />
      </DesktopShell>
    );
  }

  const isToday = day.toDateString() === new Date().toDateString();
  const label = isToday ? "Hari ini" : `${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear()}`;
  const rows = (salesList ?? []) as any[];
  const leaveList = (leaves ?? []) as any[];
  const savedOf = (id: string) => leaveList.find((l: any) => String(l.salesId) === id) ?? null;
  const selectedSaved = salesId ? savedOf(salesId) : null;
  const selectedSales = salesId ? rows.find((x: any) => String(x._id) === salesId) : null;
  const filteredSales = rows.filter((r: any) => !salesQ.trim() || `${r.name} ${r.area ?? ""}`.toLowerCase().includes(salesQ.trim().toLowerCase()));

  const reset = () => { setSalesId(null); setType(""); setScope(""); setNote(""); };
  const shiftDay = (n: number) => { setDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n)); reset(); setNotice(null); };

  const pickSales = (r: any) => {
    const sv = savedOf(String(r._id));
    setSalesId(String(r._id));
    setType(sv?.type ?? "");
    setScope(sv?.scope ?? "");
    setNote(sv?.note ?? "");
    setNotice(null);
  };

  const onSave = async () => {
    if (!salesId) return setNotice({ tone: "err", text: "Pilih sales dulu." });
    if (!type) return setNotice({ tone: "err", text: "Pilih jenis izinnya." });
    if (!scope) return setNotice({ tone: "err", text: "Pilih “Tidak masuk” atau “Tidak keliling”." });
    setBusy("FORM");
    try {
      await setLeave({ salesId: salesId as any, day: dayKey, type: type as any, scope: scope as any, note: note.trim() || undefined });
      setNotice({ tone: "ok", text: `${selectedSales?.name ?? "Sales"}: ${TYPE_LABEL[type]} · ${SCOPE_LABEL[scope]} tersimpan.` });
      reset();
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal menyimpan. Coba lagi." });
    } finally {
      setBusy(null);
    }
  };

  const doClear = async () => {
    if (!confirm) return;
    const { id, name } = confirm;
    setBusy(id);
    try {
      await clearLeave({ salesId: id as any, day: dayKey });
      if (salesId === id) reset();
      setNotice({ tone: "ok", text: `Izin ${name} dibatalkan.` });
    } catch (e: any) {
      setNotice({ tone: "err", text: e?.message ?? "Gagal membatalkan. Coba lagi." });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const formBusy = busy === "FORM";

  return (
    <DesktopShell
      active={viewer.role === "hr" ? "izin" : "spv"}
      title="Izin Sales"
      subtitle="Sales yang izin tidak dihitung target kunjungan pada tanggal itu"
      right={
        <View style={s.dateNav}>
          <WebButton icon="back" variant="ghost" size="sm" onPress={() => shiftDay(-1)} />
          <Text style={s.dateLabel}>{label}</Text>
          <WebButton icon="chevron" variant="ghost" size="sm" onPress={() => shiftDay(1)} />
          {!isToday ? <WebButton label="Hari ini" variant="soft" size="sm" onPress={() => { setDay(new Date()); reset(); }} /> : null}
        </View>
      }
    >
      <View style={s.stack}>
        {notice ? (
          <View style={[s.notice, notice.tone === "ok" ? s.noticeOk : s.noticeErr]}>
            <Text style={[s.noticeText, { color: notice.tone === "ok" ? A.green : A.red }]}>{notice.text}</Text>
          </View>
        ) : null}

        {salesList === undefined ? (
          <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>
        ) : (
          <View style={s.cols}>
            {/* ===== FORM ===== */}
            <Panel title="Tambah / ubah izin" sub={`Untuk ${label.toLowerCase()}`} basis={520}>
              <View style={s.field}>
                <View style={s.fieldHead}>
                  <Text style={s.fieldLabel}>Sales</Text>
                  {rows.length > 8 ? (
                    <TextInput
                      value={salesQ}
                      onChangeText={setSalesQ}
                      placeholder="Cari sales…"
                      placeholderTextColor={A.mutedSoft}
                      style={web([s.miniSearch, { outlineStyle: "none" }])}
                    />
                  ) : null}
                </View>
                <View style={s.chipWrap}>
                  {filteredSales.map((r: any) => (
                    <FilterChip
                      key={String(r._id)}
                      label={`${r.name}${r.area ? ` • ${r.area}` : ""}${savedOf(String(r._id)) ? " ✓" : ""}`}
                      on={salesId === String(r._id)}
                      onPress={() => pickSales(r)}
                    />
                  ))}
                  {filteredSales.length === 0 ? <Text style={s.muted}>Tidak ada sales yang cocok.</Text> : null}
                </View>
                {selectedSaved ? (
                  <Text style={s.hint}>Sales ini sudah punya izin untuk {label.toLowerCase()} — menyimpan akan menggantinya.</Text>
                ) : null}
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>Jenis izin</Text>
                <Segmented options={TYPES} value={type} onChange={setType} />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>Keterangan</Text>
                <Segmented options={SCOPES} value={scope} onChange={setScope} />
              </View>

              <View style={s.field}>
                <Text style={s.fieldLabel}>Catatan (opsional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  editable={!formBusy}
                  placeholder="contoh: demam, surat dokter ada"
                  placeholderTextColor={A.mutedSoft}
                  style={web([s.input, { outlineStyle: "none" }])}
                />
              </View>

              <View style={s.formActions}>
                <WebButton label={formBusy ? "Menyimpan…" : "Simpan izin"} icon="check" disabled={formBusy} onPress={onSave} />
                {salesId || type || scope || note ? <WebButton label="Bersihkan" variant="ghost" onPress={reset} /> : null}
              </View>
            </Panel>

            {/* ===== DAFTAR ===== */}
            <Panel title={`Izin ${isToday ? "hari ini" : label}`} sub={leaveList.length ? `${leaveList.length} sales tidak dihitung target` : undefined} tag={leaveList.length || undefined} basis={420}>
              {leaves === undefined ? (
                <IOSSpinner size="small" color={A.ink} />
              ) : leaveList.length === 0 ? (
                <EmptyState icon="calendar" title="Belum ada izin" desc="Belum ada izin untuk tanggal ini." />
              ) : (
                <View style={{ gap: 10 }}>
                  {leaveList.map((l: any) => {
                    const id = String(l.salesId);
                    return (
                      <Pressable key={id} onPress={() => pickSales({ _id: l.salesId })} style={web([s.row, salesId === id && s.rowOn, { cursor: "pointer" }])}>
                        <Avatar name={l.name} size={36} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.rowName} numberOfLines={1}>{l.name}{l.area ? ` • ${l.area}` : ""}</Text>
                          <View style={s.rowPills}>
                            <Pill text={TYPE_LABEL[l.type] ?? l.type} tone={TYPE_TONE[l.type] ?? "gray"} size="sm" />
                            <Pill text={SCOPE_LABEL[l.scope] ?? l.scope} tone="gray" size="sm" />
                          </View>
                          {l.note ? <Text style={s.rowNote} numberOfLines={2}>{l.note}</Text> : null}
                        </View>
                        <WebButton
                          label={busy === id ? "…" : "Batalkan"}
                          variant="ghost"
                          size="sm"
                          disabled={busy === id}
                          onPress={() => setConfirm({ id, name: l.name })}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Panel>
          </View>
        )}
      </View>

      <Dialog
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title="Batalkan izin?"
        subtitle={confirm ? `${confirm.name} akan kembali dihitung target kunjungan.` : undefined}
        icon="warn"
        tone="amber"
        width={440}
        footer={
          <View style={s.dlgFoot}>
            <WebButton label="Tidak" variant="ghost" onPress={() => setConfirm(null)} />
            <WebButton label="Ya, batalkan" variant="danger" disabled={!!busy} onPress={doClear} />
          </View>
        }
      />
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: "transparent" },
  stack: { gap: 16 },
  cols: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  dateNav: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateLabel: { minWidth: 120, textAlign: "center", fontSize: 14, fontWeight: "700", color: A.ink },
  notice: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  noticeOk: { backgroundColor: A.greenSoft, borderColor: A.greenBorder },
  noticeErr: { backgroundColor: A.redSoft, borderColor: "#F7C9C5" },
  noticeText: { fontSize: 13, fontWeight: "600" },
  field: { marginBottom: 18, gap: 8 },
  fieldHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  fieldLabel: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniSearch: {
    width: 180, fontSize: 13, color: A.ink, fontFamily: FONT,
    borderWidth: 1, borderColor: A.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: A.surfaceAlt,
  },
  input: {
    fontSize: 14, color: A.ink, fontFamily: FONT,
    borderWidth: 1, borderColor: A.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: A.surface,
  },
  hint: { fontSize: 12.5, color: A.orange, lineHeight: 18 },
  muted: { fontSize: 13, color: A.muted },
  formActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: A.border, borderRadius: 16, padding: 12, backgroundColor: A.surface,
  },
  rowOn: { borderColor: A.ink, backgroundColor: A.surfaceAlt },
  rowName: { fontSize: 14, fontWeight: "700", color: A.ink },
  rowPills: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  rowNote: { fontSize: 12.5, color: A.muted, marginTop: 6, lineHeight: 17 },
  dlgFoot: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
});
