import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DesktopShell from "../components/desktop/DesktopShell";
import { Kpi, Panel, Chip, WebButton } from "../components/desktop/ui";
import { A, FONT } from "../components/desktop/tokens";

// ===== SPK SALES (WEB) — versi desktop dari layar HP =====
// Isinya sama: cari toko lalu buka kartu toko untuk check-in & isi SPK.
// Di web tidak ada peta/radius otomatis, jadi penekanannya di pencarian cepat
// dan tabel yang enak dibaca di layar lebar.

const AREA_BG: any = { SOLO: A.brandSoft, DIY: A.infoSoft, SEMARANG: A.greenSoft };
const AREA_FG: any = { SOLO: A.brandDark, DIY: A.info, SEMARANG: A.green };

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-";

export default function SpkSalesWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const role = viewer?.role;
  const isField = role === "field";
  const isSuper = role === "supervisor";
  const boleh = isField || isSuper;

  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [area, setArea] = useState<"ALL" | "SOLO" | "DIY" | "SEMARANG">("ALL");
  const [take, setTake] = useState(50);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const areaArg = isSuper
    ? (area === "ALL" ? undefined : area)
    : (viewer?.area || undefined);
  const searchMode = qDeb.length >= 2;

  const paged = useQuery(
    api.stores.listStoresPage,
    viewer && boleh && !searchMode ? ({ area: areaArg, take } as any) : "skip"
  ) as any;
  const found = useQuery(
    api.stores.searchStores,
    viewer && boleh && searchMode ? ({ q: qDeb, area: areaArg, limit: 50 } as any) : "skip"
  ) as any;
  const ongoing = useQuery(api.visits.getMyOngoing) as any;

  if (!viewer) {
    return <View style={s.center}><IOSSpinner size="large" color={A.brand} /></View>;
  }

  if (!boleh) {
    return (
      <DesktopShell active="spk-sales" title="SPK Sales" subtitle="Kunjungan toko oleh sales lapangan">
        <Panel icon="pin" title="Khusus sales lapangan & supervisor">
          <Text style={s.muted}>
            Layar ini dipakai untuk mencari toko lalu check-in kunjungan. Akun Anda ({role ?? "-"})
            tidak memakai alur kunjungan lapangan.
          </Text>
          <View style={{ marginTop: 12 }}>
            <WebButton label="Ke Dashboard" variant="ghost" icon="back" onPress={() => router.replace("/beranda" as any)} />
          </View>
        </Panel>
      </DesktopShell>
    );
  }

  const rows: any[] = searchMode ? (found ?? []) : (paged ?? []);
  const loading = searchMode ? found === undefined : paged === undefined;
  const belumKoordinat = rows.filter((r) => !r.lat).length;
  const hasMore = !searchMode && rows.length >= take;

  const areaLabel = areaArg ?? "Semua area";

  const openStore = (id: string) => router.push(`/store/${id}` as any);

  return (
    <DesktopShell
      active="spk-sales"
      title="SPK Sales"
      subtitle={`Cari toko lalu check-in • ${areaLabel}${ongoing?.visit ? " • ada kunjungan berjalan" : ""}`}
      right={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <WebButton label="Toko Baru" icon="plus" variant="ghost" onPress={() => router.push("/toko-baru" as any)} />
          <WebButton label="SPK Jadwal" icon="calendar" variant="ghost" onPress={() => router.push("/jadwal" as any)} />
        </View>
      }
    >
      <View style={s.kpiRow}>
        <Kpi
          label={searchMode ? "Hasil pencarian" : "Toko ditampilkan"}
          value={loading ? "…" : String(rows.length)}
          hint={searchMode ? `kata kunci "${qDeb}"` : `maks ${take} toko pertama`}
        />
        <Kpi label="Belum ada koordinat" value={loading ? "…" : String(belumKoordinat)} color={belumKoordinat ? A.orange : A.green} hint="check-in butuh titik toko" />
        <Kpi label="Kunjungan berjalan" value={ongoing?.visit ? "1" : "0"} color={ongoing?.visit ? A.orange : A.green} hint={ongoing?.visit ? `sejak ${fmtTime(ongoing.visit.checkinAt)}` : "tidak ada"} />
        <Kpi label="Area kerja" value={areaArg ?? "Semua"} hint={isField ? "sesuai akun Anda" : "bisa difilter"} />
      </View>

      {ongoing?.visit ? (
        <View style={s.banner}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.bannerTitle}>Kunjungan berjalan</Text>
            <Text style={s.bannerText} numberOfLines={2}>
              {ongoing.store?.name ?? "Toko"} — sejak {fmtTime(ongoing.visit.checkinAt)}. Check-out dulu sebelum membuka kunjungan lain.
            </Text>
          </View>
          <WebButton label="Lanjut isi SPK" icon="clipboard" onPress={() => router.push(`/visit/${ongoing.visit._id}` as any)} />
        </View>
      ) : null}

      <View style={s.toolbar}>
        <TextInput
          style={s.search}
          placeholder="Cari nama toko (min. 2 huruf)…"
          placeholderTextColor={A.mutedSoft}
          value={q}
          onChangeText={(v) => { setQ(v); setTake(50); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSuper ? (
          <View style={s.chipRow}>
            {(["ALL", "SOLO", "DIY", "SEMARANG"] as const).map((a) => {
              const on = area === a;
              return (
                <TouchableOpacity key={a} style={[s.chip, on && s.chipOn]} onPress={() => setArea(a)}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{a === "ALL" ? "Semua area" : a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      {q.trim().length === 1 ? (
        <Text style={s.hint}>Ketik minimal 2 huruf supaya pencarian jalan.</Text>
      ) : null}

      <Panel
        icon="store"
        title={`Daftar toko (${loading ? "…" : rows.length})`}
        right={<Text style={s.panelHint}>{searchMode ? "hasil server" : "30–50 toko pertama"}</Text>}
      >
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}><IOSSpinner size="small" color={A.brand} /></View>
        ) : rows.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <Text style={s.muted}>{searchMode ? "Tidak ada toko yang cocok." : "Belum ada toko untuk area ini."}</Text>
            <Text style={s.hint}>{searchMode ? "Coba kata kunci lain." : "Daftarkan lewat Toko Baru kalau memang belum ada."}</Text>
          </View>
        ) : (
          <>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 1.6 }]}>Toko</Text>
              <Text style={[s.th, { width: 96 }]}>Area</Text>
              <Text style={[s.th, { flex: 1.8 }]}>Alamat</Text>
              <Text style={[s.th, { width: 150 }]}>Koordinat</Text>
              <Text style={[s.th, { width: 150, textAlign: "right" }]}>Aksi</Text>
            </View>
            {rows.map((r, i) => (
              <View key={r._id} style={[s.trow, i === rows.length - 1 && s.trowLast]}>
                <View style={{ flex: 1.6, paddingRight: 10 }}>
                  <Text style={s.tName} numberOfLines={1}>{r.name}</Text>
                  {r.phone ? <Text style={s.tSub} numberOfLines={1}>{r.phone}</Text> : null}
                </View>
                <View style={{ width: 96 }}>
                  {r.area ? <Chip text={r.area} bg={AREA_BG[r.area] ?? A.surfaceAlt} fg={AREA_FG[r.area] ?? A.muted} /> : <Text style={s.tSub}>-</Text>}
                </View>
                <View style={{ flex: 1.8, paddingRight: 10 }}>
                  <Text style={s.tSub} numberOfLines={2}>{r.address || "-"}</Text>
                </View>
                <View style={{ width: 150, paddingRight: 8 }}>
                  {r.lat != null && r.lng != null ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`)}
                    >
                      <Text style={s.link}>Buka Maps</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[s.tSub, { color: A.orange }]}>Belum ada titik</Text>
                  )}
                </View>
                <View style={{ width: 150, alignItems: "flex-end" }}>
                  <TouchableOpacity style={s.btnOutline} onPress={() => openStore(r._id)}>
                    <Text style={s.btnOutlineText}>Buka toko</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </Panel>

      {hasMore ? (
        <View style={{ flexDirection: "row", justifyContent: "center" }}>
          <WebButton label={`Muat ${take} toko lagi`} icon="chevronDown" variant="ghost" onPress={() => setTake((t) => t + 50)} />
        </View>
      ) : null}

      <Text style={s.footNote}>
        Check-in tetap memakai lokasi HP/browser dan dibatasi radius toko. Kalau titik toko salah,
        ajukan “Reset longlat” dari kartu toko — supervisor yang menyetujui.
      </Text>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: A.page },
  muted: { fontSize: 11.5, color: A.muted, fontFamily: FONT },
  hint: { fontSize: 10.5, color: A.muted, marginTop: 6, fontFamily: FONT },
  panelHint: { fontSize: 10.5, color: A.muted, fontWeight: "700", fontFamily: FONT },

  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  banner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: A.orangeSoft, borderWidth: 1, borderColor: "#FEDF89",
    borderRadius: 10, padding: 13,
  },
  bannerTitle: { fontSize: 11.5, fontWeight: "800", color: A.orange, fontFamily: FONT },
  bannerText: { fontSize: 11, color: A.orange, marginTop: 3, lineHeight: 16, fontFamily: FONT },

  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  search: {
    flexGrow: 1, flexBasis: 320, minWidth: 220,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 12, color: A.ink, outlineStyle: "none", fontFamily: FONT,
  } as any,
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { borderWidth: 1, borderColor: A.border, backgroundColor: A.surface, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 },
  chipOn: { backgroundColor: A.brand, borderColor: A.brand },
  chipText: { fontSize: 10.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  chipTextOn: { color: "#fff" },

  thead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 7,
    backgroundColor: A.headerRow,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: A.border,
  },
  th: { fontSize: 9.5, fontWeight: "800", color: A.inkSoft, letterSpacing: 0.3, textTransform: "uppercase", fontFamily: FONT },
  trow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  trowLast: { borderBottomWidth: 0 },
  tName: { fontSize: 12, fontWeight: "700", color: A.ink, fontFamily: FONT },
  tSub: { fontSize: 10.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  link: { fontSize: 11, fontWeight: "700", color: A.info, fontFamily: FONT },

  btnOutline: { borderWidth: 1, borderColor: A.brandBorder, backgroundColor: A.surface, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  btnOutlineText: { fontSize: 11, fontWeight: "700", color: A.brandDark, fontFamily: FONT },

  footNote: { fontSize: 10.5, color: A.muted, lineHeight: 17, fontFamily: FONT },
});
