import IOSSpinner from "../components/IOSSpinner";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import AppIcon from "../components/AppIcon";
import { A } from "../components/desktop/tokens";

function monthKeyNow() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

export default function SpvPenilaianWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const mk = monthKeyNow();
  const kpiSales = useQuery(api.visits.monthlyKpi, viewer?.role === "supervisor" ? {} : "skip") as any;
  const kpiTele = useQuery(api.visits.monthlyKpiTele, viewer?.role === "supervisor" ? {} : "skip") as any;
  const fu = useQuery(api.piutang.collectionAssessment, viewer?.role === "supervisor" ? { monthKey: mk } : "skip") as any;
  const spk = useQuery(api.orderFollowups.collectionAssessment, viewer?.role === "supervisor" ? { monthKey: mk } : "skip") as any;

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.blue} /></View>;
  }
  if (viewer.role !== "supervisor") {
    return (
      <DesktopShell active="spv" title="Penilaian Sales & Telemarketing" subtitle="Khusus supervisor">
        <View style={s.card}><Text style={s.h1}>Akses dibatasi</Text><Text style={s.sub}>Halaman ini khusus supervisor.</Text></View>
      </DesktopShell>
    );
  }

  const f = fu?.[0];
  const sfu = spk?.[0];

  return (
    <DesktopShell active="spv" title="Penilaian Sales & Telemarketing" subtitle={`Bulan ${mk} • On-track berdasarkan kunjungan, keterangan & follow-up`}>
      <View style={s.grid}>
        <View style={[s.panel, { flexBasis: 680, flexGrow: 2 }]}>
          <View style={s.panelHead}><Text style={s.panelTitle}>Sales Lapangan</Text></View>
          <View style={s.thead}>
            <Text style={[s.th,{width:160}]}>Sales</Text><Text style={[s.th,{width:80}]}>Kunjungan</Text><Text style={[s.th,{width:90}]}>Rata(menit)</Text><Text style={[s.th,{flex:1}]}>Ada Keterangan</Text><Text style={[s.th,{width:90,textAlign:'right'}]}>Status</Text><Text style={[s.th,{width:70,textAlign:'right'}]}>Skor</Text>
          </View>
          {(kpiSales||[]).map((k:any,i:number)=> {
            const onTrack = k.skor >= 70 && k.ketPct >= 70 && k.kunjungan >= 15;
            return (
              <View key={k.salesId} style={[s.trow,i===(kpiSales||[]).length-1&&s.trowLast]}>
                <View style={{width:160}}><Text style={s.tname} numberOfLines={1}>{k.salesName}</Text><Text style={s.tsub}>{k.area}</Text></View>
                <Text style={[s.tval,{width:80}]}>{k.kunjungan}</Text>
                <Text style={[s.tval,{width:90}]}>{k.rataMenit}</Text>
                <View style={{flex:1}}><Text style={s.tsub}>{k.adaKeterangan}/{k.kunjungan} ({k.ketPct}%)</Text></View>
                <Text style={[s.tval,{width:90,textAlign:'right',color:onTrack?A.green:A.orange}]}>{onTrack?'ON-TRACK':'PERLU PERHATIAN'}</Text>
                <Text style={[s.tval,{width:70,textAlign:'right'}]}>{k.skor}</Text>
              </View>
            );
          })}
          {(kpiSales||[]).length===0 && <Text style={s.muted}>Belum ada data.</Text>}
        </View>

        <View style={[s.panel, { flexBasis: 520, flexGrow: 1 }]}>
          <View style={s.panelHead}><Text style={s.panelTitle}>Telemarketing</Text></View>
          <View style={s.thead}>
            <Text style={[s.th,{width:140}]}>Telemarketing</Text><Text style={[s.th,{width:90}]}>Kunjungan</Text><Text style={[s.th,{flex:1}]}>Ada Keterangan</Text><Text style={[s.th,{width:90,textAlign:'right'}]}>Status</Text><Text style={[s.th,{width:70,textAlign:'right'}]}>Skor</Text>
          </View>
          {(kpiTele||[]).map((k:any,i:number)=> {
            const onTrack = k.skor >= 70 && k.ketPct >= 70;
            return (
              <View key={k.teleId} style={[s.trow,i===(kpiTele||[]).length-1&&s.trowLast]}>
                <View style={{width:140}}><Text style={s.tname} numberOfLines={1}>{k.teleName}</Text><Text style={s.tsub}>{k.area}</Text></View>
                <Text style={[s.tval,{width:90}]}>{k.kunjunganDibawah}</Text>
                <View style={{flex:1}}><Text style={s.tsub}>{k.adaKeterangan}/{k.kunjunganDibawah} ({k.ketPct}%)</Text></View>
                <Text style={[s.tval,{width:90,textAlign:'right',color:onTrack?A.green:A.orange}]}>{onTrack?'ON-TRACK':'PERLU PERHATIAN'}</Text>
                <Text style={[s.tval,{width:70,textAlign:'right'}]}>{k.skor}</Text>
              </View>
            );
          })}
          {(kpiTele||[]).length===0 && <Text style={s.muted}>Belum ada data.</Text>}
        </View>
      </View>

      <View style={[s.panel,{marginTop:12}]}>
        <View style={s.panelHead}><Text style={s.panelTitle}>Penilaian Follow-up Bulanan (FU Toko & SPK Admin)</Text></View>
        <View style={{flexDirection:'row',gap:12,flexWrap:'wrap'}}>
          <View style={{flex:1,minWidth:320}}>
            <Text style={s.subh}>FU Toko (Piutang)</Text>
            {f ? (<><Text style={s.tsub}>Muncul {f.totalMuncul} • Diduga lunas {f.didugaLunas} ({f.pctLunas}%) • Tertagih {f.tertagih}</Text>
              {(f.perArea||[]).map((a:any,i:number)=>(<View key={a.area} style={[s.trow,i===(f.perArea||[]).length-1&&s.trowLast]}><Text style={[s.tval,{width:80}]}>{a.area}</Text><Text style={[s.tval,{flex:1}]}>Muncul {a.muncul}</Text><Text style={[s.tval,{width:120,textAlign:'right',color:A.green}]}>Diduga lunas {a.lunas}</Text></View>))}</>) : <Text style={s.muted}>Belum ada data.</Text>}
          </View>
          <View style={{flex:1,minWidth:320}}>
            <Text style={s.subh}>SPK Admin (Order Followup)</Text>
            {sfu ? (<><Text style={s.tsub}>Muncul {sfu.totalMuncul} • Diduga lunas/selesai {sfu.didugaLunas} ({sfu.pctLunas}%)</Text>
              {(sfu.perArea||[]).map((a:any,i:number)=>(<View key={a.area} style={[s.trow,i===(sfu.perArea||[]).length-1&&s.trowLast]}><Text style={[s.tval,{width:80}]}>{a.area}</Text><Text style={[s.tval,{flex:1}]}>Muncul {a.muncul}</Text><Text style={[s.tval,{width:120,textAlign:'right',color:A.green}]}>Diduga lunas {a.lunas}</Text></View>))}</>) : <Text style={s.muted}>Belum ada data.</Text>}
          </View>
        </View>
      </View>

      <TouchableOpacity style={s.back} onPress={()=>router.back()}><Text style={s.backText}>← Kembali ke Menu SPV</Text></TouchableOpacity>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:A.page},
  card:{backgroundColor:A.surface,borderWidth:1,borderColor:A.border,borderRadius:10,padding:16,gap:6},
  h1:{fontSize:14,fontWeight:'700',color:A.ink},
  sub:{fontSize:11,color:A.muted},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:12},
  panel:{backgroundColor:A.surface,borderWidth:1,borderColor:A.border,borderRadius:10,padding:12,gap:8,flex:1,minWidth:320},
  panelHead:{flexDirection:'row',justifyContent:'space-between'},
  panelTitle:{fontSize:12.5,fontWeight:'700',color:A.ink},
  thead:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:A.border,paddingBottom:6},
  th:{fontSize:9.5,fontWeight:'800',color:A.inkSoft,textTransform:'uppercase'},
  trow:{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:A.borderSoft},
  trowLast:{borderBottomWidth:0},
  tname:{fontSize:11.5,fontWeight:'600',color:A.ink},
  tsub:{fontSize:10,color:A.muted},
  tval:{fontSize:11,color:A.ink},
  muted:{fontSize:11,color:A.muted},
  subh:{fontSize:11.5,fontWeight:'700',color:A.ink,marginBottom:4},
  back:{alignSelf:'flex-start',marginTop:10},
  backText:{fontSize:11,color:A.brand,fontWeight:'700'},
});
