import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import AppIcon from "../AppIcon";
import IOSSpinner from "../IOSSpinner";
import TabBar, { ChatHeaderButton } from "../TabBar";
import { theme } from "../../lib/theme";
import { TOP_PAD } from "../../lib/layout";

const { colors: C, radius: R, shadow: SH } = theme;

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  field: "Sales Lapangan",
  telemarketing: "Telemarketing",
  ppic: "PPIC",
};

export const ROLE_COLOR: Record<string, string> = {
  owner: C.role.owner,
  supervisor: C.role.supervisor,
  field: C.role.field,
  telemarketing: C.role.telemarketing,
};

export const TARGET_HARIAN = 7;

// ===== Tanggal & angka =====
export function todayRangeWIB() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const from = Date.parse(`${y}-${m}-${d}T00:00:00+07:00`);
  return { from, to: from + 86400000 - 1, day: `${y}-${m}-${d}` };
}

export function monthKeyWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

export function monthLabel(mk: string) {
  const [y, m] = mk.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

export const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "–";

export function fmtDur(ms: number) {
  const m = Math.max(0, Math.round((ms || 0) / 60000));
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}

export const rupiah = (n?: number | null) =>
  n == null || isNaN(Number(n)) ? "–" : "Rp" + Math.round(Number(n)).toLocaleString("id-ID");

export function compactRupiah(n?: number | null) {
  if (n == null || isNaN(Number(n))) return "–";
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000_000)
    return `Rp${(v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1_000_000)
    return `Rp${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return rupiah(v);
}

export const pctText = (p?: number | null) => (p == null ? "–" : `${Math.round(p)}%`);
export const clampPct = (p?: number | null) => Math.min(100, Math.max(0, Number(p ?? 0)));
export const pctColor = (p?: number | null) =>
  p == null ? C.inkFaint : p < 50 ? C.status.danger.fg : p < 80 ? C.status.warning.fg : C.status.success.fg;

// ===== Kerangka layar: header + scroll + tab =====
export function HomeScreen({ viewer, children }: { viewer: any; children: ReactNode }) {
  const role = viewer?.role;
  const accent = ROLE_COLOR[role] ?? C.primary;
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>PMD Ecosystem 4.0</Text>
            <Text style={s.greet} numberOfLines={1}>Halo, {viewer?.name ?? ""}</Text>
            <View style={s.metaRow}>
              <View style={[s.roleDot, { backgroundColor: accent }]} />
              <Text style={s.meta} numberOfLines={1}>
                {ROLE_LABEL[role] ?? role ?? ""}
                {viewer?.area ? ` • ${viewer.area}` : ""}
              </Text>
            </View>
          </View>
          <ChatHeaderButton />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      <TabBar active="beranda" />
    </View>
  );
}

// ===== Balok dasar =====
export function Card({ children, style }: { children: ReactNode; style?: any }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function CardLabel({ children, color }: { children: ReactNode; color?: string }) {
  return <Text style={[s.cardLabel, color ? { color } : null]}>{children}</Text>;
}

export function ProgressBar({
  pct,
  color = C.primary,
  height = 8,
}: {
  pct?: number | null;
  color?: string;
  height?: number;
}) {
  return (
    <View style={[s.barBg, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          s.barFill,
          { width: `${clampPct(pct)}%`, backgroundColor: color, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

export function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  tone = C.primary,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  tone?: string;
}) {
  return (
    <TouchableOpacity style={[s.primaryBtn, { backgroundColor: tone }]} onPress={onPress} activeOpacity={0.88}>
      {icon ? <AppIcon name={icon} size={17} color="#fff" style={{ marginRight: 7 }} /> : null}
      <Text style={s.primaryBtnText}>{label}</Text>
      <AppIcon name="chevron" size={16} color="#fff" style={{ marginLeft: 4, opacity: 0.85 }} />
    </TouchableOpacity>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.secHead}>
      <Text style={s.secTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.secAction}>{actionLabel} ›</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export type QuickItem = { icon: string; label: string; color: string; bg: string; to: string };

export function QuickActions({ items }: { items: QuickItem[] }) {
  const router = useRouter();
  return (
    <View style={s.quickRow}>
      {items.map((it) => (
        <TouchableOpacity
          key={it.label}
          style={s.quick}
          activeOpacity={0.85}
          onPress={() => router.push(it.to as any)}
        >
          <View style={[s.quickIcon, { backgroundColor: it.bg }]}>
            <AppIcon name={it.icon} size={19} color={it.color} />
          </View>
          <Text style={s.quickLabel} numberOfLines={1}>{it.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function SummaryRow({
  icon,
  label,
  value,
  sub,
  tone,
  onPress,
}: {
  icon?: string;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={onPress ? 0.75 : 1} disabled={!onPress}>
      {icon ? (
        <View style={s.rowIcon}>
          <AppIcon name={icon} size={16} color={C.inkSoft} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={s.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={[s.rowValue, tone ? { color: tone } : null]} numberOfLines={1}>{value}</Text>
      {onPress ? <AppIcon name="chevron" size={15} color={C.inkFaint} style={{ marginLeft: 6 }} /> : null}
    </TouchableOpacity>
  );
}

export function AlertRow({
  title,
  desc,
  severity,
  onPress,
}: {
  title: string;
  desc?: string;
  severity: "danger" | "warning";
  onPress?: () => void;
}) {
  const tone = severity === "danger" ? C.status.danger : C.status.warning;
  return (
    <TouchableOpacity
      style={[s.alert, { backgroundColor: tone.bg, borderColor: tone.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <AppIcon name="warn" size={16} color={tone.fg} style={{ marginRight: 8, marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.alertTitle, { color: tone.fg }]} numberOfLines={1}>{title}</Text>
        {desc ? <Text style={s.alertDesc} numberOfLines={2}>{desc}</Text> : null}
      </View>
      {onPress ? <AppIcon name="chevron" size={15} color={tone.fg} style={{ marginLeft: 4 }} /> : null}
    </TouchableOpacity>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={s.empty}>{text}</Text>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ gap: 8, paddingVertical: 4 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={[
            s.skel,
            { height: i === 0 ? 22 : 12, width: i === 0 ? "55%" : i === 1 ? "85%" : "70%" },
          ]}
        />
      ))}
    </View>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
      <IOSSpinner size="small" color={C.primary} />
      {label ? <Text style={s.rowSub}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingTop: TOP_PAD,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "#FFF7F5",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: SH.color,
    shadowOpacity: SH.opacity,
    shadowRadius: SH.radius,
    shadowOffset: { width: 0, height: 4 },
    elevation: SH.elevation,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  brand: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.1, textTransform: "uppercase" },
  greet: { fontSize: 21, fontWeight: "800", color: C.ink, letterSpacing: -0.2, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  roleDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  meta: { fontSize: 12.5, color: C.inkMuted, fontWeight: "600" },

  body: { padding: 16, paddingBottom: 130, gap: 12 },

  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: "#EEF0F3",
    padding: 16,
    shadowColor: SH.color,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: C.inkMuted,
    textTransform: "uppercase",
  },

  barBg: { backgroundColor: C.divider, overflow: "hidden", width: "100%" },
  barFill: { height: "100%" },

  pill: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 10, fontWeight: "800" },

  primaryBtn: {
    marginTop: 12,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 14.5, fontWeight: "800", letterSpacing: 0.2 },

  secHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: -4,
    paddingHorizontal: 2,
  },
  secTitle: { fontSize: 12.5, fontWeight: "800", color: C.inkSoft, letterSpacing: 0.2 },
  secAction: { fontSize: 11.5, fontWeight: "700", color: C.primary },

  quickRow: { flexDirection: "row", gap: 10 },
  quick: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: "#EEF0F3",
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
  },
  quickIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11, fontWeight: "700", color: C.inkSoft, textAlign: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rowLabel: { fontSize: 13, fontWeight: "700", color: C.ink },
  rowSub: { fontSize: 11.5, color: C.inkMuted, marginTop: 1 },
  rowValue: { fontSize: 13, fontWeight: "800", color: C.inkSoft, marginLeft: 8, maxWidth: "48%" },

  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 11,
    marginTop: 8,
  },
  alertTitle: { fontSize: 12.5, fontWeight: "800" },
  alertDesc: { fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 16 },

  empty: { fontSize: 12.5, color: C.inkMuted, lineHeight: 18, paddingVertical: 4 },
  skel: { backgroundColor: "#EDEFF2", borderRadius: 7 },
});
