// Peran yang tampilannya mengikuti Owner dan hanya boleh melihat (read-only).
// HR  = owner + menu Izin (boleh input izin) + riwayat kunjungan.
// Akunting = owner + riwayat Follow-up Admin saja (tanpa Kunjungan & FU Toko).
export type AppRole = "owner" | "supervisor" | "field" | "telemarketing" | "ppic" | "hr" | "akunting";

export const isOwnerLike = (role?: string | null): boolean =>
  role === "owner" || role === "hr" || role === "akunting";

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  field: "Sales Lapangan",
  telemarketing: "Telemarketing",
  ppic: "PPIC",
  hr: "HR",
  akunting: "Akunting",
};
