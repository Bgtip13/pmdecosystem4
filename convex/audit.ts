import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));

// Dipakai action (mis. sync piutang) karena logAudit hanya jalan di mutation.
export const writeEvent = internalMutation({
  args: {
    actorId: v.optional(v.id("users")),
    actorName: v.optional(v.string()),
    actorRole: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    area: v.optional(AREA),
    summary: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorName: args.actorName ?? "Sistem",
      actorRole: args.actorRole,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      area: args.area,
      summary: args.summary,
      before: args.before,
      after: args.after,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

// ===== DAFTAR AUDIT (supervisor & owner) =====
export const listAuditEvents = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    area: v.optional(AREA),
    actorId: v.optional(v.id("users")),
    action: v.optional(v.string()),
    actionPrefix: v.optional(v.string()),   // ← BARU: kelompok aktivitas (mis. "activeStore.")
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),       // ← BARU: satu dokumen (mis. satu toko)
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { from, to, area, actorId, action, actionPrefix, entityType, entityId, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { items: [], hasMore: false };
    const me: any = await ctx.db.get(userId);
    if (me?.role !== "supervisor" && me?.role !== "owner") return { items: [], hasMore: false };

    const TAKE = Math.min(limit ?? 100, 300);
    const f = from ?? 0;
    const t = to ?? Date.now() + 86400000;
    // Menyaring pakai awalan action → ambil lebih banyak dulu, disaring di memory
    const CAP = actionPrefix ? Math.max(TAKE + 1, 400) : TAKE + 1;

    let rows: any[];
    if (actorId) {
      rows = await ctx.db.query("audit_events")
        .withIndex("by_actor_created", (q) => q.eq("actorId", actorId).gte("createdAt", f).lte("createdAt", t))
        .order("desc").take(CAP);
    } else if (entityType && entityId) {
      const raw = await ctx.db.query("audit_events")
        .withIndex("by_entity_created", (q) => q.eq("entityType", entityType).eq("entityId", entityId))
        .order("desc").take(TAKE + 1);
      rows = raw.filter((r) => r.createdAt >= f && r.createdAt <= t);
    } else if (entityType) {
      const raw = await ctx.db.query("audit_events")
        .withIndex("by_entity_created", (q) => q.eq("entityType", entityType))
        .order("desc").take(CAP);
      rows = raw.filter((r) => r.createdAt >= f && r.createdAt <= t);
    } else if (area) {
      rows = await ctx.db.query("audit_events")
        .withIndex("by_area_created", (q) => q.eq("area", area).gte("createdAt", f).lte("createdAt", t))
        .order("desc").take(CAP);
    } else {
      rows = await ctx.db.query("audit_events")
        .withIndex("by_created", (q) => q.gte("createdAt", f).lte("createdAt", t))
        .order("desc").take(CAP);
    }

    if (action) rows = rows.filter((r) => r.action === action);
    if (actionPrefix) rows = rows.filter((r) => r.action.startsWith(actionPrefix));

    const hasMore = rows.length > TAKE;
    return { items: rows.slice(0, TAKE), hasMore };
  },
});
