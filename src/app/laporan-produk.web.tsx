import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import AppIcon from "../components/AppIcon";
import DesktopShell from "../components/desktop/DesktopShell";
import { DataTable, EmptyState, FilterChip, Kpi, Panel, Pill, SearchField, Segmented, WebButton } from "../components/desktop/ui";
import type { Col, Tone } from "../components/desktop/ui";
import { A } from "../components/desktop/tokens";
import { downloadCsv } from "../lib/downloadCsv";

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const labelBulan = (k: string) => {
  const [y, m] = k.split("-");
  return `${NAMA_BULAN[Number(m) - 1] ?? k} ${y}`;
};
const rupiah = (n: number) => (n < 0 ? "-" : "") + "Rp" + Math.abs(n).toLocaleString("id-ID");
const angka = (n: number) => n.toLocaleString("id-ID");
const normTeks = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
const AREA_TONE: Record<string, Tone> = { SOLO: "red", DIY: "blue", SEMARANG: "green" };
const web = (o: any) => o as any;

type Toko = { tokoKey: string; toko: string; area: string };

// Baris daftar pilihan (kiri)
function PickRow({ title, sub, on, onPress, right }: { title: string; sub?: string; on?: boolean; onPress: () => void; right?: string }) {
  return (
    <Pressable onPress={onPress} style={web([s.pick, on && s.pickOn, { cursor: "pointer" }])}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.pickTitle, on && { color: "#fff" }]} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={[s.pickSub, on && { color: "#C9CCD6" }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[s.pickRight, on && { color: "#fff" }]}>{right}</Text> : null}
      <AppIcon name="chevron" size={14} color={on ? "#fff" : A.mutedSoft} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

export default function LaporanProdukWeb() {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const status = useQuery(api.produk.statusSync);
  const sync = useAction(api.produkSync.manualSync);

  const [mode, setMode] = useState<"toko" | "produk">("toko");

  // ----- alur Toko -----
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [toko, setToko] = useState<Toko | null>(null);
  const [bulan, setBulan] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);

  // ----- alur Produk -----
  const [bq, setBq] = useState("");
  const [pq, setPq] = useState("");
  const [pbrand, setPbrand] = useState<string | null>(null);
  const [pbarang, setPbarang] = useState<string | null>(null);
  const [pbulan, setPbulan] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const hasilCari = useQuery(api.produk.cariToko, mode === "toko" && dq.trim().length >= 2 ? { q: dq } : "skip");
  const bulanList = useQuery(api.produk.bulanToko, mode === "toko" && toko ? { tokoKey: toko.tokoKey } : "skip");
  const bulanToko = bulan ?? (bulanList && bulanList.length ? bulanList[0].bulan : null);
  const brandData = useQuery(api.produk.brandToko, mode === "toko" && toko && bulanToko ? { tokoKey: toko.tokoKey, bulan: bulanToko } : "skip");
  const rincian = useQuery(api.produk.rincianToko, mode === "toko" && toko && bulanToko && brand ? { tokoKey: toko.tokoKey, bulan: bulanToko, brand } : "skip");

  const semuaBrand = useQuery(api.produk.daftarBrand, mode === "produk" ? {} : "skip");
  const daftarBarang = useQuery(api.produk.barangBrand, mode === "produk" && pbrand ? { brand: pbrand } : "skip");
  const bulanAktif = pbulan ?? (status?.bulan?.length ? status.bulan[status.bulan.length - 1] : null);
  const tokoList = useQuery(
    api.produk.tokoProduk,
    mode === "produk" && pbrand && pbarang && bulanAktif ? { brand: pbrand, barang: pbarang, bulan: bulanAktif } : "skip",
  );

  if (!viewer) return <View style={s.center}><IOSSpinner size="large" color={A.ink} /></View>;

  const bisaSinkron = viewer.role === "supervisor" || viewer.role === "owner";
  const updatedText = status?.updatedAt
    ? "Diperbarui " + new Date(status.updatedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : status ? "Data belum pernah disinkron" : "";

  const jalankanSinkron = async (semua: boolean) => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const r: any = await sync({ semua });
      setSyncMsg((r?.hasil ?? []).map((h: any) => `${h.bulan}: ${h.status}`).join(" · ") || "Sinkron selesai.");
    } catch (e: any) {
      setSyncMsg(e?.message ?? "Gagal menyinkron.");
    } finally {
      setSyncing(false);
    }
  };

  const switchMode = (m: string) => {
    setMode(m as any);
  };

  // ===== Kolom tabel =====
  const brandCols: Col[] = [
    { key: "brand", label: "Brand", flex: 2, render: (b: any) => <Text style={s.strong} numberOfLines={1}>{b.brand}</Text> },
    { key: "qty", label: "Qty", width: 90, align: "right", render: (b: any) => <Text style={s.cell}>{angka(b.qty)}</Text> },
    { key: "rp", label: "Penjualan", width: 150, align: "right", render: (b: any) => <Text style={[s.strong, b.rp < 0 && { color: A.red }]}>{rupiah(b.rp)}</Text> },
  ];
  const barangCols: Col[] = [
    { key: "barang", label: "Barang", flex: 3, render: (r: any) => <Text style={s.strong} numberOfLines={2}>{r.barang}</Text> },
    { key: "qty", label: "Qty", width: 90, align: "right", render: (r: any) => <Text style={s.cell}>{angka(r.qty)}</Text> },
    { key: "rp", label: "Penjualan", width: 150, align: "right", render: (r: any) => <Text style={[s.strong, r.rp < 0 && { color: A.red }]}>{rupiah(r.rp)}</Text> },
  ];
  const tokoCols: Col[] = [
    { key: "toko", label: "Toko", flex: 3, render: (r: any) => <Text style={s.strong} numberOfLines={1}>{r.toko}</Text> },
    { key: "area", label: "Area", width: 100, render: (r: any) => <Pill text={r.area} tone={AREA_TONE[r.area] ?? "gray"} size="sm" /> },
    { key: "qty", label: "Qty", width: 80, align: "right", render: (r: any) => <Text style={s.cell}>{angka(r.qty)}</Text> },
    { key: "rp", label: "Penjualan", width: 150, align: "right", render: (r: any) => <Text style={[s.strong, r.rp < 0 && { color: A.red }]}>{rupiah(r.rp)}</Text> },
  ];

  const loading = <View style={s.loadBox}><IOSSpinner size="small" color={A.ink} /></View>;

  // ===== Unduh =====
  const unduhBrand = () => {
    if (!toko || !bulanToko || !brandData) return;
    downloadCsv(`produk-${toko.toko}-${bulanToko}`.replace(/[^\w.-]+/g, "_"), ["Brand", "Qty", "Penjualan"], brandData.brands.map((b: any) => [b.brand, b.qty, b.rp]));
  };
  const unduhRincian = () => {
    if (!toko || !bulanToko || !brand || !rincian) return;
    downloadCsv(`produk-${toko.toko}-${brand}-${bulanToko}`.replace(/[^\w.-]+/g, "_"), ["Barang", "Qty", "Penjualan"], rincian.map((r: any) => [r.barang, r.qty, r.rp]));
  };
  const unduhToko = () => {
    if (!pbrand || !pbarang || !bulanAktif || !tokoList) return;
    downloadCsv(`toko-pengambil-${pbarang}-${bulanAktif}`.replace(/[^\w.-]+/g, "_"), ["Toko", "Area", "Qty", "Penjualan"], tokoList.rows.map((r: any) => [r.toko, r.area, r.qty, r.rp]));
  };

  // ===== Panel mode TOKO =====
  const renderToko = () => {
    const cocokToko = (hasilCari ?? []) as Toko[];
    return (
      <View style={s.cols}>
        <Panel title="Cari toko" sub="Ketik minimal 2 huruf nama toko" basis={320}>
          <SearchField value={q} onChangeText={(v: string) => { setQ(v); }} placeholder="Nama toko…" width={"100%"} />
          <View style={{ marginTop: 12, gap: 8 }}>
            {dq.trim().length < 2 ? (
              <Text style={s.hint}>Belum ada pencarian.</Text>
            ) : hasilCari === undefined ? loading : cocokToko.length === 0 ? (
              <Text style={s.hint}>Toko tidak ditemukan.</Text>
            ) : cocokToko.map((t) => (
              <PickRow key={t.tokoKey} title={t.toko} sub={t.area} on={toko?.tokoKey === t.tokoKey}
                onPress={() => { setToko(t); setBulan(null); setBrand(null); }} />
            ))}
          </View>
        </Panel>

        <View style={s.main}>
          {!toko ? (
            <Panel title="Produk per toko">
              <EmptyState icon="store" title="Pilih toko dulu" desc="Cari nama toko di kolom kiri untuk melihat produk yang diambil per bulan." />
            </Panel>
          ) : (
            <>
              <Panel
                title={toko.toko}
                sub={toko.area}
                right={<WebButton label="Ganti toko" variant="ghost" size="sm" onPress={() => { setToko(null); setBulan(null); setBrand(null); }} />}
              >
                {bulanList === undefined ? loading : bulanList.length === 0 ? (
                  <Text style={s.hint}>Belum ada data penjualan untuk toko ini.</Text>
                ) : (
                  <View style={s.chips}>
                    {bulanList.map((b: any) => (
                      <FilterChip key={b.bulan} label={labelBulan(b.bulan)} on={bulanToko === b.bulan} count={null}
                        onPress={() => { setBulan(b.bulan); setBrand(null); }} />
                    ))}
                  </View>
                )}
              </Panel>

              {bulanToko ? (
                <Panel
                  title={`Brand yang diambil — ${labelBulan(bulanToko)}`}
                  right={<WebButton label="Unduh CSV" icon="download" variant="ghost" size="sm" disabled={!brandData} onPress={unduhBrand} />}
                  flush
                >
                  {brandData === undefined ? loading : brandData === null ? (
                    <Text style={[s.hint, { padding: 20 }]}>Data bulan ini tidak ditemukan.</Text>
                  ) : (
                    <>
                      <View style={s.kpis}>
                        <Kpi icon="cash" tone="green" label="Total penjualan" value={rupiah(brandData.rp)} />
                        <Kpi icon="box" tone="violet" label="Total qty" value={angka(brandData.qty)} hint={`${brandData.brands.length} brand`} />
                      </View>
                      <DataTable
                        cols={brandCols}
                        rows={brandData.brands}
                        keyOf={(b: any) => b.brand}
                        minWidth={460}
                        onRowPress={(b: any) => setBrand(b.brand)}
                        empty={<EmptyState icon="box" title="Tidak ada brand" />}
                      />
                      <Text style={s.tip}>Klik brand untuk melihat rincian barangnya.</Text>
                    </>
                  )}
                </Panel>
              ) : null}

              {bulanToko && brand ? (
                <Panel
                  title={`Rincian ${brand}`}
                  sub={labelBulan(bulanToko)}
                  right={
                    <View style={s.row}>
                      <WebButton label="Unduh CSV" icon="download" variant="ghost" size="sm" disabled={!rincian} onPress={unduhRincian} />
                      <WebButton icon="close" variant="ghost" size="sm" onPress={() => setBrand(null)} />
                    </View>
                  }
                  flush
                >
                  {rincian === undefined ? loading : (
                    <>
                      <View style={s.kpis}>
                        <Kpi icon="cash" tone="green" label="Penjualan" value={rupiah(rincian.reduce((t: number, r: any) => t + r.rp, 0))} />
                        <Kpi icon="box" tone="violet" label="Qty" value={angka(rincian.reduce((t: number, r: any) => t + r.qty, 0))} hint={`${rincian.length} barang`} />
                      </View>
                      <DataTable cols={barangCols} rows={rincian} keyOf={(r: any, i: number) => r.barang + i} minWidth={460}
                        empty={<EmptyState icon="box" title="Tidak ada barang" />} />
                    </>
                  )}
                </Panel>
              ) : null}
            </>
          )}
        </View>
      </View>
    );
  };

  // ===== Panel mode PRODUK =====
  const renderProduk = () => {
    const kataBrand = normTeks(bq);
    const cocokBrand = (semuaBrand ?? []).filter((b: string) => !kataBrand || normTeks(b).includes(kataBrand)).slice(0, 60);
    const kataBarang = normTeks(pq);
    const cocokBarang = (daftarBarang ?? []).filter((b: string) => !kataBarang || normTeks(b).includes(kataBarang));

    return (
      <View style={s.cols}>
        <Panel title="1. Brand" sub="Cari brand, mis. me-o" basis={260}>
          <SearchField value={bq} onChangeText={setBq} placeholder="Nama brand…" width={"100%"} />
          <View style={{ marginTop: 12, gap: 8 }}>
            {semuaBrand === undefined ? loading : cocokBrand.length === 0 ? (
              <Text style={s.hint}>Brand tidak ditemukan.</Text>
            ) : cocokBrand.map((b: string) => (
              <PickRow key={b} title={b} on={pbrand === b} onPress={() => { setPbrand(b); setPbarang(null); setPq(""); }} />
            ))}
          </View>
        </Panel>

        <Panel title="2. Produk" sub={pbrand ?? "Pilih brand dulu"} basis={300}>
          {!pbrand ? (
            <Text style={s.hint}>Pilih brand di kolom kiri.</Text>
          ) : (
            <>
              <SearchField value={pq} onChangeText={setPq} placeholder={`Cari produk ${pbrand}…`} width={"100%"} />
              <View style={{ marginTop: 12, gap: 8 }}>
                {daftarBarang === undefined ? loading : (
                  <>
                    <Text style={s.hint}>{cocokBarang.length} produk{cocokBarang.length > 60 ? " — ketik untuk mempersempit" : ""}</Text>
                    {cocokBarang.slice(0, 60).map((b: string) => (
                      <PickRow key={b} title={b} on={pbarang === b} onPress={() => setPbarang(b)} />
                    ))}
                  </>
                )}
              </View>
            </>
          )}
        </Panel>

        <Panel
          title="3. Toko yang mengambil"
          sub={pbarang ?? "Pilih produk dulu"}
          basis={420}
          right={pbarang ? <WebButton label="Unduh CSV" icon="download" variant="ghost" size="sm" disabled={!tokoList} onPress={unduhToko} /> : undefined}
          flush={!!pbarang}
        >
          {!pbrand || !pbarang ? (
            <Text style={[s.hint, !pbarang && { padding: 0 }]}>Pilih brand lalu produk untuk melihat toko pengambilnya.</Text>
          ) : (
            <>
              <View style={[s.chips, { paddingHorizontal: 20, paddingBottom: 12 }]}>
                {[...(status?.bulan ?? [])].reverse().map((b: string) => (
                  <FilterChip key={b} label={labelBulan(b)} on={bulanAktif === b} onPress={() => setPbulan(b)} />
                ))}
              </View>
              {tokoList === undefined ? loading : (
                <>
                  <View style={s.kpis}>
                    <Kpi icon="cash" tone="green" label={`Total ${bulanAktif ? labelBulan(bulanAktif) : ""}`} value={rupiah(tokoList.rp)} />
                    <Kpi icon="store" tone="violet" label="Toko" value={tokoList.rows.length} hint={`Qty ${angka(tokoList.qty)}`} />
                  </View>
                  <DataTable cols={tokoCols} rows={tokoList.rows} keyOf={(r: any, i: number) => r.tokoKey + i} minWidth={480}
                    empty={<EmptyState icon="store" title="Tidak ada toko" desc="Tidak ada toko yang mengambil produk ini di bulan tersebut." />} />
                  {tokoList.terpotong ? <Text style={s.tip}>Daftar dipotong 500 toko teratas.</Text> : null}
                </>
              )}
            </>
          )}
        </Panel>
      </View>
    );
  };

  return (
    <DesktopShell
      active="laporan"
      title="Produk per Toko"
      subtitle={updatedText || "Cari per toko atau per produk"}
      right={
        <View style={s.row}>
          <WebButton label="Kembali ke Laporan" icon="back" variant="ghost" onPress={() => router.replace("/laporan")} />
          {bisaSinkron ? (
            <>
              <WebButton label={syncing ? "Menyinkron…" : "Sinkron sekarang"} icon="refresh" variant="soft" disabled={syncing} onPress={() => jalankanSinkron(false)} />
              <WebButton label="Semua bulan" variant="ghost" disabled={syncing} onPress={() => jalankanSinkron(true)} />
            </>
          ) : null}
        </View>
      }
    >
      <View style={s.stack}>
        {syncMsg ? (
          <View style={s.notice}><Text style={s.noticeText}>{syncMsg}</Text></View>
        ) : null}
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { key: "toko", label: "Per Toko", icon: "store" },
            { key: "produk", label: "Per Produk", icon: "box" },
          ]}
        />
        {mode === "toko" ? renderToko() : renderProduk()}
      </View>
    </DesktopShell>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  stack: { gap: 16 },
  cols: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  main: { flexBasis: 560, flexGrow: 3, minWidth: 320, gap: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  loadBox: { padding: 24, alignItems: "center" },
  hint: { fontSize: 13, color: A.muted, lineHeight: 18 },
  tip: { fontSize: 12.5, color: A.muted, padding: 14, paddingHorizontal: 20 },
  strong: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  cell: { fontSize: 13, color: A.inkSoft },
  pick: {
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: A.border, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: A.surface,
  },
  pickOn: { backgroundColor: A.ink, borderColor: A.ink },
  pickTitle: { fontSize: 13.5, fontWeight: "700", color: A.ink },
  pickSub: { fontSize: 12, color: A.muted, marginTop: 2 },
  pickRight: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, marginLeft: 8 },
  notice: { borderRadius: 14, borderWidth: 1, borderColor: A.border, backgroundColor: A.surface, paddingHorizontal: 14, paddingVertical: 11 },
  noticeText: { fontSize: 13, color: A.inkSoft },
});
