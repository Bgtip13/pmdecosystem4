import IOSSpinner from "../components/IOSSpinner";
import { useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import AppIcon from "../components/AppIcon";
import { TOP_PAD } from "../lib/layout";
import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const labelBulan = (k: string) => {
  const [y, m] = k.split("-");
  return `${NAMA_BULAN[Number(m) - 1] ?? k} ${y}`;
};
const rupiah = (n: number) => (n < 0 ? "-" : "") + "Rp" + Math.abs(n).toLocaleString("id-ID");
const angka = (n: number) => n.toLocaleString("id-ID");

const normTeks = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");

type Toko = { tokoKey: string; toko: string; area: string };

export default function LaporanProduk() {
  const C = useColors();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const status = useQuery(api.produk.statusSync);
  const sync = useAction(api.produkSync.manualSync);

  const [mode, setMode] = useState<"toko" | "produk" | null>(null);
  // alur Produk: brand → barang → toko
  const [bq, setBq] = useState("");
  const [pq, setPq] = useState("");
  const [pbrand, setPbrand] = useState<string | null>(null);
  const [pbarang, setPbarang] = useState<string | null>(null);
  const [pbulan, setPbulan] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [toko, setToko] = useState<Toko | null>(null);
  const [bulan, setBulan] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // Jeda 300 ms setelah berhenti mengetik, supaya server tidak dipanggil tiap huruf.
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Tiap langkah hanya meminta potongan kecilnya sendiri; "skip" = tidak ada panggilan sama sekali.
  const hasilCari = useQuery(api.produk.cariToko, mode === "toko" && !toko && dq.trim().length >= 2 ? { q: dq } : "skip");
  const bulanList = useQuery(api.produk.bulanToko, toko ? { tokoKey: toko.tokoKey } : "skip");
  const brandData = useQuery(api.produk.brandToko, toko && bulan ? { tokoKey: toko.tokoKey, bulan } : "skip");
  const rincian = useQuery(
    api.produk.rincianToko,
    toko && bulan && brand ? { tokoKey: toko.tokoKey, bulan, brand } : "skip",
  );

  const semuaBrand = useQuery(api.produk.daftarBrand, mode === "produk" && !pbrand ? {} : "skip");
  const daftarBarang = useQuery(api.produk.barangBrand, mode === "produk" && pbrand ? { brand: pbrand } : "skip");
  const bulanAktif = pbulan ?? (status?.bulan?.length ? status.bulan[status.bulan.length - 1] : null);
  const tokoList = useQuery(
    api.produk.tokoProduk,
    mode === "produk" && pbrand && pbarang && bulanAktif ? { brand: pbrand, barang: pbarang, bulan: bulanAktif } : "skip",
  );

  const bisaSinkron = viewer?.role === "supervisor" || viewer?.role === "owner";

  const kembali = () => {
    if (mode === "produk") {
      if (pbarang) setPbarang(null);
      else if (pbrand) { setPbrand(null); setPq(""); }
      else setMode(null);
      return;
    }
    if (mode === "toko") {
      if (brand) setBrand(null);
      else if (bulan) setBulan(null);
      else if (toko) setToko(null);
      else setMode(null);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/laporan");
  };

  const jalankanSinkron = async (semua: boolean) => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const r: any = await sync({ semua });
      const ringkas = (r?.hasil ?? []).map((h: any) => `${h.bulan}: ${h.status}`).join(" · ");
      setSyncMsg(ringkas || "Selesai.");
    } catch (e: any) {
      setSyncMsg(e?.message ?? "Gagal menyinkron.");
    } finally {
      setSyncing(false);
    }
  };

  const updatedText = status?.updatedAt
    ? "Diperbarui " + new Date(status.updatedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : status ? "Data belum pernah disinkron" : "";

  const Loading = <View style={styles.loadBox}><IOSSpinner size="small" color={C.primary} /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={kembali}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Produk per Toko</Text>
        <Text style={styles.sub}>{updatedText || "Cari per toko atau per produk"}</Text>
      </View>

      {/* Jejak pilihan — ketuk untuk kembali ke langkah itu */}
      {mode === "toko" && toko && (
        <View style={styles.crumbs}>
          <TouchableOpacity style={styles.crumb} onPress={() => { setBulan(null); setBrand(null); }}>
            <Text style={styles.crumbText} numberOfLines={1}>{toko.toko}</Text>
          </TouchableOpacity>
          {bulan && (
            <TouchableOpacity style={styles.crumb} onPress={() => setBrand(null)}>
              <Text style={styles.crumbText}>{labelBulan(bulan)}</Text>
            </TouchableOpacity>
          )}
          {brand && (
            <View style={[styles.crumb, styles.crumbOn]}>
              <Text style={[styles.crumbText, { color: C.onPrimary }]} numberOfLines={1}>{brand}</Text>
            </View>
          )}
        </View>
      )}

      {mode === "produk" && pbrand && (
        <View style={styles.crumbs}>
          <TouchableOpacity style={styles.crumb} onPress={() => setPbarang(null)}>
            <Text style={styles.crumbText} numberOfLines={1}>{pbrand}</Text>
          </TouchableOpacity>
          {pbarang && (
            <View style={[styles.crumb, styles.crumbOn]}>
              <Text style={[styles.crumbText, { color: C.onPrimary }]} numberOfLines={2}>{pbarang}</Text>
            </View>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {/* ===== Halaman awal: pilih Produk atau Toko ===== */}
        {mode === null && (
          <>
            <Text style={styles.section}>Mau cari lewat apa?</Text>
            <TouchableOpacity style={styles.choice} onPress={() => setMode("produk")}>
              <View style={[styles.choiceIcon, { backgroundColor: C.cyanSoft }]}>
                <AppIcon name="box" size={24} color={C.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Produk</Text>
                <Text style={styles.rowSub}>Pilih brand dan produk, lihat toko mana saja yang mengambil</Text>
              </View>
              <AppIcon name="chevron" size={18} color={C.inkFaint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.choice} onPress={() => setMode("toko")}>
              <View style={[styles.choiceIcon, { backgroundColor: C.primarySoft }]}>
                <AppIcon name="store" size={24} color={C.status.danger.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Toko</Text>
                <Text style={styles.rowSub}>Pilih toko, lihat produk yang diambil per bulan</Text>
              </View>
              <AppIcon name="chevron" size={18} color={C.inkFaint} />
            </TouchableOpacity>

            {bisaSinkron && (
              <View style={styles.syncBox}>
                <Text style={styles.syncTitle}>Sinkron data dari Google Sheet</Text>
                <Text style={styles.hint}>
                  Berjalan otomatis tiap 2 jam (08.00–18.00). Tekan di sini kalau perlu data terbaru sekarang.
                </Text>
                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <TouchableOpacity style={[styles.btn, syncing && { opacity: 0.5 }]} disabled={syncing} onPress={() => jalankanSinkron(false)}>
                    <Text style={styles.btnText}>{syncing ? "Menyinkron…" : "Sinkron sekarang"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.btnGhost, syncing && { opacity: 0.5 }]} disabled={syncing} onPress={() => jalankanSinkron(true)}>
                    <Text style={[styles.btnText, { color: C.primary }]}>Semua bulan</Text>
                  </TouchableOpacity>
                </View>
                {!!syncMsg && <Text style={[styles.hint, { marginTop: 8 }]}>{syncMsg}</Text>}
              </View>
            )}
          </>
        )}

        {/* ===== Produk — langkah 1: cari brand ===== */}
        {mode === "produk" && !pbrand && (
          <>
            <View style={styles.searchBox}>
              <AppIcon name="search" size={18} color={C.inkMuted} />
              <TextInput style={styles.searchInput} placeholder="Cari brand, mis. me-o…" value={bq}
                onChangeText={setBq} autoCorrect={false} autoCapitalize="none" />
              {bq.length > 0 && (
                <TouchableOpacity onPress={() => setBq("")}>
                  <AppIcon name="closeCircle" size={18} color={C.inkFaint} />
                </TouchableOpacity>
              )}
            </View>
            {normTeks(bq).length === 0 ? (
              <Text style={styles.hint}>Ketik nama brand untuk memulai.</Text>
            ) : semuaBrand === undefined ? Loading : (() => {
              const cocok = semuaBrand.filter((b: string) => normTeks(b).includes(normTeks(bq))).slice(0, 30);
              return cocok.length === 0 ? (
                <Text style={styles.hint}>Brand tidak ditemukan.</Text>
              ) : cocok.map((b: string) => (
                <TouchableOpacity key={b} style={styles.row} onPress={() => { setPbrand(b); setPq(""); setPbarang(null); }}>
                  <Text style={[styles.rowTitle, { flex: 1 }]}>{b}</Text>
                  <AppIcon name="chevron" size={18} color={C.inkFaint} />
                </TouchableOpacity>
              ));
            })()}
          </>
        )}

        {/* ===== Produk — langkah 2: pilih barang ===== */}
        {mode === "produk" && pbrand && !pbarang && (
          <>
            <View style={styles.searchBox}>
              <AppIcon name="search" size={18} color={C.inkMuted} />
              <TextInput style={styles.searchInput} placeholder={`Cari produk ${pbrand}…`} value={pq}
                onChangeText={setPq} autoCorrect={false} autoCapitalize="none" />
              {pq.length > 0 && (
                <TouchableOpacity onPress={() => setPq("")}>
                  <AppIcon name="closeCircle" size={18} color={C.inkFaint} />
                </TouchableOpacity>
              )}
            </View>
            {daftarBarang === undefined ? Loading : (() => {
              const kata = normTeks(pq);
              const cocok = daftarBarang.filter((b: string) => !kata || normTeks(b).includes(kata));
              return (
                <>
                  <Text style={styles.hint}>{cocok.length} produk{cocok.length > 60 ? " — ketik untuk mempersempit" : ""}</Text>
                  {cocok.slice(0, 60).map((b: string) => (
                    <TouchableOpacity key={b} style={styles.row} onPress={() => setPbarang(b)}>
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{b}</Text>
                      <AppIcon name="chevron" size={18} color={C.inkFaint} />
                    </TouchableOpacity>
                  ))}
                </>
              );
            })()}
          </>
        )}

        {/* ===== Produk — langkah 3: toko yang mengambil ===== */}
        {mode === "produk" && pbrand && pbarang && (
          <>
            <View style={styles.chips}>
              {[...(status?.bulan ?? [])].reverse().map((b: string) => (
                <TouchableOpacity key={b} style={[styles.chip, bulanAktif === b && styles.chipOn]} onPress={() => setPbulan(b)}>
                  <Text style={[styles.chipText, bulanAktif === b && { color: C.onPrimary }]}>{labelBulan(b)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {tokoList === undefined ? Loading : (
              <>
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>TOTAL {bulanAktif ? labelBulan(bulanAktif).toUpperCase() : ""}</Text>
                  <Text style={styles.totalValue}>{rupiah(tokoList.rp)}</Text>
                  <Text style={styles.rowSub}>Qty {angka(tokoList.qty)} · {tokoList.rows.length} toko</Text>
                </View>
                <Text style={styles.section}>Toko yang mengambil</Text>
                {tokoList.rows.length === 0 ? (
                  <Text style={styles.hint}>Tidak ada toko yang mengambil produk ini di bulan tersebut.</Text>
                ) : tokoList.rows.map((r: any, i: number) => (
                  <View key={r.tokoKey + i} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{r.toko}</Text>
                      <Text style={styles.rowSub}>{r.area} · Qty {angka(r.qty)}</Text>
                    </View>
                    <Text style={[styles.money, r.rp < 0 && { color: C.primary }]}>{rupiah(r.rp)}</Text>
                  </View>
                ))}
                {tokoList.terpotong && <Text style={styles.hint}>Daftar dipotong 500 toko teratas.</Text>}
              </>
            )}
          </>
        )}

        {/* ===== Langkah 1: cari toko ===== */}
        {mode === "toko" && !toko && (
          <>
            <View style={styles.searchBox}>
              <AppIcon name="search" size={18} color={C.inkMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari nama toko…"
                value={q}
                onChangeText={setQ}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => { setQ(""); setDq(""); }}>
                  <AppIcon name="closeCircle" size={18} color={C.inkFaint} />
                </TouchableOpacity>
              )}
            </View>

            {dq.trim().length < 2 ? (
              <Text style={styles.hint}>Ketik minimal 2 huruf nama toko untuk memulai.</Text>
            ) : hasilCari === undefined ? (
              Loading
            ) : hasilCari.length === 0 ? (
              <Text style={styles.hint}>Toko tidak ditemukan.</Text>
            ) : (
              hasilCari.map((t: Toko) => (
                <TouchableOpacity key={t.tokoKey} style={styles.row} onPress={() => { setToko(t); setBulan(null); setBrand(null); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{t.toko}</Text>
                    <Text style={styles.rowSub}>{t.area}</Text>
                  </View>
                  <AppIcon name="chevron" size={18} color={C.inkFaint} />
                </TouchableOpacity>
              ))
            )}

          </>
        )}

        {/* ===== Langkah 2: pilih bulan ===== */}
        {mode === "toko" && toko && !bulan && (
          <>
            <Text style={styles.section}>Pilih bulan</Text>
            {bulanList === undefined ? Loading : bulanList.length === 0 ? (
              <Text style={styles.hint}>Belum ada data penjualan untuk toko ini.</Text>
            ) : (
              bulanList.map((b: any) => (
                <TouchableOpacity key={b.bulan} style={styles.row} onPress={() => setBulan(b.bulan)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{labelBulan(b.bulan)}</Text>
                    <Text style={styles.rowSub}>{b.jumlahBrand} brand · Qty {angka(b.qty)}</Text>
                  </View>
                  <Text style={styles.money}>{rupiah(b.rp)}</Text>
                  <AppIcon name="chevron" size={18} color={C.inkFaint} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* ===== Langkah 3: brand pada bulan terpilih ===== */}
        {mode === "toko" && toko && bulan && !brand && (
          <>
            {brandData === undefined ? Loading : brandData === null ? (
              <Text style={styles.hint}>Data bulan ini tidak ditemukan.</Text>
            ) : (
              <>
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>TOTAL {labelBulan(bulan).toUpperCase()}</Text>
                  <Text style={styles.totalValue}>{rupiah(brandData.rp)}</Text>
                  <Text style={styles.rowSub}>Qty {angka(brandData.qty)}</Text>
                </View>
                <Text style={styles.section}>Brand yang diambil</Text>
                {brandData.brands.map((b: any) => (
                  <TouchableOpacity key={b.brand} style={styles.row} onPress={() => setBrand(b.brand)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{b.brand}</Text>
                      <Text style={styles.rowSub}>Qty {angka(b.qty)}</Text>
                    </View>
                    <Text style={styles.money}>{rupiah(b.rp)}</Text>
                    <AppIcon name="chevron" size={18} color={C.inkFaint} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {/* ===== Langkah 4: rincian barang ===== */}
        {mode === "toko" && toko && bulan && brand && (
          <>
            {rincian === undefined ? Loading : (
              <>
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>{brand.toUpperCase()} · {labelBulan(bulan).toUpperCase()}</Text>
                  <Text style={styles.totalValue}>{rupiah(rincian.reduce((s: number, r: any) => s + r.rp, 0))}</Text>
                  <Text style={styles.rowSub}>Qty {angka(rincian.reduce((s: number, r: any) => s + r.qty, 0))} · {rincian.length} barang</Text>
                </View>
                <Text style={styles.section}>Rincian barang</Text>
                {rincian.map((r: any, i: number) => (
                  <View key={r.barang + i} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{r.barang}</Text>
                      <Text style={styles.rowSub}>Qty {angka(r.qty)}</Text>
                    </View>
                    <Text style={[styles.money, r.rp < 0 && { color: C.primary }]}>{rupiah(r.rp)}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topbar: {
    backgroundColor: C.surfaceTint, paddingTop: TOP_PAD, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    shadowColor: "#101828", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  backText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  title: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  sub: { fontSize: 13, color: C.inkMuted, marginTop: 3, lineHeight: 18 },
  crumbs: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 12 },
  crumb: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6, marginRight: 6, marginBottom: 4, backgroundColor: C.card, maxWidth: "100%" },
  crumbOn: { backgroundColor: C.primary, borderColor: C.primary },
  crumbText: { fontSize: 12, fontWeight: "700", color: C.inkSoft },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.status.neutral.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 11, paddingHorizontal: 8, fontSize: 15, color: C.ink0 },
  choice: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 10, borderWidth: 1, borderColor: C.divider },
  choiceIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: C.status.neutral.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, color: C.inkSoft, fontWeight: "700" },
  hint: { fontSize: 12, color: C.inkMuted, marginTop: 10, lineHeight: 17 },
  section: { fontSize: 13, fontWeight: "800", color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.divider },
  rowTitle: { fontSize: 14, fontWeight: "800", color: C.ink0 },
  rowSub: { fontSize: 12, color: C.inkMuted, marginTop: 2 },
  money: { fontSize: 14, fontWeight: "900", color: C.status.success.fg, marginLeft: 10 },
  totalCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.divider, borderTopWidth: 3, borderTopColor: C.primary, marginBottom: 6 },
  totalLabel: { fontSize: 10, fontWeight: "800", color: C.inkMuted },
  totalValue: { fontSize: 20, fontWeight: "900", color: C.ink0, marginTop: 4 },
  loadBox: { paddingVertical: 28, alignItems: "center" },
  syncBox: { marginTop: 28, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.divider },
  syncTitle: { fontSize: 13, fontWeight: "800", color: C.ink },
  btn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginRight: 8 },
  btnGhost: { backgroundColor: C.card, borderWidth: 1, borderColor: C.primary },
  btnText: { color: C.onPrimary, fontWeight: "800", fontSize: 13 },
});
