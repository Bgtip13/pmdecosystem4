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
const GREEN = "#16A34A";
const ORANGE = "#F59E0B";
const RED = C.primary;
const ON_TRACK_MIN = 70;

function monthKeyNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

const pctText = (p: any) => (p == null ? "-" : `${p}%`);

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.line}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function Status({ skor }: { skor: number }) {
  const ok = skor >= ON_TRACK_MIN;
  return (
    <Text style={[s.badge, { color: ok ? GREEN : ORANGE, borderColor: ok ? GREEN : ORANGE }]}>
      {ok ? "ON TRACK" : "PERLU PERHATIAN"}
    </Text>
  );
}

export default function SpvPenilaian() {
  const router = useRouter();
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

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={RED} /></View>;
  if (!boleh) {
    return (
      <View style={s.screen}>
        <View style={s.topbar}><Text style={s.title}>Penilaian Sales & Telemarketing</Text></View>
        <View style={{ padding: 16 }}><Text style={s.meta}>Khusus supervisor</Text></View>
        <TabBar active="spv" />
      </View>
    );
  }

  const field = data?.field ?? [];
  const tele = data?.tele ?? [];
  const sum = data?.summary;

  return (
    <View style={s.screen}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Kembali</Text></TouchableOpacity>
        <Text style={s.title}>Penilaian Sales & Telemarketing</Text>
        <Text style={s.meta}>Bulan {mk} • status dihitung otomatis sampai hari ini</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {err ? <Text style={s.err}>{err}</Text> : null}

        {!data ? (
          <View style={s.card}><IOSSpinner size="small" color={RED} /><Text style={s.meta}>Menghitung penilaian & menarik omset…</Text></View>
        ) : (
          <>
            <View style={s.chips}>
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

            <Text style={s.section}>1. Sales Field</Text>
            <Text style={s.hint}>
              Target kunjungan 7 toko/hari (Sabtu 3). Hari Minggu dan izin/cuti tidak dihitung.
            </Text>
            {field.length === 0 && <Text style={s.meta}>Belum ada sales lapangan.</Text>}
            {field.map((p: any) => (
              <View key={p.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.name}>{p.name}</Text>
                  <Status skor={p.skor} />
                </View>
                <Text style={s.meta}>{p.area} • Skor {p.skor}/100</Text>
                <Baris label="Kunjungan sesuai target" value={`${p.hariMemenuhi}/${p.hariWajib} hari (${p.kunjungan} toko)`} />
                <Baris label="Toko tembus order" value={`${p.orderCount} toko • ${pctText(p.orderPct)}`} />
                <Baris label="Keterangan lengkap" value={`${p.keteranganLengkap}/${p.kunjungan} • ${pctText(p.ketPct)}`} />
                <Baris label="Omset bulanan" value={pctText(p.omsetBulanPct)} />
                <Baris label={`Omset mingguan${p.omsetMingguLabel ? ` (${p.omsetMingguLabel})` : ""}`} value={pctText(p.omsetMingguPct)} />
                <Text style={s.komponen}>
                  {(p.komponen ?? []).map((k: any) => `${k.label} ${pctText(k.pct)}`).join(" • ")}
                </Text>
              </View>
            ))}

            <Text style={s.section}>2. Sales Telemarketing</Text>
            <Text style={s.hint}>
              SPK penagihan: toko + nominal yang sama muncul lagi besok dianggap belum tertagih.
            </Text>
            {tele.length === 0 && <Text style={s.meta}>Belum ada telemarketing.</Text>}
            {tele.map((p: any) => (
              <View key={p.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.name}>{p.name}</Text>
                  <Status skor={p.skor} />
                </View>
                <Text style={s.meta}>{p.area} • Skor {p.skor}/100</Text>
                <Baris
                  label="FU Toko"
                  value={`${p.fuOrder} order / ${p.fuTotal} • ${pctText(p.fuPct)}`}
                />
                <Text style={s.sub}>No respon {p.fuNoRespon} • tidak order {p.fuTidakOrder} • rencana order {p.fuPlan}</Text>
                <Baris
                  label="SPK penagihan tertagih"
                  value={`${p.tagihSelesai}/${p.tagihTotal} • ${pctText(p.tagihPct)}`}
                />
                <Text style={s.sub}>Masih muncul besok (belum tertagih) {p.tagihMasih}</Text>
                <Baris
                  label="SPK orderan"
                  value={`${p.spkOrder}/${p.spkTotal} • ${pctText(p.spkPct)}`}
                />
                <Text style={s.sub}>No respon {p.spkNoRespon} • tidak order {p.spkTidakOrder}</Text>
                <Baris label="Omset bulanan" value={pctText(p.omsetBulanPct)} />
                <Baris label={`Omset mingguan${p.omsetMingguLabel ? ` (${p.omsetMingguLabel})` : ""}`} value={pctText(p.omsetMingguPct)} />
                <Text style={s.komponen}>
                  {(p.komponen ?? []).map((k: any) => `${k.label} ${pctText(k.pct)}`).join(" • ")}
                </Text>
              </View>
            ))}

            <Text style={s.note}>
              Skor = rata-rata berbobot dari komponen di atas, ambang on track {ON_TRACK_MIN}/100.
              Komponen tanpa data (mis. omset belum tersedia) dilewati, bukan dihitung nol.
            </Text>
          </>
        )}
      </ScrollView>
      <TabBar active="spv" />
    </View>
  );
}

const s = StyleSheet.create({
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg},
  screen:{flex:1,backgroundColor:C.bg},
  topbar:{backgroundColor:'#FFF7F5',paddingTop:TOP_PAD,paddingHorizontal:16,paddingBottom:12,borderBottomLeftRadius:20,borderBottomRightRadius:20},
  back:{color:'#D92D20',fontWeight:'700'},
  title:{fontSize:18,fontWeight:'800',color:C.ink,marginTop:4},
  meta:{fontSize:11,color:C.inkMuted,marginTop:2},
  err:{fontSize:11,color:RED,marginBottom:8,fontWeight:'700'},
  warn:{fontSize:11,color:ORANGE,marginBottom:8},
  section:{fontSize:12,fontWeight:'800',color:C.inkMuted,textTransform:'uppercase',letterSpacing:0.6,marginTop:16,marginBottom:4},
  hint:{fontSize:11,color:C.inkMuted,marginBottom:6},
  card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:12,marginBottom:8},
  rowBetween:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  name:{fontSize:13,fontWeight:'700',color:C.ink},
  badge:{fontSize:9.5,fontWeight:'800',borderWidth:1,borderRadius:999,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'},
  line:{flexDirection:'row',justifyContent:'space-between',marginTop:6},
  label:{fontSize:11,color:C.inkMuted},
  value:{fontSize:11,fontWeight:'700',color:C.ink},
  sub:{fontSize:10,color:C.inkMuted,marginTop:2},
  komponen:{fontSize:10,color:C.inkMuted,marginTop:8},
  chips:{flexDirection:'row',gap:8},
  chip:{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:10},
  chipLabel:{fontSize:9,fontWeight:'800',color:C.inkMuted,letterSpacing:0.5},
  chipValue:{fontSize:14,fontWeight:'800',color:C.ink,marginTop:2},
  note:{fontSize:10,color:C.inkMuted,marginTop:12,lineHeight:15},
});
