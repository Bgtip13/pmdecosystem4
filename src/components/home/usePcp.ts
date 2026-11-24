import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

const TTL = 5 * 60 * 1000;

let bulananCache: { at: number; data: any } | null = null;
let mingguanCache: { at: number; data: any } | null = null;

export type PcpState = "idle" | "loading" | "done" | "err";

/** PCP bulanan (Google Sheets) — cache 5 menit, supaya beranda tidak menarik berulang. */
export function usePcpBulanan(enabled = true) {
  const fetch = useAction(api.laporan.fetchPcpBulanan);
  const [data, setData] = useState<any>(bulananCache?.data ?? null);
  const [state, setState] = useState<PcpState>(bulananCache ? "done" : "idle");

  useEffect(() => {
    if (!enabled) return;
    if (bulananCache && Date.now() - bulananCache.at < TTL) {
      setData(bulananCache.data);
      setState("done");
      return;
    }
    let alive = true;
    setState("loading");
    fetch()
      .then((r: any) => {
        bulananCache = { at: Date.now(), data: r };
        if (alive) {
          setData(r);
          setState("done");
        }
      })
      .catch(() => {
        if (alive) setState("err");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { data, state };
}

/** PCP mingguan M1–M5 (Google Sheets) — cache 5 menit. */
export function usePcpMingguan(enabled = true) {
  const fetch = useAction(api.laporan.fetchPcpMingguan);
  const [data, setData] = useState<any>(mingguanCache?.data ?? null);
  const [state, setState] = useState<PcpState>(mingguanCache ? "done" : "idle");

  useEffect(() => {
    if (!enabled) return;
    if (mingguanCache && Date.now() - mingguanCache.at < TTL) {
      setData(mingguanCache.data);
      setState("done");
      return;
    }
    let alive = true;
    setState("loading");
    fetch()
      .then((r: any) => {
        mingguanCache = { at: Date.now(), data: r };
        if (alive) {
          setData(r);
          setState("done");
        }
      })
      .catch(() => {
        if (alive) setState("err");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { data, state };
}

const num = (n: any) => (typeof n === "number" && !isNaN(n) ? n : 0);

export type PcpTotals = { tgt: number; act: number; kejar: number; pct: number | null; global: boolean };

/** Total bulanan. Sheet punya baris GLOBAL (SPV), jadi baris itu dipakai agar tidak dobel. */
export function pcpTotals(rows: any[] | null | undefined): PcpTotals | null {
  if (!rows || rows.length === 0) return null;
  const global = rows.find(
    (r) => String(r.area ?? "").trim().toUpperCase() === "GLOBAL" && num(r.tgt) > 0
  );
  if (global) {
    const tgt = num(global.tgt);
    const act = num(global.act);
    return {
      tgt,
      act,
      kejar: num(global.kejar),
      pct: typeof global.pcpPct === "number" ? global.pcpPct : tgt > 0 ? (act / tgt) * 100 : null,
      global: true,
    };
  }
  let tgt = 0;
  let act = 0;
  let kejar = 0;
  for (const r of rows) {
    tgt += num(r.tgt);
    act += num(r.act);
    kejar += num(r.kejar);
  }
  return { tgt, act, kejar, pct: tgt > 0 ? (act / tgt) * 100 : null, global: false };
}

export type PcpArea = { area: string; tgt: number; act: number; pct: number | null; sdm: number };

/** Ringkasan per area (GLOBAL dikeluarkan supaya tidak terhitung dua kali). */
export function pcpAreas(rows: any[] | null | undefined): PcpArea[] {
  if (!rows) return [];
  const map = new Map<string, { tgt: number; act: number; pcts: number[]; sdm: number }>();
  for (const r of rows) {
    const area = String(r.area ?? "").trim().toUpperCase();
    if (!area || area === "GLOBAL") continue;
    const cur = map.get(area) ?? { tgt: 0, act: 0, pcts: [], sdm: 0 };
    cur.tgt += num(r.tgt);
    cur.act += num(r.act);
    if (typeof r.pcpPct === "number") cur.pcts.push(r.pcpPct);
    cur.sdm += 1;
    map.set(area, cur);
  }
  const order = ["SOLO", "DIY", "SEMARANG", "TAB"];
  return Array.from(map.entries())
    .map(([area, v]) => ({
      area,
      tgt: v.tgt,
      act: v.act,
      sdm: v.sdm,
      pct: v.tgt > 0 ? (v.act / v.tgt) * 100 : v.pcts.length ? v.pcts.reduce((a, b) => a + b, 0) / v.pcts.length : null,
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.area);
      const ib = order.indexOf(b.area);
      return (ia < 0 ? 90 : ia) - (ib < 0 ? 90 : ib) || a.area.localeCompare(b.area);
    });
}

export type PcpWeek = { label: string; pct: number | null };

/** Tren mingguan M1–M5. Pakai baris GLOBAL kalau ada, kalau tidak rata-rata semua baris. */
export function pcpWeekly(rows: any[] | null | undefined, labels?: string[]): PcpWeek[] {
  if (!rows || rows.length === 0) return [];
  const weekLabels: string[] =
    labels && labels.length > 0
      ? labels
      : (rows[0]?.weeks ?? []).map((w: any, i: number) => w?.m ?? `M${i + 1}`);

  const global = rows.find((r) => String(r.area ?? "").trim().toUpperCase() === "GLOBAL" && Array.isArray(r.weeks));
  if (global) {
    return weekLabels.map((label, i) => {
      const w = global.weeks?.[i];
      return { label, pct: typeof w?.pct === "number" ? w.pct : null };
    });
  }

  return weekLabels.map((label, i) => {
    const vals = rows
      .map((r) => r.weeks?.[i]?.pct)
      .filter((p: any) => typeof p === "number") as number[];
    return {
      label,
      pct: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    };
  });
}
