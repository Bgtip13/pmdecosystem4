import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { Kpi, Panel, Bar, WebButton } from "../components/desktop/ui";
import { A, FONT } from "../components/desktop/tokens";

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
const warna = (p: any) =>
  p == null ? A.mutedSoft : p >= ON_TRACK_MIN ? A.green : p >= 40 ? A.orange : A.red;

function Status({ skor }: { skor: number }) {
  const ok = skor >= ON_TRACK_MIN;
  return (
    <View style={[s.badge, { backgroundColor: ok ? A.greenSoft : A.orangeSoft, borderColor: ok ? A.greenBorder : "#FEDF89" }]}>
      <Text style={[s.badgeText, { color: ok ? A.green : A.orange }]}>
        {ok ? "ON TRACK" : "PERLU PERHATIAN"}
      </Text>
    </View>
  );
}

// ===== RAPOR SAYA (WEB) =====
// Hanya menampilkan penilaian akun yang login. Server sudah menyaring datanya,
// jadi daftar rekan lain tidak pernah dikirim ke browser sales.
export default function PenilaianSayaWeb() {
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

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>;
  }

  if (!boleh) {
    return (
      <DesktopShell active="beranda" title="Rapor Saya" subtitle="Penilaian bulanan pribadi">
        <Panel icon="chart" title="Rapor ini bukan untuk akun Anda">
          <Text style={s.muted}>Rapor pribadi berlaku untuk sales lapangan & telemarketing.</Text>
        </Panel>
      </DesktopShell>
    );
  }

  const person: any = (data?.field ?? [])[0] ?? (data?.tele ?? [])[0] ?? null;
  const isField = (data?.selfKind ?? (role === "field" ? "field" : "tele")) === "field";

  const monthNav = (
    <View style={s.nav}>
      <TouchableOpacity style={s.navBtn} onPress={() => setMk((k) => shiftMonth(k, -1))}>
        <Text style={s.navArrow}>‹</Text>
      </TouchableOpacity>
      <Text style={s.navLabel}>{monthLabel(mk)}</Text>
      <TouchableOpacity
        style={[s.navBtn, mk >= now && { opacity: 0.35 }]}
        onPress={() => mk < now && setMk((k) => shiftMonth(k, 1))}
        disabled={mk >= now}
      >
        <Text style={s.navArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <DesktopShell
      active="beranda"
      title="Rapor Saya"
      subtitle={`${isField ? "Sales Lapangan" : "Sales & Marketing (Telemarketing)"} • ${viewer.name} • ${viewer.area || "semua area"}`}
      right={monthNav}
    >
      {!bolehSendiri ? (
        <Panel icon="shield" title="Akun supervisor">
          <Text style={s.muted}>
            Halaman ini menampilkan rapor pribadi. Untuk rapor semua sales, buka menu Rapor Bulanan.
          </Text>
          <View style={{ marginTop: 12 }}>
            <WebButton label="Buka Rapor Bulanan" icon="chart" onPress={() => router.push("/spv-penilaian" as any)} />
          </View>
        </Panel>
      ) : err ? (
        <Text style={s.err}>{err}</Text>
      ) : !data ? (
        <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <IOSSpinner size="small" color={A.brand} />
          <Text style={s.muted}>{loading ? "Menghitung rapor & menarik omset…" : "Memuat rapor…"}</Text>
        </View>
      ) : data.selfMissing || !person ? (
        <Panel icon="info" title="Belum ada data penilaian">
          <Text style={s.muted}>
            Akunmu belum tercatat pada daftar {isField ? "sales lapangan" : "telemarketing"} di sistem, atau belum
            ada aktivitas pada {monthLabel(mk)}. Hubungi supervisor untuk memastikan peran & area akunmu.
          </Text>
        </Panel>
      ) : (
        <>
          <View style={s.hero}>
            <View style={s.heroScore}>
              <Text style={[s.heroScoreValue, { color: person.skor >= ON_TRACK_MIN ? A.green : A.orange }]}>
                {person.skor}
              </Text>
              <Text style={s.heroScoreUnit}>/100</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.heroName}>{person.name}</Text>
              <Text style={s.heroMeta}>{isField ? "Sales Lapangan" : "Sales & Marketing"} • Area {person.area || "-"}</Text>
              <View style={s.heroBadges}>
                <Status skor={person.skor} />
                <Text style={s.heroHint}>
                  {person.skor >= ON_TRACK_MIN
                    ? "Sudah melewati ambang on track bulan ini."
                    : `Perlu ${ON_TRACK_MIN - person.skor} poin lagi untuk on track.`}
                </Text>
              </View>
            </View>
          </View>

          {!data.omsetTersedia ? (
            <Text style={s.warn}>Sheet omset (PCP) tidak bisa ditarik — komponen omset dilewati sementara.</Text>
          ) : null}

          <View style={s.kpiRow}>
            {isField ? (
              <>
                <Kpi label="KUNJUNGAN" value={String(person.kunjungan ?? 0)} hint={`${person.hariMemenuhi}/${person.hariWajib} hari sesuai target`} />
                <Kpi label="TOKO ORDER" value={String(person.orderCount ?? 0)} color={A.green} hint={`${pctText(person.orderPct)} dari kunjungan`} />
                <Kpi label="OMSET BULAN" value={shortRp(person.omsetBulan)} hint={`target ${shortRp(person.omsetBulanTarget)}`} />
                <Kpi label="RATA-RATA MINGGU" value={shortRp(person.omsetMingguAct)} color={A.info} hint={`target ${shortRp(person.omsetMingguTarget)}/minggu`} />
              </>
            ) : (
              <>
                <Kpi label="SPK PENAGIHAN" value={`${person.tagihClosed ?? 0}/${person.tagihTotal ?? 0}`} hint={`CLSD • ${person.tagihInpg ?? 0} menunggu review`} />
                <Kpi label="SPK ORDERAN" value={`${person.spkOrder ?? 0}/${person.spkTotal ?? 0}`} color={A.green} hint={`${person.spkClosed ?? 0} CLSD • ${person.spkOpen ?? 0} belum`} />
                <Kpi label="FU TOKO" value={`${person.fuOrder ?? 0}/${person.fuTotal ?? 0}`} hint={`${person.fuPlan ?? 0} rencana order`} />
                <Kpi label="OMSET BULAN" value={shortRp(person.omsetBulan)} color={A.info} hint={`target ${shortRp(person.omsetBulanTarget)}`} />
              </>
            )}
          </View>

          <Panel icon="chart" title="Rincian penilaian" right={<Text style={s.panelHint}>bobot total 100%</Text>}>
            {(person.komponen ?? []).map((k: any) => (
              <View key={k.key} style={s.comp}>
                <View style={s.compHead}>
                  <Text style={s.compLabel}>{k.label}</Text>
                  <View style={s.compRight}>
                    <Text style={[s.compPct, { color: warna(k.pct) }]}>{pctText(k.pct)}</Text>
                    <Text style={s.compWeight}>bobot {k.bobot}%</Text>
                  </View>
                </View>
                <Bar pct={k.pct ?? 0} color={warna(k.pct)} height={5} />
                <View style={s.compMeta}>
                  <Text style={s.compNilai}>{k.nilai}</Text>
                  {k.target ? <Text style={s.compTarget}>Target: {k.target}</Text> : null}
                </View>
                <Text style={s.compNote}>{k.penjelasan}</Text>
                <Text style={s.compSource}>Sumber: {k.sumber}</Text>
              </View>
            ))}
          </Panel>

          <Panel icon="cash" title="Omset & porsi kiriman" right={<Text style={s.panelHint}>9 kiriman / bulan</Text>}>
            <View style={s.omsetRow}>
              <View style={s.omsetBox}>
                <Text style={s.omsetLabel}>OMSET BULANAN</Text>
                <Text style={s.omsetValue}>{rupiah(person.omsetBulan)}</Text>
                <Text style={s.omsetSub}>Target {rupiah(person.omsetBulanTarget)} • {pctText(person.omsetBulanPct)}</Text>
                <Bar pct={person.omsetBulanPct ?? 0} color={warna(person.omsetBulanPct)} />
              </View>
              <View style={s.omsetBox}>
                <Text style={s.omsetLabel}>RATA-RATA MINGGUAN</Text>
                <Text style={s.omsetValue}>{rupiah(person.omsetMingguAct)}</Text>
                <Text style={s.omsetSub}>
                  Target {rupiah(person.omsetMingguTarget)}/minggu • {pctText(person.omsetMingguPct)}
                </Text>
                <Bar pct={person.omsetMingguPct ?? 0} color={warna(person.omsetMingguPct)} />
              </View>
            </View>
            <Text style={s.note}>
              Rata-rata diambil dari {person.omsetMingguCount ?? 0} minggu yang sudah ada ACT. Target per kiriman ={" "}
              {rupiah(person.omsetTargetPerKiriman)} (target bulanan ÷ {person.omsetKirimanPerBulan ?? 9}). Target
              mingguan = target per kiriman × {person.omsetKirimanPerMinggu ?? 2.25} kiriman/minggu.
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
          </Panel>

          {!isField ? (
            <Panel icon="clipboard" title="Riwayat SPK Admin" right={<Text style={s.panelHint}>bulan {monthLabel(mk)}</Text>}>
              <View style={s.spkGrid}>
                <View style={s.spkBox}>
                  <Text style={s.spkTitle}>SPK penagihan</Text>
                  <Text style={s.spkBig}>{person.tagihTotal ?? 0} tugas</Text>
                  <Text style={s.spkLine}>CLSD {person.tagihClosed ?? 0} • review {person.tagihInpg ?? 0} • belum {person.tagihOpen ?? 0}</Text>
                  <Text style={s.spkLine}>
                    Lunas {person.tagihLunas ?? 0} • cicil {person.tagihCicil ?? 0} • janji {person.tagihJanji ?? 0} • no respon {person.tagihNoRespon ?? 0}
                  </Text>
                </View>
                <View style={s.spkBox}>
                  <Text style={s.spkTitle}>SPK orderan H+1</Text>
                  <Text style={s.spkBig}>{person.spkTotal ?? 0} tugas</Text>
                  <Text style={s.spkLine}>CLSD {person.spkClosed ?? 0} • review {person.spkInpg ?? 0} • belum {person.spkOpen ?? 0}</Text>
                  <Text style={s.spkLine}>
                    Order masuk {person.spkOrderMasuk ?? 0} • tambah {person.spkOrderTambah ?? 0} • tidak order {person.spkTidakOrder ?? 0} • no respon {person.spkNoRespon ?? 0}
                  </Text>
                </View>
              </View>
            </Panel>
          ) : null}

          <Text style={s.privacy}>
            Rapor ini hanya menampilkan penilaianmu sendiri. Penilaian rekan lain hanya bisa dilihat supervisor dan owner.
          </Text>
        </>
      )}
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: A.page },
  muted: { fontSize: 11.5, color: A.muted, fontFamily: FONT },
  err: { fontSize: 11, color: A.red, fontWeight: "700", fontFamily: FONT },
  warn: { fontSize: 11, color: A.orange, fontFamily: FONT },
  card: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10, padding: 14 },

  nav: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: {
    width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: A.border,
    backgroundColor: A.surface, alignItems: "center", justifyContent: "center",
  },
  navArrow: { fontSize: 15, fontWeight: "800", color: A.inkSoft, lineHeight: 17, fontFamily: FONT },
  navLabel: { fontSize: 11.5, fontWeight: "800", color: A.ink, minWidth: 92, textAlign: "center", fontFamily: FONT },

  hero: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 16,
  },
  heroScore: { flexDirection: "row", alignItems: "flex-end" },
  heroScoreValue: { fontSize: 46, fontWeight: "900", lineHeight: 48 },
  heroScoreUnit: { fontSize: 12, fontWeight: "700", color: A.muted, marginBottom: 7, marginLeft: 2 },
  heroName: { fontSize: 18, fontWeight: "800", color: A.ink },
  heroMeta: { fontSize: 11, color: A.muted, marginTop: 3 },
  heroBadges: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8, flexWrap: "wrap" },
  heroHint: { fontSize: 10.5, color: A.muted },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  panelHint: { fontSize: 10.5, color: A.muted, fontWeight: "700", fontFamily: FONT },

  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2.5 },
  badgeText: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.3 },

  comp: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  compHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  compLabel: { fontSize: 12.5, fontWeight: "700", color: A.ink },
  compRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  compPct: { fontSize: 13, fontWeight: "900" },
  compWeight: { fontSize: 9.5, color: A.mutedSoft, fontWeight: "700" },
  compMeta: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 6, flexWrap: "wrap" },
  compNilai: { fontSize: 11.5, fontWeight: "700", color: A.inkSoft },
  compTarget: { fontSize: 10, color: A.muted },
  compNote: { fontSize: 10.5, color: A.muted, lineHeight: 16, marginTop: 5 },
  compSource: { fontSize: 9.5, color: A.mutedSoft, marginTop: 4, fontStyle: "italic" },

  omsetRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  omsetBox: {
    flex: 1, minWidth: 240, backgroundColor: A.surfaceAlt, borderWidth: 1,
    borderColor: A.borderSoft, borderRadius: 9, padding: 12, gap: 5,
  },
  omsetLabel: { fontSize: 9, fontWeight: "800", color: A.muted, letterSpacing: 0.6 },
  omsetValue: { fontSize: 16, fontWeight: "800", color: A.ink },
  omsetSub: { fontSize: 10.5, color: A.muted, marginBottom: 3 },

  weeks: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  week: {
    flexBasis: 120, flexGrow: 1, backgroundColor: A.surface, borderWidth: 1,
    borderColor: A.borderSoft, borderRadius: 7, padding: 8,
  },
  weekLabel: { fontSize: 9, fontWeight: "800", color: A.muted, letterSpacing: 0.4 },
  weekValue: { fontSize: 11.5, fontWeight: "700", color: A.ink, marginTop: 2 },
  weekPct: { fontSize: 10, fontWeight: "700", marginTop: 1 },

  spkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  spkBox: {
    flex: 1, minWidth: 260, backgroundColor: A.surfaceAlt, borderWidth: 1,
    borderColor: A.borderSoft, borderRadius: 9, padding: 12, gap: 4,
  },
  spkTitle: { fontSize: 9, fontWeight: "800", color: A.muted, letterSpacing: 0.6, textTransform: "uppercase" },
  spkBig: { fontSize: 15, fontWeight: "800", color: A.ink },
  spkLine: { fontSize: 10.5, color: A.muted, lineHeight: 15 },

  note: { fontSize: 10.5, color: A.muted, lineHeight: 16, marginTop: 10 },
  privacy: {
    fontSize: 10.5, color: A.muted, lineHeight: 16,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.border, borderRadius: 9, padding: 11,
  },
});
