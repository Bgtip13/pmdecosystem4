import { useState } from "react";
import type { ReactNode } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, Modal, ScrollView,
  useWindowDimensions,
} from "react-native";
import AppIcon from "../AppIcon";
import { A, FONT, R, SHADOW, SHADOW_POP } from "./tokens";

// ============================================================================
// KIT UI DESKTOP (khusus web) — dipakai semua layar *.web.tsx
// Gaya: kartu putih radius besar, tombol utama hitam, pill pastel, tabel lega.
// Komponen lama (Kpi, Panel, Bar, Field, NoteBox, Chip, WebButton) tetap ada dengan
// props yang sama, sehingga semua layar lama otomatis ikut tampilan baru.
// ============================================================================

export type Tone = "green" | "amber" | "red" | "violet" | "blue" | "gray" | "ink";

export const TONES: Record<Tone, { bg: string; fg: string; dot: string }> = {
  green: { bg: A.greenSoft, fg: A.green, dot: A.green },
  amber: { bg: A.orangeSoft, fg: A.orange, dot: A.amber },
  red: { bg: A.redSoft, fg: A.red, dot: A.red },
  violet: { bg: A.purpleSoft, fg: A.purple, dot: A.violet },
  blue: { bg: A.infoSoft, fg: A.info, dot: A.sky },
  gray: { bg: A.surfaceAlt, fg: A.muted, dot: A.mutedSoft },
  ink: { bg: A.ink, fg: "#FFFFFF", dot: A.ink },
};

const web = (o: any) => o as any; // properti khusus web (cursor, transition, dst.)

// ----------------------------------------------------------------------------
// Pill / Chip
// ----------------------------------------------------------------------------
export function Pill({ text, tone = "gray", dot, icon, size = "md" }: {
  text: string; tone?: Tone; dot?: boolean; icon?: string; size?: "sm" | "md";
}) {
  const t = TONES[tone];
  return (
    <View style={[s.pill, size === "sm" && s.pillSm, { backgroundColor: t.bg }]}>
      {dot ? <View style={[s.pillDot, { backgroundColor: t.dot }]} /> : null}
      {icon ? <AppIcon name={icon} size={size === "sm" ? 10 : 12} color={t.fg} style={{ marginRight: 4 }} /> : null}
      <Text style={[s.pillText, size === "sm" && { fontSize: 10.5 }, { color: t.fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// Versi lama: warna diberikan langsung (bg/fg).
export function Chip({ text, bg, fg }: any) {
  return (
    <View style={[s.pill, s.pillSm, { backgroundColor: bg ?? A.surfaceAlt }]}>
      <Text style={[s.pillText, { fontSize: 10.5, color: fg ?? A.muted }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Kartu, ikon, avatar
// ----------------------------------------------------------------------------
export function Card({ children, style, pad = 20 }: { children: ReactNode; style?: any; pad?: number }) {
  return <View style={[s.card, { padding: pad }, style]}>{children}</View>;
}

export function IconTile({ icon, tone = "gray", size = 36 }: { icon: string; tone?: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <View style={[s.iconTile, { width: size, height: size, borderRadius: Math.round(size * 0.34), backgroundColor: t.bg }]}>
      <AppIcon name={icon} size={Math.round(size * 0.48)} color={t.fg} />
    </View>
  );
}

const AVATAR_TONES = ["#EFECFD", "#E6F6EE", "#FFF1DB", "#EAF1FE", "#FDECEA", "#E7F7F6"];
const AVATAR_FG = ["#6A55D8", "#079455", "#B25E09", "#2563D8", "#D92D20", "#0F8F84"];
export function Avatar({ name, size = 32 }: { name?: string | null; size?: number }) {
  const n = String(name ?? "?").trim();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  const idx = h % AVATAR_TONES.length;
  const parts = n.split(/\s+/).filter(Boolean);
  const init = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_TONES[idx] }]}>
      <Text style={{ fontSize: Math.round(size * 0.36), fontWeight: "800", color: AVATAR_FG[idx], fontFamily: FONT }}>{init}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------------
// KPI
// ----------------------------------------------------------------------------
export function Kpi({ label, value, color, hint, icon, tone, viz, onPress }: any) {
  const t: Tone | undefined = tone ?? undefined;
  const tint = t ? TONES[t as Tone] : null;
  const body = (
    <View style={[s.kpi, onPress ? { flexBasis: "auto", minWidth: 0 } : null]}>
      <View style={s.kpiTop}>
        {icon ? (
          <IconTile icon={icon} tone={(t as Tone) ?? "violet"} size={30} />
        ) : color ? (
          <View style={[s.kpiDot, { backgroundColor: color }]} />
        ) : null}
        <Text style={s.kpiLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={s.kpiMid}>
        <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </Text>
        {viz ? <View style={s.kpiViz}>{viz}</View> : null}
      </View>
      {hint ? (
        <Text style={[s.kpiHint, tint ? { color: tint.fg } : null]} numberOfLines={1}>{hint}</Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable onPress={onPress} style={web({ flexBasis: 220, flexGrow: 1, minWidth: 190, cursor: "pointer" })}>{body}</Pressable>;
}

// ----------------------------------------------------------------------------
// Panel (kartu berjudul)
// ----------------------------------------------------------------------------
export function Panel({ title, sub, tag, right, children, basis = 0, pad = 20, flush }: any) {
  return (
    <View style={[s.panel, basis ? { flexBasis: basis, flexGrow: 1, minWidth: 320 } : { width: "100%" }]}>
      <View style={[s.panelHead, { paddingHorizontal: pad, paddingTop: pad - 2 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.panelTitle} numberOfLines={1}>{title}</Text>
          {sub ? <Text style={s.panelSub} numberOfLines={2}>{sub}</Text> : null}
        </View>
        {right}
        {tag ? <Pill text={String(tag)} tone="gray" /> : null}
      </View>
      <View style={flush ? { paddingTop: 12 } : { padding: pad, paddingTop: 14 }}>{children}</View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Bar sederhana & bar bersegmen (gradasi seperti di video)
// ----------------------------------------------------------------------------
export function Bar({ pct, color = A.brand, height = 6 }: any) {
  return (
    <View style={[s.barBg, { height, borderRadius: height }]}>
      <View
        style={[
          s.barFill,
          { height, borderRadius: height, width: `${Math.min(100, Math.max(0, pct ?? 0))}%` as any, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function SegBar({ parts, height = 8 }: { parts: { value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <View style={[s.barBg, { height, borderRadius: height, flexDirection: "row", gap: 2 }]}>
      {parts.filter((p) => p.value > 0).map((p, i) => (
        <View key={i} style={{ flex: p.value / total, backgroundColor: p.color, borderRadius: height }} />
      ))}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Field / NoteBox (panel detail)
// ----------------------------------------------------------------------------
export function Field({ label, value, strong }: any) {
  const empty = value === null || value === undefined || value === "";
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.fieldValue, strong && s.fieldValueStrong, empty && s.fieldValueEmpty]} numberOfLines={4}>
        {empty ? "-" : value}
      </Text>
    </View>
  );
}

export function NoteBox({ note, author, title = "Saran SPV" }: any) {
  if (!note) return null;
  return (
    <View style={s.note}>
      <View style={s.noteHead}>
        <AppIcon name="chat" size={13} color={A.purple} />
        <Text style={s.noteTitle}>{title}{author ? ` • ${author}` : ""}</Text>
      </View>
      <Text style={s.noteText}>{note}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Tombol
// ----------------------------------------------------------------------------
export function WebButton({ label, icon, variant = "primary", onPress, disabled, size = "md" }: any) {
  const [hover, setHover] = useState(false);
  const v = variant;
  const fg = v === "primary" || v === "danger" ? "#fff" : v === "soft" ? A.ink : A.inkSoft;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={web([
        s.btn,
        size === "sm" && s.btnSm,
        v === "primary" && s.btnPrimary,
        v === "ghost" && s.btnGhost,
        v === "soft" && s.btnSoft,
        v === "danger" && s.btnDanger,
        hover && !disabled && (v === "primary" ? { backgroundColor: "#2A2D36" } : { backgroundColor: A.surfaceAlt }),
        disabled && { opacity: 0.5 },
        { cursor: disabled ? "not-allowed" : "pointer" },
      ])}
    >
      {icon ? <AppIcon name={icon} size={size === "sm" ? 12 : 14} color={fg} style={{ marginRight: label ? 6 : 0 }} /> : null}
      {label ? <Text style={[s.btnText, size === "sm" && { fontSize: 12 }, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

// ----------------------------------------------------------------------------
// Segmented control / tab pill
// ----------------------------------------------------------------------------
export function Segmented({ options, value, onChange }: {
  options: { key: string; label: string; count?: number | null; icon?: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={web([s.segItem, on && s.segItemOn, { cursor: "pointer" }])}
          >
            {o.icon ? <AppIcon name={o.icon} size={13} color={on ? A.ink : A.muted} style={{ marginRight: 6 }} /> : null}
            <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{o.label}</Text>
            {o.count != null && o.count > 0 ? (
              <View style={[s.segCount, on && { backgroundColor: A.ink }]}>
                <Text style={[s.segCountText, on && { color: "#fff" }]}>{o.count > 99 ? "99+" : o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// Chip filter kecil (toggle)
export function FilterChip({ label, on, onPress, count }: { label: string; on?: boolean; onPress: () => void; count?: number | null }) {
  return (
    <Pressable onPress={onPress} style={web([s.fchip, on && s.fchipOn, { cursor: "pointer" }])}>
      <Text style={[s.fchipText, on && { color: "#fff" }]}>{label}</Text>
      {count != null && count > 0 ? <Text style={[s.fchipCount, on && { color: "#C9CCD6" }]}>{count}</Text> : null}
    </Pressable>
  );
}

// ----------------------------------------------------------------------------
// Input pencarian
// ----------------------------------------------------------------------------
export function SearchField({ value, onChangeText, placeholder = "Cari…", width = 280 }: any) {
  return (
    <View style={[s.search, { width }]}>
      <AppIcon name="search" size={14} color={A.mutedSoft} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={A.mutedSoft}
        style={web([s.searchInput, { outlineStyle: "none" }])}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} style={web({ cursor: "pointer" })}>
          <AppIcon name="closeCircle" size={14} color={A.mutedSoft} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Keadaan kosong / skeleton
// ----------------------------------------------------------------------------
export function EmptyState({ icon = "info", title, desc, action }: any) {
  return (
    <View style={s.empty}>
      <IconTile icon={icon} tone="gray" size={44} />
      <Text style={s.emptyTitle}>{title}</Text>
      {desc ? <Text style={s.emptyDesc}>{desc}</Text> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}

export function Skeleton({ h = 14, w = "100%", r = 8, style }: any) {
  return <View style={[{ height: h, width: w, borderRadius: r, backgroundColor: A.borderSoft }, style]} />;
}

// ----------------------------------------------------------------------------
// Tabel data generik
// ----------------------------------------------------------------------------
export type Col<T = any> = {
  key: string;
  label: string;
  flex?: number;
  width?: number;
  align?: "left" | "right" | "center";
  render?: (row: T, i: number) => ReactNode;
};

export function DataTable<T = any>({ cols, rows, onRowPress, empty, keyOf, minWidth = 640 }: {
  cols: Col<T>[]; rows: T[]; onRowPress?: (row: T) => void; empty?: ReactNode; keyOf?: (row: T, i: number) => string; minWidth?: number;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const cell = (c: Col<T>): any => ({
    ...(c.width ? { width: c.width } : { flex: c.flex ?? 1 }),
    alignItems: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start",
    paddingRight: 10,
    minWidth: 0,
  });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1, minWidth }}>
        <View style={s.tHead}>
          {cols.map((c) => (
            <View key={c.key} style={cell(c)}>
              <Text style={s.tHeadText} numberOfLines={1}>{c.label}</Text>
            </View>
          ))}
        </View>
        {rows.length === 0 ? (empty ?? <EmptyState title="Belum ada data" />) : rows.map((r, i) => {
          const k = keyOf ? keyOf(r, i) : String(i);
          const hov = hoverKey === k;
          return (
            <Pressable
              key={k}
              disabled={!onRowPress}
              onPress={() => onRowPress?.(r)}
              onHoverIn={() => setHoverKey(k)}
              onHoverOut={() => setHoverKey(null)}
              style={web([s.tRow, i === rows.length - 1 && { borderBottomWidth: 0 }, hov && { backgroundColor: A.surfaceAlt }, onRowPress && { cursor: "pointer" }])}
            >
              {cols.map((c) => (
                <View key={c.key} style={cell(c)}>
                  {c.render ? c.render(r, i) : <Text style={s.tCell} numberOfLines={1}>{String((r as any)[c.key] ?? "–")}</Text>}
                </View>
              ))}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ----------------------------------------------------------------------------
// Dialog (modal tengah) — dipakai untuk detail & konfirmasi
// ----------------------------------------------------------------------------
export function Dialog({ visible, onClose, title, subtitle, icon, tone = "gray", children, footer, width = 560 }: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string; icon?: string; tone?: Tone;
  children?: ReactNode; footer?: ReactNode; width?: number;
}) {
  const { height } = useWindowDimensions();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={s.dlgLayer}>
        <Pressable style={web([s.dlgBackdrop, { backdropFilter: "blur(6px)" }])} onPress={onClose} />
        <View style={[s.dlg, { width, maxWidth: "94%" as any, maxHeight: height - 60 }]}>
          <View style={s.dlgHead}>
            {icon ? <IconTile icon={icon} tone={tone} size={40} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.dlgTitle} numberOfLines={2}>{title}</Text>
              {subtitle ? <Text style={s.dlgSub} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={web([s.dlgClose, { cursor: "pointer" }])} accessibilityLabel="Tutup">
              <AppIcon name="close" size={16} color={A.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 22, paddingTop: 6 }}>{children}</ScrollView>
          {footer ? <View style={s.dlgFoot}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

// Baris informasi kecil: ikon + teks (dipakai di banyak kartu)
export function MetaRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <AppIcon name={icon} size={12} color={A.mutedSoft} />
      <Text style={{ fontSize: 12, color: A.muted, fontFamily: FONT }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // Pill
  pill: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4,
  },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3 },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { fontSize: 11.5, fontWeight: "700", fontFamily: FONT, letterSpacing: 0.1 },

  // Kartu & ikon
  card: { backgroundColor: A.surface, borderRadius: R.card, borderWidth: 1, borderColor: A.border, ...SHADOW },
  iconTile: { alignItems: "center", justifyContent: "center" },
  avatar: { alignItems: "center", justifyContent: "center" },

  // KPI
  kpi: {
    flexBasis: 220, flexGrow: 1, minWidth: 190,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: R.card, padding: 18, ...SHADOW,
  },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  kpiDot: { width: 8, height: 8, borderRadius: 4 },
  kpiLabel: { fontSize: 13, fontWeight: "600", color: A.inkSoft, fontFamily: FONT, flexShrink: 1 },
  kpiMid: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, gap: 10 },
  kpiValue: { fontSize: 32, fontWeight: "800", color: A.ink, letterSpacing: -1.2, fontVariant: ["tabular-nums"], fontFamily: FONT, flexShrink: 1 },
  kpiViz: { alignItems: "flex-end", justifyContent: "flex-end", flexShrink: 0 },
  kpiHint: { fontSize: 12, color: A.muted, marginTop: 6, fontFamily: FONT },

  // Panel
  panel: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, borderRadius: R.card, overflow: "hidden", ...SHADOW },
  panelHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  panelTitle: { fontSize: 16, fontWeight: "700", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  panelSub: { fontSize: 12.5, color: A.muted, marginTop: 3, lineHeight: 18, fontFamily: FONT },

  // Bar
  barBg: { backgroundColor: A.borderSoft, overflow: "hidden", marginTop: 6 },
  barFill: {},

  // Field & note
  field: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  fieldLabel: { fontSize: 12.5, color: A.muted, flex: 1, paddingRight: 12, fontFamily: FONT },
  fieldValue: { fontSize: 13, color: A.inkSoft, fontWeight: "600", flex: 1.15, textAlign: "right", fontFamily: FONT },
  fieldValueStrong: { color: A.ink, fontWeight: "800" },
  fieldValueEmpty: { color: A.mutedSoft, fontWeight: "500" },
  note: { backgroundColor: A.purpleSoft, borderRadius: 14, padding: 14 },
  noteHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  noteTitle: { fontSize: 11, fontWeight: "800", color: A.purple, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: FONT },
  noteText: { fontSize: 13, color: A.inkSoft, lineHeight: 20, fontFamily: FONT },

  // Tombol
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: R.field, paddingHorizontal: 16, height: 40 } as any,
  btnSm: { height: 32, paddingHorizontal: 12, borderRadius: 10 },
  btnPrimary: { backgroundColor: A.ink },
  btnGhost: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border },
  btnSoft: { backgroundColor: A.borderSoft },
  btnDanger: { backgroundColor: A.red },
  btnText: { fontSize: 13, fontWeight: "700", fontFamily: FONT },

  // Segmented
  seg: { flexDirection: "row", backgroundColor: A.borderSoft, borderRadius: 12, padding: 4, alignSelf: "flex-start", flexWrap: "wrap" },
  segItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 32, borderRadius: 9 },
  segItemOn: { backgroundColor: A.surface, ...SHADOW, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  segText: { fontSize: 13, fontWeight: "600", color: A.muted, fontFamily: FONT },
  segTextOn: { color: A.ink, fontWeight: "700" },
  segCount: { marginLeft: 8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: A.border, alignItems: "center", justifyContent: "center" },
  segCountText: { fontSize: 10.5, fontWeight: "800", color: A.inkSoft, fontFamily: FONT },

  // Filter chip
  fchip: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, backgroundColor: A.surface, borderWidth: 1, borderColor: A.border },
  fchipOn: { backgroundColor: A.ink, borderColor: A.ink },
  fchipText: { fontSize: 12.5, fontWeight: "600", color: A.inkSoft, fontFamily: FONT },
  fchipCount: { fontSize: 11.5, fontWeight: "700", color: A.mutedSoft, fontFamily: FONT },

  // Search
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 13, borderRadius: R.field, backgroundColor: A.surface, borderWidth: 1, borderColor: A.border },
  searchInput: { flex: 1, fontSize: 13, color: A.ink, fontFamily: FONT, padding: 0 } as any,

  // Empty
  empty: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 20, gap: 6 },
  emptyTitle: { fontSize: 14.5, fontWeight: "700", color: A.ink, marginTop: 8, fontFamily: FONT },
  emptyDesc: { fontSize: 12.5, color: A.muted, textAlign: "center", maxWidth: 360, lineHeight: 18, fontFamily: FONT },

  // Tabel
  tHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: A.borderSoft, backgroundColor: A.headerRow },
  tHeadText: { fontSize: 11.5, fontWeight: "700", color: A.muted, fontFamily: FONT, letterSpacing: 0.2 },
  tRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  tCell: { fontSize: 13, color: A.inkSoft, fontFamily: FONT },

  // Dialog
  dlgLayer: { flex: 1, alignItems: "center", justifyContent: "center" },
  dlgBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(16,18,24,0.42)" } as any,
  dlg: { backgroundColor: A.surface, borderRadius: 24, overflow: "hidden", ...SHADOW_POP },
  dlgHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 22, paddingBottom: 14 },
  dlgTitle: { fontSize: 18, fontWeight: "800", color: A.ink, letterSpacing: -0.4, fontFamily: FONT },
  dlgSub: { fontSize: 13, color: A.muted, marginTop: 3, fontFamily: FONT },
  dlgClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: A.borderSoft },
  dlgFoot: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: 18, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: A.borderSoft, backgroundColor: A.surfaceAlt },
});
