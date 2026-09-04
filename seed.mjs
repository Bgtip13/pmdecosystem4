import { ConvexClient } from "convex/browser";

const client = new ConvexClient("https://vibrant-dotterel-990.convex.cloud");
try {
  await client.action("users:seedUsers", {});
  console.log("SEED OK - 7 akun dibuat (password awal: pmd123)");
} catch (e) {
  console.error("SEED ERROR:", e.message);
}
await client.close();
