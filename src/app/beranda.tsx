import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import IOSSpinner from "../components/IOSSpinner";
import {
  Card,
  CardLabel,
  Empty,
  HomeScreen,
  QuickActions,
  SummaryRow,
} from "../components/home/ui";
import FieldHome from "../components/home/FieldHome";
import TeleHome from "../components/home/TeleHome";
import SupervisorHome from "../components/home/SupervisorHome";
import OwnerHome from "../components/home/OwnerHome";
import { theme } from "../lib/theme";

const { colors: C } = theme;

/**
 * Beranda mobile — satu layar, satu pekerjaan utama per role.
 * Tiap role punya komposisinya sendiri supaya query dan panel yang tidak
 * relevan tidak ikut dimuat.
 */
export default function Beranda() {
  const viewer = useQuery(api.users.viewer) as any;

  if (!viewer) {
    return (
      <View style={s.center}>
        <IOSSpinner size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <HomeScreen viewer={viewer}>
      {viewer.role === "field" ? (
        <FieldHome />
      ) : viewer.role === "telemarketing" ? (
        <TeleHome viewer={viewer} />
      ) : viewer.role === "supervisor" ? (
        <SupervisorHome />
      ) : viewer.role === "owner" ? (
        <OwnerHome />
      ) : (
        <FallbackHome />
      )}
    </HomeScreen>
  );
}

/** Role di luar sales/supervisor/owner (mis. PPIC) — tetap punya jalan ke menu utama. */
function FallbackHome() {
  const router = useRouter();
  return (
    <>
      <Card>
        <CardLabel>AKSES CEPAT</CardLabel>
        <Text style={s.fallbackTitle}>Selamat datang</Text>
        <Empty text="Pilih menu di bawah untuk mulai. Ringkasan role kamu ada di menu Laporan." />
      </Card>

      <QuickActions
        items={[
          { icon: "chart", label: "Laporan", color: C.chip.success.fg, bg: C.chip.success.bg, to: "/laporan" },
          { icon: "store", label: "Kelola Toko", color: C.chip.info.fg, bg: C.chip.info.bg, to: "/kelola-toko" },
          { icon: "user", label: "Akun", color: C.chip.purple.fg, bg: C.chip.purple.bg, to: "/akun" },
        ]}
      />

      <Card>
        <SummaryRow icon="trend" label="Pencapaian PCP" sub="Bulanan & mingguan per area" value="Buka" onPress={() => router.push("/laporan-pcp" as any)} />
        <SummaryRow icon="clipboard" label="SPK" sub="SPK Sales & SPK Admin" value="Buka" onPress={() => router.push("/spk" as any)} />
        <SummaryRow icon="chat" label="Chat internal" sub="Pesan dengan tim" value="Buka" onPress={() => router.push("/chat" as any)} />
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },
  fallbackTitle: { fontSize: 20, fontWeight: "900", color: C.ink, marginTop: 6, marginBottom: 2 },
});
