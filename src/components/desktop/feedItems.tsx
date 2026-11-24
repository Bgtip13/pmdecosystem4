import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import AppIcon from "../AppIcon";
import { A, FONT } from "./tokens";
import { IconTile, Pill, Avatar } from "./ui";
import type { Tone } from "./ui";
import { KIND_META, kindOf, labelOf, domainOf, timeAgo, clock } from "../../lib/activityMeta";
import { ROLE_LABEL } from "../../lib/roles";

const web = (o: any) => o as any;

// ===== Jenis notifikasi biasa (tabel notifications) → ikon & warna =====
const NOTIF_KIND: Record<string, { icon: string; tone: Tone; label: string }> = {
  manual: { icon: "send", tone: "violet", label: "Pesan supervisor" },
  spk_admin: { icon: "clipboard", tone: "amber", label: "SPK Admin" },
  field_visits: { icon: "pin", tone: "blue", label: "Kunjungan" },
  riwayat_cek: { icon: "clock", tone: "violet", label: "Riwayat" },
  active_store_reopen: { icon: "store", tone: "red", label: "FU Toko dibuka ulang" },
  jadwal_added: { icon: "calendar", tone: "green", label: "Jadwal" },
  jadwal_request_move: { icon: "calendar", tone: "amber", label: "Pengajuan jadwal" },
  chat: { icon: "chat", tone: "blue", label: "Chat" },
};
export const notifMeta = (k?: string | null) => NOTIF_KIND[k ?? ""] ?? { icon: "bell", tone: "gray" as Tone, label: "Notifikasi" };

export function NotifRow({ n, onPress, compact }: { n: any; onPress?: () => void; compact?: boolean }) {
  const [hov, setHov] = useState(false);
  const m = notifMeta(n.kind);
  const unread = !n.readAt;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHov(true)}
      onHoverOut={() => setHov(false)}
      style={web({
        flexDirection: "row", gap: 12, alignItems: "flex-start",
        paddingVertical: compact ? 11 : 14, paddingHorizontal: compact ? 14 : 18,
        backgroundColor: hov ? A.surfaceAlt : unread ? "#FAFAFD" : "transparent",
        cursor: "pointer",
      })}
    >
      <IconTile icon={m.icon} tone={m.tone} size={compact ? 32 : 38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: unread ? "800" : "600", color: A.ink, fontFamily: FONT }} numberOfLines={1}>{n.title}</Text>
          <Text style={{ fontSize: 11.5, color: A.mutedSoft, fontFamily: FONT }}>{timeAgo(n.createdAt)}</Text>
        </View>
        <Text style={{ fontSize: 12.5, color: A.muted, marginTop: 2, lineHeight: 18, fontFamily: FONT }} numberOfLines={compact ? 1 : 2}>{n.body}</Text>
        {!compact ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            <Pill text={m.label} tone={m.tone} size="sm" />
            {n.fromName ? <Text style={{ fontSize: 11.5, color: A.mutedSoft, fontFamily: FONT }}>dari {n.fromName}</Text> : null}
          </View>
        ) : null}
      </View>
      {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: A.red, marginTop: 6 }} /> : null}
    </Pressable>
  );
}

// ===== Baris aktivitas (audit_events) =====
export function ActivityRow({ e, onPress, compact, isNew }: { e: any; onPress?: () => void; compact?: boolean; isNew?: boolean }) {
  const [hov, setHov] = useState(false);
  const k = kindOf(e.action);
  const meta = KIND_META[k];
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHov(true)}
      onHoverOut={() => setHov(false)}
      style={web({
        flexDirection: "row", gap: 12, alignItems: "flex-start",
        paddingVertical: compact ? 11 : 14, paddingHorizontal: compact ? 14 : 18,
        backgroundColor: hov ? A.surfaceAlt : isNew ? "#FAFAFD" : "transparent",
        cursor: onPress ? "pointer" : "default",
      })}
    >
      <IconTile icon={meta.icon} tone={meta.tone} size={compact ? 32 : 38} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13.5, color: A.ink, fontFamily: FONT }} numberOfLines={1}>
            <Text style={{ fontWeight: "800" }}>{e.actorName}</Text>
            <Text style={{ color: A.muted }}> • {labelOf(e.action)}</Text>
          </Text>
          <Text style={{ fontSize: 11.5, color: A.mutedSoft, fontFamily: FONT }}>{compact ? timeAgo(e.createdAt) : clock(e.createdAt)}</Text>
        </View>
        <Text style={{ fontSize: 12.5, color: A.muted, marginTop: 2, lineHeight: 18, fontFamily: FONT }} numberOfLines={compact ? 1 : 2}>{e.summary}</Text>
        {!compact ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Pill text={meta.label} tone={meta.tone} size="sm" />
            <Pill text={domainOf(e.action)} tone="gray" size="sm" />
            {e.actorRole ? <Text style={{ fontSize: 11.5, color: A.mutedSoft, fontFamily: FONT }}>{ROLE_LABEL[e.actorRole] ?? e.actorRole}{e.area ? ` • ${e.area}` : ""}</Text> : null}
          </View>
        ) : null}
      </View>
      {isNew ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: A.red, marginTop: 6 }} /> : null}
    </Pressable>
  );
}

export { Avatar };
