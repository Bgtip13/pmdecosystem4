import { View, Text, StyleSheet } from "react-native";

// ===== FASE 1: badge status pekerjaan SPK =====
// OPEN  = belum dikerjakan (oranye)
// INPG  = sudah diisi, menunggu review supervisor (biru)
// CLSD  = sudah disetujui supervisor / terkunci (hijau)

export type WorkflowStatus = "OPEN" | "INPG" | "CLSD";

const TONE: Record<WorkflowStatus, { bg: string; fg: string; border: string }> = {
  OPEN: { bg: "#FFFAEB", fg: "#B54708", border: "#FEDF89" },
  INPG: { bg: "#EFF8FF", fg: "#175CD3", border: "#B2DDFF" },
  CLSD: { bg: "#ECFDF3", fg: "#067647", border: "#ABEFC6" },
};

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

const styles = StyleSheet.create({
  badge: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  text: { fontWeight: "900", letterSpacing: 0.4 },
  note: {
    backgroundColor: "#F5F3FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    padding: 10,
    marginTop: 8,
  },
  noteTitle: { fontSize: 11, fontWeight: "900", color: "#5B21B6", marginBottom: 3 },
  noteText: { fontSize: 13, color: "#3F3F46", lineHeight: 19 },
  legend: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  legendText: { fontSize: 11, color: "#667085", marginHorizontal: 5, marginRight: 10 },
});
