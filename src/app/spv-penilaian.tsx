import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C } = theme;
const GREEN = "#0E7C4F";
const ORANGE = "#B54708";
const RED = C.primary;
const ON_TRACK_MIN = 70;

function monthKeyNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}
function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
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

function Status({ skor }: { skor: number }) {
  const ok = skor >= ON_TRACK_MIN;
  return (
    <View style={[s.badge, { backgroundColor: ok ? "#ECFDF3" : "#FFFAEB", borderColor: ok ? "#ABEFC6" : "#FEDF89" }]}>
      <Text style={[s.badgeText, { color: ok ? GREEN : ORANGE }]}>{ok ? "ON TRACK" : "PERLU PERHATIAN"}</Text>
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

type Kind = "field" | "tele";

export default function SpvPenilaian() {
  const router = useRouter();
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

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={RED} /></View>;
  if (!boleh) {
    return (
      <View style={s.screen}>
        <View style={s.topbar}><Text style={s.title}>Rapor Bulanan Sales</Text></View>
        <View style={{ padding: 16 }}><Text style={s.meta}>Khusus supervisor</Text></View>
        <TabBar active="spv" />
      </View>
    );
  }

  const field: any[] = data?.field ?? [];
  const tele: any[] = data?.tele ?? [];
  const sum = data?.summary;
  const person = sel ? (sel.kind === "field" ? field : tele).find((p) => String(p.id) === sel.id) : null;

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

  // ===== DETAIL RAPOR =====
  if (person) {
    const isField = sel?.kind === "field";
    return (
      <View style={s.screen}>
        <View style={s.topbar}>
          <TouchableOpacity onPress={() => setSel(null)}>
            <Text style={s.back}>‹ Daftar sales</Text>
          </TouchableOpacity>
          <Text style={s.title}>{person.name}</Text>
          <Text style={s.meta}>
            {isField ? "Sales Field" : "Sales & Marketing (Telemarketing)"} • {person.area || "-"} • {monthLabel(mk)}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View style={s.hero}>
            <View style={{ alignItems: "center" }}>
              <Text style={[s.heroScore, { color: person.skor >= ON_TRACK_MIN ? GREEN : ORANGE }]}>{person.skor}</Text>
              <Text style={s.heroScoreUnit}>dari 100</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Status skor={person.skor} />
              <Text style={s.heroHint}>
                {person.skor >= ON_TRACK_MIN
                  ? "Sudah melewati ambang on track bulan ini."
                  : `Butuh ${ON_TRACK_MIN - person.skor} poin lagi untuk on track.`}
              </Text>
            </View>
          </View>

          <Text style={s.section}>Ringkasan</Text>
          <View style={s.card}>
            {isField ? (
              <>
                <Line label="Kunjungan" value={`${person.kunjungan} toko`} />
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
                Tugas dihitung unik per tagihan/toko. CLSD dinilai penuh dan INPG (menunggu review) dinilai separuh.
              </Text>
            </>
          ) : null}

          <Text style={s.note}>
            Skor = rata-rata berbobot komponen 0–100. Komponen tanpa data dilewati dan bobotnya dinormalisasi ulang,
            bukan dihitung nol. Ambang on track {ON_TRACK_MIN}.
          </Text>

          <TouchableOpacity style={s.backWide} onPress={() => setSel(null)}>
            <Text style={s.backWideText}>‹ Kembali ke daftar sales</Text>
          </TouchableOpacity>
        </ScrollView>
        <TabBar active="spv" />
      </View>
    );
  }

  // ===== DAFTAR SALES =====
  return (
    <View style={s.screen}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Kembali</Text></TouchableOpacity>
        <Text style={s.title}>Rapor Bulanan Sales & Marketing</Text>
        <Text style={s.meta}>Pilih nama untuk membuka rapor lengkap</Text>
        {monthBar}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {err ? <Text style={s.err}>{err}</Text> : null}

        {!data ? (
          <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
            <IOSSpinner size="small" color={RED} />
            <Text style={s.meta}>{loading ? "Menghitung rapor & menarik omset…" : "Belum ada data."}</Text>
          </View>
        ) : (
          <>
            <View style={s.chips}>
              <View style={s.chip}>
                <Text style={s.chipLabel}>SALES FIELD</Text>
                <Text style={s.chipValue}>{sum?.field?.onTrack ?? 0}/{sum?.field?.total ?? 0}</Text>
                <Text style={s.chipSub}>on track</Text>
              </View>
              <View style={s.chip}>
                <Text style={s.chipLabel}>SALES & MARKETING</Text>
                <Text style={s.chipValue}>{sum?.tele?.onTrack ?? 0}/{sum?.tele?.total ?? 0}</Text>
                <Text style={s.chipSub}>on track</Text>
              </View>
            </View>

            {!data.omsetTersedia ? (
              <Text style={s.warn}>Sheet omset (PCP) tidak bisa ditarik — komponen omset dilewati.</Text>
            ) : null}

            <Text style={s.section}>Sales Field</Text>
            {field.length === 0 ? <Text style={s.meta}>Belum ada sales lapangan.</Text> : null}
            {field.map((p: any) => (
              <TouchableOpacity key={p.id} style={s.person} onPress={() => setSel({ kind: "field", id: String(p.id) })} activeOpacity={0.85}>
                <View style={s.avatar}><Text style={s.avatarText}>{String(p.name || "?").slice(0, 2).toUpperCase()}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.personName}>{p.name}</Text>
                  <Text style={s.personMeta}>{p.area || "-"} • {p.hariMemenuhi}/{p.hariWajib} hari • {p.orderCount} toko order</Text>
                  <Text style={s.personMeta}>Omset {pctText(p.omsetBulanPct)} • mingguan {pctText(p.omsetMingguPct)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[s.personScore, { color: p.skor >= ON_TRACK_MIN ? GREEN : ORANGE }]}>{p.skor}</Text>
                  <Status skor={p.skor} />
                </View>
              </TouchableOpacity>
            ))}

            <Text style={s.section}>Sales & Marketing / Telemarketing</Text>
            {tele.length === 0 ? <Text style={s.meta}>Belum ada telemarketing.</Text> : null}
            {tele.map((p: any) => (
              <TouchableOpacity key={p.id} style={s.person} onPress={() => setSel({ kind: "tele", id: String(p.id) })} activeOpacity={0.85}>
                <View style={[s.avatar, { backgroundColor: "#F4EBFF" }]}>
                  <Text style={[s.avatarText, { color: "#6941C6" }]}>{String(p.name || "?").slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.personName}>{p.name}</Text>
                  <Text style={s.personMeta}>
                    {p.area || "-"} • Penagihan {p.tagihClosed}/{p.tagihTotal} • Orderan {p.spkOrder}/{p.spkTotal}
                  </Text>
                  <Text style={s.personMeta}>FU {p.fuOrder}/{p.fuTotal} order • Omset {pctText(p.omsetBulanPct)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[s.personScore, { color: p.skor >= ON_TRACK_MIN ? GREEN : ORANGE }]}>{p.skor}</Text>
                  <Status skor={p.skor} />
                </View>
              </TouchableOpacity>
            ))}

            <Text style={s.note}>
              Skor memakai data kunjungan, riwayat SPK Admin (piutang & orderan), FU Toko, dan omset PCP sampai hari
              ini. Ambang on track {ON_TRACK_MIN}/100. Ketuk nama untuk melihat rincian dan penjelasannya.
            </Text>
          </>
        )}
      </ScrollView>
      <TabBar active="spv" />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: "#FFF7F5", paddingTop: TOP_PAD, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  back: { color: "#D92D20", fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "800", color: C.ink, marginTop: 4 },
  meta: { fontSize: 11, color: C.inkMuted, marginTop: 2 },
  err: { fontSize: 11, color: RED, marginBottom: 8, fontWeight: "700" },
  warn: { fontSize: 11, color: ORANGE, marginBottom: 8 },

  monthBar: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 10 },
  monthBtn: {
    width: 30, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
  },
  monthArrow: { fontSize: 16, fontWeight: "800", color: C.inkSoft, lineHeight: 18 },
  monthLabel: { fontSize: 12, fontWeight: "800", color: C.ink, minWidth: 110, textAlign: "center" },

  section: {
    fontSize: 12, fontWeight: "800", color: C.inkMuted, textTransform: "uppercase",
    letterSpacing: 0.6, marginTop: 16, marginBottom: 6,
  },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  hero: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 14, marginBottom: 4,
  },
  heroScore: { fontSize: 40, fontWeight: "900", lineHeight: 42 },
  heroScoreUnit: { fontSize: 9.5, color: C.inkMuted, fontWeight: "700" },
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

  sub: { fontSize: 10, color: C.inkMuted, marginTop: 4 },
  note: { fontSize: 10, color: C.inkMuted, marginTop: 10, lineHeight: 15 },

  weeks: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  week: { flexBasis: 96, flexGrow: 1, backgroundColor: "#FAF7F5", borderRadius: 8, padding: 8 },
  weekLabel: { fontSize: 9, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.4 },
  weekValue: { fontSize: 11, fontWeight: "700", color: C.ink, marginTop: 2 },
  weekPct: { fontSize: 10, fontWeight: "700", marginTop: 1 },

  spkTitle: { fontSize: 9, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.6, textTransform: "uppercase" },

  chips: { flexDirection: "row", gap: 8, marginBottom: 8 },
  chip: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10 },
  chipLabel: { fontSize: 8.5, fontWeight: "800", color: C.inkMuted, letterSpacing: 0.4 },
  chipValue: { fontSize: 18, fontWeight: "900", color: C.ink, marginTop: 2 },
  chipSub: { fontSize: 9.5, color: C.inkMuted },

  person: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 11, marginBottom: 8,
  },
  avatar: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#EFF8FF", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 11, fontWeight: "800", color: "#175CD3" },
  personName: { fontSize: 12.5, fontWeight: "700", color: C.ink },
  personMeta: { fontSize: 10, color: C.inkMuted, marginTop: 2 },
  personScore: { fontSize: 19, fontWeight: "900", lineHeight: 22 },

  backWide: { alignItems: "center", paddingVertical: 12 },
  backWideText: { fontSize: 11, fontWeight: "700", color: RED },
});
