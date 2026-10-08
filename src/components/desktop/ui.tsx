import { View, Text, StyleSheet } from "react-native";
import AppIcon from "../AppIcon";
import { theme } from "../../lib/theme";

const { colors: C, radius: R } = theme;
const RED = C.primary;

// ===== KIT UI DESKTOP (mandiri) — dipakai semua layar *.web.tsx =====
export function Kpi({ label, value, color, hint }: any) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text
        style={[s.kpiValue, color ? { color } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      {hint ? <Text style={s.kpiHint} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

export function Panel({ title, icon, right, children, basis = 0 }: any) {
  return (
    <View style={[s.panel, basis ? { flexBasis: basis, flexGrow: 1, minWidth: 320 } : { width: "100%" }]}>
      <View style={s.panelHead}>
        {icon ? (
          <View style={s.panelIcon}>
            <AppIcon name={icon} size={15} color={RED} />
          </View>
        ) : null}
        <Text style={s.panelTitle} numberOfLines={1}>{title}</Text>
        <View style={{ flex: 1 }} />
        {right}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

export function Bar({ pct, color = RED, height = 6 }: any) {
  return (
    <View style={[s.barBg, { height }]}>
      <View
        style={[
          s.barFill,
          { height, width: `${Math.min(100, Math.max(0, pct ?? 0))}%` as any, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function Chip({ text, bg, fg }: any) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  kpi: {
    flexBasis: 190,
    flexGrow: 1,
    minWidth: 160,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.divider,
    borderRadius: R.lg,
    padding: 14,
  },
  kpiLabel: { fontSize: 10, fontWeight: "900", color: C.inkMuted, letterSpacing: 0.6 },
  kpiValue: { fontSize: 26, fontWeight: "900", color: C.ink, marginTop: 6, letterSpacing: -0.5 },
  kpiHint: { fontSize: 11.5, color: C.inkMuted, marginTop: 4, fontWeight: "600" },

  panel: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.divider, borderRadius: R.lg, padding: 16 },
  panelHead: { flexDirection: "row", alignItems: "center" },
  panelIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 9 },
  panelTitle: { fontSize: 14, fontWeight: "900", color: C.ink },

  barBg: { borderRadius: R.pill, backgroundColor: "#EAECF0", overflow: "hidden", marginTop: 6 },
  barFill: { borderRadius: R.pill },

  chip: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" },
  chipText: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.2 },
});
