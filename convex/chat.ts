import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ROLE_ORDER: any = { supervisor: 0, field: 1, telemarketing: 2 };
const now = () => Date.now();

// ===== DAFTAR ORANG YANG BOLEH DIAJAK CHAT =====
export const listContacts = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = (await ctx.db.get(userId)) as any;
    if (!me?.role) return [];
    const all = await ctx.db.query("users").collect();
    const out: any[] = [];
    for (const u of all as any[]) {
      if (String(u._id) === String(userId) || !u.role) continue;
      const isSuperPeer = u.role === "supervisor";
      const sameArea = u.area && u.area === me.area;
      if (me.role !== "supervisor" && !isSuperPeer && !sameArea) continue;
      out.push({ _id: u._id, name: u.name ?? "", role: u.role, area: u.area ?? null });
    }
    out.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name));
    return out;
  },
});

// ===== REGISTER TOKEN PUSH PERANGKAT =====
export const registerPushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    if (!token) return { ok: true };
    const existing = (await ctx.db.query("push_tokens")
      .withIndex("by_user", (q) => q.eq("userId", userId)).first()) as any;
    if (existing && existing.token === token) return { ok: true };
    if (existing) await ctx.db.patch(existing._id, { token, updatedAt: now() });
    else await ctx.db.insert("push_tokens", { userId, token, updatedAt: now() });
    return { ok: true };
  },
});

// ===== BUAT / CARI RUANG CHAT =====
export const findOrCreateRoom = mutation({
  args: {
    memberIds: v.array(v.id("users")),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { memberIds, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = (await ctx.db.get(userId)) as any;
    if (!me?.role) throw new Error("Akun belum lengkap.");
    if (memberIds.length === 0) throw new Error("Pilih minimal 1 orang.");

    const members = Array.from(new Set([String(userId), ...memberIds.map(String)])) as any;

    if (me.role !== "supervisor") {
      if (memberIds.length > 1) throw new Error("Sales/telemarketing hanya bisa chat 1 orang.");
      const peer = (await ctx.db.get(memberIds[0])) as any;
      if (!peer?.role) throw new Error("User tidak ditemukan.");
      const allowed = peer.role === "supervisor" || (peer.area && peer.area === me.area);
      if (!allowed) throw new Error("Tidak bisa chat dengan user tersebut.");
    }

    const key = members.map(String).sort().join("|");
    const rooms = (await ctx.db.query("chat_rooms").collect()) as any[];
    for (const r of rooms) {
      const rk = (r.memberIds ?? []).map(String).sort().join("|");
      if (rk === key) return { roomId: r._id, created: false };
    }

    const isGroup = members.length > 2;
    const roomId = await ctx.db.insert("chat_rooms", {
      name: name?.trim() || undefined,
      isGroup,
      memberIds: members,
      createdBy: userId,
      createdAt: now(),
    });
    return { roomId, created: true };
  },
});

// ===== AMBIL RUANG (internal) =====
export const getRoomInternal = internalQuery({
  args: { roomId: v.id("chat_rooms") },
  handler: async (ctx, { roomId }) => ctx.db.get(roomId),
});

// ===== TOKEN PUSH USER (internal) =====
export const tokensForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = (await ctx.db.query("push_tokens")
      .withIndex("by_user", (q) => q.eq("userId", userId)).collect()) as any[];
    return rows.map((r) => r.token as string);
  },
});

// ===== SIMPAN PESAN (internal) =====
export const insertMessageInternal = internalMutation({
  args: {
    roomId: v.id("chat_rooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chat_messages", {
      roomId: args.roomId,
      senderId: args.senderId,
      senderName: args.senderName,
      text: args.text,
      createdAt: now(),
    });
    await ctx.db.patch(args.roomId, {
      lastMessage: args.text,
      lastSenderName: args.senderName,
      lastMessageAt: now(),
    });
    return { ok: true };
  },
});

// ===== KIRIM PESAN + NOTIF PUSH =====
export const sendMessage = action({
  args: { roomId: v.id("chat_rooms"), text: v.string() },
  handler: async (ctx, { roomId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const clean = text.trim();
    if (!clean) throw new Error("Pesan kosong.");
    const me = (await ctx.runQuery(api.users.getUserById, { userId })) as any;
    const room = (await ctx.runQuery(internal.chat.getRoomInternal, { roomId })) as any;
    if (!room) throw new Error("Percakapan tidak ditemukan.");
    if (!(room.memberIds ?? []).map(String).includes(String(userId)))
      throw new Error("Bukan anggota percakapan.");

    await ctx.runMutation(internal.chat.insertMessageInternal, {
      roomId,
      senderId: userId,
      senderName: me?.name ?? "User",
      text: clean,
    });

    // Kirim push ke anggota lain (best-effort)
    try {
      const others = (room.memberIds ?? []).filter((m: any) => String(m) !== String(userId));
      const payloads: any[] = [];
      for (const oid of others) {
        const tokens = (await ctx.runQuery(internal.chat.tokensForUserInternal, { userId: oid as any })) as string[];
        for (const t of tokens) {
          payloads.push({
            to: t,
            title: me?.name ?? "Pesan baru",
            body: clean,
            sound: "default",
            data: { kind: "chat", roomId: String(roomId) },
          });
        }
      }
      for (let i = 0; i < payloads.length; i += 100) {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloads.slice(i, i + 100)),
        });
        await res.json().catch(() => null);
      }
    } catch {}

    return { ok: true };
  },
});

// ===== TANDAI DIBACA =====
export const markRead = mutation({
  args: { roomId: v.id("chat_rooms") },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return;
    const existing = (await ctx.db.query("chat_reads")
      .withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId)).first()) as any;
    const t = now();
    if (existing) await ctx.db.patch(existing._id, { lastReadAt: t });
    else await ctx.db.insert("chat_reads", { userId, roomId, lastReadAt: t });
  },
});

// ===== DAFTAR PERCAKAPAN SAYA =====
export const listRooms = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = (await ctx.db.get(userId)) as any;
    if (!me) return [];
    const rooms = (await ctx.db.query("chat_rooms").collect()) as any[];
    const mine = rooms.filter((r) => (r.memberIds ?? []).map(String).includes(String(userId)));

    const reads = (await ctx.db.query("chat_reads")
      .withIndex("by_user_room", (q) => q.eq("userId", userId)).collect()) as any[];
    const readMap = new Map(reads.map((r) => [String(r.roomId), r.lastReadAt ?? 0]));

    const out: any[] = [];
    for (const r of mine) {
      let title = "";
      if (!r.isGroup) {
        const otherId = (r.memberIds ?? []).find((m: any) => String(m) !== String(userId));
        const u = otherId ? await ctx.db.get(otherId) : null;
        title = (u as any)?.name ?? "Percakapan";
      } else {
        const names: string[] = [];
        for (const m of r.memberIds ?? []) {
          if (String(m) === String(userId)) continue;
          const u = await ctx.db.get(m);
          if (u) names.push((u as any)?.name ?? "");
        }
        title = r.name ?? (names.join(", ") || "Grup");
      }

      const lastRead = readMap.get(String(r._id)) ?? 0;
      // HEMAT: rentang di dalam index + batas 50 (badge maksimal "9+")
      const msgs = (await ctx.db.query("chat_messages")
        .withIndex("by_room_created", (q) => q.eq("roomId", r._id).gte("createdAt", lastRead + 1))
        .take(50)) as any[];
      const unread = msgs.filter((m) => String(m.senderId) !== String(userId)).length;

      out.push({
        roomId: r._id,
        title,
        isGroup: !!r.isGroup,
        lastMessage: r.lastMessage ?? "",
        lastSenderName: r.lastSenderName ?? "",
        lastMessageAt: r.lastMessageAt ?? 0,
        unread,
      });
    }
    out.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
    return out;
  },
});

// ===== TOTAL BELUM DIBACA (badge tab Chat) =====
// HEMAT: dulu memanggil listRooms yang MEMINDAI seluruh pesan tiap room.
// Sekarang: pakai index by_room_created + batas 50 (badge hanya menampilkan "9+").
export const totalUnread = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;

    const rooms = (await ctx.db.query("chat_rooms").collect()) as any[];
    const mine = rooms.filter((r) => (r.memberIds ?? []).map(String).includes(String(userId)));
    if (mine.length === 0) return 0;

    const reads = (await ctx.db.query("chat_reads")
      .withIndex("by_user_room", (q) => q.eq("userId", userId)).collect()) as any[];
    const readMap = new Map(reads.map((r) => [String(r.roomId), r.lastReadAt ?? 0]));

    let total = 0;
    for (const r of mine) {
      const lastRead = readMap.get(String(r._id)) ?? 0;
      const unread = (await ctx.db.query("chat_messages")
        .withIndex("by_room_created", (q) => q.eq("roomId", r._id).gt("createdAt", lastRead))
        .take(50)) as any[];
      total += unread.filter((m) => String(m.senderId) !== String(userId)).length;
    }
    return total;
  },
});

// ===== INFO RUANG (header layar chat) =====
export const getRoomInfo = query({
  args: { roomId: v.id("chat_rooms") },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const room = (await ctx.db.get(roomId)) as any;
    if (!room) return null;
    if (!(room.memberIds ?? []).map(String).includes(String(userId))) return null;

    let title = room.name ?? "";
    if (!title && !room.isGroup) {
      const otherId = (room.memberIds ?? []).find((m: any) => String(m) !== String(userId));
      const u = otherId ? await ctx.db.get(otherId) : null;
      title = (u as any)?.name ?? "Percakapan";
    }
    if (!title) {
      const names: string[] = [];
      for (const m of room.memberIds ?? []) {
        const u = await ctx.db.get(m);
        if (u) names.push((u as any)?.name ?? "");
      }
      title = names.join(", ");
    }
    return { roomId, title, isGroup: !!room.isGroup };
  },
});

// ===== PESAN-PESAN DALAM RUANG =====
export const getMessages = query({
  args: { roomId: v.id("chat_rooms") },
  handler: async (ctx, { roomId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const room = (await ctx.db.get(roomId)) as any;
    if (!room) return [];
    if (!(room.memberIds ?? []).map(String).includes(String(userId))) return [];
    const msgs = (await ctx.db.query("chat_messages")
      .withIndex("by_room_created", (q) => q.eq("roomId", roomId)).collect()) as any[];
    return msgs.slice(-200).map((m) => ({
      _id: m._id,
      senderId: m.senderId,
      senderName: m.senderName,
      text: m.text,
      createdAt: m.createdAt,
    }));
  },
});
