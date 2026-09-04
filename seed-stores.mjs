import { ConvexClient } from "convex/browser";
import Papa from "papaparse";

const URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGlsTx4NinTEqLvG3W7BjDBmlSKY3WqDpUVGxHR4-o5QCaOFrljy92iXGx8sV5tIkPTRy5KeRlGnS4/pub?gid=135639417&single=true&output=csv";
const client = new ConvexClient("https://vibrant-dotterel-990.convex.cloud");

const res = await fetch(URL);
const csv = await res.text();
const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });

const rows = [];
for (const r of data) {
  const area = (r.AREA || "").trim().toUpperCase();
  if (!["SOLO", "DIY", "SEMARANG"].includes(area)) continue;
  const ll = (r.LONGLAT || "").trim();
  let lat, lng;
  if (ll) {
    const p = ll.split(",");
    lat = parseFloat(p[0]);
    lng = parseFloat(p[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) { lat = undefined; lng = undefined; }
  }
  rows.push({
    name: (r.NAMA_TOKO || "").trim(),
    address: (r.ALAMAT || "").trim(),
    phone: (r.NO_HP || "").trim(),
    pic: (r.PIC || "").trim(),
    area,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
  });
}

console.log("Total baris valid:", rows.length);

const CHUNK = 40;
let added = 0, skipped = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const r2 = await client.mutation("stores:bulkImport", { stores: chunk });
  added += r2.added;
  skipped += r2.skipped;
  console.log(`...progress ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
}

console.log(`IMPORT SELESAI -> ${added} toko masuk, ${skipped} duplikat/kosong`);
await client.close();
