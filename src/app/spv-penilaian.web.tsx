import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { A } from "../components/desktop/tokens";
import AppIcon from "../components/AppIcon";
import { Bar, Panel, Kpi } from "../components/desktop/ui";

const ON_TRACK_MIN = 70;

function monthKeyNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function monthLabel(key: string) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

const pctText = (p: any) => (p == null ? "-" : `${p}%`);
const rupiah = (n: any) =>
  n == null || isNaN(n) ? "-" : "Rp" + Number(n).toLocaleString("id-ID");
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

type Kind = "field" | "tele";

export default function SpvPenilaianWeb() {
  const viewer = useQuery(api.users.viewer) as any;
  const run = useAction(api.penilaian.monthly);
  const boleh = viewer?.role === "supervisor" || viewer?.role === "owner";

  const now = monthKeyNow();
  const [mk, setMk] = useState(now);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<{ kind: Kind; id: string } | null>(null);

  useEffect(() => {
    if (!boleh) return;
    let alive = true;
    setErr(null);
    setLoading(true);
    run({ monthKey: mk })
      .then((r: any) => { if (alive) setData(r); })
      .catch((e: any) => { if (alive) setErr(e?.message ? String(e.message) : "Gagal memuat penilaian."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [boleh, mk]);

  useEffect(() => { setSel(null); }, [mk]);

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.blue} /></View>;
  }
  if (!boleh) {
    return (
      <DesktopShell active="spv" title="Rapor Bulanan Sales" subtitle="Khusus supervisor">
        <View style={s.card}><Text style={s.h1}>Akses dibatasi</Text><Text style={s.sub}>Halaman ini khusus supervisor.</Text></View>
      </DesktopShell>
    );
  }

  const field: any[] = data?.field ?? [];
  const tele: any[] = data?.tele ?? [];
  const sum = data?.summary;
  const person = sel ? (sel.kind === "field" ? field : tele).find((p) => String(p.id) === sel.id) : null;

  const monthNav = (
    <View style={s.nav}>
      <TouchableOpacity style={s.navBtn} onPress={() => setMk((k) => shiftMonth(k, -1))}>
        <AppIcon name="chevron" size={13} color={A.inkSoft} style={{ transform: [{ rotate: "180deg" }] }} />
      </TouchableOpacity>
      <Text style={s.navLabel}>{monthLabel(mk)}</Text>
      <TouchableOpacity
        style={[s.navBtn, mk >= now && { opacity: 0.35 }]}
        onPress={() => mk < now && setMk((k) => shiftMonth(k, 1))}
        disabled={mk >= now}
      >
        <AppIcon name="chevron" size={13} color={A.inkSoft} />
      </TouchableOpacity>
    </View>
  );

  // ===== DETAIL RAPOR SATU SALES =====
  if (person) {
    const kindLabel = sel?.kind === "field" ? "Sales Field" : "Sales & Marketing (Telemarketing)";
    return (
      <DesktopShell
        active="spv"
        title={`Rapor ${person.name}`}
        subtitle={`${kindLabel} • ${person.area || "-"} • ${monthLabel(mk)}`}
        right={
          <TouchableOpacity style={s.backBtn} onPress={() => setSel(null)}>
            <AppIcon name="chevron" size={13} color={A.inkSoft} style={{ transform: [{ rotate: "180deg" }], marginRight: 5 }} />
            <Text style={s.backBtnText}>Daftar sales</Text>
          </TouchableOpacity>
        }
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={s.hero}>
            <View style={s.heroScore}>
              <Text style={[s.heroScoreValue, { color: person.skor >= ON_TRACK_MIN ? A.green : A.orange }]}>
                {person.skor}
              </Text>
              <Text style={s.heroScoreUnit}>/100</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.heroName}>{person.name}</Text>
              <Text style={s.heroMeta}>{kindLabel} • Area {person.area || "-"}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                <Status skor={person.skor} />
                <Text style={s.heroHint}>
                  {person.skor >= ON_TRACK_MIN
                    ? "Sudah melewati ambang on track."
                    : `Perlu ${ON_TRACK_MIN - person.skor} poin lagi untuk on track.`}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.kpiRow}>
            {sel?.kind === "field" ? (
              <>
                <Kpi label="KUNJUNGAN" value={String(person.kunjungan ?? 0)} hint={`${person.hariMemenuhi}/${person.hariWajib} hari sesuai target`} />
                <Kpi label="TOKO ORDER" value={String(person.orderCount ?? 0)} color={A.green} hint={`${pctText(person.orderPct)} dari kunjungan`} />
                <Kpi label="OMSET BULAN" value={shortRp(person.omsetBulan)} hint={`target ${shortRp(person.omsetBulanTarget)}`} />
                <Kpi label="RATA-RATA MINGGU" value={shortRp(person.omsetMingguAct)} color={A.blue} hint={`target ${shortRp(person.omsetMingguTarget)}/minggu`} />
              </>
            ) : (
              <>
                <Kpi label="SPK PENAGIHAN" value={`${person.tagihClosed ?? 0}/${person.tagihTotal ?? 0}`} hint={`CLSD • ${person.tagihInpg ?? 0} menunggu review`} />
                <Kpi label="SPK ORDERAN" value={`${person.spkOrder ?? 0}/${person.spkTotal ?? 0}`} color={A.green} hint={`${person.spkClosed ?? 0} CLSD • ${person.spkOpen ?? 0} belum`} />
                <Kpi label="FU TOKO" value={`${person.fuOrder ?? 0}/${person.fuTotal ?? 0}`} hint={`${person.fuPlan ?? 0} rencana order`} />
                <Kpi label="OMSET BULAN" value={shortRp(person.omsetBulan)} color={A.blue} hint={`target ${shortRp(person.omsetBulanTarget)}`} />
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

          <Panel icon="chart" title="Omset & porsi kiriman" right={<Text style={s.panelHint}>9 kiriman / bulan</Text>}>
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

          {sel?.kind === "tele" ? (
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
              <Text style={s.note}>
                Tugas dihitung unik per tagihan/toko, bukan per hari. Pekerjaan yang sudah disetujui (CLSD) dinilai
                penuh dan yang menunggu review (INPG) dinilai separuh supaya keterlambatan persetujuan tidak
                menjatuhkan nilai petugas.
              </Text>
            </Panel>
          ) : null}

          <TouchableOpacity style={s.backWide} onPress={() => setSel(null)}>
            <Text style={s.backWideText}>‹ Kembali ke daftar sales</Text>
          </TouchableOpacity>
        </ScrollView>
      </DesktopShell>
    );
  }

  // ===== DAFTAR PER SALES =====
  return (
    <DesktopShell
      active="spv"
      title="Rapor Bulanan Sales & Marketing"
      subtitle={`${monthLabel(mk)} • pilih nama untuk membuka rapor lengkap`}
      right={monthNav}
    >
      {err ? <Text style={s.err}>{err}</Text> : null}

      {!data ? (
        <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <IOSSpinner size="small" color={A.blue} />
          <Text style={s.sub}>{loading ? "Menghitung rapor & menarik omset…" : "Belum ada data."}</Text>
        </View>
      ) : (
        <>
          <View style={s.kpiRow}>
            <Kpi label="SALES FIELD" value={`${sum?.field?.onTrack ?? 0}/${sum?.field?.total ?? 0}`} hint="on track bulan ini" color={A.blue} />
            <Kpi label="SALES & MARKETING" value={`${sum?.tele?.onTrack ?? 0}/${sum?.tele?.total ?? 0}`} hint="on track bulan ini" color={A.purple} />
            <Kpi label="AMBANG ON TRACK" value={`${ON_TRACK_MIN}`} hint="dari skor maksimal 100" />
            <Kpi label="PERIODE DINILAI" value={`${data.hariDinilai ?? 0} hari`} hint={`sampai ${data.today ?? "hari ini"}`} />
          </View>

          {!data.omsetTersedia ? (
            <Text style={s.warn}>Sheet omset (PCP) tidak bisa ditarik — komponen omset dilewati sementara.</Text>
          ) : null}

          <Panel icon="user" title={`Sales Field (${field.length})`} right={<Text style={s.panelHint}>klik nama untuk rapor</Text>}>
            {field.length === 0 ? <Text style={s.muted}>Belum ada sales lapangan.</Text> : null}
            {field.map((p: any) => (
              <TouchableOpacity key={p.id} style={s.person} onPress={() => setSel({ kind: "field", id: String(p.id) })} activeOpacity={0.8}>
                <View style={s.avatar}><Text style={s.avatarText}>{String(p.name || "?").slice(0, 2).toUpperCase()}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.personName}>{p.name}</Text>
                  <Text style={s.personMeta}>
                    {p.area || "-"} • {p.hariMemenuhi}/{p.hariWajib} hari target • {p.orderCount} toko order
                  </Text>
                  <Text style={s.personMeta}>
                    Omset bulan {pctText(p.omsetBulanPct)} • mingguan {pctText(p.omsetMingguPct)}
                  </Text>
                </View>
                <View style={s.personScore}>
                  <Text style={[s.personScoreValue, { color: p.skor >= ON_TRACK_MIN ? A.green : A.orange }]}>{p.skor}</Text>
                  <Status skor={p.skor} />
                </View>
                <AppIcon name="chevron" size={15} color={A.mutedSoft} />
              </TouchableOpacity>
            ))}
          </Panel>

          <Panel icon="clipboard" title={`Sales & Marketing / Telemarketing (${tele.length})`} right={<Text style={s.panelHint}>nilai dari riwayat SPK Admin</Text>}>
            {tele.length === 0 ? <Text style={s.muted}>Belum ada telemarketing.</Text> : null}
            {tele.map((p: any) => (
              <TouchableOpacity key={p.id} style={s.person} onPress={() => setSel({ kind: "tele", id: String(p.id) })} activeOpacity={0.8}>
                <View style={[s.avatar, { backgroundColor: A.purpleSoft }]}>
                  <Text style={[s.avatarText, { color: A.purple }]}>{String(p.name || "?").slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.personName}>{p.name}</Text>
                  <Text style={s.personMeta}>
                    {p.area || "-"} • SPK penagihan {p.tagihClosed}/{p.tagihTotal} CLSD • SPK orderan {p.spkOrder}/{p.spkTotal} order
                  </Text>
                  <Text style={s.personMeta}>
                    FU toko {p.fuOrder}/{p.fuTotal} order • omset bulan {pctText(p.omsetBulanPct)}
                  </Text>
                </View>
                <View style={s.personScore}>
                  <Text style={[s.personScoreValue, { color: p.skor >= ON_TRACK_MIN ? A.green : A.orange }]}>{p.skor}</Text>
                  <Status skor={p.skor} />
                </View>
                <AppIcon name="chevron" size={15} color={A.mutedSoft} />
              </TouchableOpacity>
            ))}
          </Panel>

          <Text style={s.note}>
            Skor = rata-rata berbobot komponen (0–100). Komponen tanpa data dilewati dan bobotnya dinormalisasi ulang,
            bukan dihitung nol. Ambang on track {ON_TRACK_MIN}. Rapor memakai data bulan berjalan sampai hari ini:
            kunjungan sales, riwayat SPK Admin (piutang & orderan), sheet Toko Aktif, dan omset PCP.
          </Text>
        </>
      )}
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: A.page },
  card: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: 10, padding: 16, gap: 6 },
  h1: { fontSize: 14, fontWeight: "700", color: A.ink },
  sub: { fontSize: 11, color: A.muted },
  err: { fontSize: 11, color: A.red, marginBottom: 8, fontWeight: "700" },
  warn: { fontSize: 11, color: A.orange, marginBottom: 8 },
  muted: { fontSize: 11, color: A.muted },

  nav: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: {
    width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: A.border,
    backgroundColor: A.surface, alignItems: "center", justifyContent: "center",
  },
  navLabel: { fontSize: 11.5, fontWeight: "800", color: A.ink, minWidth: 92, textAlign: "center" },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  panelHint: { fontSize: 10.5, color: A.muted, fontWeight: "700" },

  person: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  avatar: {
    width: 34, height: 34, borderRadius: 9, backgroundColor: A.infoSoft,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 11, fontWeight: "800", color: A.info },
  personName: { fontSize: 12.5, fontWeight: "700", color: A.ink },
  personMeta: { fontSize: 10.5, color: A.muted, marginTop: 2 },
  personScore: { alignItems: "flex-end", gap: 4, minWidth: 110 },
  personScoreValue: { fontSize: 19, fontWeight: "900", lineHeight: 22 },

  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2.5 },
  badgeText: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.3 },

  backBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: A.surface,
    borderWidth: 1, borderColor: A.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  backBtnText: { fontSize: 11, fontWeight: "700", color: A.inkSoft },
  backWide: { alignItems: "center", paddingVertical: 12 },
  backWideText: { fontSize: 11, fontWeight: "700", color: A.blue },

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
  heroHint: { fontSize: 10.5, color: A.muted },

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
});
