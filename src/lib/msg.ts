// Ubah pesan error teknis menjadi kalimat rapi (buang awalan Convex / stack trace)
export function toFriendlyError(e: any, fallback = "Terjadi kesalahan. Coba lagi."): string {
  if (!e) return fallback;
  const raw = String(typeof e === "string" ? e : e?.message ?? "");
  let s = raw
    .replace(/^\[CONVEX[^\]]*\]\s*/i, "")
    .replace(/^Server Error\s*:?\s*/i, "")
    .replace(/^Uncaught Error\s*:?\s*/i, "")
    .replace(/^Error\s*:?\s*/i, "");
  const nl = s.search(/\n/);
  if (nl > 0) s = s.slice(0, nl);
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
