// Ubah pesan error teknis menjadi kalimat rapi (buang awalan Convex / stack trace)
export function toFriendlyError(e: any, fallback = "Terjadi kesalahan. Coba lagi."): string {
  if (!e) return fallback;
  const raw = e?.message ?? e?.data?.message ?? e?.errorData ?? e;
  const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
  const clean = msg.replace(/^(Error|ConvexError|ServerError|Uncaught):\s*/i, "").trim();
  return clean || fallback;
}
