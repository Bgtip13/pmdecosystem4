import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import AppIcon from "../AppIcon";
import { A, FONT, SHADOW } from "./tokens";

// ===== KERANGKA BERSAMA LAYAR DETAIL WEB =====
// Dipakai oleh visit-detail, spk-detail, spk-detail-order, toko-aktif, dan
// fu-toko-riwayat supaya semua halaman detail punya susunan, jarak, dan tombol
// yang sama — bukan tampilan HP yang ditarik selebar layar.

// Tombol kembali untuk slot kanan header halaman.
export function BackButton({ onPress, label = "Kembali" }: any) {
  return (
    <TouchableOpacity style={d.back} onPress={onPress} activeOpacity={0.85}>
      <AppIcon name="back" size={14} color={A.inkSoft} />
      <Text style={d.backText}>{label}</Text>
    </TouchableOpacity>
  );
}

// Judul + keterangan singkat + lencana, di atas dua kolom.
export function HeadCard({ children }: { children: ReactNode }) {
  return <View style={d.headCard}>{children}</View>;
}

export function HeadTitle({ children }: { children: ReactNode }) {
  return <Text style={d.headTitle} numberOfLines={2}>{children}</Text>;
}

export function HeadMeta({ children }: { children: ReactNode }) {
  return <Text style={d.headMeta} numberOfLines={2}>{children}</Text>;
}

export function HeadBadges({ children }: { children: ReactNode }) {
  return <View style={d.headBadges}>{children}</View>;
}

// Dua kolom: isi utama (kiri, lebih lebar) + panel pendukung (kanan).
// Di layar sempit otomatis menumpuk karena flexWrap.
export function Cols({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <View style={d.cols}>
      <View style={d.colMain}>{main}</View>
      <View style={d.colSide}>{side}</View>
    </View>
  );
}

// Tombol aksi: primary (merah), green (setujui), danger (merah muda), ghost (putih).
export function ActionButton({ label, icon, tone = "ghost", onPress, disabled }: any) {
  const solid = tone === "primary" || tone === "green";
  const fg = solid ? "#fff" : tone === "danger" ? A.brandDark : A.inkSoft;
  const bg = tone === "primary" ? A.brand : tone === "green" ? A.green : tone === "danger" ? A.brandSoft : A.surface;
  const border = solid ? undefined : tone === "danger" ? A.brandBorder : A.border;
  return (
    <TouchableOpacity
      style={[d.btn, { backgroundColor: bg }, !solid && { borderWidth: 1, borderColor: border }, disabled && d.btnOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {icon ? <AppIcon name={icon} size={14} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text style={[d.btnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={d.actionRow}>{children}</View>;
}

// Kotak isian multi-baris (review supervisor, catatan, dll).
export function TextArea({ label, value, onChangeText, placeholder, rows = 3 }: any) {
  return (
    <View style={{ width: "100%" }}>
      {label ? <Text style={d.inputLabel}>{label}</Text> : null}
      <TextInput
        style={[d.input, { minHeight: 22 * rows }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={A.mutedSoft}
        multiline
      />
    </View>
  );
}

// Pesan hasil aksi. Tidak memakai Alert karena di web Alert tidak tampil.
export function Notice({ tone = "ok", text }: { tone?: "ok" | "err" | "info"; text: string }) {
  const map: any = {
    ok: { bg: A.greenSoft, bd: A.greenBorder, fg: A.green, icon: "check" },
    err: { bg: A.brandSoft, bd: A.brandBorder, fg: A.brandDark, icon: "warn" },
    info: { bg: A.infoSoft, bd: A.infoBorder, fg: A.info, icon: "info" },
  };
  const t = map[tone] ?? map.ok;
  return (
    <View style={[d.notice, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <AppIcon name={t.icon} size={13} color={t.fg} style={{ marginRight: 7 }} />
      <Text style={[d.noticeText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

export function EmptyLine({ text }: { text: string }) {
  return <Text style={d.empty}>{text}</Text>;
}

export function Para({ children }: { children: ReactNode }) {
  return <Text style={d.para}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={d.hint}>{children}</Text>;
}

// Garis waktu untuk riwayat aksi / audit.
export function Timeline({ items }: { items: { key?: string; summary: string; meta: string }[] }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={it.key ?? i} style={d.tlRow}>
          <View style={d.tlCol}>
            <View style={d.tlDot} />
            {i < items.length - 1 ? <View style={d.tlLine} /> : null}
          </View>
          <View style={d.tlBody}>
            <Text style={d.tlText}>{it.summary}</Text>
            <Text style={d.tlMeta}>{it.meta}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// Tombol pilih berbentuk pil (dipakai form koreksi & filter).
export function Pick({ on, label, onPress }: any) {
  return (
    <TouchableOpacity style={[d.pick, on && d.pickOn]} onPress={onPress} activeOpacity={0.85}>
      <Text style={[d.pickText, on && d.pickTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PickRow({ children }: { children: ReactNode }) {
  return <View style={d.pickRow}>{children}</View>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={d.inputLabel}>{children}</Text>;
}

export const d = StyleSheet.create({
  back: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8,
  },
  backText: { fontSize: 11, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },

  headCard: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 10, padding: 15, ...SHADOW, shadowOpacity: 0.04, shadowRadius: 10,
  },
  headTitle: { fontSize: 17, fontWeight: "800", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  headMeta: { fontSize: 11, color: A.muted, marginTop: 5, lineHeight: 16, fontFamily: FONT },
  headBadges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 },

  cols: { flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "flex-start" },
  colMain: { flexGrow: 3, flexBasis: 480, minWidth: 320, gap: 16 },
  colSide: { flexGrow: 1, flexBasis: 340, minWidth: 290, gap: 16 },

  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 8, paddingHorizontal: 13, paddingVertical: 9,
  },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 11.5, fontWeight: "800", fontFamily: FONT },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  inputLabel: {
    fontSize: 9.5, fontWeight: "800", color: A.muted, letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 6, fontFamily: FONT,
  },
  input: {
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.border,
    borderRadius: 8, padding: 10, fontSize: 11.5, color: A.ink,
    textAlignVertical: "top", outlineStyle: "none", fontFamily: FONT,
  } as any,

  notice: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
  },
  noticeText: { fontSize: 11, fontWeight: "600", flex: 1, fontFamily: FONT },

  empty: { fontSize: 11, color: A.mutedSoft, fontStyle: "italic", fontFamily: FONT },
  para: { fontSize: 11.5, color: A.inkSoft, lineHeight: 18, fontFamily: FONT },
  hint: { fontSize: 11, color: A.muted, lineHeight: 17, fontFamily: FONT },

  tlRow: { flexDirection: "row" },
  tlCol: { width: 18, alignItems: "center" },
  tlDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: A.brand, marginTop: 4 },
  tlLine: { flex: 1, width: 2, backgroundColor: A.borderSoft, marginTop: 3 },
  tlBody: { flex: 1, paddingBottom: 12, minWidth: 0 },
  tlText: { fontSize: 11.5, color: A.ink, fontWeight: "600", lineHeight: 17, fontFamily: FONT },
  tlMeta: { fontSize: 9.5, color: A.muted, marginTop: 2, fontFamily: FONT },

  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pick: {
    borderWidth: 1, borderColor: A.border, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: A.surface,
  },
  pickOn: { backgroundColor: A.brand, borderColor: A.brand },
  pickText: { fontSize: 10.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  pickTextOn: { color: "#fff" },

  photoLabel: {
    fontSize: 9, fontWeight: "800", color: A.mutedSoft, letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 5, fontFamily: FONT,
  },
});
