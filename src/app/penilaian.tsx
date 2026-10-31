import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import AppIcon from "../components/AppIcon";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;
const GREEN = "#067647";
const ORANGE = "#B54708";
const ON_TRACK_MIN = 70;

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function monthKeyNow() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}
function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

const pctText = (p: any) => (p == null ? "-" : `${p}%`);
const rupiah = (n: any) => (n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID"));
const shortRp = (n: any) => {
  if (n == null || isNaN(n)) return "-";
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000_000) return `Rp${(v / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (Math.abs(v) >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  return rupiah(v);
};
const warna = (p: any) => (p == null ? C.inkFaint : p >= ON_TRACK_MIN ? GREEN : p >= 40 ? ORANGE : RED);

function Bar({ pct, color }: { pct: any; color: string }) {
  return (
    <View style={s.barBg}>
      <View style={[s.barFill, { width: `${Math.min(100, Math.max(0, pct ?? 0))}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={s.lineValue}>{value}</Text>
    </View>
  );
}

// ==========================================================================
// RAPOR SAYA — penilaian pribadi sales lapangan & telemarketing
//
// Server hanya mengirim SATU baris (milik akun yang login). Supervisor &
// owner memakai halaman Rapor Bulanan untuk melihat semua.
// ==========================================================================
export default function PenilaianSaya() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const run = useAction(api.penilaian.monthly);

  const now = monthKeyNow();
  const [mk, setMk] = useState(now);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const role = viewer?.role;
  const bolehSendiri = role === "field" || role === "telemarketing";
  const boleh = bolehSendiri || role === "supervisor" || role === "owner";

  useEffect(() => {
    if (!bolehSendiri) return;
    let alive = true;
    setErr(null);
    setLoading(true);
    run({ monthKey: mk })
      .then((r: any) => { if (alive) setData(r); })
      .catch((e: any) => { if (alive) setErr(e?.message ? String(e.message) : "Gagal memuat penilaian."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bolehSendiri, mk]);

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={RED} /></View>;

  if (!boleh) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>Rapor ini bukan untuk akunmu</Text>
        <Text style={s.emptySub}>Rapor penilaian berlaku untuk sales lapangan & telemarketing.</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace("/beranda" as any)}>
          <Text style={s.primaryBtnText}>Kembali ke Beranda</Text>
        </TouchableOpacity>
        <TabBar active="beranda" />
      </View>
    );
  }

  const person: any = (data?.field ?? [])[0] ?? (data?.tele ?? [])[0] ?? null;
  const isField = (data?.selfKind ?? (role === "field" ? "field" : "tele")) === "field";

  const monthBar = (
    <View style={s.monthBar}>
      <TouchableOpacity style={s.monthBtn} onPress={() => setMk((k) => shiftMonth(k, -1))}>
        <Text style={s.monthArrow}>‹</Text>
      </TouchableOpacity>
      <Text style={s.monthLabel}>{monthLabel(mk)}</Text>
      <TouchableOpacity
        style={[s.monthBtn, mk >= now && { opacity: 0.35 }]}
        onPress={() => mk < now && setMk((k) => shiftMonth(k, 1))}
        disabled={mk >= now}
      >
        <Text style={s.monthArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.screen}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/beranda" as any); }}>
          <Text style={s.back}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={s.title}>Rapor Saya</Text>
        <Text style={s.meta}>
          {isField ? "Sales Lapangan" : "Sales & Marketing (Telemarketing)"} · {viewer.name}
        </Text>
        {monthBar}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {!bolehSendiri ? (
          <View style={s.card}>
            <Text style={s.noteTitle}>Akun supervisor</Text>
            <Text style={s.sub}>
              Halaman ini menampilkan rapor pribadi. Untuk melihat rapor semua sales, buka menu Rapor Bulanan.
            </Text>
            <TouchableOpacity style={s.outlineBtn} onPress={() => router.push("/spv-penilaian" as any)}>
              <AppIcon name="chart" size={14} color={RED} style={{ marginRight: 6 }} />
              <Text style={s.outlineBtnText}>Buka Rapor Bulanan</Text>
            </TouchableOpacity>
          </View>
        ) : err ? (
          <Text style={s.err}>{err}</Text>
        ) : !data ? (
          <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
            <IOSSpinner size="small" color={RED} />
            <Text style={s.sub}>{loading ? "Menghitung rapor & menarik omset…" : "Memuat rapor…"}</Text>
          </View>
        ) : data.selfMissing || !person ? (
          <View style={s.card}>
            <Text style={s.noteTitle}>Belum ada data penilaian</Text>
            <Text style={s.sub}>
              Akunmu belum tercatat pada daftar {isField ? "sales lapangan" : "telemarketing"} di sistem,
              atau belum ada aktivitas pada {monthLabel(mk)}. Hubungi supervisor untuk memastikan peran & area akunmu.
            </Text>
          </View>
        ) : (
          <>
            {/* ===== Skor ===== */}
            <View style={s.hero}>
              <View style={{ alignItems: "center" }}>
                <Text style={[s.heroScore, { color: person.skor >= ON_TRACK_MIN ? GREEN : ORANGE }]}>{person.skor}</Text>
                <Text style={s.heroUnit}>dari 100</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={[s.badge, { backgroundColor: person.skor >= ON_TRACK_MIN ? "#ECFDF3" : "#FFFAEB", borderColor: person.skor >= ON_TRACK_MIN ? "#ABEFC6" : "#FEDF89" }]}>
                  <Text style={[s.badgeText, { color: person.skor >= ON_TRACK_MIN ? GREEN : ORANGE }]}>
                    {person.skor >= ON_TRACK_MIN ? "ON TRACK" : "PERLU PERHATIAN"}
                  </Text>
                </View>
                <Text style={s.heroHint}>
                  {person.skor >= ON_TRACK_MIN
                    ? "Kinerja bulan ini sudah melewati ambang on track. Pertahankan!"
                    : `Butuh ${ON_TRACK_MIN - person.skor} poin lagi untuk on track. Lihat komponen di bawah untuk tahu yang perlu dinaikkan.`}
                </Text>
              </View>
            </View>

            {!data.omsetTersedia ? (
              <Text style={s.warn}>Sheet omset (PCP) tidak bisa ditarik — komponen omset dilewati sementara.</Text>
            ) : null}

            {/* ===== Ringkasan ===== */}
            <Text style={s.section}>Ringkasan</Text>
            <View style={s.card}>
              {isField ? (
                <>
                  <Line label="Kunjungan selesai" value={`${person.kunjungan} toko`} />
                  <Line label="Hari sesuai target" value={`${person.hariMemenuhi}/${person.hariWajib} hari`} />
                  <Line label="Toko tembus order" value={`${person.orderCount} (${pctText(person.orderPct)})`} />
                  <Line label="Keterangan lengkap" value={`${person.keteranganLengkap}/${person.kunjungan}`} />
                </>
              ) : (
                <>
                  <Line label="SPK penagihan" value={`${person.tagihClosed}/${person.tagihTotal} CLSD`} />
                  <Line label="SPK orderan" value={`${person.spkOrder}/${person.spkTotal} order`} />
                  <Line label="FU Toko" value={`${person.fuOrder}/${person.fuTotal} order`} />
                  <Line label="Menunggu review" value={`${(person.tagihInpg ?? 0) + (person.spkInpg ?? 0)} tugas`} />
                </>
              )}
              <Line label="Omset bulan ini" value={`${shortRp(person.omsetBulan)} (${pctText(person.omsetBulanPct)})`} />
              <Line label="Rata-rata mingguan" value={`${shortRp(person.omsetMingguAct)} (${pctText(person.omsetMingguPct)})`} />
            </View>

            {/* ===== Rincian komponen ===== */}
            <Text style={s.section}>Rincian penilaian</Text>
            {(person.komponen ?? []).map((k: any) => (
              <View key={k.key} style={s.comp}>
                <View style={s.compHead}>
                  <Text style={s.compLabel}>{k.label}</Text>
                  <Text style={[s.compPct, { color: warna(k.pct) }]}>{pctText(k.pct)}</Text>
                </View>
                <Bar pct={k.pct ?? 0} color={warna(k.pct)} />
                <View style={s.compMeta}>
                  <Text style={s.compNilai}>{k.nilai}</Text>
                  <Text style={s.compWeight}>bobot {k.bobot}%</Text>
                </View>
                {k.target ? <Text style={s.compTarget}>Target: {k.target}</Text> : null}
                <Text style={s.compNote}>{k.penjelasan}</Text>
                <Text style={s.compSource}>Sumber: {k.sumber}</Text>
              </View>
            ))}

            {/* ===== Omset ===== */}
            <Text style={s.section}>Omset & porsi kiriman</Text>
            <View style={s.card}>
              <Line label="Omset bulanan" value={`${rupiah(person.omsetBulan)} / ${rupiah(person.omsetBulanTarget)}`} />
              <Bar pct={person.omsetBulanPct ?? 0} color={warna(person.omsetBulanPct)} />
              <Text style={s.sub}>Target bulanan dicapai {pctText(person.omsetBulanPct)}</Text>

              <View style={{ height: 10 }} />
              <Line label="Rata-rata per minggu" value={`${rupiah(person.omsetMingguAct)} / ${rupiah(person.omsetMingguTarget)}`} />
              <Bar pct={person.omsetMingguPct ?? 0} color={warna(person.omsetMingguPct)} />
              <Text style={s.sub}>
                Dari {person.omsetMingguCount ?? 0} minggu berjalan • target mingguan {pctText(person.omsetMingguPct)} tercapai
              </Text>

              {(person.omsetMingguWeeks ?? []).length > 0 ? (
                <View style={s.weeks}>
                  {(person.omsetMingguWeeks ?? []).map((w: any) => (
                    <View key={w.label} style={s.week}>
                      <Text style={s.weekLabel}>{w.label}</Text>
                      <Text style={s.weekValue}>{shortRp(w.act)}</Text>
                      <Text style={[s.weekPct, { color: warna(w.pct) }]}>{pctText(w.pct)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <Text style={s.note}>
              Sebulan dihitung {person.omsetKirimanPerBulan ?? 9} kali kiriman. Target per kiriman ={" "}
              {rupiah(person.omsetTargetPerKiriman)}; target mingguan = target per kiriman ×{" "}
              {person.omsetKirimanPerMinggu ?? 2.25} kiriman/minggu.
            </Text>

            {/* ===== Riwayat SPK Admin (telemarketing) ===== */}
            {!isField ? (
              <>
                <Text style={s.section}>Riwayat SPK Admin</Text>
                <View style={s.card}>
                  <Text style={s.spkTitle}>SPK penagihan</Text>
                  <Line label="Total tugas" value={String(person.tagihTotal ?? 0)} />
                  <Line label="CLSD / review / belum" value={`${person.tagihClosed ?? 0} / ${person.tagihInpg ?? 0} / ${person.tagihOpen ?? 0}`} />
                  <Line
                    label="Hasil"
                    value={`Lunas ${person.tagihLunas ?? 0} • Cicil ${person.tagihCicil ?? 0} • Janji ${person.tagihJanji ?? 0} • No respon ${person.tagihNoRespon ?? 0}`}
                  />
                  <View style={{ height: 10 }} />
                  <Text style={s.spkTitle}>SPK orderan H+1</Text>
                  <Line label="Total tugas" value={String(person.spkTotal ?? 0)} />
                  <Line label="CLSD / review / belum" value={`${person.spkClosed ?? 0} / ${person.spkInpg ?? 0} / ${person.spkOpen ?? 0}`} />
                  <Line
                    label="Hasil"
                    value={`Order ${person.spkOrderMasuk ?? 0} • Tambah ${person.spkOrderTambah ?? 0} • Tidak ${person.spkTidakOrder ?? 0} • No respon ${person.spkNoRespon ?? 0}`}
                  />
                </View>
                <Text style={s.note}>
                  Tugas dihitung unik per tagihan/toko. Pekerjaan yang sudah disetujui (CLSD) dinilai penuh dan
                  yang menunggu review (INPG) dinilai separuh.
                </Text>
              </>
            ) : null}

            <Text style={s.privacy}>
              Rapor ini hanya menampilkan penilaianmu sendiri. Penilaian rekan lain hanya bisa dilihat supervisor
              dan owner.
            </Text>
          </>
        )}
      </ScrollView>

      <TabBar active="beranda" />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  back: { color: RED, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "800", color: C.ink, marginTop: 2 },
  meta: { fontSize: 11.5, color: C.inkMuted, marginTop: 2 },
  err: { fontSize: 12, color: RED, marginBottom: 8, fontWeight: "700" },
  warn: { fontSize: 11, color: ORANGE, marginTop: 8, marginBottom: 4 },

  monthBar: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 10 },
  monthBtn: {
    width: 32, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
  },
  monthArrow: { fontSize: 16, fontWeight: "800", color: C.inkSoft, lineHeight: 18 },
  monthLabel: { fontSize: 12.5, fontWeight: "800", color: C.ink, minWidth: 110, textAlign: "center" },

  section: {
    fontSize: 12, fontWeight: "800", color: C.inkMuted, textTransform: "uppercase",
    letterSpacing: 0.6, marginTop: 16, marginBottom: 6,
  },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  noteTitle: { fontSize: 14, fontWeight: "800", color: C.ink },
  sub: { fontSize: 11.5, color: C.inkMuted, lineHeight: 17, marginTop: 4 },
  note: { fontSize: 10.5, color: C.inkMuted, marginTop: 8, lineHeight: 15 },

  hero: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 14, marginBottom: 4,
  },
  heroScore: { fontSize: 40, fontWeight: "900", lineHeight: 42 },
  heroUnit: { fontSize: 9.5, color: C.inkMuted, fontWeight: "700" },
  heroHint: { fontSize: 10.5, color: C.inkMuted, marginTop: 6, lineHeight: 15 },

  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.3 },

  line: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 6 },
  lineLabel: { fontSize: 11, color: C.inkMuted, flexShrink: 1 },
  lineValue: { fontSize: 11, fontWeight: "700", color: C.ink, textAlign: "right", flexShrink: 1 },

  comp: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  compHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  compLabel: { fontSize: 12.5, fontWeight: "700", color: C.ink, flexShrink: 1 },
  compPct: { fontSize: 13, fontWeight: "900" },
  compMeta: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 6 },
  compNilai: { fontSize: 11, fontWeight: "700", color: C.inkSoft, flexShrink: 1 },
  compWeight: { fontSize: 9.5, color: C.inkFaint, fontWeight: "700" },
  compTarget: { fontSize: 10, color: C.inkMuted, marginTop: 4 },
  compNote: { fontSize: 10.5, color: C.inkMuted, lineHeight: 16, marginTop: 5 },
  compSource: { fontSize: 9.5, color: C.inkFaint, marginTop: 4, fontStyle: "italic" },

  barBg: { height: 5, borderRadius: 3, backgroundColor: "#F0ECEC", overflow: "hidden", marginTop: 7 },
  barFill: { height: 5, borderRadius: 3 },

  weeks: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  week: { flexBasis: 96, flexGrow: 1, backgroundColor: "#FAF7F5", borderRadius: 8, padding: 8 },
  weekLabel: { fontSize: 9, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.4 },
  weekValue: { fontSize: 11, fontWeight: "700", color: C.ink, marginTop: 2 },
  weekPct: { fontSize: 10, fontWeight: "700", marginTop: 1 },

  spkTitle: { fontSize: 9, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.6, textTransform: "uppercase" },

  privacy: {
    fontSize: 10.5, color: C.inkMuted, lineHeight: 15, marginTop: 14,
    backgroundColor: "#F2F4F7", borderRadius: 10, padding: 10,
  },

  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, textAlign: "center" },
  emptySub: { fontSize: 12.5, color: GRAY, textAlign: "center", marginTop: 6, lineHeight: 18 },
  primaryBtn: { backgroundColor: RED, borderRadius: R.md, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  outlineBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderColor: "#FECDCA", backgroundColor: "#fff", borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
  outlineBtnText: { fontSize: 12, fontWeight: "800", color: "#B42318" },
});
