import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../lib/theme";

const { colors: C, radius: R } = theme;
const GREEN = "#067647";
const GRAY = C.inkMuted;
const MAX = 20;

// ===== Hook: mode pilih banyak =====
export function useBulkSelect() {
  const [pilih, setPilih] = useState(false);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());

  const buka = () => { setTerpilih(new Set()); setPilih(true); };
  const reset = () => { setTerpilih(new Set()); setPilih(false); };

  const toggle = (id: string) =>
    setTerpilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else { if (n.size >= MAX) return s; n.add(id); }
      return n;
    });

  const pilihSemua = (ids: string[]) => setTerpilih(new Set(ids.slice(0, MAX)));

  return { pilih, terpilih, buka, reset, toggle, pilihSemua };
}

// ===== Kotak centang di kartu =====
export function SelectBox({ checked }: { checked: boolean }) {
  return (
    <View style={[b.box, checked && b.boxOn]}>
      {checked ? <Text style={b.boxMark}>✓</Text> : null}
    </View>
  );
}

// ===== Tombol "Pilih" untuk header =====
export function BulkToggle({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={b.toggle} onPress={onPress}>
      <Text style={b.toggleText}>Pilih</Text>
    </TouchableOpacity>
  );
}

// ===== Bar bawah: jumlah + tombol setujui =====
// Menempel di bawah layar; TabBar disembunyikan saat mode pilih agar tidak bertumpuk.
export function BulkBar({
  count, label = "Setujui (CLSD)", onAll, onClose, onCancel,
}: {
  count: number;
  label?: string;
  onAll: () => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[b.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={b.row}>
        <TouchableOpacity onPress={onAll} hitSlop={6}>
          <Text style={b.link}>Pilih semua</Text>
        </TouchableOpacity>
        <Text style={b.count}>{count} dipilih{count >= MAX ? ` (maks ${MAX})` : ""}</Text>
        <TouchableOpacity onPress={onCancel} hitSlop={6}>
          <Text style={b.link}>Batal</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[b.btn, !count && { opacity: 0.45 }]}
        onPress={onClose}
        disabled={!count}
      >
        <Text style={b.btnText}>{label}{count ? ` (${count})` : ""}</Text>
      </TouchableOpacity>
    </View>
  );
}

const b = StyleSheet.create({
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#D0D5DD",
    alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  boxOn: { backgroundColor: GREEN, borderColor: GREEN },
  boxMark: { color: "#fff", fontSize: 13, fontWeight: "900" },

  toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: "#fff" },
  toggleText: { fontSize: 12, fontWeight: "800", color: C.inkSoft },

  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 16, paddingTop: 10,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { fontSize: 12, fontWeight: "800", color: GRAY },
  count: { fontSize: 12, fontWeight: "800", color: C.ink },
  btn: { backgroundColor: GREEN, borderRadius: R.md, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
