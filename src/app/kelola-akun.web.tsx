import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { A, FONT } from "../components/desktop/tokens";
import {
  Avatar, Card, DataTable, Dialog, EmptyState, FilterChip, Pill, SearchField, WebButton,
} from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { ROLE_LABEL } from "../lib/roles";
import { toFriendlyError } from "../lib/msg";

const web = (o: any) => o as any;
const ROLES: [string, string][] = [["owner", "Owner"], ["field", "Sales Lapangan"], ["telemarketing", "Telemarketing"], ["supervisor", "Supervisor"], ["hr", "HR"], ["akunting", "Akunting"]];
const NO_AREA = ["supervisor", "owner", "hr", "akunting"];
const AREAS = ["SOLO", "DIY", "SEMARANG"];
const ROLE_TONE: Record<string, Tone> = { owner: "violet", supervisor: "blue", field: "green", telemarketing: "amber", hr: "red", akunting: "gray" };

type Mode = null | { type: "add" } | { type: "edit"; u: any } | { type: "delete"; u: any } | { type: "reset"; u: any };

export default function KelolaAkunWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [role, setRole] = useState("ALL");
  const [mode, setMode] = useState<Mode>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const rows = useQuery(api.users.listUsersManage, {
    ...(dq ? { q: dq } : {}),
    ...(role !== "ALL" ? { role: role as any } : {}),
  }) as any;

  if (!viewer) return null;
  const denied = viewer.role !== "supervisor";

  const cols: Col<any>[] = [
    {
      key: "n", label: "Akun", flex: 2,
      render: (u) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Avatar name={u.name} size={34} />
          <View style={{ minWidth: 0 }}>
            <Text style={s.strong} numberOfLines={1}>{u.name}</Text>
            <Text style={s.sub} numberOfLines={1}>@{u.email?.replace("@pmd.local", "") ?? "-"}</Text>
          </View>
        </View>
      ),
    },
    { key: "r", label: "Peran", width: 150, render: (u) => <Pill text={ROLE_LABEL[u.role] ?? u.role} tone={ROLE_TONE[u.role] ?? "gray"} size="sm" /> },
    { key: "a", label: "Area", width: 110, render: (u) => <Text style={s.cell}>{u.area ?? "Semua area"}</Text> },
    { key: "p", label: "Password", width: 150, render: (u) => (u.mustChangePassword ? <Pill text="Wajib ganti" tone="amber" size="sm" dot /> : <Pill text="Aman" tone="green" size="sm" dot />) },
    {
      key: "x", label: "Aksi", width: 230, align: "right",
      render: (u) => (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <WebButton label="Ubah" icon="edit" variant="ghost" size="sm" onPress={() => setMode({ type: "edit", u })} />
          <WebButton icon="key" variant="ghost" size="sm" onPress={() => setMode({ type: "reset", u })} />
          <WebButton icon="trash" variant="ghost" size="sm" onPress={() => setMode({ type: "delete", u })} />
        </View>
      ),
    },
  ];

  return (
    <DesktopShell
      active="spv"
      title="Kelola Akun"
      subtitle="Tambah, ubah peran/area, reset password, dan hapus akun — semua perubahan tercatat di Log Aktivitas"
      right={!denied ? <WebButton label="Tambah akun" icon="plus" onPress={() => setMode({ type: "add" })} /> : undefined}
    >
      {denied ? (
        <Card><EmptyState icon="lock" title="Khusus Supervisor" desc="Akun Anda tidak memiliki akses ke halaman ini." action={<WebButton label="Kembali" onPress={() => router.replace("/beranda" as any)} />} /></Card>
      ) : (
        <View style={{ gap: 16 }}>
          {toast ? (
            <View style={[s.toast, { backgroundColor: toast.ok ? A.greenSoft : A.redSoft }]}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: toast.ok ? A.green : A.red, fontFamily: FONT }}>{toast.text}</Text>
            </View>
          ) : null}
          <View style={s.toolbar}>
            {[["ALL", "Semua"], ["owner", "Owner"], ["hr", "HR"], ["akunting", "Akunting"], ["supervisor", "Supervisor"], ["field", "Sales Lapangan"], ["telemarketing", "Telemarketing"]].map(([k, l]) => (
              <FilterChip key={k} label={l} on={role === k} onPress={() => setRole(k)} />
            ))}
            <View style={{ flex: 1 }} />
            <SearchField value={q} onChangeText={setQ} placeholder="Cari nama / ID…" width={260} />
          </View>
          <Card pad={0} style={{ overflow: "hidden" }}>
            <View style={{ padding: 20, paddingBottom: 14 }}>
              <Text style={s.title}>Daftar akun</Text>
              <Text style={s.sub}>{rows ? `${rows.length} akun` : "Memuat…"}</Text>
            </View>
            {rows === undefined ? <Text style={[s.sub, { padding: 24 }]}>Memuat…</Text> : (
              <DataTable cols={cols} rows={rows} keyOf={(u) => String(u._id)} minWidth={820} empty={<EmptyState icon="users" title="Akun tidak ditemukan" />} />
            )}
          </Card>
        </View>
      )}
      <AccountDialogs mode={mode} onClose={() => setMode(null)} onDone={(ok, text) => { setToast({ ok, text }); setMode(null); }} meId={String(viewer._id)} />
    </DesktopShell>
  );
}

function AccountDialogs({ mode, onClose, onDone, meId }: { mode: Mode; onClose: () => void; onDone: (ok: boolean, t: string) => void; meId: string }) {
  const createUser = useAction(api.users.createUserByAdmin);
  const deleteUser = useMutation(api.users.deleteUserByAdmin);
  const updateRole = useMutation(api.users.updateUserRoleArea);
  const resetPw = useAction(api.users.adminResetPassword);

  const [uname, setUname] = useState("");
  const [full, setFull] = useState("");
  const [rl, setRl] = useState("field");
  const [area, setArea] = useState("SOLO");
  const [pw, setPw] = useState("pmd123");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr(""); setBusy(false);
    if (mode?.type === "add") { setUname(""); setFull(""); setRl("field"); setArea("SOLO"); }
    if (mode?.type === "edit") { setRl(mode.u.role); setArea(mode.u.area ?? "SOLO"); }
    if (mode?.type === "reset") setPw("pmd123");
  }, [mode]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setErr("");
    try { onDone(true, await fn()); } catch (e) { setErr(toFriendlyError(e)); setBusy(false); }
  };

  if (!mode) return null;
  const noArea = NO_AREA.includes(rl);

  const roleArea = (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={s.label}>Peran</Text>
        <View style={s.chips}>{ROLES.map(([k, l]) => <FilterChip key={k} label={l} on={rl === k} onPress={() => setRl(k)} />)}</View>
      </View>
      {!noArea ? (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Area</Text>
          <View style={s.chips}>{AREAS.map((a) => <FilterChip key={a} label={a} on={area === a} onPress={() => setArea(a)} />)}</View>
        </View>
      ) : null}
    </View>
  );
  const errBox = err ? <Text style={{ color: A.red, fontSize: 12.5, fontWeight: "600", fontFamily: FONT }}>{err}</Text> : null;

  if (mode.type === "add")
    return (
      <Dialog visible onClose={onClose} title="Tambah akun" subtitle="Password awal pmd123 — wajib diganti saat login pertama" icon="plus" tone="green"
        footer={<><View style={{ flex: 1 }} /><WebButton label="Batal" variant="ghost" onPress={onClose} /><WebButton label={busy ? "Menyimpan…" : "Buat akun"} disabled={busy}
          onPress={() => run(async () => {
            if (!uname.trim() || !full.trim()) throw new Error("ID dan nama wajib diisi.");
            await createUser({ username: uname.trim().toLowerCase(), name: full.trim(), role: rl as any, area: noArea ? undefined : (area as any) });
            return `Akun "${uname.trim().toLowerCase()}" dibuat.`;
          })} /></>}>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}><Text style={s.label}>ID login</Text><TextInput value={uname} onChangeText={setUname} autoCapitalize="none" placeholder="mis. budi.s" placeholderTextColor={A.mutedSoft} style={web([s.input, { outlineStyle: "none" }])} /></View>
          <View style={{ gap: 6 }}><Text style={s.label}>Nama lengkap</Text><TextInput value={full} onChangeText={setFull} placeholder="Nama karyawan" placeholderTextColor={A.mutedSoft} style={web([s.input, { outlineStyle: "none" }])} /></View>
          {roleArea}{errBox}
        </View>
      </Dialog>
    );

  if (mode.type === "edit")
    return (
      <Dialog visible onClose={onClose} title={`Ubah ${mode.u.name}`} subtitle="Perubahan peran/area berlaku pada login berikutnya" icon="edit" tone="amber"
        footer={<><View style={{ flex: 1 }} /><WebButton label="Batal" variant="ghost" onPress={onClose} /><WebButton label={busy ? "Menyimpan…" : "Simpan"} disabled={busy}
          onPress={() => run(async () => { await updateRole({ userId: mode.u._id, role: rl as any, area: noArea ? undefined : (area as any) }); return `Akun ${mode.u.name} diperbarui.`; })} /></>}>
        <View style={{ gap: 14 }}>{roleArea}{errBox}</View>
      </Dialog>
    );

  if (mode.type === "reset")
    return (
      <Dialog visible onClose={onClose} title={`Reset password ${mode.u.name}`} subtitle="Pengguna wajib menggantinya saat login berikutnya" icon="key" tone="violet"
        footer={<><View style={{ flex: 1 }} /><WebButton label="Batal" variant="ghost" onPress={onClose} /><WebButton label={busy ? "Memproses…" : "Reset"} disabled={busy}
          onPress={() => run(async () => {
            if (pw.length < 6) throw new Error("Password minimal 6 karakter.");
            await resetPw({ username: String(mode.u.email).replace("@pmd.local", ""), newPassword: pw });
            return `Password ${mode.u.name} direset.`;
          })} /></>}>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}><Text style={s.label}>Password sementara</Text><TextInput value={pw} onChangeText={setPw} placeholder="Minimal 6 karakter" placeholderTextColor={A.mutedSoft} style={web([s.input, { outlineStyle: "none" }])} /></View>
          {errBox}
        </View>
      </Dialog>
    );

  const self = String(mode.u._id) === meId;
  return (
    <Dialog visible onClose={onClose} title="Hapus akun?" subtitle={`"${mode.u.name}" dihapus permanen beserta semua sesi login. Riwayat kunjungan lama tetap tersimpan.`} icon="trash" tone="red"
      footer={<><View style={{ flex: 1 }} /><WebButton label="Batal" variant="ghost" onPress={onClose} /><WebButton label={busy ? "Menghapus…" : "Ya, hapus"} variant="danger" disabled={busy || self}
        onPress={() => run(async () => { await deleteUser({ userId: mode.u._id }); return `Akun ${mode.u.name} dihapus.`; })} /></>}>
      <View style={{ gap: 10 }}>
        {self ? <Text style={{ color: A.red, fontSize: 13, fontFamily: FONT }}>Anda tidak bisa menghapus akun sendiri.</Text> : null}
        {errBox}
      </View>
    </Dialog>
  );
}

const s = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 16, fontWeight: "700", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  strong: { fontSize: 13.5, fontWeight: "700", color: A.ink, fontFamily: FONT },
  sub: { fontSize: 12, color: A.muted, marginTop: 2, fontFamily: FONT },
  cell: { fontSize: 13, color: A.inkSoft, fontFamily: FONT },
  label: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  input: { borderWidth: 1, borderColor: A.border, borderRadius: 12, paddingHorizontal: 13, height: 42, fontSize: 13.5, color: A.ink, backgroundColor: A.surface, fontFamily: FONT } as any,
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toast: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
});
