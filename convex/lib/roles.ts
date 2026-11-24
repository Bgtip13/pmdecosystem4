// Peran yang tampilannya mengikuti Owner dan hanya boleh MELIHAT (read-only):
// owner, hr, akunting. Dipakai di semua query/laporan yang dulu hanya mengecek "owner".
// Mutasi (ubah data) sengaja TIDAK memakai helper ini.
export const OWNER_LIKE_ROLES = ["owner", "hr", "akunting"] as const;

export function isOwnerLike(role: unknown): boolean {
  return role === "owner" || role === "hr" || role === "akunting";
}

// Peran tanpa area (tidak terikat wilayah).
export function isNoAreaRole(role: unknown): boolean {
  return role === "supervisor" || isOwnerLike(role);
}
