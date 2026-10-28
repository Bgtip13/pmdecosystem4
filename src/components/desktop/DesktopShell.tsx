import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet,
  Image, useWindowDimensions, Platform,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import AppIcon from "../AppIcon";
import { A, FONT, SHADOW } from "./tokens";
import type { ReactNode } from "react";

// ===== Kerangka desktop (khusus WEB): sidebar putih-merah + top bar + area isi =====

type NavItem = {
  key: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
  group: string;
};

const ROLE_LABEL: any = {
  owner: "Owner",
  field: "Sales Lapangan",
  telemarketing: "Telemarketing",
  supervisor: "Supervisor",
  ppic: "PPIC",
};

function readSidebarPref(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("pmd.sidebar") === "1";
  } catch {
    return false;
  }
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
  const isOwner = role === "owner";
  const canUseSpk = role === "supervisor" || role === "telemarketing" || role === "owner";
  const canSeeLaporan = role !== "field";

  const piutangCount = useQuery(api.piutang.pendingCount, canUseSpk ? undefined : "skip") as any;
  const orderCount = useQuery(api.orderFollowups.pendingCount, canUseSpk ? undefined : "skip") as any;
  const unread = useQuery(api.notifications.unreadCount) as any;

  const isMobile = width < 900;
  const compactViewport = width < 1160;
  const [collapsedPref, setCollapsedPref] = useState<boolean>(readSidebarPref);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [userMenu, setUserMenu] = useState(false);

  const collapsed = !isMobile && (collapsedPref || compactViewport);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("pmd.sidebar", collapsedPref ? "1" : "0");
    } catch {}
  }, [collapsedPref]);

  // Tutup drawer setiap pindah halaman
  useEffect(() => {
    setDrawerOpen(false);
    setUserMenu(false);
    setPaletteOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) setDrawerOpen((v) => !v);
    else setCollapsedPref((v) => !v);
  }, [isMobile]);

  // Pintasan papan tombol: Ctrl/Cmd+K cari menu, Ctrl/Cmd+B lipat sidebar
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") {
        e.preventDefault();
        setPaletteQuery("");
        setPaletteOpen((v) => !v);
      } else if (mod && key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setUserMenu(false);
        setDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      { key: "beranda", label: "Dashboard", icon: "home", href: "/beranda", group: "Operasional" },
    ];
    if (canUseSpk) {
      items.push({
        key: "spk", label: "SPK", icon: "clipboard", href: "/spk", group: "Operasional",
        badge: (piutangCount?.count ?? 0) + (orderCount?.count ?? 0),
      });
    }
    // Kunjungan lapangan: daftar toko untuk check-in + jadwal harian dari sheet.
    if (role === "field" || isSuper) {
      items.push({ key: "spk-sales", label: "SPK Sales", icon: "pin", href: "/spk-sales", group: "Operasional" });
    }
    if (role === "field" || isSuper || isOwner) {
      items.push({ key: "jadwal", label: "SPK Jadwal", icon: "calendar", href: "/jadwal", group: "Operasional" });
    }
    items.push({ key: "riwayat", label: "Riwayat", icon: "clock", href: "/riwayat", group: "Operasional" });
    if (canSeeLaporan) {
      items.push({ key: "laporan", label: "Laporan", icon: "chart", href: "/laporan", group: "Analitik" });
    }
    if (isSuper) {
      items.push({ key: "spv", label: "Supervisor", icon: "shield", href: "/spv", group: "Sistem" });
    }
    items.push({ key: "akun", label: "Akun", icon: "user", href: "/akun", group: "Sistem" });
    return items;
  }, [canUseSpk, canSeeLaporan, isSuper, isOwner, role, piutangCount?.count, orderCount?.count]);

  const paletteItems = useMemo(() => {
    const base = [
      ...navItems.map((n) => ({ label: n.label, hint: n.group, icon: n.icon, href: n.href })),
      ...(role === "field" || isSuper
        ? [{ label: "SPK Sales", hint: "Operasional", icon: "pin", href: "/spk-sales" }]
        : []),
      ...(role === "field" || isSuper || isOwner
        ? [{ label: "SPK Jadwal", hint: "Operasional", icon: "calendar", href: "/jadwal" }]
        : []),
      { label: "Riwayat Kunjungan Sales", hint: "Riwayat", icon: "pin", href: "/riwayat?tab=kunjungan" },
      { label: "Riwayat Follow-up Admin", hint: "Riwayat", icon: "checkDone", href: "/riwayat?tab=admin" },
      { label: "Riwayat FU Toko", hint: "Riwayat", icon: "store", href: "/riwayat?tab=fu" },
      ...(canSeeLaporan
        ? [
            { label: "PCP Bulanan", hint: "Laporan", icon: "trend", href: "/laporan-pcp" },
            { label: "PCP Mingguan", hint: "Laporan", icon: "calendar", href: "/laporan-pcp-mingguan" },
            { label: "Target vs Aktual", hint: "Laporan", icon: "chart", href: "/laporan-dap" },
            { label: "Rekap FU Toko", hint: "Laporan", icon: "store", href: "/laporan-fu-toko" },
          ]
        : []),
      { label: "Kelola Toko", hint: "Data", icon: "store", href: "/kelola-toko" },
      { label: "Notifikasi", hint: "Akun", icon: "bell", href: "/notifikasi" },
      { label: "Chat Internal", hint: "Akun", icon: "chat", href: "/chat" },
      ...(isSuper
        ? [
            { label: "Audit Aktivitas", hint: "Supervisor", icon: "shield", href: "/audit" },
            { label: "Approval Lokasi Toko", hint: "Supervisor", icon: "location", href: "/spv-approval" },
            { label: "Izin Sales", hint: "Supervisor", icon: "calendar", href: "/izin" },
            { label: "Kelola Akun Sales", hint: "Supervisor", icon: "users", href: "/kelola-akun" },
          ]
        : []),
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
  }, [navItems, paletteQuery, canSeeLaporan, isSuper, isOwner, role]);

  const openItem = (href: string) => {
    setPaletteOpen(false);
    setPaletteQuery("");
    router.push(href as any);
  };

  const initial = String(viewer?.name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const roleLabel = ROLE_LABEL[role] ?? role ?? "-";

  const doLogout = async () => {
    try {
      await signOut();
      router.replace("/" as any);
    } catch {}
  };

  const sidebar = (
    <View style={[s.sidebar, collapsed && s.sidebarCollapsed, isMobile && s.sidebarMobile]}>
      {/* Merek */}
      <View style={[s.brandBox, collapsed && s.brandBoxCollapsed]}>
        <View style={s.logoTile}>
          <Image source={require("../../../assets/logo.png")} style={s.logo} resizeMode="contain" />
        </View>
        {!collapsed ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.brandName} numberOfLines={1}>PMD Ecosystem 4.0</Text>
            <Text style={s.brandSub} numberOfLines={1}>Prima Mandiri Distribusi</Text>
          </View>
        ) : null}
        {!isMobile ? (
          <TouchableOpacity
            style={s.collapseBtn}
            onPress={() => setCollapsedPref((v) => !v)}
            accessibilityLabel={collapsed ? "Buka menu" : "Ciutkan menu"}
          >
            <AppIcon name={collapsed ? "chevron" : "back"} size={14} color={A.muted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.collapseBtn} onPress={() => setDrawerOpen(false)} accessibilityLabel="Tutup menu">
            <AppIcon name="close" size={16} color={A.muted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        {["Operasional", "Analitik", "Sistem"].map((group) => {
          const items = navItems.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <View key={group} style={s.navGroup}>
              {collapsed ? <View style={s.groupRule} /> : <Text style={s.navLabel}>{group}</Text>}
              {items.map((item) => (
                <SidebarItem
                  key={item.key}
                  item={item}
                  active={active === item.key}
                  collapsed={collapsed}
                  onPress={() => router.push(item.href as any)}
                />
              ))}
            </View>
          );
        })}

        {!collapsed ? (
          <View style={s.tipCard}>
            <View style={s.tipIcon}>
              <AppIcon name="info" size={14} color={A.brand} />
            </View>
            <Text style={s.tipTitle}>Pintasan cepat</Text>
            <Text style={s.tipText}>Tekan Ctrl + K untuk mencari menu, Ctrl + B untuk melipat sidebar.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[s.sideFoot, collapsed && { alignItems: "center" }]}>
        <View style={[s.userBox, collapsed && s.userBoxCollapsed]}>
          {viewer?.image ? (
            <Image source={{ uri: viewer.image }} style={s.avatar} />
          ) : (
            <View style={s.userAvatar}><Text style={s.userAvatarText}>{initial}</Text></View>
          )}
          {!collapsed ? (
            <>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.userName} numberOfLines={1}>{viewer?.name ?? "-"}</Text>
                <Text style={s.userRole} numberOfLines={1}>
                  {roleLabel}{viewer?.area ? ` • ${viewer.area}` : ""}
                </Text>
              </View>
              <TouchableOpacity style={s.logoutMini} onPress={doLogout} accessibilityLabel="Keluar">
                <AppIcon name="logout" size={15} color={A.muted} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        {!collapsed ? <Text style={s.version}>PMD Ecosystem v4.0.4</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {!isMobile ? sidebar : null}

      <View style={s.main}>
        {/* ===== Top bar ===== */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.menuBtn} onPress={toggleSidebar} accessibilityLabel="Buka atau lipat menu">
            <AppIcon name="menu" size={17} color={A.inkSoft} />
          </TouchableOpacity>

          {width >= 720 ? (
            <View style={s.crumb}>
              <Text style={s.crumbRoot}>PMD Ecosystem</Text>
              <Text style={s.crumbSep}>/</Text>
              <Text style={s.crumbNow} numberOfLines={1}>{title}</Text>
            </View>
          ) : null}

          {width >= 760 ? (
            <Pressable style={s.searchBtn} onPress={() => { setPaletteQuery(""); setPaletteOpen(true); }}>
              <AppIcon name="search" size={14} color={A.mutedSoft} />
              <Text style={s.searchPlaceholder} numberOfLines={1}>Cari menu atau halaman…</Text>
              <View style={s.kbd}><Text style={s.kbdText}>Ctrl K</Text></View>
            </Pressable>
          ) : <View style={{ flex: 1 }} />}

          <View style={{ flex: 1 }} />
          {width >= 1240 ? <Text style={s.dateText} numberOfLines={1}>{today}</Text> : null}

          <TouchableOpacity style={s.topIcon} onPress={() => router.push("/notifikasi" as any)} accessibilityLabel="Notifikasi">
            <AppIcon name="bell" size={16} color={A.inkSoft} />
            {Number(unread ?? 0) > 0 ? (
              <View style={s.topBadge}><Text style={s.topBadgeText}>{Number(unread) > 9 ? "9+" : unread}</Text></View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.topIcon} onPress={() => router.push("/chat" as any)} accessibilityLabel="Chat">
            <AppIcon name="chat" size={16} color={A.inkSoft} />
          </TouchableOpacity>

          <View style={s.topDivider} />

          <Pressable style={s.userPill} onPress={() => setUserMenu((v) => !v)}>
            {viewer?.image ? (
              <Image source={{ uri: viewer.image }} style={s.avatarTop} />
            ) : (
              <View style={s.avatarTop}><Text style={s.avatarTopText}>{initial}</Text></View>
            )}
            {width >= 1040 ? (
              <View style={{ maxWidth: 132 }}>
                <Text style={s.topName} numberOfLines={1}>{viewer?.name ?? "-"}</Text>
                <Text style={s.topRole} numberOfLines={1}>{roleLabel}</Text>
              </View>
            ) : null}
            <AppIcon name="chevronDown" size={13} color={A.muted} />
          </Pressable>
        </View>

        {/* ===== Judul halaman ===== */}
        <View style={s.pageHead}>
          <View style={s.titleMark} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
          </View>
          {right ? <View style={s.pageActions}>{right}</View> : null}
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator>
          <View style={s.bodyInner}>{children}</View>
        </ScrollView>
      </View>

      {/* ===== Drawer mobile ===== */}
      {isMobile && drawerOpen ? (
        <View style={s.drawerLayer}>
          <Pressable style={s.backdrop} onPress={() => setDrawerOpen(false)} />
          <View style={s.drawer}>{sidebar}</View>
        </View>
      ) : null}

      {/* ===== Menu pengguna ===== */}
      {userMenu ? (
        <>
          <Pressable style={s.menuBackdrop} onPress={() => setUserMenu(false)} />
          <View style={s.userMenu}>
            <View style={s.userMenuHead}>
              <Text style={s.userMenuName} numberOfLines={1}>{viewer?.name ?? "-"}</Text>
              <Text style={s.userMenuSub} numberOfLines={1}>
                @{viewer?.email?.replace("@pmd.local", "") ?? "-"} • {roleLabel}
              </Text>
            </View>
            <UserMenuRow icon="user" label="Akun saya" onPress={() => { setUserMenu(false); router.push("/akun" as any); }} />
            <UserMenuRow icon="key" label="Ganti password" onPress={() => { setUserMenu(false); router.push("/ganti-password" as any); }} />
            <UserMenuRow icon="bell" label="Notifikasi" onPress={() => { setUserMenu(false); router.push("/notifikasi" as any); }} />
            <View style={s.userMenuRule} />
            <UserMenuRow icon="logout" label="Keluar" danger onPress={() => { setUserMenu(false); doLogout(); }} />
          </View>
        </>
      ) : null}

      {/* ===== Pencarian menu (Ctrl+K) ===== */}
      {paletteOpen ? (
        <View style={s.paletteLayer}>
          <Pressable style={s.paletteBackdrop} onPress={() => setPaletteOpen(false)} />
          <View style={s.palette}>
            <View style={s.paletteInputRow}>
              <AppIcon name="search" size={16} color={A.muted} />
              <TextInput
                style={s.paletteInput}
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
                  <Pressable
                    key={`${item.label}-${item.href}-${i}`}
                    style={s.paletteRow}
                    onPress={() => openItem(item.href)}
                  >
                    <View style={s.paletteIcon}><AppIcon name={item.icon} size={15} color={A.brand} /></View>
                    <Text style={s.paletteLabel}>{item.label}</Text>
                    <Text style={s.paletteHint}>{item.hint}</Text>
                    <AppIcon name="chevron" size={13} color={A.mutedSoft} />
                  </Pressable>
                ))
              )}
            </ScrollView>
            <View style={s.paletteFoot}>
              <Text style={s.paletteFootText}>Enter untuk membuka hasil teratas</Text>
              <Text style={s.paletteFootText}>PMD Ecosystem 4.0</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SidebarItem({
  item, active, collapsed, onPress,
}: {
  item: NavItem; active: boolean; collapsed: boolean; onPress: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        s.navItem,
        collapsed && s.navItemCollapsed,
        active && s.navItemOn,
        hover && !active && s.navItemHover,
      ]}
    >
      <View style={[s.activeRail, active && { opacity: 1 }]} />
      <AppIcon name={item.icon} size={17} color={active ? A.brand : A.muted} />
      {!collapsed ? (
        <>
          <Text style={[s.navText, active && s.navTextOn]} numberOfLines={1}>{item.label}</Text>
          {item.badge && item.badge > 0 ? (
            <View style={s.badge}><Text style={s.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text></View>
          ) : null}
        </>
      ) : item.badge && item.badge > 0 ? (
        <View style={s.dotBadge} />
      ) : null}
    </Pressable>
  );
}

function UserMenuRow({ icon, label, onPress, danger }: any) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      style={[s.userMenuRow, hover && { backgroundColor: danger ? A.brandSoft : A.surfaceAlt }]}
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
  root: { flex: 1, flexDirection: "row", backgroundColor: A.page, fontFamily: FONT },

  // ===== Sidebar =====
  sidebar: {
    width: 256,
    backgroundColor: A.surface,
    borderRightWidth: 1,
    borderRightColor: A.border,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
  },
  sidebarCollapsed: { width: 78, paddingHorizontal: 10 },
  sidebarMobile: { width: 262, borderRadius: 0 },
  brandBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 6, paddingBottom: 14, marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  brandBoxCollapsed: { justifyContent: "center", paddingHorizontal: 0, borderBottomWidth: 0, marginBottom: 2 },
  logoTile: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: A.cream, borderWidth: 1, borderColor: A.brandBorder,
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: 27, height: 27 },
  brandName: { fontSize: 12.5, fontWeight: "800", color: A.ink, letterSpacing: -0.1, fontFamily: FONT },
  brandSub: { fontSize: 9.5, color: A.muted, marginTop: 2, fontWeight: "500", fontFamily: FONT },
  collapseBtn: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },

  navGroup: { marginTop: 8 },
  navLabel: {
    fontSize: 9, fontWeight: "800", color: A.mutedSoft,
    letterSpacing: 1.1, textTransform: "uppercase",
    marginLeft: 10, marginTop: 12, marginBottom: 5, fontFamily: FONT,
  },
  groupRule: { height: 1, backgroundColor: A.borderSoft, marginVertical: 8, marginHorizontal: 8 },
  navItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 9,
    borderRadius: 8, marginBottom: 2, position: "relative", overflow: "hidden",
  },
  navItemCollapsed: { justifyContent: "center", paddingHorizontal: 0, height: 42 },
  navItemOn: { backgroundColor: A.brandSoft },
  navItemHover: { backgroundColor: A.surfaceAlt },
  activeRail: {
    position: "absolute", left: 0, top: 9, bottom: 9, width: 3,
    borderTopRightRadius: 3, borderBottomRightRadius: 3,
    backgroundColor: A.brand, opacity: 0,
  },
  navText: { flex: 1, fontSize: 12.5, fontWeight: "600", color: A.inkSoft, fontFamily: FONT },
  navTextOn: { color: A.brandDark, fontWeight: "800" },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: A.brand, alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9.5, fontWeight: "800", fontFamily: FONT },
  dotBadge: {
    position: "absolute", top: 7, right: 11,
    width: 7, height: 7, borderRadius: 4, backgroundColor: A.brand,
  },

  tipCard: {
    marginTop: 18, marginHorizontal: 2, padding: 11,
    backgroundColor: A.cream, borderRadius: 10,
    borderWidth: 1, borderColor: A.brandBorder,
  },
  tipIcon: { marginBottom: 5 },
  tipTitle: { fontSize: 10.5, fontWeight: "800", color: A.brandDark, fontFamily: FONT },
  tipText: { fontSize: 9.5, color: A.inkSoft, lineHeight: 14, marginTop: 2, fontFamily: FONT },

  sideFoot: { borderTopWidth: 1, borderTopColor: A.borderSoft, paddingTop: 10 },
  userBox: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 6, paddingVertical: 6, borderRadius: 9,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
  },
  userBoxCollapsed: { backgroundColor: "transparent", borderWidth: 0, padding: 0, justifyContent: "center" },
  userAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: A.brand, alignItems: "center", justifyContent: "center" },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: A.surface },
  userAvatarText: { fontSize: 12, fontWeight: "800", color: "#fff", fontFamily: FONT },
  userName: { fontSize: 11.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  userRole: { fontSize: 9.5, color: A.muted, marginTop: 1, fontFamily: FONT },
  logoutMini: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  version: { fontSize: 9, color: A.mutedSoft, marginTop: 8, textAlign: "center", fontFamily: FONT },

  // ===== Top bar =====
  main: { flex: 1, minWidth: 0, backgroundColor: A.page },
  topbar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    height: 60, paddingHorizontal: 18,
    backgroundColor: A.surface, borderBottomWidth: 1, borderBottomColor: A.border,
  },
  menuBtn: {
    width: 34, height: 34, borderRadius: 8,
    borderWidth: 1, borderColor: A.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: A.surface,
  },
  crumb: { flexDirection: "row", alignItems: "center", minWidth: 0, maxWidth: 240 },
  crumbRoot: { fontSize: 11, color: A.mutedSoft, fontFamily: FONT },
  crumbSep: { fontSize: 11, color: A.mutedSoft, marginHorizontal: 6 },
  crumbNow: { fontSize: 11, fontWeight: "700", color: A.inkSoft, fontFamily: FONT },
  searchBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    height: 34, minWidth: 250, maxWidth: 330,
    paddingHorizontal: 10, marginLeft: 4,
    backgroundColor: A.surfaceAlt, borderWidth: 1, borderColor: A.borderSoft,
    borderRadius: 8,
  },
  searchPlaceholder: { flex: 1, fontSize: 11, color: A.mutedSoft, fontFamily: FONT },
  kbd: {
    backgroundColor: A.surface, borderWidth: 1, borderColor: A.border,
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  kbdText: { fontSize: 8.5, fontWeight: "700", color: A.muted, fontFamily: FONT },
  dateText: { fontSize: 10.5, color: A.muted, marginRight: 4, fontFamily: FONT },
  topIcon: {
    width: 34, height: 34, borderRadius: 8,
    borderWidth: 1, borderColor: A.borderSoft,
    alignItems: "center", justifyContent: "center",
    backgroundColor: A.surface,
  },
  topBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: A.brand, borderWidth: 2, borderColor: A.surface,
    alignItems: "center", justifyContent: "center",
  },
  topBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", fontFamily: FONT },
  topDivider: { width: 1, height: 24, backgroundColor: A.borderSoft, marginHorizontal: 2 },
  userPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingLeft: 4, paddingRight: 7, paddingVertical: 4,
    borderRadius: 22, borderWidth: 1, borderColor: A.borderSoft, backgroundColor: A.surface,
  },
  avatarTop: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: A.brand, alignItems: "center", justifyContent: "center",
  },
  avatarTopText: { fontSize: 11, fontWeight: "800", color: "#fff", fontFamily: FONT },
  topName: { fontSize: 10.5, fontWeight: "800", color: A.ink, fontFamily: FONT },
  topRole: { fontSize: 8.5, color: A.muted, marginTop: 1, fontFamily: FONT },

  // ===== Page head =====
  pageHead: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 16,
    backgroundColor: A.surface, borderBottomWidth: 1, borderBottomColor: A.border,
  },
  titleMark: { width: 4, height: 34, borderRadius: 2, backgroundColor: A.brand },
  title: { fontSize: 22, fontWeight: "800", color: A.ink, letterSpacing: -0.5, fontFamily: FONT },
  subtitle: { fontSize: 11.5, color: A.muted, marginTop: 3, lineHeight: 17, fontFamily: FONT },
  pageActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  scroll: { flex: 1, backgroundColor: A.page },
  body: { padding: 22, paddingBottom: 40 },
  bodyInner: { width: "100%", maxWidth: 1560, alignSelf: "center", gap: 16 },

  // ===== Drawer =====
  drawerLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 80, flexDirection: "row" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(27,21,19,0.42)" },
  drawer: {
    height: "100%",
    backgroundColor: A.surface,
    ...(Platform.OS === "web" ? ({ boxShadow: "0 18px 50px rgba(30,16,12,0.28)" } as any) : {}),
  },

  // ===== User menu =====
  menuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 },
  userMenu: {
    position: "absolute", top: 56, right: 18, width: 232, zIndex: 100,
    backgroundColor: A.surface, borderRadius: 12,
    borderWidth: 1, borderColor: A.border, paddingVertical: 6,
    ...SHADOW,
    shadowOpacity: 0.16,
    shadowRadius: 30,
  },
  userMenuHead: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: A.borderSoft },
  userMenuName: { fontSize: 12, fontWeight: "800", color: A.ink, fontFamily: FONT },
  userMenuSub: { fontSize: 9.5, color: A.muted, marginTop: 2, fontFamily: FONT },
  userMenuRow: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 4, borderRadius: 7,
  },
  userMenuRowText: { fontSize: 11.5, fontWeight: "600", color: A.inkSoft, fontFamily: FONT },
  userMenuRule: { height: 1, backgroundColor: A.borderSoft, marginVertical: 5, marginHorizontal: 10 },

  // ===== Command palette =====
  paletteLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 120, alignItems: "center" },
  paletteBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(27,21,19,0.46)" },
  palette: {
    width: "92%", maxWidth: 580, marginTop: 90,
    backgroundColor: A.surface, borderRadius: 14,
    borderWidth: 1, borderColor: A.border,
    overflow: "hidden",
    ...SHADOW, shadowOpacity: 0.22, shadowRadius: 40,
  },
  paletteInputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, height: 52,
    borderBottomWidth: 1, borderBottomColor: A.borderSoft,
  },
  paletteInput: { flex: 1, fontSize: 13, color: A.ink, outlineStyle: "none", fontFamily: FONT } as any,
  paletteEmpty: { fontSize: 11.5, color: A.muted, padding: 18, textAlign: "center", fontFamily: FONT },
  paletteRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 6, marginTop: 4, borderRadius: 8,
  },
  paletteIcon: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: A.brandSoft, alignItems: "center", justifyContent: "center",
  },
  paletteLabel: { flex: 1, fontSize: 12, fontWeight: "700", color: A.ink, fontFamily: FONT },
  paletteHint: { fontSize: 9.5, color: A.mutedSoft, marginRight: 2, fontFamily: FONT },
  paletteFoot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: A.borderSoft, backgroundColor: A.surfaceAlt,
  },
  paletteFootText: { fontSize: 9, color: A.muted, fontFamily: FONT },
});
