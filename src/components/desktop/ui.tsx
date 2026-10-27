import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import AppIcon from "../AppIcon";
import { A, FONT, SHADOW } from "./tokens";

// ===== KIT UI DESKTOP (khusus web) — dipakai semua layar *.web.tsx =====
export function Kpi({ label, value, color, hint }: any) {
  return (
    <View style={[s.kpi, color ? { borderTopWidth: 3, borderTopColor: color } : null]}>
      <Text style={s.kpiLabel} numberOfLines={1}>{label}</Text>
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
            <AppIcon name={icon} size={13} color={A.brand} />
          </View>
        ) : null}
        <Text style={s.panelTitle} numberOfLines={1}>{title}</Text>
        <View style={{ flex: 1 }} />
        {right}
      </View>
      <View style={s.panelBody}>{children}</View>
    </View>
  );
}

export function Bar({ pct, color = A.brand, height = 4 }: any) {
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

// Tombol aksi web (dipakai di header halaman)
export function WebButton({ label, icon, variant = "primary", onPress, disabled }: any) {
  const ghost = variant === "ghost";
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.btn,
        ghost ? s.btnGhost : s.btnPrimary,
        disabled && { opacity: 0.55 },
      ]}
    >
      {icon ? <AppIcon name={icon} size={13} color={ghost ? A.inkSoft : "#fff"} style={{ marginRight: 6 }} /> : null}
      <Text style={[s.btnText, ghost && { color: A.inkSoft }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  kpi: {
    flexBasis: 196,
    flexGrow: 1,
    minWidth: 165,
    backgroundColor: A.surface,
    borderWidth: 1,
    borderColor: A.border,
    borderRadius: 10,
    padding: 13,
    ...SHADOW,
    shadowOpacity: 0.045,
    shadowRadius: 10,
  },
  kpiLabel: { fontSize: 9, fontWeight: "800", color: A.muted, letterSpacing: 0.7, textTransform: "uppercase", fontFamily: FONT },
  kpiValue: { fontSize: 23, fontWeight: "800", color: A.ink, marginTop: 6, letterSpacing: -0.6, fontVariant: ["tabular-nums"], fontFamily: FONT },
  kpiHint: { fontSize: 10, color: A.muted, marginTop: 4, fontFamily: FONT },

  panel: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, overflow: "hidden", ...SHADOW, shadowOpacity: 0.045, shadowRadius: 10,
  },
  panelHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 13, paddingVertical: 10,
    backgroundColor: A.surface,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  panelIcon: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: A.brandSoft,
    alignItems: "center", justifyContent: "center",
  },
  panelTitle: {
    fontSize: 10.5, fontWeight: "800", color: A.inkSoft,
    letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONT,
  },
  panelBody: { padding: 13 },

  barBg: { borderRadius: 3, backgroundColor: "#F0E9E5", overflow: "hidden", marginTop: 5 },
  barFill: { borderRadius: 3 },

  chip: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" },
  chipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3, fontFamily: FONT },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  } as any,
  btnPrimary: { backgroundColor: A.brand },
  btnGhost: { backgroundColor: A.surface, borderWidth: 1, borderColor: A.border },
  btnText: { color: "#fff", fontSize: 11, fontWeight: "700", fontFamily: FONT },
});
