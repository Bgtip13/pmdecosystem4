import IOSSpinner from "../components/IOSSpinner";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import TabBar from "../components/TabBar";
import { theme } from "../lib/theme";
import { TOP_PAD } from "../lib/layout";

const { colors: C } = theme;
const GREEN = "#16A34A";
const ORANGE = "#F59E0B";
const RED = C.primary;

function monthKeyNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

export default function SpvPenilaian() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const mk = monthKeyNow();
  const kpiSales = useQuery(api.visits.monthlyKpi, viewer?.role === "supervisor" ? {} : "skip") as any;
  const kpiTele = useQuery(api.visits.monthlyKpiTele, viewer?.role === "supervisor" ? {} : "skip") as any;
  const fu = useQuery(api.piutang.collectionAssessment, viewer?.role === "supervisor" ? { monthKey: mk } : "skip") as any;
  const spk = useQuery(api.orderFollowups.collectionAssessment, viewer?.role === "supervisor" ? { monthKey: mk } : "skip") as any;

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={RED} /></View>;
  if (viewer.role !== "supervisor") {
    return (
      <View style={s.screen}>
        <View style={s.topbar}><Text style={s.title}>Penilaian Sales & Telemarketing</Text></View>
        <View style={{padding:16}}><Text style={s.meta}>Khusus supervisor</Text></View>
        <TabBar active="spv" />
      </View>
    );
  }

  const f = fu?.[0];
  const sfu = spk?.[0];

  return (
    <View style={s.screen}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={s.back}>‹ Kembali</Text></TouchableOpacity>
        <Text style={s.title}>Penilaian Sales & Telemarketing</Text>
        <Text style={s.meta}>Bulan {mk} • On-track berdasarkan kunjungan, keterangan & follow-up</Text>
      </View>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:120}}>
        <Text style={s.section}>Sales Lapangan</Text>
        {(kpiSales||[]).map((k:any)=> {
          const onTrack = k.skor >= 70 && k.ketPct >= 70 && k.kunjungan >= 15;
          return (
            <View key={k.salesId} style={s.card}>
              <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                <Text style={s.name}>{k.salesName} <Text style={s.meta}>({k.area})</Text></Text>
                <Text style={{color:onTrack?GREEN:ORANGE,fontWeight:'800'}}>{onTrack?'ON-TRACK':'PERHATIAN'}</Text>
              </View>
              <Text style={s.meta}>Kunjungan {k.kunjungan} • Rata {k.rataMenit} mnt • Keterangan {k.ketPct}% • Skor {k.skor}</Text>
            </View>
          );
        })}
        {(kpiSales||[]).length===0 && <Text style={s.meta}>Belum ada data.</Text>}

        <Text style={s.section}>Telemarketing</Text>
        {(kpiTele||[]).map((k:any)=> {
          const onTrack = k.skor >= 70 && k.ketPct >= 70;
          return (
            <View key={k.teleId} style={s.card}>
              <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                <Text style={s.name}>{k.teleName} <Text style={s.meta}>({k.area})</Text></Text>
                <Text style={{color:onTrack?GREEN:ORANGE,fontWeight:'800'}}>{onTrack?'ON-TRACK':'PERHATIAN'}</Text>
              </View>
              <Text style={s.meta}>Kunjungan area {k.kunjunganDibawah} • Ada keterangan {k.ketPct}% • Skor {k.skor}</Text>
            </View>
          );
        })}
        {(kpiTele||[]).length===0 && <Text style={s.meta}>Belum ada data.</Text>}

        <Text style={s.section}>Follow-up Bulanan</Text>
        <View style={s.card}>
          <Text style={s.name}>FU Toko (Piutang)</Text>
          {f ? <Text style={s.meta}>Muncul {f.totalMuncul} • Diduga lunas {f.didugaLunas} ({f.pctLunas}%) • Tertagih {f.tertagih}</Text> : <Text style={s.meta}>Belum ada data.</Text>}
        </View>
        <View style={s.card}>
          <Text style={s.name}>SPK Admin (Order Followup)</Text>
          {sfu ? <Text style={s.meta}>Muncul {sfu.totalMuncul} • Diduga lunas/selesai {sfu.didugaLunas} ({sfu.pctLunas}%)</Text> : <Text style={s.meta}>Belum ada data.</Text>}
        </View>
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
  section:{fontSize:12,fontWeight:'800',color:C.inkMuted,textTransform:'uppercase',letterSpacing:0.6,marginTop:16,marginBottom:6},
  card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:12,marginBottom:8},
  name:{fontSize:13,fontWeight:'700',color:C.ink},
});
