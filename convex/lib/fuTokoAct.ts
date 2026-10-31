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
  return map;
}

export type OrderInfo = {
  act: number | null;
  targetJadwal: number | null;
  sudahOrder: boolean;
  actDateKey: string | null;
  actTanggal: string | null;
  actNoSpk: string | null;
};

// ACT > 0 = toko sudah ada penjualan bulan ini → dianggap sudah order.
export function orderInfoOf(
  map: Map<string, JadwalActRow>,
  area: any,
  storeName: any
): OrderInfo {
  const row = map.get(storeKeyOf(area, storeName)) ?? null;
  const act = row?.act ?? null;
  return {
    act,
    targetJadwal: row?.target ?? null,
    sudahOrder: act != null && act > 0,
    actDateKey: row?.dateKey ?? null,
    actTanggal: row?.tanggal ?? null,
    actNoSpk: row?.noSpk ?? null,
  };
}
