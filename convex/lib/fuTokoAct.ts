// ==========================================================================
// PENGHUBUNG FU TOKO ↔ TARIKAN JADWAL (SPK Jadwal)
//
// Sheet Toko_aktif hanya berisi nama toko. Sheet JADWAL (visit_schedules)
// membawa TARGET dan ACT (omset aktual bulan berjalan). Kalau nama + area
// toko FU terhubung otomatis dengan baris JADWAL dan ACT-nya > 0, toko itu
// dianggap SUDAH ORDER bulan ini — tanpa perlu di-follow-up lagi.
//
// Kunci pencocokan sama dengan modul lain: "AREA||nama ternormalisasi"
// (huruf kecil, selain huruf/angka jadi spasi). Jadi tidak ada tebakan liar:
// nama yang beda tipis tetap tidak dianggap sama.
//
// Nilai dihitung saat dibaca (derived), bukan disimpan, supaya begitu tarikan
// JADWAL diperbarui, status "sudah order" ikut segar tanpa sinkron ulang.
// ==========================================================================

export type JadwalActRow = {
  act: number | null;
  target: number | null;
  dateKey: string;
  tanggal: string;
  noSpk: string | null;
  scheduleStatus: string;
  storeId: string | null;
  // Penjualan bulan ini dari DATA PRODUK (tabel produk_bulan). Dipakai sebagai
  // sumber kedua penanda "sudah order" kalau ACT jadwal kosong / belum cocok.
  produkRp?: number;
  produkQty?: number;
};

export function normStoreName(s: any) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function storeKeyOf(area: any, name: any) {
  return `${area}||${normStoreName(name)}`;
}

// Satu query per bulan (bukan satu query per toko), lalu dicocokkan di memori.
export async function loadJadwalAct(ctx: any, monthKey: string) {
  const rows: any[] = await ctx.db
    .query("visit_schedules")
    .withIndex("by_month", (q: any) => q.eq("monthKey", monthKey))
    .take(4000);

  const map = new Map<string, JadwalActRow>();
  for (const r of rows) {
    // Baris yang dihapus/dibatalkan tidak dihitung sebagai penjualan.
    if (r.status === "CANCELLED") continue;

    const key = r.storeKey || storeKeyOf(r.area, r.storeName);
    const raw = r.act == null ? null : Number(r.act);
    const act = raw != null && Number.isFinite(raw) ? raw : null;

    // Satu toko = satu baris per bulan, tapi kalau ada duplikat pakai ACT terbesar.
    const prev = map.get(key);
    if (!prev || (act ?? 0) > (prev.act ?? 0)) {
      map.set(key, {
        act,
        target: r.target ?? null,
        dateKey: r.dateKey ?? "",
        tanggal: r.tanggal ?? "",
        noSpk: r.noSpk ?? null,
        scheduleStatus: r.status ?? "PLANNED",
        storeId: r.storeId ? String(r.storeId) : null,
      });
    }
  }

  // ---- Sumber ke-2: DATA PRODUK (penjualan per toko per bulan) ----
  // Toko yang punya penjualan di bulan ini otomatis dianggap sudah order,
  // walau tarikan JADWAL belum ada / ACT-nya masih kosong.
  // Kunci produk_bulan.tokoKey = "AREA||nama ternormalisasi" = storeKeyOf().
  try {
    const metas: any[] = await ctx.db
      .query("produk_meta")
      .withIndex("by_bulan", (q: any) => q.eq("bulan", monthKey))
      .collect();
    const gen = metas[0]?.gen;
    if (gen != null) {
      const prod: any[] = await ctx.db
        .query("produk_bulan")
        .withIndex("by_bulan_gen", (q: any) => q.eq("bulan", monthKey).eq("gen", gen))
        .take(8000);
      for (const p of prod) {
        const rp = Number(p.rp ?? 0);
        const qty = Number(p.qty ?? 0);
        if (!(rp > 0 || qty > 0)) continue;
        const prev = map.get(p.tokoKey);
        if (prev) {
          prev.produkRp = rp;
          prev.produkQty = qty;
        } else {
          map.set(p.tokoKey, {
            act: null, target: null, dateKey: "", tanggal: "", noSpk: null,
            scheduleStatus: "", storeId: null, produkRp: rp, produkQty: qty,
          });
        }
      }
    }
  } catch {
    // Data produk belum pernah disinkron → abaikan, pakai ACT jadwal saja.
  }
  return map;
}

export type OrderInfo = {
  act: number | null;
  targetJadwal: number | null;
  sudahOrder: boolean;
  actDateKey: string | null;
  actTanggal: string | null;
  actNoSpk: string | null;
  produkRp: number | null;
  produkQty: number | null;
  sumberOrder: "act" | "produk" | null;
};

// ACT > 0 = toko sudah ada penjualan bulan ini → dianggap sudah order.
export function orderInfoOf(
  map: Map<string, JadwalActRow>,
  area: any,
  storeName: any
): OrderInfo {
  const row = map.get(storeKeyOf(area, storeName)) ?? null;
  const act = row?.act ?? null;
  const dariAct = act != null && act > 0;
  const dariProduk = !!row && ((row.produkRp ?? 0) > 0 || (row.produkQty ?? 0) > 0);
  return {
    act,
    targetJadwal: row?.target ?? null,
    sudahOrder: dariAct || dariProduk,
    produkRp: row?.produkRp ?? null,
    produkQty: row?.produkQty ?? null,
    sumberOrder: dariAct ? "act" : dariProduk ? "produk" : null,
    actDateKey: row?.dateKey ?? null,
    actTanggal: row?.tanggal ?? null,
    actNoSpk: row?.noSpk ?? null,
  };
}
