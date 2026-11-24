import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image,
  useWindowDimensions, Platform,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import { menusFor } from "../../lib/menuCatalog";
import { setDownloadLogger } from "../../lib/downloadCsv";
import AppIcon from "../AppIcon";
import { A, FONT, SHADOW, SHADOW_POP } from "./tokens";
import { Avatar, Segmented } from "./ui";
import { ActivityRow, NotifRow } from "./feedItems";
import type { ReactNode } from "react";
import { isOwnerLike, ROLE_LABEL } from "../../lib/roles";

// ===== Kerangka desktop (khusus WEB) =====
// Rail ikon di kiri (aktif = pil hitam), header berisi sapaan/judul + pencarian + lonceng,
// area isi di atas latar abu-lavender. Meniru bahasa desain video referensi.

type NavItem = { key: string; label: string; icon: string; href: string; badge?: number };
const web = (o: any) => o as any;

function readFlag(key: string): boolean {
  try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(key) === "1"; } catch { return false; }
}
function setFlag(key: string) {
  try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1"); } catch {}
}
function clearFlag(key: string) {
  try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key); } catch {}
}

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
  const pathname = usePathname() ?? "";
  const { width } = useWindowDimensions();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer) as any;

  const role = viewer?.role;
  const isSuper = role === "supervisor";
  const isOwner = isOwnerLike(role);
  const isTele = role === "telemarketing";
  const canUseSpk = role === "supervisor" || role === "telemarketing" || isOwnerLike(role);
  const canSeeLaporan = role !== "field";

  const piutangCount = useQuery(api.piutang.pendingCount, canUseSpk ? undefined : "skip") as any;
  const orderCount = useQuery(api.orderFollowups.pendingCount, canUseSpk ? undefined : "skip") as any;
  const unread = useQuery(api.notifications.unreadCount) as any;
  const actUnread = useQuery(api.activity.unreadCount, isSuper ? {} : "skip") as any;
  const bellCount = Number(unread ?? 0) + Number(actUnread ?? 0);

  const record = useMutation(api.activity.record);
  const markSeen = useMutation(api.activity.markSeen);
  const markRead = useMutation(api.notifications.markRead);

  const isMobile = width < 900;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [userMenu, setUserMenu] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellTab, setBellTab] = useState<"notif" | "aktivitas">("notif");

  // Popover lonceng: data hanya diminta saat terbuka
  const notifs = useQuery(api.notifications.listMine, bellOpen ? undefined : "skip") as any;
  const acts = useQuery(api.activity.feed, bellOpen && isSuper ? { limit: 8 } : "skip") as any;

  // ===== Catat login (sekali per sesi tab) & unduhan =====
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => {
    if (!viewer?._id && !viewer?.role) return;
    if (!readFlag("pmd.login.logged")) {
      setFlag("pmd.login.logged");
      recordRef.current({
        action: "auth.login",
        summary: `Login ke web (${ROLE_LABEL[viewer.role] ?? viewer.role})`,
      }).catch(() => {});
    }
  }, [viewer?._id, viewer?.role]);

  useEffect(() => {
    setDownloadLogger((fileName, rows) => {
      recordRef.current({
        action: "export.download",
        summary: `Mengunduh ${fileName} (${rows} baris)`,
        metadata: { fileName, rows },
      }).catch(() => {});
    });
    return () => setDownloadLogger(null);
  }, []);

  // Tutup panel setiap pindah halaman
  useEffect(() => {
    setDrawerOpen(false); setUserMenu(false); setPaletteOpen(false); setBellOpen(false);
  }, [pathname]);

  const toggleBell = () => {
    setUserMenu(false);
    setBellOpen((v) => {
      const next = !v;
      if (next) setBellTab("notif");
      return next;
    });
  };

  // Pintasan: Ctrl/Cmd+K atau "/" cari menu, Esc tutup
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if ((mod && key === "k") || (!typing && !mod && e.key === "/")) {
        e.preventDefault();
        setPaletteQuery("");
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false); setUserMenu(false); setDrawerOpen(false); setBellOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [{ key: "beranda", label: "Beranda", icon: "home", href: "/beranda" }];
    if (canUseSpk) {
      items.push({ key: "spk", label: "SPK", icon: "clipboard", href: "/spk", badge: (piutangCount?.count ?? 0) + (orderCount?.count ?? 0) });
    }
    if (role === "field" || isSuper || isOwner) items.push({ key: "jadwal", label: "Jadwal", icon: "calendar", href: "/jadwal" });
    items.push({ key: "riwayat", label: "Riwayat", icon: "clock", href: "/riwayat" });
    if (role === "hr") items.push({ key: "izin", label: "Izin", icon: "calendar", href: "/izin" });
    if (role && role !== "ppic") items.push({ key: "kelola-toko", label: "Toko", icon: "store", href: "/kelola-toko" });
    if (isTele || isSuper || isOwner) items.push({ key: "toko-aktif", label: "FU Toko", icon: "phone", href: "/toko-aktif" });
    if (role === "field" || isSuper) items.push({ key: "toko-baru", label: "Toko Baru", icon: "plus", href: "/toko-baru" });
    if (canSeeLaporan) items.push({ key: "laporan", label: "Laporan", icon: "chart", href: "/laporan" });
    if (isSuper) items.push({ key: "spv", label: "Supervisor", icon: "shield", href: "/spv" });
    return items;
  }, [canUseSpk, canSeeLaporan, isSuper, isOwner, isTele, role, piutangCount?.count, orderCount?.count]);

  const paletteItems = useMemo(() => {
    const base = [
      ...navItems.map((n) => ({ label: n.label, hint: "Menu", icon: n.icon, href: n.href })),
      { label: "Notifikasi", hint: "Pemberitahuan", icon: "bell", href: "/notifikasi" },
      ...(isSuper ? [{ label: "Log Aktivitas", hint: "Supervisor", icon: "list", href: "/audit" }] : []),
      { label: "Akun saya", hint: "Sistem", icon: "user", href: "/akun" },
      ...menusFor(role).map((m) => ({ label: m.label, hint: m.section, icon: m.icon, href: m.href })),
      ...(role === "akunting" ? [] : [{ label: "Riwayat Kunjungan Sales", hint: "Riwayat", icon: "pin", href: "/riwayat?tab=kunjungan" }]),
      { label: "Riwayat Follow-up Admin", hint: "Riwayat", icon: "checkDone", href: "/riwayat?tab=admin" },
      ...(role === "akunting" ? [] : [{ label: "Riwayat FU Toko", hint: "Riwayat", icon: "store", href: "/riwayat?tab=fu" }]),
    ];
    const q = paletteQuery.trim().toLowerCase();
    const seen = new Set<string>();
    return base.filter((it) => {
      if (!q || `${it.label} ${it.hint}`.toLowerCase().includes(q)) {
        if (seen.has(it.label + it.href)) return false;
        seen.add(it.label + it.href);
        return true;
      }
      return false;
    });
  }, [navItems, paletteQuery, role, isSuper]);

  const openItem = (href: string) => {
    setPaletteOpen(false); setPaletteQuery(""); setBellOpen(false);
    router.push(href as any);
  };

  const roleLabel = ROLE_LABEL[role] ?? role ?? "-";

  const doLogout = async () => {
    try {
      await record({ action: "auth.logout", summary: `Logout dari web (${roleLabel})` }).catch(() => {});
    } catch {}
    try {
      clearFlag("pmd.login.logged");
      await signOut();
      router.replace("/" as any);
    } catch {}
  };

  const openNotif = async (n: any) => {
    try { if (!n.readAt) await markRead({ notifId: n._id }); } catch {}
    if (n.link) openItem(String(n.link)); else openItem("/notifikasi");
  };

  const openAllActivity = async () => {
    try { await markSeen({}); } catch {}
    openItem("/notifikasi?tab=aktivitas");
  };

  // ===== Rail / sidebar =====
  const rail = (
    <View style={[s.rail, isMobile && s.railMobile]}>
      <Pressable style={web([s.logoTile, { cursor: "pointer" }])} onPress={() => router.push("/beranda" as any)}>
        <Image source={require("../../../assets/logo.png")} style={s.logo} resizeMode="contain" />
      </Pressable>
      {isMobile ? (
        <View style={s.drawerHead}>
          <Text style={s.drawerBrand}>PMD Ecosystem</Text>
          <Pressable onPress={() => setDrawerOpen(false)} accessibilityLabel="Tutup menu" style={web({ cursor: "pointer" })}>
            <AppIcon name="close" size={18} color={A.muted} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1, width: "100%" }} contentContainerStyle={s.navList} showsVerticalScrollIndicator={false}>
        {navItems.map((item) => (
          <RailItem key={item.key} item={item} active={active === item.key} wide={isMobile} onPress={() => router.push(item.href as any)} />
        ))}
      </ScrollView>

      <Pressable style={web([s.railUser, { cursor: "pointer" }])} onPress={() => setUserMenu((v) => !v)} accessibilityLabel="Menu akun">
        {viewer?.image ? <Image source={{ uri: viewer.image }} style={s.railAvatar} /> : <Avatar name={viewer?.name} size={38} />}
        {isMobile ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.userName} numberOfLines={1}>{viewer?.name ?? "-"}</Text>
            <Text style={s.userRole} numberOfLines={1}>{roleLabel}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  return (
    <View style={s.root}>
      {!isMobile ? rail : null}

      <View style={s.main}>
        {/* ===== Header ===== */}
        <View style={[s.header, width < 760 && { flexWrap: "wrap" }]}>
          {isMobile ? (
            <Pressable style={web([s.iconBtn, { cursor: "pointer" }])} onPress={() => setDrawerOpen(true)} accessibilityLabel="Buka menu">
              <AppIcon name="list" size={18} color={A.inkSoft} />
            </Pressable>
          ) : null}

          <View style={{ flex: 1, minWidth: 180 }}>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
          </View>

          {width >= 980 ? (
            <Pressable style={web([s.searchBtn, { cursor: "text" }])} onPress={() => { setPaletteQuery(""); setPaletteOpen(true); }}>
              <AppIcon name="search" size={15} color={A.mutedSoft} />
              <Text style={s.searchPlaceholder} numberOfLines={1}>Cari menu, halaman…</Text>
              <View style={s.kbd}><Text style={s.kbdText}>/</Text></View>
            </Pressable>
          ) : (
            <Pressable style={web([s.iconBtn, { cursor: "pointer" }])} onPress={() => { setPaletteQuery(""); setPaletteOpen(true); }} accessibilityLabel="Cari">
              <AppIcon name="search" size={16} color={A.inkSoft} />
            </Pressable>
          )}

          <Pressable style={web([s.iconBtn, { cursor: "pointer" }])} onPress={toggleBell} accessibilityLabel="Notifikasi">
            <AppIcon name="bell" size={17} color={A.inkSoft} />
            {bellCount > 0 ? (
              <View style={s.bellBadge}><Text style={s.bellBadgeText}>{bellCount > 9 ? "9+" : bellCount}</Text></View>
            ) : null}
          </Pressable>
          <Pressable style={web([s.iconBtn, { cursor: "pointer" }])} onPress={() => router.push("/chat" as any)} accessibilityLabel="Chat">
            <AppIcon name="chat" size={17} color={A.inkSoft} />
          </Pressable>
          {right ? <View style={s.actions}>{right}</View> : null}
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator>
          <View style={s.bodyInner}>{children}</View>
        </ScrollView>
      </View>

      {/* ===== Drawer mobile ===== */}
      {isMobile && drawerOpen ? (
        <View style={s.layer}>
          <Pressable style={s.backdrop} onPress={() => setDrawerOpen(false)} />
          <View style={s.drawer}>{rail}</View>
        </View>
      ) : null}

      {/* ===== Popover lonceng ===== */}
      {bellOpen ? (
        <>
          <Pressable style={s.menuBackdrop} onPress={() => setBellOpen(false)} />
          <View style={[s.bell, width < 520 && { right: 8, left: 8, width: "auto" as any }]}>
            <View style={s.bellHead}>
              <Text style={s.bellTitle}>Notifikasi</Text>
              <Pressable onPress={() => openItem("/notifikasi")} style={web({ cursor: "pointer" })}>
                <Text style={s.bellLink}>Lihat semua</Text>
              </Pressable>
            </View>
            {isSuper ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
                <Segmented
                  value={bellTab}
                  onChange={(k) => setBellTab(k as any)}
                  options={[
                    { key: "notif", label: "Untuk saya", count: Number(unread ?? 0) },
                    { key: "aktivitas", label: "Aktivitas tim", count: Number(actUnread ?? 0) },
                  ]}
                />
              </View>
            ) : null}
            <ScrollView style={{ maxHeight: 420 }}>
              {bellTab === "notif" || !isSuper ? (
                notifs === undefined ? (
                  <Text style={s.bellEmpty}>Memuat…</Text>
                ) : (notifs as any[]).length === 0 ? (
                  <Text style={s.bellEmpty}>Belum ada notifikasi.</Text>
                ) : (
                  (notifs as any[]).slice(0, 7).map((n) => <NotifRow key={String(n._id)} n={n} compact onPress={() => openNotif(n)} />)
                )
              ) : acts === undefined ? (
                <Text style={s.bellEmpty}>Memuat…</Text>
              ) : (acts.items as any[]).length === 0 ? (
                <Text style={s.bellEmpty}>Belum ada aktivitas.</Text>
              ) : (
                (acts.items as any[]).map((e) => (
                  <ActivityRow key={String(e._id)} e={e} compact isNew={e.createdAt > (acts.seenAt ?? 0) && String(e.actorId) !== String(viewer?._id)} onPress={openAllActivity} />
                ))
              )}
            </ScrollView>
            {isSuper && bellTab === "aktivitas" ? (
              <Pressable style={web([s.bellFoot, { cursor: "pointer" }])} onPress={openAllActivity}>
                <Text style={s.bellFootText}>Buka log aktivitas lengkap</Text>
                <AppIcon name="chevron" size={13} color={A.inkSoft} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      {/* ===== Menu pengguna ===== */}
      {userMenu ? (
        <>
          <Pressable style={s.menuBackdrop} onPress={() => setUserMenu(false)} />
          <View style={[s.userMenu, isMobile && { left: 12, bottom: 84 }]}>
            <View style={s.userMenuHead}>
              <Avatar name={viewer?.name} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.userMenuName} numberOfLines={1}>{viewer?.name ?? "-"}</Text>
                <Text style={s.userMenuSub} numberOfLines={1}>
                  @{viewer?.email?.replace("@pmd.local", "") ?? "-"} • {roleLabel}
                </Text>
              </View>
            </View>
            <UserMenuRow icon="user" label="Akun saya" onPress={() => { setUserMenu(false); router.push("/akun" as any); }} />
            <UserMenuRow icon="key" label="Ganti password" onPress={() => { setUserMenu(false); router.push("/ganti-password" as any); }} />
            <UserMenuRow icon="bell" label="Notifikasi" onPress={() => { setUserMenu(false); router.push("/notifikasi" as any); }} />
            <View style={s.userMenuRule} />
            <UserMenuRow icon="logout" label="Keluar" danger onPress={() => { setUserMenu(false); doLogout(); }} />
          </View>
        </>
      ) : null}

      {/* ===== Pencarian menu ===== */}
      {paletteOpen ? (
        <View style={s.layer}>
          <Pressable style={web([s.backdrop, { backdropFilter: "blur(6px)" }])} onPress={() => setPaletteOpen(false)} />
          <View style={s.palette}>
            <View style={s.paletteInputRow}>
              <AppIcon name="search" size={17} color={A.muted} />
              <TextInput
                style={web([s.paletteInput, { outlineStyle: "none" }])}
                placeholder="Cari menu atau halaman…"
                placeholderTextColor={A.mutedSoft}
                value={paletteQuery}
                onChangeText={setPaletteQuery}
                autoFocus
                onSubmitEditing={() => paletteItems[0] && openItem(paletteItems[0].href)}
              />
              <View style={s.kbd}><Text style={s.kbdText}>Esc</Text></View>
            </View>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {paletteItems.length === 0 ? (
                <Text style={s.paletteEmpty}>Tidak ada menu yang cocok.</Text>
              ) : (
                paletteItems.map((item, i) => (
                  <PaletteRow key={`${item.label}-${item.href}-${i}`} item={item} onPress={() => openItem(item.href)} />
                ))
              )}
            </ScrollView>
            <View style={s.paletteFoot}>
              <Text style={s.paletteFootText}>Enter membuka hasil teratas</Text>
              <Text style={s.paletteFootText}>PMD Ecosystem 4.0</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RailItem({ item, active, wide, onPress }: { item: NavItem; active: boolean; wide: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={web([s.navItem, wide && s.navItemWide, { cursor: "pointer" }])}
    >
      <View style={[s.navIconWrap, wide && { marginRight: 12 }, active && s.navIconOn, hover && !active && { backgroundColor: A.borderSoft }]}>
        <AppIcon name={item.icon} size={19} color={active ? "#fff" : A.muted} />
        {item.badge && item.badge > 0 ? (
          <View style={s.navBadge}><Text style={s.navBadgeText}>{item.badge > 99 ? "99+" : item.badge}</Text></View>
        ) : null}
      </View>
      <Text style={[s.navText, wide && { fontSize: 14 }, active && s.navTextOn]} numberOfLines={1}>{item.label}</Text>
    </Pressable>
  );
}

function PaletteRow({ item, onPress }: any) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      style={web([s.paletteRow, hover && { backgroundColor: A.surfaceAlt }, { cursor: "pointer" }])}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onPress={onPress}
    >
      <View style={s.paletteIcon}><AppIcon name={item.icon} size={15} color={A.inkSoft} /></View>
      <Text style={s.paletteLabel}>{item.label}</Text>
      <Text style={s.paletteHint}>{item.hint}</Text>
      <AppIcon name="chevron" size={13} color={A.mutedSoft} />
    </Pressable>
  );
}

function UserMenuRow({ icon, label, onPress, danger }: any) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      style={web([s.userMenuRow, hover && { backgroundColor: danger ? A.redSoft : A.surfaceAlt }, { cursor: "pointer" }])}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onPress={onPress}
    >
      <AppIcon name={icon} size={15} color={danger ? A.red : A.inkSoft} />
      <Text style={[s.userMenuRowText, danger && { color: A.red }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: A.page, fontFamily: FONT } as any,

  // Rail
  rail: {
    width: 96, backgroundColor: A.surface, borderRightWidth: 1, borderRightColor: A.border,
    alignItems: "center", paddingTop: 18, paddingBottom: 14,
  },
  railMobile: { width: 280, alignItems: "stretch", paddingHorizontal: 14, height: "100%" as any },
  logoTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.border, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  logo: { width: 30, height: 30 },
  drawerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  drawerBrand: { fontSize: 15, fontWeight: "800", color: A.ink, fontFamily: FONT },
  navList: { alignItems: "center", gap: 6, paddingVertical: 6 },
  navItem: { width: 76, alignItems: "center", paddingVertical: 4 },
  navItemWide: { width: "100%" as any, flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  navIconWrap: { width: 46, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  navIconOn: { backgroundColor: A.ink },
  navText: { fontSize: 10.5, fontWeight: "600", color: A.muted, marginTop: 4, fontFamily: FONT },
  navTextOn: { color: A.ink, fontWeight: "800" },
  navBadge: { position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: A.red, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: A.surface },
  navBadgeText: { color: "#fff", fontSize: 9.5, fontWeight: "800", fontFamily: FONT },
  railUser: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12 },
  railAvatar: { width: 38, height: 38, borderRadius: 19 },
  userName: { fontSize: 13, fontWeight: "700", color: A.ink, fontFamily: FONT },
  userRole: { fontSize: 11.5, color: A.muted, fontFamily: FONT },

  // Main
  main: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 28, paddingTop: 22, paddingBottom: 6 },
  title: { fontSize: 26, fontWeight: "800", color: A.ink, letterSpacing: -0.9, fontFamily: FONT },
  subtitle: { fontSize: 13.5, color: A.muted, marginTop: 3, fontFamily: FONT },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, alignItems: "center", justifyContent: "center", ...SHADOW, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  bellBadge: { position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: A.red, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: A.page },
  bellBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", fontFamily: FONT },
  searchBtn: { width: 280, height: 42, borderRadius: 14, backgroundColor: A.surface, borderWidth: 1, borderColor: A.border, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14 },
  searchPlaceholder: { flex: 1, fontSize: 13, color: A.mutedSoft, fontFamily: FONT },
  kbd: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 6, backgroundColor: A.borderSoft, alignItems: "center", justifyContent: "center" },
  kbdText: { fontSize: 11, fontWeight: "700", color: A.muted, fontFamily: FONT },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 48 },
  bodyInner: { width: "100%", maxWidth: 1440, alignSelf: "center" },

  // Lapisan overlay
  layer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 80 } as any,
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(16,18,24,0.40)" } as any,
  drawer: { position: "absolute", top: 0, left: 0, bottom: 0, width: 280 },
  menuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 } as any,

  // Popover lonceng
  bell: { position: "absolute", top: 76, right: 28, width: 410, zIndex: 70, backgroundColor: A.surface, borderRadius: 22, borderWidth: 1, borderColor: A.border, overflow: "hidden", ...SHADOW_POP } as any,
  bellHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  bellTitle: { fontSize: 16, fontWeight: "800", color: A.ink, letterSpacing: -0.3, fontFamily: FONT },
  bellLink: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  bellEmpty: { padding: 28, textAlign: "center", fontSize: 13, color: A.muted, fontFamily: FONT },
  bellFoot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderTopWidth: 1, borderTopColor: A.borderSoft, backgroundColor: A.surfaceAlt },
  bellFootText: { fontSize: 12.5, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },

  // Menu pengguna
  userMenu: { position: "absolute", left: 104, bottom: 18, width: 280, zIndex: 70, backgroundColor: A.surface, borderRadius: 20, borderWidth: 1, borderColor: A.border, padding: 8, ...SHADOW_POP } as any,
  userMenuHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginBottom: 4 },
  userMenuName: { fontSize: 14, fontWeight: "800", color: A.ink, fontFamily: FONT },
  userMenuSub: { fontSize: 11.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  userMenuRule: { height: 1, backgroundColor: A.borderSoft, marginVertical: 6 },
  userMenuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  userMenuRowText: { fontSize: 13.5, fontWeight: "600", color: A.inkSoft, fontFamily: FONT },

  // Palet pencarian
  palette: { position: "absolute", top: 90, alignSelf: "center", width: 580, maxWidth: "92%" as any, backgroundColor: A.surface, borderRadius: 22, overflow: "hidden", ...SHADOW_POP } as any,
  paletteInputRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, height: 58, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  paletteInput: { flex: 1, fontSize: 15, color: A.ink, fontFamily: FONT, padding: 0 } as any,
  paletteRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 11 },
  paletteIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: A.borderSoft, alignItems: "center", justifyContent: "center" },
  paletteLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: A.ink, fontFamily: FONT },
  paletteHint: { fontSize: 12, color: A.mutedSoft, fontFamily: FONT },
  paletteEmpty: { padding: 28, textAlign: "center", fontSize: 13, color: A.muted, fontFamily: FONT },
  paletteFoot: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: 1, borderTopColor: A.borderSoft, backgroundColor: A.surfaceAlt },
  paletteFootText: { fontSize: 11.5, color: A.mutedSoft, fontFamily: FONT },
});
