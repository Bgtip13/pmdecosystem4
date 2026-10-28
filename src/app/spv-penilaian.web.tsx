import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { A } from "../components/desktop/tokens";

const ON_TRACK_MIN = 70;

function monthKeyNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

const pctText = (p: any) => (p == null ? "-" : `${p}%`);

function Status({ skor }: { skor: number }) {
  const ok = skor >= ON_TRACK_MIN;
  return (
    <Text style={[s.tval, { color: ok ? A.green : A.orange, fontWeight: "700" }]}>
      {ok ? "ON TRACK" : "PERLU PERHATIAN"}
    </Text>
  );
}

export default function SpvPenilaianWeb() {
  const viewer = useQuery(api.users.viewer) as any;
  const mk = monthKeyNow();
  const run = useAction(api.penilaian.monthly);
  const boleh = viewer?.role === "supervisor" || viewer?.role === "owner";

  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!boleh) return;
    let alive = true;
    setErr(null);
    run({ monthKey: mk })
      .then((r: any) => { if (alive) setData(r); })
      .catch((e: any) => { if (alive) setErr(e?.message ? String(e.message) : "Gagal memuat penilaian."); });
    return () => { alive = false; };
  }, [boleh, mk]);

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.blue} /></View>;
  }
  if (!boleh) {
    return (
      <DesktopShell active="spv" title="Penilaian Sales & Telemarketing" subtitle="Khusus supervisor">
        <View style={s.card}><Text style={s.h1}>Akses dibatasi</Text><Text style={s.sub}>Halaman ini khusus supervisor.</Text></View>
      </DesktopShell>
    );
  }

  const field = data?.field ?? [];
  const tele = data?.tele ?? [];
  const sum = data?.summary;

  return (
    <DesktopShell
      active="spv"
      title="Penilaian Sales & Telemarketing"
      subtitle={`Bulan ${mk} • status dihitung otomatis sampai hari ini`}
    >
      {err ? <Text style={s.err}>{err}</Text> : null}

      {!data ? (
        <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <IOSSpinner size="small" color={A.blue} />
          <Text style={s.sub}>Menghitung penilaian & menarik omset…</Text>
        </View>
      ) : (
        <>
          <View style={s.grid}>
            <View style={s.chip}>
              <Text style={s.chipLabel}>SALES FIELD</Text>
              <Text style={s.chipValue}>{sum?.field?.onTrack ?? 0}/{sum?.field?.total ?? 0} on track</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipLabel}>TELEMARKETING</Text>
              <Text style={s.chipValue}>{sum?.tele?.onTrack ?? 0}/{sum?.tele?.total ?? 0} on track</Text>
            </View>
          </View>

          {!data.omsetTersedia && (
            <Text style={s.warn}>Sheet omset (PCP) tidak bisa ditarik — komponen omset dilewati sementara.</Text>
          )}

          <View style={s.panel}>
            <View style={s.panelHead}>
              <Text style={s.panelTitle}>1. Sales Field</Text>
              <Text style={s.muted}>Target 7 toko/hari · Sabtu 3 · Minggu & izin tidak dihitung</Text>
            </View>
            <View style={s.thead}>
              <Text style={[s.th, { width: 150 }]}>Sales</Text>
              <Text style={[s.th, { width: 150 }]}>Kunjungan</Text>
              <Text style={[s.th, { width: 110 }]}>Order</Text>
              <Text style={[s.th, { flex: 1 }]}>Keterangan</Text>
              <Text style={[s.th, { width: 90, textAlign: "right" }]}>Omset bln</Text>
              <Text style={[s.th, { width: 90, textAlign: "right" }]}>Omset mgg</Text>
              <Text style={[s.th, { width: 50, textAlign: "right" }]}>Skor</Text>
              <Text style={[s.th, { width: 130, textAlign: "right" }]}>Status</Text>
            </View>
            {field.length === 0 && <Text style={s.muted}>Belum ada sales lapangan.</Text>}
            {field.map((p: any, i: number) => (
              <View key={p.id} style={[s.trow, i === field.length - 1 && s.trowLast]}>
                <View style={{ width: 150 }}>
                  <Text style={s.tname} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.tsub}>{p.area}</Text>
                </View>
                <View style={{ width: 150 }}>
                  <Text style={s.tval}>{p.hariMemenuhi}/{p.hariWajib} hari</Text>
                  <Text style={s.tsub}>{p.kunjungan} toko • {pctText(p.kunjunganPct)}</Text>
                </View>
                <View style={{ width: 110 }}>
                  <Text style={s.tval}>{p.orderCount} toko</Text>
                  <Text style={s.tsub}>{pctText(p.orderPct)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tval}>{p.keteranganLengkap}/{p.kunjungan}</Text>
                  <Text style={s.tsub}>{pctText(p.ketPct)} lengkap</Text>
                </View>
                <Text style={[s.tval, { width: 90, textAlign: "right" }]}>{pctText(p.omsetBulanPct)}</Text>
                <Text style={[s.tval, { width: 90, textAlign: "right" }]}>{pctText(p.omsetMingguPct)}</Text>
                <Text style={[s.tval, { width: 50, textAlign: "right" }]}>{p.skor}</Text>
                <View style={{ width: 130, alignItems: "flex-end" }}><Status skor={p.skor} /></View>
              </View>
            ))}
          </View>

          <View style={s.panel}>
            <View style={s.panelHead}>
              <Text style={s.panelTitle}>2. Sales Telemarketing</Text>
              <Text style={s.muted}>SPK penagihan: toko + nominal sama muncul lagi besok = belum tertagih</Text>
            </View>
            <View style={s.thead}>
              <Text style={[s.th, { width: 150 }]}>Telemarketing</Text>
              <Text style={[s.th, { width: 150 }]}>FU Toko</Text>
              <Text style={[s.th, { flex: 1 }]}>SPK penagihan</Text>
              <Text style={[s.th, { width: 130 }]}>SPK orderan</Text>
              <Text style={[s.th, { width: 90, textAlign: "right" }]}>Omset bln</Text>
              <Text style={[s.th, { width: 90, textAlign: "right" }]}>Omset mgg</Text>
              <Text style={[s.th, { width: 50, textAlign: "right" }]}>Skor</Text>
              <Text style={[s.th, { width: 130, textAlign: "right" }]}>Status</Text>
            </View>
            {tele.length === 0 && <Text style={s.muted}>Belum ada telemarketing.</Text>}
            {tele.map((p: any, i: number) => (
              <View key={p.id} style={[s.trow, i === tele.length - 1 && s.trowLast]}>
                <View style={{ width: 150 }}>
                  <Text style={s.tname} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.tsub}>{p.area}</Text>
                </View>
                <View style={{ width: 150 }}>
                  <Text style={s.tval}>{p.fuOrder}/{p.fuTotal} order</Text>
                  <Text style={s.tsub}>no respon {p.fuNoRespon} • tidak order {p.fuTidakOrder} • {pctText(p.fuPct)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tval}>{p.tagihSelesai}/{p.tagihTotal} tertagih • {pctText(p.tagihPct)}</Text>
                  <Text style={s.tsub}>masih muncul besok {p.tagihMasih}</Text>
                </View>
                <View style={{ width: 130 }}>
                  <Text style={s.tval}>{p.spkOrder}/{p.spkTotal} • {pctText(p.spkPct)}</Text>
                  <Text style={s.tsub}>no respon {p.spkNoRespon} • tidak order {p.spkTidakOrder}</Text>
                </View>
                <Text style={[s.tval, { width: 90, textAlign: "right" }]}>{pctText(p.omsetBulanPct)}</Text>
                <Text style={[s.tval, { width: 90, textAlign: "right" }]}>{pctText(p.omsetMingguPct)}</Text>
                <Text style={[s.tval, { width: 50, textAlign: "right" }]}>{p.skor}</Text>
                <View style={{ width: 130, alignItems: "flex-end" }}><Status skor={p.skor} /></View>
              </View>
            ))}
          </View>

          <Text style={s.note}>
            Skor = rata-rata berbobot komponen di atas, ambang on track {ON_TRACK_MIN}/100. Komponen tanpa data
            (mis. omset belum tersedia) dilewati, bukan dihitung nol.
          </Text>
        </>
      )}
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:A.page},
  card:{backgroundColor:A.surface,borderWidth:1,borderColor:A.border,borderRadius:10,padding:16,gap:6},
  h1:{fontSize:14,fontWeight:'700',color:A.ink},
  sub:{fontSize:11,color:A.muted},
  err:{fontSize:11,color:A.red,marginBottom:8,fontWeight:'700'},
  warn:{fontSize:11,color:A.orange,marginBottom:8},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:12},
  chip:{flex:1,minWidth:220,backgroundColor:A.surface,borderWidth:1,borderColor:A.border,borderRadius:10,padding:12,gap:2},
  chipLabel:{fontSize:9.5,fontWeight:'800',color:A.inkSoft,letterSpacing:0.5},
  chipValue:{fontSize:16,fontWeight:'800',color:A.ink},
  panel:{backgroundColor:A.surface,borderWidth:1,borderColor:A.border,borderRadius:10,padding:12,gap:8},
  panelHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  panelTitle:{fontSize:12.5,fontWeight:'700',color:A.ink},
  thead:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:A.border,paddingBottom:6},
  th:{fontSize:9.5,fontWeight:'800',color:A.inkSoft,textTransform:'uppercase'},
  trow:{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:A.borderSoft},
  trowLast:{borderBottomWidth:0},
  tname:{fontSize:11.5,fontWeight:'600',color:A.ink},
  tsub:{fontSize:10,color:A.muted},
  tval:{fontSize:11,color:A.ink},
  muted:{fontSize:11,color:A.muted},
  note:{fontSize:10.5,color:A.muted,lineHeight:15},
});
