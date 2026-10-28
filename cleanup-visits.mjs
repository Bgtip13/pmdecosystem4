import { ConvexClient } from "convex/browser";

const client = new ConvexClient("https://vibrant-dotterel-990.convex.cloud");
let total = 0;
while (true) {
  const n = await client.mutation("visits:deleteAllVisits", {});
  if (!n) break;
  total += n;
  console.log("Terhapus:", total);
}
console.log("SELESAI - total kunjungan dihapus:", total);
await client.close();
