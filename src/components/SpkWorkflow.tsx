import { View, Text, StyleSheet } from "react-native";

import { useColors, useStyles } from "../lib/themeContext";
import type { Colors } from "../lib/colors";
// ===== FASE 1: badge status pekerjaan SPK =====
// OPEN  = belum dikerjakan (oranye)
// INPG  = sudah diisi, menunggu review supervisor (biru)
// CLSD  = sudah disetujui supervisor / terkunci (hijau)

export type WorkflowStatus = "OPEN" | "INPG" | "CLSD";

const makeTONE = (C: Colors): Record<WorkflowStatus, { bg: string; fg: string; border: string }> => (
  {
  OPEN: { bg: C.status.warning.bg, fg: C.status.warning.fg, border: C.status.warning.border },
  INPG: { bg: C.status.info.bg, fg: C.status.info.fg, border: C.status.info.border },
  CLSD: { bg: C.status.success.bg, fg: C.status.success.fg, border: C.status.success.border },
}
);
// Data lama (belum punya workflowStatus) dianggap OPEN.
export function normalizeWf(w?: string | null): WorkflowStatus {
  return w === "INPG" || w === "CLSD" ? w : "OPEN";
}

export function SpkStatusBadge({
  status,
  size = 11,
  style,
}: {
  status?: string | null;
  size?: number;
  style?: any;
}) {
  const C = useColors();
  const styles = useStyles(createStyles);
  const TONE = makeTONE(C);
  const wf = normalizeWf(status);
  const t = TONE[wf];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <Text style={[styles.text, { color: t.fg, fontSize: size }]}>{wf}</Text>
    </View>
  );
}

// Kotak saran/review supervisor — tampil di Riwayat (sales & admin bisa baca).
export function ReviewNoteBox({
  note,
  reviewerName,
  style,
}: {
  note?: string | null;
  reviewerName?: string | null;
  style?: any;
}) {
  const C = useColors();
  const styles = useStyles(createStyles);
  if (!note) return null;
  return (
    <View style={[styles.note, style]}>
      <Text style={styles.noteTitle}>
        💬 Saran SPV{reviewerName ? ` • ${reviewerName}` : ""}
      </Text>
      <Text style={styles.noteText}>{note}</Text>
    </View>
  );
}

// Keterangan singkat, dipakai di header daftar SPK kalau perlu.
export function WorkflowLegend({ style }: { style?: any }) {
  const C = useColors();
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.legend, style]}>
      <SpkStatusBadge status="OPEN" />
      <Text style={styles.legendText}>belum dikerjakan</Text>
      <SpkStatusBadge status="INPG" />
      <Text style={styles.legendText}>menunggu review</Text>
      <SpkStatusBadge status="CLSD" />
      <Text style={styles.legendText}>selesai</Text>
    </View>
  );
}

const createStyles = (C: Colors) => StyleSheet.create({
  badge: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  text: { fontWeight: "900", letterSpacing: 0.4 },
  note: {
    backgroundColor: C.purpleSoft2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.purpleBorder,
    padding: 10,
    marginTop: 8,
  },
  noteTitle: { fontSize: 11, fontWeight: "900", color: C.chip.purple.fg, marginBottom: 3 },
  noteText: { fontSize: 13, color: C.ink4, lineHeight: 19 },
  legend: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  legendText: { fontSize: 11, color: C.inkMuted, marginHorizontal: 5, marginRight: 10 },
});
