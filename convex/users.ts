import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

const SEED_USERS = [
  { username: "bagus",   name: "Bagus",  role: "supervisor",    area: undefined },
  { username: "surya",   name: "Surya",  role: "field",         area: "SOLO" },
  { username: "adelia",  name: "Adelia", role: "telemarketing", area: "SOLO" },
  { username: "wahyu",   name: "Wahyu",  role: "field",         area: "DIY" },
  { username: "april",   name: "April",  role: "telemarketing", area: "DIY" },
  { username: "krisna",  name: "Krisna", role: "field",         area: "SEMARANG" },
  { username: "fitri",   name: "Fitri",  role: "telemarketing", area: "SEMARANG" },
];

export const seedUsers = action({
  handler: async (ctx) => {
        const first = await ctx.runQuery(api.users.firstUser);
    if (first) throw new Error("Seed sudah pernah dijalankan.");
    for (const u of SEED_USERS) {
      const email = u.username + "@pmd.local";
      const profile: any = { name: u.name, email, role: u.role, mustChangePassword: true };
      if (u.area) profile.area = u.area;
      await createAccount(ctx, {
        provider: "password",
        account: { id: email, secret: "pmd123" },
        profile,
      });
    }
  },
});

export const firstUser = query({
  handler: async (ctx) => ctx.db.query("users").first(),
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});

export const findByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    ctx.db.query("users").filter((q) => q.eq(q.field("email"), email)).first(),
});

export const viewer = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name ?? "",
      email: user.email ?? "",
      role: (user as any).role ?? "",
      area: (user as any).area ?? "",
      mustChangePassword: (user as any).mustChangePassword ?? false,
    };
  },
});

export const clearMustChangePassword = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { mustChangePassword: false });
  },
});

export const setMustChangePassword = mutation({
  args: { userId: v.id("users"), value: v.boolean() },
  handler: async (ctx, { userId, value }) => {
    await ctx.db.patch(userId, { mustChangePassword: value });
  },
});

export const changeMyPassword = action({
  args: { newPassword: v.string() },
  handler: async (ctx, { newPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const user = await ctx.runQuery(api.users.getUserById, { userId });
    if (!user || !user.email) throw new Error("User tidak ditemukan.");
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: user.email, secret: newPassword },
    });
    await ctx.runMutation(api.users.clearMustChangePassword, { userId });
  },
});

export const adminResetPassword = action({
  args: { username: v.string(), newPassword: v.string() },
  handler: async (ctx, { username, newPassword }) => {
    const callerId = await getAuthUserId(ctx);
    if (callerId === null) throw new Error("Belum login.");
    const caller = await ctx.runQuery(api.users.getUserById, { userId: callerId });
    if ((caller as any)?.role !== "supervisor")
      throw new Error("Hanya supervisor yang boleh reset password.");
    const email = username.trim().toLowerCase() + "@pmd.local";
    const target = await ctx.runQuery(api.users.findByEmail, { email });
    if (!target) throw new Error("User tidak ditemukan.");
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: newPassword },
    });
    await ctx.runMutation(api.users.setMustChangePassword, { userId: target._id, value: true });
  },
});
// ===== KELOLA AKUN (SPV) =====
export const listUsersManage = query({
  args: {
    role: v.optional(v.union(v.literal("field"), v.literal("telemarketing"), v.literal("supervisor"))),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { role, q }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") return [];

    const keyword = (q ?? "").trim().toLowerCase();
    const all = await ctx.db.query("users").collect();
    const out = all
      .filter((u: any) => u.role) // hanya akun terisi perannya
      .filter((u: any) => (role ? u.role === role : true))
      .filter((u: any) => {
        if (!keyword) return true;
        return (u.name || "").toLowerCase().includes(keyword)
          || (u.email || "").toLowerCase().includes(keyword);
      })
      .sort((a: any, b: any) => {
        const order: any = { supervisor: 0, field: 1, telemarketing: 2 };
        return (order[a.role] ?? 9) - (order[b.role] ?? 9) || (a.name || "").localeCompare(b.name || "");
      });
    return out.map((u: any) => ({
      _id: u._id,
      name: u.name ?? "",
      email: u.email ?? "",
      role: u.role ?? "",
      area: u.area ?? null,
      mustChangePassword: u.mustChangePassword ?? false,
    }));
  },
});

export const updateUserRoleArea = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("field"), v.literal("telemarketing"), v.literal("supervisor")),
    area: v.optional(v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Belum login.");
    const me = await ctx.db.get(userId);
    if ((me as any)?.role !== "supervisor") throw new Error("Khusus supervisor.");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User tidak ditemukan.");

    if (args.userId === userId && args.role !== "supervisor") {
      throw new Error("Kamu tidak bisa mengubah peranmu sendiri dari Supervisor.");
    }
    if ((args.role === "field" || args.role === "telemarketing") && !args.area) {
      throw new Error("Sales lapangan / telemarketing wajib punya area.");
    }

    await ctx.db.patch(args.userId, {
      role: args.role,
      area: args.role === "supervisor" ? undefined : args.area,
    });
    return { ok: true };
  },
});
