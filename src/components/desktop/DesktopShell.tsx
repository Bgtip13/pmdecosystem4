import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../AppIcon";
import { theme } from "../../lib/theme";
import type { ReactNode } from "react";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;

// ===== Kerangka desktop: sidebar kiri + header + area isi =====
export default function DesktopShell({
  active, title, subtitle, right, children,
}: {
  active: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const viewer = useQuery(api.users.viewer) as any;
  const isSuper = viewer?.role === "supervisor";

  const NAV: any[] = [
    { key: "beranda", label: "Dashboard", icon: "home", href: "/beranda" },
    { key: "spk", label: "SPK", icon: "clipboard", href: "/spk" },
    ...(isSuper ? [{ key: "spv", label: "SPV", icon: "shield", href: "/spv" }] : []),
    { key: "laporan", label: "Laporan", icon: "chart", href: "/laporan" },
    { key: "akun", label: "Akun", icon: "user", href: "/akun" },
  ];

  return (
    <View style={s.row}>
      {/* ===== Sidebar ===== */}
      <View style={s.sidebar}>
        <View style={s.brandBox}>
          <Text style={s.brandTop}>PMD ECOSYSTEM</Text>
          <Text style={s.brandBottom}>4.0</Text>
        </View>

        <View style={s.nav}>
          {NAV.map((n) => {
            const on = active === n.key;
            return (
              <TouchableOpacity
                key={n.key}
                style={[s.navItem, on && s.navItemOn]}
                onPress={() => router.replace(n.href as any)}
              >
                <AppIcon name={n.icon} size={17} color={on ? RED : GRAY} />
                <Text style={[s.navText, on && s.navTextOn]}>{n.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.userBox}>
          <Text style={s.userName} numberOfLines={1}>{viewer?.name ?? "-"}</Text>
          <Text style={s.userRole}>{viewer?.role ?? "-"}{viewer?.area ? ` • ${viewer.area}` : ""}</Text>
        </View>
      </View>

      {/* ===== Isi ===== */}
      <View style={s.main}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

// ===== Kit kecil supaya layout desktop konsisten =====
export function DGrid({ children }: { children: ReactNode }) {
  return <View style={s.grid}>{children}</View>;
}

export function DCard({
  title, right, children, span = 1,
}: {
  title?: string; right?: ReactNode; children: ReactNode; span?: 1 | 2 | 3 | 4;
}) {
  return (
    <View style={[s.card, { flexGrow: 0, flexBasis: `${(span / 4) * 100}%` as any }]}>
      {title ? (
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function DStat({
  label, value, tone = "neutral",
}: {
  label: string; value: string | number; tone?: "neutral" | "danger" | "warn" | "ok" | "info";
}) {
  const TONE: any = {
    neutral: { bg: "#F2F4F7", fg: "#344054" },
    danger: { bg: "#FEF3F2", fg: "#B42318" },
    warn: { bg: "#FFFAEB", fg: "#B54708" },
    ok: { bg: "#ECFDF3", fg: "#067647" },
    info: { bg: "#EFF8FF", fg: "#175CD3" },
  };
  const t = TONE[tone];
  return (
    <View style={[s.stat, { backgroundColor: t.bg }]}>
      <Text style={[s.statValue, { color: t.fg }]}>{value}</Text>
      <Text style={[s.statLabel, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function DRow({
  label, value, color, onPress, last,
}: {
  label: string; value: string; color?: string; onPress?: () => void; last?: boolean;
}) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[s.dRow, last && { borderBottomWidth: 0 }]} onPress={onPress}>
      <Text style={s.dRowLabel}>{label}</Text>
      <Text style={[s.dRowValue, color ? { color } : null]}>{value}</Text>
    </Wrap>
  );
}

const s = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },

  sidebar: {
    width: 232,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  brandBox: { paddingHorizontal: 8, marginBottom: 22 },
  brandTop: { fontSize: 12, fontWeight: "900", color: RED, letterSpacing: 0.6 },
  brandBottom: { fontSize: 20, fontWeight: "900", color: C.ink },
  nav: { flex: 1 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: R.md,
    marginBottom: 4,
  },
  navItemOn: { backgroundColor: "#FDE8E6" },
  navText: { fontSize: 13.5, fontWeight: "700", color: GRAY },
  navTextOn: { color: RED, fontWeight: "800" },
  userBox: { borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12, paddingHorizontal: 8 },
  userName: { fontSize: 13, fontWeight: "800", color: C.ink },
  userRole: { fontSize: 11.5, color: GRAY, marginTop: 2, textTransform: "capitalize" },

  main: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surfaceTint,
  },
  title: { fontSize: 20, fontWeight: "900", color: C.ink },
  subtitle: { fontSize: 12.5, color: GRAY, marginTop: 2 },
  body: { padding: 24, gap: 16 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    minWidth: 300,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: "900", color: C.inkSoft, letterSpacing: 0.3 },

  stat: { flex: 1, minWidth: 130, borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 14 },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11.5, fontWeight: "700", marginTop: 2, opacity: 0.9 },

  dRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
    gap: 12,
  },
  dRowLabel: { fontSize: 13, color: GRAY, flex: 1 },
  dRowValue: { fontSize: 13.5, fontWeight: "800", color: C.ink },
});
