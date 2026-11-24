import { useState } from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { A, FONT } from "./tokens";

// ===== Grafik SVG ringan (khusus web) — gaya video: bersih, bulat, gradasi lembut =====

// Batang mini (di sudut kartu KPI)
export function MiniBars({ values, color = A.ink, width = 64, height = 28, highlightLast = true }: {
  values: number[]; color?: string; width?: number; height?: number; highlightLast?: boolean;
}) {
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const gap = 3;
  const bw = Math.max(3, (width - gap * (n - 1)) / n);
  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * height);
        return (
          <Rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={2}
            fill={highlightLast && i === n - 1 ? color : color} opacity={highlightLast && i !== n - 1 ? 0.28 : 1} />
        );
      })}
    </Svg>
  );
}

// Garis tren mini
export function Sparkline({ values, color = A.violet, width = 84, height = 30 }: {
  values: number[]; color?: string; width?: number; height?: number;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...values), min = Math.min(...values);
  const rng = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / rng) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill="#fff" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

// Donut dengan teks tengah
export function Donut({ parts, size = 140, stroke = 16, center, sub }: {
  parts: { value: number; color: string }[]; size?: number; stroke?: number; center?: string; sub?: string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={A.borderSoft} strokeWidth={stroke} fill="none" />
        {total > 0 && parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = (
            <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={p.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${Math.max(0, len - 3)} ${c}`} strokeDashoffset={-off} strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          off += len;
          return el;
        })}
      </Svg>
      {center ? <Text style={{ fontSize: size * 0.22, fontWeight: "800", color: A.ink, letterSpacing: -1, fontFamily: FONT }}>{center}</Text> : null}
      {sub ? <Text style={{ fontSize: 11.5, color: A.muted, fontFamily: FONT }}>{sub}</Text> : null}
    </View>
  );
}

// Jam radial 24 jam (ala "Agents today"): tiap titik = satu kejadian pada jamnya
export type ClockDot = { hour: number; color: string; label?: string };
export function RadialClock({ dots, size = 300, nowHour }: { dots: ClockDot[]; size?: number; nowHour?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const cx = size / 2, cy = size / 2;
  const rOut = size / 2 - 14;
  const rIn = rOut * 0.42;
  const ang = (h: number) => (h / 24) * 2 * Math.PI - Math.PI / 2;
  const pt = (h: number, r: number) => [cx + r * Math.cos(ang(h)), cy + r * Math.sin(ang(h))];
  const now = nowHour ?? (new Date().getHours() + new Date().getMinutes() / 60);

  // susun titik per jam supaya tidak bertumpuk: ring dalam→luar
  const byHour: Record<number, number> = {};
  const placed = dots.map((d) => {
    const hk = Math.floor(d.hour);
    const k = byHour[hk] ?? 0;
    byHour[hk] = k + 1;
    const r = rIn + 16 + (k % 6) * ((rOut - rIn - 26) / 6);
    const [x, y] = pt(d.hour, r);
    return { ...d, x, y };
  });

  const arc = (h0: number, h1: number) => {
    const [x0, y0] = pt(h0, rOut), [x1, y1] = pt(h1, rOut);
    const large = h1 - h0 > 12 ? 1 : 0;
    return `M${cx} ${cy} L${x0} ${y0} A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} Z`;
  };
  const [nx, ny] = pt(now, rOut);
  const hh = String(Math.floor(now)).padStart(2, "0");
  const mm = String(Math.floor((now % 1) * 60)).padStart(2, "0");

  return (
    <View style={{ width: size, height: size, alignSelf: "center" }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="clk" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#E9E7FB" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#DDF1F6" stopOpacity="0.9" />
          </LinearGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={rOut} fill="#F3F4F8" />
        <Path d={arc(0, Math.max(0.01, Math.min(23.99, now)))} fill="url(#clk)" />
        <Circle cx={cx} cy={cy} r={rIn} fill="#fff" />
        {Array.from({ length: 24 }).map((_, h) => {
          const [x0, y0] = pt(h, rOut + 2), [x1, y1] = pt(h, rOut + (h % 6 === 0 ? 9 : 5));
          return <Line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke={A.mutedSoft} strokeWidth={h % 6 === 0 ? 1.6 : 1} />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = pt(h, rOut + 22 > size / 2 - 4 ? rOut + 12 : rOut + 12);
          return null;
        })}
        <Line x1={cx} y1={cy} x2={nx} y2={ny} stroke={A.ink} strokeWidth={2} strokeLinecap="round" />
        {placed.map((d, i) => (
          <G key={i}>
            <Circle cx={d.x} cy={d.y} r={hover === i ? 9 : 6.5} fill={d.color} stroke="#fff" strokeWidth={2} />
          </G>
        ))}
      </Svg>
      {/* area sentuh titik */}
      {placed.map((d, i) => (
        <View key={i}
          // @ts-ignore properti web
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          style={{ position: "absolute", left: d.x - 10, top: d.y - 10, width: 20, height: 20 } as any} />
      ))}
      {[["00", 0], ["06", 6], ["12", 12], ["18", 18]].map(([t, h]: any) => {
        const [x, y] = pt(h, rOut + 0);
        return (
          <Text key={t} style={{ position: "absolute", left: x - 12 + (h === 6 ? 14 : h === 18 ? -14 : 0), top: y - 8 + (h === 0 ? 20 : h === 12 ? -20 : 0), width: 24, textAlign: "center", fontSize: 10.5, color: A.muted, fontWeight: "700", fontFamily: FONT } as any}>{t}</Text>
        );
      })}
      <View style={{ position: "absolute", left: cx - 34, top: cy - 24, width: 68, height: 48, borderRadius: 24, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#1C2033", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } } as any}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: A.ink, fontFamily: FONT, letterSpacing: -0.4 }}>{hh}:{mm}</Text>
        <Text style={{ fontSize: 10, color: A.muted, fontFamily: FONT }}>Sekarang</Text>
      </View>
      {hover != null && placed[hover]?.label ? (
        <View style={{ position: "absolute", left: Math.min(size - 160, Math.max(0, placed[hover].x - 70)), top: Math.max(0, placed[hover].y - 40), maxWidth: 160, backgroundColor: A.ink, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 } as any} pointerEvents="none">
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600", fontFamily: FONT }} numberOfLines={2}>{placed[hover].label}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Area/line chart dengan label sumbu X
export function AreaChart({ values, labels, color = A.violet, height = 180, width = 560, target }: {
  values: number[]; labels?: string[]; color?: string; height?: number; width?: number; target?: number;
}) {
  const padL = 30, padR = 10, padT = 10, padB = 24;
  const max = Math.max(1, target ?? 0, ...values) * 1.1;
  const W = width - padL - padR, H = height - padT - padB;
  const x = (i: number) => padL + (values.length <= 1 ? W / 2 : (i / (values.length - 1)) * W);
  const y = (v: number) => padT + H - (v / max) * H;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = values.length ? `${line} L${x(values.length - 1)} ${padT + H} L${x(0)} ${padT + H} Z` : "";
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="ar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.28" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {ticks.map((t, i) => (
        <G key={i}>
          <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={A.borderSoft} strokeWidth={1} />
          <SvgText x={padL - 6} y={y(t) + 3} fontSize="10" fill={A.mutedSoft} textAnchor="end">{t}</SvgText>
        </G>
      ))}
      {target != null ? <Line x1={padL} x2={width - padR} y1={y(target)} y2={y(target)} stroke={A.green} strokeDasharray="4 4" strokeWidth={1.2} /> : null}
      {area ? <Path d={area} fill="url(#ar)" /> : null}
      {line ? <Path d={line} stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {values.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4.5 : 0} fill="#fff" stroke={color} strokeWidth={2.2} />)}
      {labels?.map((l, i) => (
        (labels.length <= 8 || i % Math.ceil(labels.length / 8) === 0)
          ? <SvgText key={i} x={x(i)} y={height - 6} fontSize="10" fill={A.mutedSoft} textAnchor="middle">{l}</SvgText> : null
      ))}
    </Svg>
  );
}

// Batang berkelompok/tunggal dengan label
export function BarChart({ data, height = 170, width = 520, color = A.ink }: {
  data: { label: string; value: number; color?: string }[]; height?: number; width?: number; color?: string;
}) {
  const padB = 22, padT = 16;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const slot = width / n;
  const bw = Math.min(34, slot * 0.58);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Line x1={0} x2={width} y1={height - padB} y2={height - padB} stroke={A.border} />
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 4 : 0, (d.value / max) * (height - padB - padT));
        const x = i * slot + (slot - bw) / 2;
        return (
          <G key={i}>
            <Rect x={x} y={height - padB - h} width={bw} height={h} rx={7} fill={d.color ?? color} />
            {d.value > 0 ? <SvgText x={x + bw / 2} y={height - padB - h - 5} fontSize="10.5" fontWeight="700" fill={A.inkSoft} textAnchor="middle">{d.value}</SvgText> : null}
            <SvgText x={x + bw / 2} y={height - 6} fontSize="10" fill={A.mutedSoft} textAnchor="middle">{d.label}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// Daftar progres horizontal (ala "Next to fire")
export function HBarList({ items }: { items: { label: string; value: number; max?: number; color?: string; right?: string; sub?: string }[] }) {
  return (
    <View style={{ gap: 14 }}>
      {items.map((it, i) => {
        const pct = Math.min(100, Math.max(0, (it.value / (it.max ?? 100)) * 100));
        return (
          <View key={i}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: A.ink, fontFamily: FONT }} numberOfLines={1}>{it.label}</Text>
              {it.right ? <Text style={{ fontSize: 12, color: A.muted, fontFamily: FONT }}>{it.right}</Text> : null}
            </View>
            <View style={{ height: 6, borderRadius: 6, backgroundColor: A.borderSoft, marginTop: 6, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: 6, borderRadius: 6, backgroundColor: it.color ?? A.teal }} />
            </View>
            {it.sub ? <Text style={{ fontSize: 11.5, color: A.mutedSoft, marginTop: 4, fontFamily: FONT }}>{it.sub}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
