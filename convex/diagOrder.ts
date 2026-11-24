import { internalQuery } from "./_generated/server";

// DIAGNOSA SPK ADMIN ORDERAN — hanya MEMBACA, tidak mengubah data apa pun.
// Jalankan dari dashboard Convex: Functions → diagOrder:ringkas → Run function.
//
// Yang dicari:
//  1. perHari       : tiap tanggal tampil (day) berisi berapa tugas, dari kunjungan tanggal berapa saja (sumber).
//                     Normalnya 1 tanggal tampil = 1 tanggal sumber (Senin = Sabtu).
//  2. anomaliSumber : tanggal tampil yang memuat kunjungan dari LEBIH dari satu tanggal.
//  3. dibuatPerHari : berapa dokumen dibuat tiap hari. Lonjakan = ada yang membuat massal.
//  4. kembar        : toko yang sama (area + nama) pada tanggal kunjungan yang sama muncul lebih dari satu.
//  5. antreanReview : jumlah INPG (menunggu disetujui) per tanggal tampil — ini ikut tampil di layar SPK Admin.
export const ringkas = internalQuery({
  handler: async (ctx) => {
    const WIB = 7 * 3600 * 1000;
    const hariWib = (ms: number) => new Date(ms + WIB).toISOString().slice(0, 10);

    const rows: any[] = await ctx.db.query("order_followups").order("desc").take(3000);

    const perHari: Record<string, { total: number; pending: number; INPG: number; CLSD: number; OPEN: number; sumber: string[] }> = {};
    const dibuatPerHari: Record<string, number> = {};
    const kelompok: Record<string, any[]> = {};

    for (const r of rows) {
      const d = (perHari[r.day] ??= { total: 0, pending: 0, INPG: 0, CLSD: 0, OPEN: 0, sumber: [] });
      d.total++;
      if (r.status === "pending") d.pending++;
      const wf = r.workflowStatus ?? "(kosong)";
      (d as any)[wf] = ((d as any)[wf] ?? 0) + 1;
      if (r.visitDay && !d.sumber.includes(r.visitDay)) d.sumber.push(r.visitDay);

      const h = hariWib(r.createdAt ?? r._creationTime);
      dibuatPerHari[h] = (dibuatPerHari[h] ?? 0) + 1;

      const k = `${r.area}::${r.nameKey}@${r.visitDay}`;
      (kelompok[k] ??= []).push({ id: r._id, storeId: r.storeId, dedupeKey: r.dedupeKey, day: r.day, wf: r.workflowStatus });
    }

    const anomaliSumber = Object.entries(perHari)
      .filter(([, v]) => v.sumber.length > 1)
      .map(([day, v]) => ({ day, sumber: v.sumber.sort(), total: v.total }));

    const kembar = Object.entries(kelompok)
      .filter(([, v]) => v.length > 1)
      .map(([toko, v]) => ({ toko, jumlah: v.length, contoh: v.slice(0, 3) }));

    const antreanReview = Object.fromEntries(
      Object.entries(perHari).filter(([, v]) => v.INPG > 0).map(([day, v]) => [day, v.INPG]),
    );

    return {
      dibaca: rows.length,
      perHari: Object.fromEntries(Object.entries(perHari).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)),
      anomaliSumber: anomaliSumber.slice(0, 20),
      dibuatPerHari: Object.fromEntries(Object.entries(dibuatPerHari).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)),
      jumlahKembar: kembar.length,
      kembar: kembar.slice(0, 15),
      antreanReview,
    };
  },
});
