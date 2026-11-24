import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export type PiutangArea = "SOLO" | "DIY" | "SEMARANG";

// Ringkasan piutang semua area (kartu Beranda). `null` = peran tidak berhak, `undefined` = memuat.
export function usePiutangAll() {
  const summary = useQuery(api.piutangAll.summary, {}) as any;
  const syncAction = useAction(api.piutangAll.sync);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError("");
    try {
      await syncAction({});
    } catch (e: any) {
      const raw = String(e?.message ?? "");
      // Pesan error Convex membawa awalan teknis; ambil kalimat terakhir yang bisa dibaca.
      const m = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
      setError((m?.[1] ?? raw) || "Gagal sinkron piutang.");
    } finally {
      setSyncing(false);
    }
  };

  return { summary, syncing, error, sync };
}

// Daftar piutang per pelanggan (halaman /piutang-semua).
export function usePiutangList(area: PiutangArea | "ALL", search: string) {
  return useQuery(api.piutangAll.list, {
    area: area === "ALL" ? undefined : area,
    search: search.trim() || undefined,
  }) as any[] | undefined;
}

export const fmtSynced = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "belum pernah";

export const canSyncPiutang = (role?: string | null) => role === "supervisor";
