import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { theme } from "../lib/theme";

const { colors: C, radius: R } = theme;
const RED = C.primary;
const GRAY = C.inkMuted;

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const todayKeyWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const dayKeyOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

export default function DatePickerModal({
  visible,
  value,
  onClose,
  onPick,
  minDate,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (dk: string) => void;
  minDate?: string;
}) {
  const [ym, setYm] = useState(String(value || todayKeyWIB()).slice(0, 7));
  const [y, m] = ym.split("-").map(Number);

  // Tiap kali dibuka, tampilkan bulan dari tanggal yang sedang dipilih
  // (mis. geser dari 31 Okt ke 1 Nov → kalender langsung di November).
  useEffect(() => {
    if (visible) setYm(String(value || todayKeyWIB()).slice(0, 7));
  }, [visible, value]);
  const today = todayKeyWIB();
  const batas = minDate ?? today;

  const firstIdx = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const jmlHari = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstIdx; i++) cells.push(null);
  for (let d = 1; d <= jmlHari; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <TouchableOpacity style={styles.arrow} onPress={() => setYm(addMonths(ym, -1))}>
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.headText}>{BULAN[m - 1]} {y}</Text>
            <TouchableOpacity style={styles.arrow} onPress={() => setYm(addMonths(ym, 1))}>
              <Text style={styles.arrowText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {HARI_SHORT.map((h) => (
              <Text key={h} style={styles.week}>{h}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={`e${i}`} style={styles.cell} />;
              const dk = dayKeyOf(y, m, d);
              const on = dk === value;
              const isToday = dk === today;
              const lewat = dk < batas;
              return (
                <TouchableOpacity
                  key={dk}
                  style={styles.cell}
                  disabled={lewat}
                  onPress={() => onPick(dk)}
                >
                  <View style={[styles.day, on && styles.dayOn, !on && isToday && styles.dayToday]}>
                    <Text
                      style={[
                        styles.dayText,
                        on && styles.dayTextOn,
                        !on && isToday && { color: RED },
                        !on && lewat && { color: "#D0D5DD" },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.foot}>
            <TouchableOpacity style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(16,24,40,0.45)", justifyContent: "center", padding: 22 },
  card: { backgroundColor: "#fff", borderRadius: R.lg, padding: 14 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  arrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  arrowText: { fontSize: 20, fontWeight: "800", color: RED, lineHeight: 22 },
  headText: { fontSize: 15, fontWeight: "800", color: C.ink },
  weekRow: { flexDirection: "row" },
  week: { width: "14.2857%", textAlign: "center", fontSize: 10.5, fontWeight: "800", color: GRAY, paddingVertical: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  cell: { width: "14.2857%", height: 42, alignItems: "center", justifyContent: "center" },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayOn: { backgroundColor: RED },
  dayToday: { borderWidth: 1.5, borderColor: RED },
  dayText: { fontSize: 13, fontWeight: "700", color: C.ink },
  dayTextOn: { color: "#fff", fontWeight: "800" },
  foot: { flexDirection: "row", marginTop: 12 },
  ghost: { flex: 1, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingVertical: 12, alignItems: "center" },
  ghostText: { fontSize: 13, fontWeight: "800", color: C.inkSoft },
});
