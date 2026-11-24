// Helper audit: dipanggil LANGSUNG dari dalam mutation supaya
// perubahan utama + catatan audit tercatat dalam transaksi yang sama.
export async function logAudit(ctx: any, args: {
  actorId?: any;
  actorName?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  area?: any;
  summary: string;
  before?: any;
  after?: any;
  metadata?: any;
}) {
  let actorName = args.actorName;
  let actorRole = args.actorRole;
  if (args.actorId && (!actorName || !actorRole)) {
    const u: any = await ctx.db.get(args.actorId);
    actorName = actorName ?? u?.name ?? "Sistem";
    actorRole = actorRole ?? u?.role ?? undefined;
  }
  return await ctx.db.insert("audit_events", {
    actorId: args.actorId,
    actorName: actorName ?? "Sistem",
    actorRole,
    action: args.action,
    entityType: args.entityType,
    entityId: String(args.entityId),
    area: args.area,
    summary: args.summary,
    before: args.before,
    after: args.after,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}
