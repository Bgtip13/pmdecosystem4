import { ConvexClient } from "convex/browser";

const client = new ConvexClient("https://vibrant-dotterel-990.convex.cloud");
try {
  const u = await client.query("users:firstUser");
  console.log("FIRST USER:", JSON.stringify(u, null, 2));
} catch (e) {
  console.error("ERROR:", e.message);
}
await client.close();
